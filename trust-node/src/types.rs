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

impl TrustScore {
    /// Create a new trust score
    pub fn new(expected_pv_roi: f64, total_volume: f64, data_points: usize) -> Self {
        Self {
            expected_pv_roi,
            total_volume,
            data_points,
        }
    }

    /// Merge this trust score with another, using volume-weighted averaging
    /// 
    /// # Arguments
    /// * `other` - The other trust score to merge with
    /// * `other_weight` - Quality multiplier for the other score (e.g., recommender quality)
    /// 
    /// # Returns
    /// A new TrustScore representing the merged result
    pub fn merge_with(&self, other: &TrustScore, other_weight: f64) -> TrustScore {
        let self_adjusted_volume = self.total_volume;
        let other_adjusted_volume = other.total_volume * other_weight.abs();

        if self_adjusted_volume == 0.0 && other_adjusted_volume == 0.0 {
            return TrustScore::default();
        }

        let total_weight = self_adjusted_volume + other_adjusted_volume;
        
        // Handle negative recommender quality by inverting ROI (2.0 - roi)
        let other_roi = if other_weight < 0.0 {
            2.0 - other.expected_pv_roi
        } else {
            other.expected_pv_roi
        };

        let weighted_roi = if total_weight > 0.0 {
            (self.expected_pv_roi * self_adjusted_volume + other_roi * other_adjusted_volume) / total_weight
        } else {
            1.0 // Default neutral ROI
        };

        TrustScore {
            expected_pv_roi: weighted_roi,
            total_volume: total_weight,
            data_points: self.data_points + other.data_points,
        }
    }

    /// Merge multiple trust scores with their respective weights
    /// 
    /// # Arguments
    /// * `scores` - Vector of (trust_score, weight) tuples
    /// 
    /// # Returns
    /// A new TrustScore representing the merged result
    pub fn merge_multiple(scores: Vec<(TrustScore, f64)>) -> TrustScore {
        if scores.is_empty() {
            return TrustScore::default();
        }

        // Start with the first score instead of default to avoid merging with empty
        let mut scores_iter = scores.into_iter();
        let (mut result, first_weight) = scores_iter.next().unwrap();
        
        // Apply weight to the first score
        if first_weight != 1.0 {
            result.total_volume *= first_weight.abs();
            if first_weight < 0.0 {
                result.expected_pv_roi = 2.0 - result.expected_pv_roi;
            }
        }
        
        // Merge remaining scores
        for (score, weight) in scores_iter {
            result = result.merge_with(&score, weight);
        }
        result
    }

    /// Check if this trust score has any data
    pub fn has_data(&self) -> bool {
        self.data_points > 0 && self.total_volume > 0.0
    }
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