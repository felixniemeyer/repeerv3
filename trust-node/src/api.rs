use crate::node::NodeCommand;
use crate::types::{Peer, TrustDataExport, TrustExperience, TrustQuery, TrustResponse, TrustScore};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post},
    Router,
};
use chrono::Utc;
use serde::Deserialize;
use std::net::SocketAddr;
use tokio::sync::{mpsc, oneshot};
use tower_http::cors::CorsLayer;
use tracing::info;
use uuid::Uuid;

#[derive(Clone)]
pub struct ApiState {
    pub command_tx: mpsc::Sender<NodeCommand>,
}

/// Helper function to execute a node command and handle the standard error cases
async fn execute_command<T, F>(state: &ApiState, command_builder: F) -> Result<T, StatusCode>
where
    F: FnOnce(oneshot::Sender<Result<T, anyhow::Error>>) -> NodeCommand,
{
    let (tx, rx) = oneshot::channel();
    state
        .command_tx
        .send(command_builder(tx))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    rx.await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn run_api_server(port: u16, command_tx: mpsc::Sender<NodeCommand>) -> anyhow::Result<()> {
    let state = ApiState { command_tx };

    let app = Router::new()
        .route("/health", get(health))
        .route("/experiences", post(add_experience))
        .route("/experiences/clear", delete(clear_experiences))
        .route("/experiences/:id_domain/:agent_id", get(get_experiences))
        .route("/experience/:experience_id", delete(delete_experience))
        .route("/trust/:id_domain/:agent_id", get(query_trust))
        .route("/trust/batch", post(query_trust_batch))
        .route("/peers", get(get_peers))
        .route("/peers", post(add_peer))
        .route("/peers/clear", delete(clear_peers))
        .route("/peers/:peer_id", delete(delete_peer))
        .route("/peers/:peer_id/quality", post(update_peer_quality))
        .route("/peers/connected", get(get_connected_peers))
        .route("/peers/discover", post(trigger_peer_discovery))
        .route("/peers/self", get(get_self_peer_id))
        .route("/export", get(export_trust_data))
        .route("/import", post(import_trust_data))
        .with_state(state)
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!("API server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> &'static str {
    "OK"
}

#[derive(Deserialize)]
pub struct AddExperienceRequest {
    pub id_domain: String,
    pub agent_id: String,
    pub investment: f64,
    pub return_value: f64,
    pub timeframe_days: f64,
    pub discount_rate: Option<f64>,
    pub notes: Option<String>,
    pub data: Option<serde_json::Value>,
}

async fn add_experience(
    State(state): State<ApiState>,
    Json(req): Json<AddExperienceRequest>,
) -> Result<Json<TrustExperience>, StatusCode> {
    let discount_rate = req.discount_rate.unwrap_or(0.05);
    let years = req.timeframe_days / 365.0;
    let pv_roi = (req.return_value / (1.0 + discount_rate).powf(years)) / req.investment;

    let experience = TrustExperience {
        id: Uuid::new_v4(),
        id_domain: req.id_domain,
        agent_id: req.agent_id,
        pv_roi,
        invested_volume: req.investment,
        timestamp: Utc::now(),
        notes: req.notes,
        data: req.data,
    };

    execute_command(&state, |response| NodeCommand::AddExperience {
        experience: experience.clone(),
        response,
    }).await?;

    Ok(Json(experience))
}

async fn get_experiences(
    State(state): State<ApiState>,
    Path((id_domain, agent_id)): Path<(String, String)>,
) -> Result<Json<Vec<TrustExperience>>, StatusCode> {
    let experiences = execute_command(&state, |response| NodeCommand::GetExperiences { 
        id_domain,
        agent_id, 
        response 
    }).await?;

    Ok(Json(experiences))
}

#[derive(Deserialize)]
pub struct TrustQueryParams {
    pub max_depth: Option<u8>,
    pub forget_rate: Option<f64>,
}

async fn query_trust(
    State(state): State<ApiState>,
    Path((id_domain, agent_id)): Path<(String, String)>,
    Query(params): Query<TrustQueryParams>,
) -> Result<Json<TrustScore>, StatusCode> {
    let query = TrustQuery {
        agents: vec![crate::types::AgentIdentifier::new(id_domain.clone(), agent_id.clone())],
        max_depth: params.max_depth.unwrap_or(3),
        point_in_time: Some(Utc::now()),
        forget_rate: Some(params.forget_rate.unwrap_or(0.0)),
    };

    let response = execute_command(&state, |response| NodeCommand::QueryTrust { 
        query, 
        response 
    }).await?;
    
    tracing::debug!("API: Received response with {} scores for single trust query", response.scores.len());
    let trust_score = response
        .scores
        .into_iter()
        .find(|agent_score| agent_score.id_domain == id_domain && agent_score.agent_id == agent_id)
        .map(|agent_score| agent_score.score)
        .unwrap_or_else(|| TrustScore::default()); // Return default score (PV-ROI=1, volume=0) instead of 404
    
    Ok(Json(trust_score))
}

async fn query_trust_batch(
    State(state): State<ApiState>,
    Json(query): Json<TrustQuery>,
) -> Result<Json<TrustResponse>, StatusCode> {
    let response = execute_command(&state, |response| NodeCommand::QueryTrust { 
        query, 
        response 
    }).await?;

    Ok(Json(response))
}

async fn get_peers(State(state): State<ApiState>) -> Result<Json<Vec<Peer>>, StatusCode> {
    let peers = execute_command(&state, |response| NodeCommand::GetPeers { 
        response 
    }).await?;

    Ok(Json(peers))
}

#[derive(Deserialize)]
pub struct AddPeerRequest {
    pub peer_id: String,
    pub name: String,
    pub recommender_quality: Option<f64>,
}

async fn add_peer(
    State(state): State<ApiState>,
    Json(req): Json<AddPeerRequest>,
) -> Result<Json<Peer>, StatusCode> {
    let peer = Peer {
        peer_id: req.peer_id,
        name: req.name,
        recommender_quality: req.recommender_quality.unwrap_or(0.5),
        added_at: Utc::now(),
    };

    match execute_command(&state, |response| NodeCommand::AddPeer {
        peer: peer.clone(),
        response,
    }).await {
        Ok(_) => Ok(Json(peer)),
        Err(_) => {
            // Return a more specific error for duplicates
            // This will be improved when we add proper error types
            Err(StatusCode::CONFLICT)
        }
    }
}

#[derive(Deserialize)]
pub struct UpdateQualityRequest {
    pub quality: f64,
}

async fn update_peer_quality(
    State(state): State<ApiState>,
    Path(peer_id): Path<String>,
    Json(req): Json<UpdateQualityRequest>,
) -> Result<StatusCode, StatusCode> {
    execute_command(&state, |response| NodeCommand::UpdatePeerQuality {
        peer_id,
        quality: req.quality,
        response,
    }).await?;

    Ok(StatusCode::OK)
}

async fn delete_peer(
    State(state): State<ApiState>,
    Path(peer_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    execute_command(&state, |response| NodeCommand::RemovePeer {
        peer_id,
        response,
    }).await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn get_connected_peers(State(state): State<ApiState>) -> Result<Json<Vec<String>>, StatusCode> {
    let connected_peers = execute_command(&state, |response| NodeCommand::GetConnectedPeers { 
        response 
    }).await?;

    Ok(Json(connected_peers))
}

async fn get_self_peer_id(State(state): State<ApiState>) -> Result<Json<String>, StatusCode> {
    let self_peer_id = execute_command(&state, |response| NodeCommand::GetSelfPeerId { 
        response 
    }).await?;

    Ok(Json(self_peer_id))
}

async fn trigger_peer_discovery(State(state): State<ApiState>) -> Result<StatusCode, StatusCode> {
    execute_command(&state, |response| NodeCommand::TriggerPeerDiscovery { 
        response 
    }).await?;

    Ok(StatusCode::OK)
}

async fn delete_experience(
    State(state): State<ApiState>,
    Path(experience_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    execute_command(&state, |response| NodeCommand::RemoveExperience {
        experience_id,
        response,
    }).await?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct ImportRequest {
    pub data: TrustDataExport,
    pub overwrite: Option<bool>,
}

async fn export_trust_data(State(state): State<ApiState>) -> Result<Json<TrustDataExport>, StatusCode> {
    let export_data = execute_command(&state, |response| NodeCommand::ExportTrustData { 
        response 
    }).await?;

    Ok(Json(export_data))
}

async fn import_trust_data(
    State(state): State<ApiState>,
    Json(req): Json<ImportRequest>,
) -> Result<StatusCode, StatusCode> {
    execute_command(&state, |response| NodeCommand::ImportTrustData {
        data: req.data,
        overwrite: req.overwrite.unwrap_or(false),
        response,
    }).await?;

    Ok(StatusCode::OK)
}

async fn clear_peers(State(state): State<ApiState>) -> Result<StatusCode, StatusCode> {
    execute_command(&state, |response| NodeCommand::ClearPeers { response }).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn clear_experiences(State(state): State<ApiState>) -> Result<StatusCode, StatusCode> {
    execute_command(&state, |response| NodeCommand::ClearExperiences { response }).await?;
    Ok(StatusCode::NO_CONTENT)
}