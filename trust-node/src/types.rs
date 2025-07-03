use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustExperience {
    pub id: Uuid,
    pub id_domain: String,
    pub agent_id: String,
    pub pv_roi: f64,
    pub invested_volume: f64,
    pub timestamp: DateTime<Utc>,
    pub notes: Option<String>,
    pub data: Option<serde_json::Value>, // Adapter-specific data (e.g., tx links, purchase info)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustScore {
    pub expected_pv_roi: f64,
    pub total_volume: f64,
    pub data_points: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Peer {
    pub peer_id: String,
    pub name: String,
    pub recommender_quality: f64,
    pub added_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustQuery {
    pub agents: Vec<AgentIdentifier>,
    pub max_depth: u8,
    pub point_in_time: Option<DateTime<Utc>>,
    pub forget_rate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentIdentifier {
    pub id_domain: String,
    pub agent_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustResponse {
    pub scores: Vec<AgentScore>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentScore {
    pub id_domain: String,
    pub agent_id: String,
    pub score: TrustScore,
}

/// Cached trust score from a peer's recommendation
/// 
/// The key distinction between fields:
/// - `id_domain` + `agent_id`: The entity being evaluated (e.g., domain="ethereum", agent_id="0x123")
/// - `from_peer`: The peer who provided this trust score (e.g., PeerId of the recommending node)
/// 
/// Example: Alice (from_peer) recommends trust score for Bob's Ethereum address (id_domain="ethereum", agent_id="0x123")
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedTrustScore {
    pub id_domain: String,    // The domain of the entity being evaluated
    pub agent_id: String,     // The agent identifier within that domain
    pub score: TrustScore,    // The trust score for this agent
    pub from_peer: String,    // The peer who provided this recommendation
    pub cached_at: DateTime<Utc>, // When this score was cached
}

impl TrustExperience {
    pub fn aged_volume(&self, point_in_time: DateTime<Utc>, forget_rate: f64) -> f64 {
        let years_elapsed = (point_in_time - self.timestamp).num_days() as f64 / 365.0;
        let age_factor = (1.0 - years_elapsed.abs() * forget_rate).max(0.0);
        self.invested_volume * age_factor
    }
}

impl Default for TrustScore {
    fn default() -> Self {
        Self {
            expected_pv_roi: 1.0,
            total_volume: 0.0,
            data_points: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustDataExport {
    pub version: String,
    pub exported_at: DateTime<Utc>,
    pub experiences: Vec<TrustExperience>,
    pub peers: Vec<Peer>,
}

impl TrustDataExport {
    pub fn new(experiences: Vec<TrustExperience>, peers: Vec<Peer>) -> Self {
        Self {
            version: "1.0".to_string(),
            exported_at: Utc::now(),
            experiences,
            peers,
        }
    }
}

impl AgentIdentifier {
    pub fn new(id_domain: impl Into<String>, agent_id: impl Into<String>) -> Self {
        Self {
            id_domain: id_domain.into(),
            agent_id: agent_id.into(),
        }
    }

}

impl AgentScore {
    pub fn new(id_domain: impl Into<String>, agent_id: impl Into<String>, score: TrustScore) -> Self {
        Self {
            id_domain: id_domain.into(),
            agent_id: agent_id.into(),
            score,
        }
    }
}