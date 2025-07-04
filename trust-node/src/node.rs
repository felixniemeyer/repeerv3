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
use std::sync::{Arc, Mutex};
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
        id_domain: String,
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
    GetSelfPeerId {
        response: oneshot::Sender<Result<String>>,
    },
    ClearPeers {
        response: oneshot::Sender<Result<()>>,
    },
    ClearExperiences {
        response: oneshot::Sender<Result<()>>,
    },
}

pub struct TrustNode<S: Storage> {
    swarm: Swarm<TrustBehaviour>,
    storage: Arc<S>,
    query_engine: QueryEngine<S>,
    command_rx: mpsc::Receiver<NodeCommand>,
    peers: HashMap<String, Peer>,
    pending_requests: HashMap<request_response::OutboundRequestId, Arc<Mutex<PendingRequest>>>,
}

struct PendingRequest {
    responses: Vec<TrustResponseInternal>,
    waiting_for: HashSet<PeerId>,
    response_channel: oneshot::Sender<Result<TrustResponse>>,
    local_scores: HashMap<(String, String), Vec<(String, TrustScore, f64)>>, // Store original local+cached scores
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
                        .with_request_timeout(Duration::from_secs(5)), // Reduced for local testing
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
        let mut discovery_interval = interval(TokioDuration::from_secs(30)); // 30 seconds for faster test discovery
        let mut peer_connection_interval = interval(TokioDuration::from_secs(5)); // 5 seconds for faster test connections
        
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
        // Create a oneshot channel for the response
        let (tx, rx) = oneshot::channel();
        
        // Process the query using the same logic as HTTP queries
        // This ensures depth-based forwarding works for libp2p queries too
        self.process_trust_query(query, tx).await?;
        
        // Wait for the response
        match rx.await {
            Ok(Ok(response)) => {
                debug!("Sending trust response via libp2p: {} scores", response.scores.len());
                // Send the response back through libp2p
                self.swarm
                    .behaviour_mut()
                    .request_response
                    .send_response(channel, response)
                    .map_err(|_| anyhow::anyhow!("Failed to send response"))?;
                debug!("Trust response sent successfully via libp2p");
            }
            Ok(Err(e)) => {
                warn!("Trust query processing failed: {}", e);
                // Send empty response on error
                let empty_response = TrustResponse {
                    scores: vec![],
                    timestamp: Utc::now(),
                };
                self.swarm
                    .behaviour_mut()
                    .request_response
                    .send_response(channel, empty_response)
                    .map_err(|_| anyhow::anyhow!("Failed to send response"))?;
            }
            Err(_) => {
                warn!("Trust query response channel closed");
            }
        }

        Ok(())
    }

    async fn handle_trust_response(&mut self, request_id: request_response::OutboundRequestId, peer: PeerId, response: TrustResponse) -> Result<()> {
        debug!("LIBP2P: Received response from peer {} with {} scores for request {:?}", 
               peer, response.scores.len(), request_id);
        
        // Cache the received trust scores from this peer
        for agent_score in &response.scores {
            let cached = crate::types::CachedTrustScore {
                id_domain: agent_score.id_domain.clone(),
                agent_id: agent_score.agent_id.clone(),
                score: agent_score.score.clone(),
                from_peer: peer.to_string(),
                cached_at: Utc::now(),
            };
            if let Err(e) = self.storage.cache_trust_score(cached).await {
                debug!("Failed to cache trust score from {}: {}", peer, e);
            }
        }

        if let Some(pending_arc) = self.pending_requests.get(&request_id).cloned() {
            debug!("LIBP2P: Found pending request for {:?}", request_id);
            let (should_remove, response_channel, final_response) = {
                let mut pending = pending_arc.lock().unwrap();
                pending.responses.push(TrustResponseInternal {
                    response,
                    peer_id: peer.to_string(),
                });
                pending.waiting_for.remove(&peer);
                debug!("LIBP2P: Added response from {}, still waiting for {} peers", peer, pending.waiting_for.len());

                if pending.waiting_for.is_empty() {
                    // All responses received, combine with local scores
                    let peer_response = merge_responses(pending.responses.clone());
                    debug!("LIBP2P: Peer responses contain {} scores", peer_response.scores.len());
                    for score in &peer_response.scores {
                        debug!("LIBP2P: Peer response score: {}:{} = ROI:{} vol:{} pts:{}", 
                               score.id_domain, score.agent_id, 
                               score.score.expected_pv_roi, score.score.total_volume, score.score.data_points);
                    }
                    
                    // Merge local scores with peer responses
                    let mut final_all_scores = pending.local_scores.clone();
                    debug!("LIBP2P: Local scores contain {} agents", final_all_scores.len());
                    
                    // Add peer responses to the all_scores map
                    for agent_score in peer_response.scores {
                        let key = (agent_score.id_domain.clone(), agent_score.agent_id.clone());
                        debug!("LIBP2P: Adding peer score for {}:{} with ROI {} and volume {}", 
                               agent_score.id_domain, agent_score.agent_id, 
                               agent_score.score.expected_pv_roi, agent_score.score.total_volume);
                        final_all_scores
                            .entry(key)
                            .or_default()
                            .push(("peers".to_string(), agent_score.score, 1.0)); // Peer responses get weight 1.0
                    }
                    
                    // Generate final scores using the same logic as immediate response
                    let final_scores: Vec<crate::types::AgentScore> = final_all_scores
                        .into_iter()
                        .map(|((id_domain, agent_id), scores)| {
                            let combined = TrustScore::merge_multiple(
                                scores.into_iter().map(|(_, score, quality)| (score, quality)).collect()
                            );
                            crate::types::AgentScore::new(id_domain, agent_id, combined)
                        })
                        .collect();
                    
                    let final_response = TrustResponse {
                        scores: final_scores,
                        timestamp: chrono::Utc::now(),
                    };
                    
                    debug!("LIBP2P: All responses received, merged with local scores into {} final scores", final_response.scores.len());
                    (true, Some(std::mem::replace(&mut pending.response_channel, 
                        oneshot::channel().0)), // Dummy replacement
                    Some(final_response))
                } else {
                    (false, None, None)
                }
            };

            if should_remove {
                // Remove all request IDs that point to this pending request
                self.pending_requests.retain(|_, v| !Arc::ptr_eq(v, &pending_arc));
                
                if let (Some(channel), Some(response)) = (response_channel, final_response) {
                    debug!("LIBP2P: Sending final merged response with {} scores to HTTP API", response.scores.len());
                    let _ = channel.send(Ok(response));
                }
            }
        }
        Ok(())
    }

    async fn handle_request_failure(&mut self, request_id: request_response::OutboundRequestId, peer: PeerId) -> Result<()> {
        if let Some(pending_arc) = self.pending_requests.get(&request_id).cloned() {
            let (should_remove, response_channel, result) = {
                let mut pending = pending_arc.lock().unwrap();
                pending.waiting_for.remove(&peer);

                if pending.waiting_for.is_empty() {
                    // No more peers to wait for
                    let result = if pending.responses.is_empty() {
                        Err(anyhow::anyhow!("All requests failed"))
                    } else {
                        let final_response = merge_responses(pending.responses.clone());
                        Ok(final_response)
                    };
                    (true, Some(std::mem::replace(&mut pending.response_channel, 
                        oneshot::channel().0)), // Dummy replacement
                    Some(result))
                } else {
                    (false, None, None)
                }
            };

            if should_remove {
                // Remove all request IDs that point to this pending request
                self.pending_requests.retain(|_, v| !Arc::ptr_eq(v, &pending_arc));
                
                if let (Some(channel), Some(result)) = (response_channel, result) {
                    let _ = channel.send(result);
                }
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
            NodeCommand::GetExperiences { id_domain, agent_id, response } => {
                let result = self.storage.get_experiences(&id_domain, &agent_id).await;
                let _ = response.send(result);
            }
            NodeCommand::RemoveExperience { experience_id, response } => {
                let result = self.storage.remove_experience(&experience_id).await;
                let _ = response.send(result);
            }
            NodeCommand::AddPeer { peer, response } => {
                // Try to parse peer_id as a multiaddr (e.g., /ip4/127.0.0.1/tcp/9015/p2p/12D3KooW...)
                if let Ok(addr) = peer.peer_id.parse::<Multiaddr>() {
                    // Extract peer ID from the multiaddr
                    if let Some(libp2p::multiaddr::Protocol::P2p(peer_id_hash)) = addr.iter().last() {
                        if let Ok(peer_id) = PeerId::from_multihash(peer_id_hash.into()) {
                            debug!("Adding peer {} at address {}", peer_id, addr);
                            
                            // Add address to Kademlia DHT
                            self.swarm.behaviour_mut().kademlia.add_address(&peer_id, addr.clone());
                            
                            // Attempt to dial the peer
                            if let Err(e) = self.swarm.dial(addr) {
                                warn!("Failed to dial peer {}: {}", peer_id, e);
                            } else {
                                info!("Dialing peer {} successfully initiated", peer_id);
                            }
                        } else {
                            warn!("Failed to parse peer ID from multiaddr: {}", peer.peer_id);
                        }
                    } else {
                        warn!("Multiaddr does not contain a peer ID: {}", peer.peer_id);
                    }
                } else {
                    warn!("Failed to parse peer_id as multiaddr: {}", peer.peer_id);
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
            NodeCommand::GetSelfPeerId { response } => {
                let peer_id = self.swarm.local_peer_id().to_string();
                let _ = response.send(Ok(peer_id));
            }
            NodeCommand::ClearPeers { response } => {
                self.peers.clear();
                let result = self.storage.clear_peers().await;
                let _ = response.send(result);
            }
            NodeCommand::ClearExperiences { response } => {
                let result = self.storage.clear_experiences().await;
                let _ = response.send(result);
            }
        }
        Ok(())
    }

    async fn process_trust_query(&mut self, query: TrustQuery, response: oneshot::Sender<Result<TrustResponse>>) -> Result<()> {
        let point_in_time = query.point_in_time.unwrap_or_else(Utc::now);
        let forget_rate = query.forget_rate.unwrap_or(0.0);
        let max_depth = query.max_depth;

        let mut all_scores: HashMap<(String, String), Vec<(String, TrustScore, f64)>> = HashMap::new();

        // Get personal scores
        for agent in &query.agents {
            let personal_score = self.query_engine
                .calculate_trust_score(&agent.id_domain, &agent.agent_id, point_in_time, forget_rate)
                .await?;
            
            if personal_score.total_volume > 0.0 {
                all_scores
                    .entry((agent.id_domain.clone(), agent.agent_id.clone()))
                    .or_default()
                    .push(("self".to_string(), personal_score, 1.0));
            }
        }

        // Always check for cached scores from peers (even at depth 0)
        for agent in &query.agents {
            if let Ok(cached_scores) = self.storage.get_cached_scores(&agent.id_domain, &agent.agent_id).await {
                debug!("Found {} cached scores for agent {}:{}", cached_scores.len(), agent.id_domain, agent.agent_id);
                for cached in cached_scores {
                    // Find the peer's recommender quality
                    if let Some(peer) = self.peers.values().find(|p| p.peer_id == cached.from_peer) {
                        // Apply age decay to cached scores
                        let age_seconds = (Utc::now() - cached.cached_at).num_seconds() as f64;
                        let age_factor = 1.0 / (1.0 + age_seconds / 86400.0); // Decay over days
                        
                        debug!("Using cached score from peer {} with age factor {}", cached.from_peer, age_factor);
                        all_scores
                            .entry((agent.id_domain.clone(), agent.agent_id.clone()))
                            .or_default()
                            .push((cached.from_peer, cached.score, peer.recommender_quality * age_factor));
                    } else {
                        debug!("Cached score from unknown peer: {}", cached.from_peer);
                    }
                }
            } else {
                debug!("No cached scores found for agent {}:{}", agent.id_domain, agent.agent_id);
            }
        }

        // Query peers if depth > 0
        if max_depth > 0 {
            let mut waiting_for = HashSet::new();
            let mut request_ids = Vec::new();

            // Then try to get fresh scores from connected peers
            for peer in self.peers.values() {
                // Try to extract peer ID from multiaddr
                if let Ok(addr) = peer.peer_id.parse::<Multiaddr>() {
                    if let Some(libp2p::multiaddr::Protocol::P2p(peer_id_hash)) = addr.iter().last() {
                        if let Ok(peer_id) = PeerId::from_multihash(peer_id_hash.into()) {
                            debug!("Checking peer {} ({}) - connected: {}", peer.name, peer_id, self.swarm.is_connected(&peer_id));
                            // Only query if peer is connected
                            if self.swarm.is_connected(&peer_id) {
                                let peer_query = TrustQuery {
                                    agents: query.agents.clone(),
                                    max_depth: max_depth.saturating_sub(1),
                                    point_in_time: Some(point_in_time),
                                    forget_rate: Some(forget_rate),
                                };

                                debug!("LIBP2P: Sending request to peer {} for {} agents with depth {}", 
                                       peer_id, peer_query.agents.len(), peer_query.max_depth);
                                let request_id = self.swarm
                                    .behaviour_mut()
                                    .request_response
                                    .send_request(&peer_id, peer_query);

                                debug!("LIBP2P: Request sent with ID {:?}", request_id);
                                waiting_for.insert(peer_id);
                                request_ids.push(request_id);
                            }
                        }
                    }
                }
            }

            if !waiting_for.is_empty() {
                // Store pending request with local scores to merge later
                let pending = Arc::new(Mutex::new(PendingRequest {
                    responses: Vec::new(),
                    waiting_for,
                    response_channel: response,
                    local_scores: all_scores.clone(), // Store the local+cached scores
                }));
                
                // Map all request_ids to the same pending request
                for request_id in request_ids {
                    self.pending_requests.insert(request_id, pending.clone());
                }
                
                return Ok(());
            }
        }

        // No peers to query or depth is 0, return personal scores
        let final_scores: Vec<crate::types::AgentScore> = all_scores
            .into_iter()
            .map(|((id_domain, agent_id), scores)| {
                let combined = self.combine_scores_sync(scores);
                crate::types::AgentScore::new(id_domain, agent_id, combined)
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
        // Convert to the format expected by TrustScore::merge_multiple
        let score_weight_pairs: Vec<(TrustScore, f64)> = scores
            .into_iter()
            .map(|(_, score, quality)| (score, quality))
            .collect();
        
        TrustScore::merge_multiple(score_weight_pairs)
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
            if overwrite || self.storage.get_experiences(&experience.id_domain, &experience.agent_id).await?.is_empty() {
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