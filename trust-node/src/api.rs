use crate::node::NodeCommand;
use crate::types::{Peer, TrustExperience, TrustQuery, TrustResponse, TrustScore};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tokio::sync::mpsc;
use tower_http::cors::CorsLayer;
use tracing::info;
use uuid::Uuid;

#[derive(Clone)]
pub struct ApiState {
    pub command_tx: mpsc::Sender<NodeCommand>,
}

pub async fn run_api_server(port: u16, command_tx: mpsc::Sender<NodeCommand>) -> anyhow::Result<()> {
    let state = ApiState { command_tx };

    let app = Router::new()
        .route("/health", get(health))
        .route("/experiences", post(add_experience))
        .route("/experiences/:agent_id", get(get_experiences))
        .route("/trust/:agent_id", get(query_trust))
        .route("/trust/batch", post(query_trust_batch))
        .route("/peers", get(get_peers))
        .route("/peers", post(add_peer))
        .route("/peers/:peer_id/quality", post(update_peer_quality))
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
    pub agent_id: String,
    pub investment: f64,
    pub return_value: f64,
    pub timeframe_days: f64,
    pub discount_rate: Option<f64>,
    pub notes: Option<String>,
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
        agent_id: req.agent_id,
        pv_roi,
        invested_volume: req.investment,
        timestamp: Utc::now(),
        notes: req.notes,
    };

    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .command_tx
        .send(NodeCommand::AddExperience {
            experience: experience.clone(),
            response: tx,
        })
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    rx.await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(experience))
}

async fn get_experiences(
    State(state): State<ApiState>,
    Path(agent_id): Path<String>,
) -> Result<Json<Vec<TrustExperience>>, StatusCode> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .command_tx
        .send(NodeCommand::GetExperiences { agent_id, response: tx })
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let experiences = rx
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(experiences))
}

#[derive(Deserialize)]
pub struct TrustQueryParams {
    pub max_depth: Option<u8>,
    pub forget_rate: Option<f64>,
}

async fn query_trust(
    State(state): State<ApiState>,
    Path(agent_id): Path<String>,
    Query(params): Query<TrustQueryParams>,
) -> Result<Json<TrustScore>, StatusCode> {
    let query = TrustQuery {
        agent_ids: vec![agent_id.clone()],
        max_depth: params.max_depth.unwrap_or(3),
        point_in_time: Some(Utc::now()),
        forget_rate: Some(params.forget_rate.unwrap_or(0.0)),
    };

    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .command_tx
        .send(NodeCommand::QueryTrust { query, response: tx })
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response = rx
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    response
        .scores
        .into_iter()
        .find(|(id, _)| id == &agent_id)
        .map(|(_, score)| Json(score))
        .ok_or(StatusCode::NOT_FOUND)
}

async fn query_trust_batch(
    State(state): State<ApiState>,
    Json(query): Json<TrustQuery>,
) -> Result<Json<TrustResponse>, StatusCode> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .command_tx
        .send(NodeCommand::QueryTrust { query, response: tx })
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response = rx
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(response))
}

async fn get_peers(State(state): State<ApiState>) -> Result<Json<Vec<Peer>>, StatusCode> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .command_tx
        .send(NodeCommand::GetPeers { response: tx })
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let peers = rx
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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

    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .command_tx
        .send(NodeCommand::AddPeer {
            peer: peer.clone(),
            response: tx,
        })
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    rx.await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(peer))
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
    let (tx, rx) = tokio::sync::oneshot::channel();
    state
        .command_tx
        .send(NodeCommand::UpdatePeerQuality {
            peer_id,
            quality: req.quality,
            response: tx,
        })
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    rx.await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}