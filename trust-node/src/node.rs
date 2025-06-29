use crate::api::run_api_server;
use crate::protocols::{TrustCodec, TrustProtocol, merge_responses, TrustResponseInternal};
use crate::query_engine::QueryEngine;
use crate::storage::Storage;
use crate::types::{Peer, TrustDataExport, TrustExperience, TrustQuery, TrustResponse, TrustScore};
use anyhow::Result;
use chrono::Utc;
use futures::StreamExt;
use libp2p::{
    identity, kad, noise, request_response::{self, Event as ReqResEvent, Message, ResponseChannel},
    swarm::{NetworkBehaviour, SwarmEvent}, tcp, yamux, Multiaddr, PeerId, Swarm, SwarmBuilder
};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tokio::time::{interval, Duration as TokioDuration};
use tracing::{debug, info, warn};

#[derive(NetworkBehaviour)]
pub struct TrustBehaviour {
    request_response: request_response::Behaviour<TrustCodec>,
    kademlia: kad::Behaviour<kad::store::MemoryStore>,
    identify: libp2p::identify::Behaviour,
}

pub enum NodeCommand {
    AddExperience {
        experience: TrustExperience,
        response: oneshot::Sender<Result<()>>,
    },
    GetExperiences {
        agent_id: String,
        response: oneshot::Sender<Result<Vec<TrustExperience>>>,
    },
    RemoveExperience {
        experience_id: String,
        response: oneshot::Sender<Result<()>>,
    },
    AddPeer {
        peer: Peer,
        response: oneshot::Sender<Result<()>>,
    },
    GetPeers {
        response: oneshot::Sender<Result<Vec<Peer>>>,
    },
    UpdatePeerQuality {
        peer_id: String,
        quality: f64,
        response: oneshot::Sender<Result<()>>,
    },
    RemovePeer {
        peer_id: String,
        response: oneshot::Sender<Result<()>>,
    },
    QueryTrust {
        query: TrustQuery,
        response: oneshot::Sender<Result<TrustResponse>>,
    },
    GetConnectedPeers {
        response: oneshot::Sender<Result<Vec<String>>>,
    },
    TriggerPeerDiscovery {
        response: oneshot::Sender<Result<()>>,
    },
    ExportTrustData {
        response: oneshot::Sender<Result<TrustDataExport>>,
    },
    ImportTrustData {
        data: TrustDataExport,
        overwrite: bool,
        response: oneshot::Sender<Result<()>>,
    },
}

pub struct TrustNode<S: Storage> {
    swarm: Swarm<TrustBehaviour>,
    storage: Arc<S>,
    query_engine: QueryEngine<S>,
    command_rx: mpsc::Receiver<NodeCommand>,
    peers: HashMap<String, Peer>,
    pending_requests: HashMap<request_response::OutboundRequestId, PendingRequest>,
}

struct PendingRequest {
    responses: Vec<TrustResponseInternal>,
    waiting_for: HashSet<PeerId>,
    response_channel: oneshot::Sender<Result<TrustResponse>>,
}

impl<S: Storage + 'static> TrustNode<S> {
    pub async fn new(
        p2p_port: u16,
        api_port: u16,
        storage: S,
        bootstrap_peers: Vec<String>,
    ) -> Result<(Self, JoinHandle<Result<()>>)> {
        let local_key = identity::Keypair::generate_ed25519();
        let local_peer_id = PeerId::from(local_key.public());
        info!("Local peer id: {}", local_peer_id);

        let mut swarm = SwarmBuilder::with_existing_identity(local_key)
            .with_tokio()
            .with_tcp(
                tcp::Config::default(),
                noise::Config::new,
                yamux::Config::default,
            )?
            .with_behaviour(|key| {
                let kademlia = kad::Behaviour::new(
                    local_peer_id,
                    kad::store::MemoryStore::new(local_peer_id),
                );
                
                let request_response = request_response::Behaviour::new(
                    [(TrustProtocol, request_response::ProtocolSupport::Full)],
                    request_response::Config::default()
                        .with_request_timeout(Duration::from_secs(30)),
                );

                let identify = libp2p::identify::Behaviour::new(
                    libp2p::identify::Config::new("/repeer/1.0.0".to_string(), key.public())
                );

                Ok(TrustBehaviour {
                    request_response,
                    kademlia,
                    identify,
                })
            })?
            .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(60)))
            .build();

        swarm.listen_on(format!("/ip4/0.0.0.0/tcp/{}", p2p_port).parse()?)?;

        // Add bootstrap peers and start Kademlia bootstrap
        for addr_str in bootstrap_peers {
            if let Ok(addr) = addr_str.parse::<Multiaddr>() {
                if let Some(peer_id) = addr.iter().find_map(|p| match p {
                    libp2p::multiaddr::Protocol::P2p(id) => Some(id),
                    _ => None,
                }) {
                    swarm.behaviour_mut().kademlia.add_address(&peer_id, addr);
                }
            }
        }
        
        // Start Kademlia bootstrap if we have any peers
        if let Err(e) = swarm.behaviour_mut().kademlia.bootstrap() {
            warn!("Failed to start bootstrap: {:?}", e);
        }

        let storage = Arc::new(storage);
        let query_engine = QueryEngine::new(storage.clone());
        
        let (command_tx, command_rx) = mpsc::channel(100);
        
        // Load peers from storage
        let peers = storage.get_peers().await?
            .into_iter()
            .map(|p| (p.peer_id.clone(), p))
            .collect();

        let node = Self {
            swarm,
            storage,
            query_engine,
            command_rx,
            peers,
            pending_requests: HashMap::new(),
        };

        let api_handle = tokio::spawn(run_api_server(api_port, command_tx));

        Ok((node, api_handle))
    }

    pub async fn run(mut self) -> Result<()> {
        let mut discovery_interval = interval(TokioDuration::from_secs(300)); // 5 minutes
        let mut peer_connection_interval = interval(TokioDuration::from_secs(60)); // 1 minute
        
        loop {
            tokio::select! {
                Some(event) = self.swarm.next() => {
                    self.handle_swarm_event(event).await?;
                }
                Some(command) = self.command_rx.recv() => {
                    self.handle_command(command).await?;
                }
                _ = discovery_interval.tick() => {
                    self.discover_peers().await?;
                }
                _ = peer_connection_interval.tick() => {
                    self.connect_to_known_peers().await?;
                }
            }
        }
    }

    async fn handle_swarm_event(&mut self, event: SwarmEvent<TrustBehaviourEvent>) -> Result<()> {
        match event {
            SwarmEvent::NewListenAddr { address, .. } => {
                info!("Listening on {}", address);
            }
            SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                info!("Connected to peer: {}", peer_id);
            }
            SwarmEvent::ConnectionClosed { peer_id, cause, .. } => {
                info!("Connection to peer {} closed: {:?}", peer_id, cause);
            }
            SwarmEvent::IncomingConnection { local_addr, send_back_addr, .. } => {
                debug!("Incoming connection from {} to {}", send_back_addr, local_addr);
            }
            SwarmEvent::Behaviour(TrustBehaviourEvent::RequestResponse(event)) => {
                self.handle_request_response_event(event).await?;
            }
            SwarmEvent::Behaviour(TrustBehaviourEvent::Kademlia(event)) => {
                match event {
                    kad::Event::OutboundQueryProgressed { result, .. } => {
                        match result {
                            kad::QueryResult::Bootstrap(Ok(kad::BootstrapOk { peer, .. })) => {
                                info!("Successfully bootstrapped with peer: {}", peer);
                            }
                            kad::QueryResult::Bootstrap(Err(e)) => {
                                warn!("Bootstrap failed: {:?}", e);
                            }
                            kad::QueryResult::GetClosestPeers(Ok(kad::GetClosestPeersOk { peers, .. })) => {
                                info!("Found {} closest peers", peers.len());
                                for peer in peers {
                                    debug!("Discovered peer: {:?}", peer);
                                }
                            }
                            _ => {
                                debug!("Kademlia query result: {:?}", result);
                            }
                        }
                    }
                    kad::Event::RoutingUpdated { peer, .. } => {
                        info!("Routing table updated with peer: {}", peer);
                    }
                    _ => {
                        debug!("Kademlia event: {:?}", event);
                    }
                }
            }
            SwarmEvent::Behaviour(TrustBehaviourEvent::Identify(event)) => {
                if let libp2p::identify::Event::Received { peer_id, info, .. } = event {
                    debug!("Identified peer {} with protocols: {:?}", peer_id, info.protocols);
                    for addr in info.listen_addrs {
                        self.swarm.behaviour_mut().kademlia.add_address(&peer_id, addr);
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    async fn handle_request_response_event(&mut self, event: ReqResEvent<TrustQuery, TrustResponse>) -> Result<()> {
        match event {
            ReqResEvent::Message { peer, message } => match message {
                Message::Request { request, channel, .. } => {
                    debug!("Received trust query from {}: {:?}", peer, request);
                    self.handle_trust_query(request, channel).await?;
                }
                Message::Response { request_id, response } => {
                    debug!("Received trust response for request {:?}", request_id);
                    self.handle_trust_response(request_id, peer, response).await?;
                }
            },
            ReqResEvent::OutboundFailure { peer, request_id, error } => {
                warn!("Outbound request to {} failed: {:?}", peer, error);
                self.handle_request_failure(request_id, peer).await?;
            }
            ReqResEvent::InboundFailure { peer, error, .. } => {
                warn!("Inbound request from {} failed: {:?}", peer, error);
            }
            _ => {}
        }
        Ok(())
    }

    async fn handle_trust_query(&mut self, query: TrustQuery, channel: ResponseChannel<TrustResponse>) -> Result<()> {
        let mut scores = Vec::new();
        let point_in_time = query.point_in_time.unwrap_or_else(Utc::now);
        let forget_rate = query.forget_rate.unwrap_or(0.0);

        for agent_id in &query.agent_ids {
            let score = self.query_engine
                .calculate_trust_score(agent_id, point_in_time, forget_rate)
                .await?;
            scores.push((agent_id.clone(), score));
        }

        let response = TrustResponse {
            scores,
            timestamp: Utc::now(),
        };

        self.swarm
            .behaviour_mut()
            .request_response
            .send_response(channel, response)
            .map_err(|_| anyhow::anyhow!("Failed to send response"))?;

        Ok(())
    }

    async fn handle_trust_response(&mut self, request_id: request_response::OutboundRequestId, peer: PeerId, response: TrustResponse) -> Result<()> {
        // Cache the received trust scores from this peer
        for (agent_id, score) in &response.scores {
            let cached = crate::types::CachedTrustScore {
                agent_id: agent_id.clone(),
                score: score.clone(),
                from_peer: peer.to_string(),
                cached_at: Utc::now(),
            };
            if let Err(e) = self.storage.cache_trust_score(cached).await {
                debug!("Failed to cache trust score from {}: {}", peer, e);
            }
        }

        if let Some(mut pending) = self.pending_requests.remove(&request_id) {
            pending.responses.push(TrustResponseInternal {
                response,
                peer_id: peer.to_string(),
            });
            pending.waiting_for.remove(&peer);

            if pending.waiting_for.is_empty() {
                // All responses received, combine and send final result
                let final_response = merge_responses(pending.responses);
                let _ = pending.response_channel.send(Ok(final_response));
            } else {
                // Still waiting for more responses
                self.pending_requests.insert(request_id, pending);
            }
        }
        Ok(())
    }

    async fn handle_request_failure(&mut self, request_id: request_response::OutboundRequestId, peer: PeerId) -> Result<()> {
        if let Some(mut pending) = self.pending_requests.remove(&request_id) {
            pending.waiting_for.remove(&peer);

            if pending.waiting_for.is_empty() {
                // No more peers to wait for
                if pending.responses.is_empty() {
                    let _ = pending.response_channel.send(Err(anyhow::anyhow!("All requests failed")));
                } else {
                    let final_response = merge_responses(pending.responses);
                    let _ = pending.response_channel.send(Ok(final_response));
                }
            } else {
                self.pending_requests.insert(request_id, pending);
            }
        }
        Ok(())
    }

    async fn handle_command(&mut self, command: NodeCommand) -> Result<()> {
        match command {
            NodeCommand::AddExperience { experience, response } => {
                let result = self.storage.add_experience(experience).await;
                let _ = response.send(result);
            }
            NodeCommand::GetExperiences { agent_id, response } => {
                let result = self.storage.get_experiences(&agent_id).await;
                let _ = response.send(result);
            }
            NodeCommand::RemoveExperience { experience_id, response } => {
                let result = self.storage.remove_experience(&experience_id).await;
                let _ = response.send(result);
            }
            NodeCommand::AddPeer { peer, response } => {
                // Parse and add peer to libp2p
                if let Ok(peer_id) = peer.peer_id.parse::<PeerId>() {
                    // Try to parse as multiaddr with peer id
                    if let Ok(addr) = peer.peer_id.parse::<Multiaddr>() {
                        self.swarm.behaviour_mut().kademlia.add_address(&peer_id, addr);
                    }
                }
                
                self.peers.insert(peer.peer_id.clone(), peer.clone());
                let result = self.storage.add_peer(peer).await;
                let _ = response.send(result);
            }
            NodeCommand::GetPeers { response } => {
                let result = self.storage.get_peers().await;
                let _ = response.send(result);
            }
            NodeCommand::UpdatePeerQuality { peer_id, quality, response } => {
                if let Some(peer) = self.peers.get_mut(&peer_id) {
                    peer.recommender_quality = quality;
                }
                let result = self.storage.update_peer_quality(&peer_id, quality).await;
                let _ = response.send(result);
            }
            NodeCommand::RemovePeer { peer_id, response } => {
                self.peers.remove(&peer_id);
                let result = self.storage.remove_peer(&peer_id).await;
                let _ = response.send(result);
            }
            NodeCommand::QueryTrust { query, response } => {
                self.process_trust_query(query, response).await?;
            }
            NodeCommand::GetConnectedPeers { response } => {
                let connected: Vec<String> = self.swarm.connected_peers()
                    .map(|p| p.to_string())
                    .collect();
                let _ = response.send(Ok(connected));
            }
            NodeCommand::TriggerPeerDiscovery { response } => {
                let result = self.discover_peers().await;
                let _ = response.send(result);
            }
            NodeCommand::ExportTrustData { response } => {
                let result = self.export_trust_data().await;
                let _ = response.send(result);
            }
            NodeCommand::ImportTrustData { data, overwrite, response } => {
                let result = self.import_trust_data(data, overwrite).await;
                let _ = response.send(result);
            }
        }
        Ok(())
    }

    async fn process_trust_query(&mut self, query: TrustQuery, response: oneshot::Sender<Result<TrustResponse>>) -> Result<()> {
        let point_in_time = query.point_in_time.unwrap_or_else(Utc::now);
        let forget_rate = query.forget_rate.unwrap_or(0.0);
        let max_depth = query.max_depth;

        let mut all_scores: HashMap<String, Vec<(String, TrustScore, f64)>> = HashMap::new();

        // Get personal scores
        for agent_id in &query.agent_ids {
            let personal_score = self.query_engine
                .calculate_trust_score(agent_id, point_in_time, forget_rate)
                .await?;
            
            if personal_score.total_volume > 0.0 {
                all_scores
                    .entry(agent_id.clone())
                    .or_default()
                    .push(("self".to_string(), personal_score, 1.0));
            }
        }

        // Query peers if depth > 0
        if max_depth > 0 {
            let mut waiting_for = HashSet::new();
            let mut request_ids = Vec::new();

            // First, check for cached scores from peers
            for agent_id in &query.agent_ids {
                if let Ok(cached_scores) = self.storage.get_cached_scores(agent_id).await {
                    for cached in cached_scores {
                        // Find the peer's recommender quality
                        if let Some(peer) = self.peers.values().find(|p| p.peer_id == cached.from_peer) {
                            // Apply age decay to cached scores
                            let age_seconds = (Utc::now() - cached.cached_at).num_seconds() as f64;
                            let age_factor = 1.0 / (1.0 + age_seconds / 86400.0); // Decay over days
                            
                            all_scores
                                .entry(agent_id.clone())
                                .or_default()
                                .push((cached.from_peer, cached.score, peer.recommender_quality * age_factor));
                        }
                    }
                }
            }

            // Then try to get fresh scores from connected peers
            for peer in self.peers.values() {
                if let Ok(peer_id) = peer.peer_id.parse::<PeerId>() {
                    // Only query if peer is connected
                    if self.swarm.is_connected(&peer_id) {
                        let peer_query = TrustQuery {
                            agent_ids: query.agent_ids.clone(),
                            max_depth: max_depth.saturating_sub(1),
                            point_in_time: Some(point_in_time),
                            forget_rate: Some(forget_rate),
                        };

                        let request_id = self.swarm
                            .behaviour_mut()
                            .request_response
                            .send_request(&peer_id, peer_query);

                        waiting_for.insert(peer_id);
                        request_ids.push(request_id);
                    }
                }
            }

            if !waiting_for.is_empty() {
                // Store pending request
                let pending = PendingRequest {
                    responses: Vec::new(),
                    waiting_for,
                    response_channel: response,
                };
                
                // Use the first request_id as the key
                if let Some(request_id) = request_ids.first() {
                    self.pending_requests.insert(*request_id, pending);
                }
                
                return Ok(());
            }
        }

        // No peers to query or depth is 0, return personal scores
        let final_scores: Vec<(String, TrustScore)> = all_scores
            .into_iter()
            .map(|(agent_id, scores)| {
                let combined = self.combine_scores_sync(scores);
                (agent_id, combined)
            })
            .collect();

        let trust_response = TrustResponse {
            scores: final_scores,
            timestamp: Utc::now(),
        };

        let _ = response.send(Ok(trust_response));
        Ok(())
    }

    fn combine_scores_sync(&self, scores: Vec<(String, TrustScore, f64)>) -> TrustScore {
        let mut weighted_roi_sum = 0.0;
        let mut total_weight = 0.0;
        let mut total_data_points = 0;

        for (_, score, quality) in scores {
            let adjusted_volume = score.total_volume * quality.abs();
            if adjusted_volume > 0.0 {
                let roi = if quality < 0.0 {
                    2.0 - score.expected_pv_roi
                } else {
                    score.expected_pv_roi
                };
                
                weighted_roi_sum += roi * adjusted_volume;
                total_weight += adjusted_volume;
                total_data_points += score.data_points;
            }
        }

        if total_weight > 0.0 {
            TrustScore {
                expected_pv_roi: weighted_roi_sum / total_weight,
                total_volume: total_weight,
                data_points: total_data_points,
            }
        } else {
            TrustScore::default()
        }
    }

    async fn discover_peers(&mut self) -> Result<()> {
        info!("Starting peer discovery");
        
        // Try to bootstrap again to discover new peers
        if let Err(e) = self.swarm.behaviour_mut().kademlia.bootstrap() {
            debug!("Bootstrap attempt failed: {:?}", e);
        }
        
        // Query for peers close to random keys to discover the network
        let random_peer_id = PeerId::random();
        self.swarm.behaviour_mut().kademlia.get_closest_peers(random_peer_id);
        
        // Also query for peers close to our own ID
        let local_peer_id = *self.swarm.local_peer_id();
        self.swarm.behaviour_mut().kademlia.get_closest_peers(local_peer_id);
        
        Ok(())
    }

    async fn connect_to_known_peers(&mut self) -> Result<()> {
        let connected_peers: HashSet<PeerId> = self.swarm.connected_peers().cloned().collect();
        let mut connection_attempts = 0;
        const MAX_CONNECTION_ATTEMPTS: usize = 5;
        
        for peer in self.peers.values() {
            if connection_attempts >= MAX_CONNECTION_ATTEMPTS {
                break;
            }
            
            // Try to parse peer_id as either a PeerId or a multiaddr
            if let Ok(peer_id) = peer.peer_id.parse::<PeerId>() {
                if !connected_peers.contains(&peer_id) {
                    debug!("Attempting to connect to known peer: {}", peer_id);
                    if let Err(e) = self.swarm.dial(peer_id) {
                        debug!("Failed to dial peer {}: {:?}", peer_id, e);
                    } else {
                        connection_attempts += 1;
                    }
                }
            } else if let Ok(addr) = peer.peer_id.parse::<Multiaddr>() {
                // Extract peer ID from multiaddr if possible
                if let Some(peer_id) = addr.iter().find_map(|p| match p {
                    libp2p::multiaddr::Protocol::P2p(id) => Some(id),
                    _ => None,
                }) {
                    if !connected_peers.contains(&peer_id) {
                        debug!("Attempting to connect to peer via multiaddr: {}", addr);
                        if let Err(e) = self.swarm.dial(addr.clone()) {
                            debug!("Failed to dial multiaddr {}: {:?}", addr, e);
                        } else {
                            connection_attempts += 1;
                        }
                    }
                }
            }
        }
        
        if connection_attempts > 0 {
            info!("Attempted {} peer connections", connection_attempts);
        }
        
        Ok(())
    }

    async fn export_trust_data(&self) -> Result<TrustDataExport> {
        let experiences = self.storage.get_all_experiences().await?;
        let peers = self.storage.get_peers().await?;
        
        Ok(TrustDataExport::new(experiences, peers))
    }

    async fn import_trust_data(&mut self, data: TrustDataExport, overwrite: bool) -> Result<()> {
        if overwrite {
            info!("Importing trust data with overwrite - clearing existing data");
            // Note: In a production system, we might want to backup existing data first
        }

        info!("Importing {} experiences and {} peers", data.experiences.len(), data.peers.len());

        // Import experiences
        for experience in data.experiences {
            if overwrite || self.storage.get_experiences(&experience.agent_id).await?.is_empty() {
                self.storage.add_experience(experience).await?;
            }
        }

        // Import peers
        for peer in data.peers {
            if overwrite || !self.peers.contains_key(&peer.peer_id) {
                self.peers.insert(peer.peer_id.clone(), peer.clone());
                self.storage.add_peer(peer).await?;
            }
        }

        info!("Trust data import completed successfully");
        Ok(())
    }
}