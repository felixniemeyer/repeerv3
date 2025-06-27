use crate::api::run_api_server;
use crate::protocols::{TrustCodec, TrustProtocol, merge_responses, TrustResponseInternal};
use crate::query_engine::QueryEngine;
use crate::storage::Storage;
use crate::types::{CachedTrustScore, Peer, TrustExperience, TrustQuery, TrustResponse, TrustScore};
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
use tracing::{debug, error, info, warn};

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
    QueryTrust {
        query: TrustQuery,
        response: oneshot::Sender<Result<TrustResponse>>,
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
    query: TrustQuery,
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

        // Add bootstrap peers
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
        loop {
            tokio::select! {
                Some(event) = self.swarm.next() => {
                    self.handle_swarm_event(event).await?;
                }
                Some(command) = self.command_rx.recv() => {
                    self.handle_command(command).await?;
                }
            }
        }
    }

    async fn handle_swarm_event(&mut self, event: SwarmEvent<TrustBehaviourEvent>) -> Result<()> {
        match event {
            SwarmEvent::NewListenAddr { address, .. } => {
                info!("Listening on {}", address);
            }
            SwarmEvent::Behaviour(TrustBehaviourEvent::RequestResponse(event)) => {
                self.handle_request_response_event(event).await?;
            }
            SwarmEvent::Behaviour(TrustBehaviourEvent::Kademlia(event)) => {
                debug!("Kademlia event: {:?}", event);
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
            NodeCommand::QueryTrust { query, response } => {
                self.process_trust_query(query, response).await?;
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

            for peer in self.peers.values() {
                if let Ok(peer_id) = peer.peer_id.parse::<PeerId>() {
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

            if !waiting_for.is_empty() {
                // Store pending request
                let pending = PendingRequest {
                    query: query.clone(),
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
}