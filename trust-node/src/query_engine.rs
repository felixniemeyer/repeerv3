use crate::storage::Storage;
use crate::types::{TrustExperience, TrustScore};
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, warn};

pub struct QueryEngine<S: Storage> {
    storage: Arc<S>,
}

impl<S: Storage> QueryEngine<S> {
    pub fn new(storage: Arc<S>) -> Self {
        Self { storage }
    }

    pub async fn calculate_trust_score(
        &self,
        agent_id: &str,
        point_in_time: DateTime<Utc>,
        forget_rate: f64,
    ) -> anyhow::Result<TrustScore> {
        let experiences = self.storage.get_experiences(agent_id).await?;
        
        if experiences.is_empty() {
            return Ok(TrustScore::default());
        }

        let (weighted_roi, total_weight) = self.calculate_weighted_average(
            &experiences,
            point_in_time,
            forget_rate,
        );

        Ok(TrustScore {
            expected_pv_roi: weighted_roi,
            total_volume: total_weight,
            data_points: experiences.len(),
        })
    }

    pub async fn calculate_all_trust_scores(
        &self,
        point_in_time: DateTime<Utc>,
        forget_rate: f64,
    ) -> anyhow::Result<HashMap<String, TrustScore>> {
        let all_experiences = self.storage.get_all_experiences().await?;
        
        let mut scores_by_agent: HashMap<String, Vec<TrustExperience>> = HashMap::new();
        for exp in all_experiences {
            scores_by_agent
                .entry(exp.agent_id.clone())
                .or_default()
                .push(exp);
        }

        let mut results = HashMap::new();
        for (agent_id, experiences) in scores_by_agent {
            let (weighted_roi, total_weight) = self.calculate_weighted_average(
                &experiences,
                point_in_time,
                forget_rate,
            );

            results.insert(
                agent_id,
                TrustScore {
                    expected_pv_roi: weighted_roi,
                    total_volume: total_weight,
                    data_points: experiences.len(),
                },
            );
        }

        Ok(results)
    }

    fn calculate_weighted_average(
        &self,
        experiences: &[TrustExperience],
        point_in_time: DateTime<Utc>,
        forget_rate: f64,
    ) -> (f64, f64) {
        let mut weighted_sum = 0.0;
        let mut total_weight = 0.0;

        for exp in experiences {
            let aged_volume = exp.aged_volume(point_in_time, forget_rate);
            if aged_volume > 0.0 {
                weighted_sum += exp.pv_roi * aged_volume;
                total_weight += aged_volume;
            }
        }

        if total_weight > 0.0 {
            (weighted_sum / total_weight, total_weight)
        } else {
            (1.0, 0.0)
        }
    }

    pub async fn combine_trust_information(
        &self,
        agent_id: &str,
        personal_score: Option<TrustScore>,
        friend_scores: Vec<(String, TrustScore, f64)>, // (peer_id, score, recommender_quality)
        _point_in_time: DateTime<Utc>,
        _forget_rate: f64,
    ) -> TrustScore {
        let mut weighted_roi_sum = 0.0;
        let mut total_weight = 0.0;
        let mut data_points = 0;

        // Add personal score with full weight
        if let Some(score) = personal_score {
            if score.total_volume > 0.0 {
                weighted_roi_sum += score.expected_pv_roi * score.total_volume;
                total_weight += score.total_volume;
                data_points += score.data_points;
            }
        }

        // Add friend scores with recommender quality adjustment
        for (peer_id, score, recommender_quality) in friend_scores {
            if score.total_volume > 0.0 && recommender_quality.abs() > 0.0 {
                let adjusted_volume = score.total_volume * recommender_quality.abs();
                let roi = if recommender_quality < 0.0 {
                    // Contrarian indicator: invert the ROI around 1.0
                    2.0 - score.expected_pv_roi
                } else {
                    score.expected_pv_roi
                };
                
                weighted_roi_sum += roi * adjusted_volume;
                total_weight += adjusted_volume;
                data_points += score.data_points;
                
                debug!(
                    "Added friend {} score for {}: ROI={}, volume={}, quality={}",
                    peer_id, agent_id, roi, adjusted_volume, recommender_quality
                );
            }
        }

        if total_weight > 0.0 {
            TrustScore {
                expected_pv_roi: weighted_roi_sum / total_weight,
                total_volume: total_weight,
                data_points,
            }
        } else {
            TrustScore::default()
        }
    }

    pub async fn age_cached_scores(
        &self,
        cached_scores: Vec<crate::types::CachedTrustScore>,
        point_in_time: DateTime<Utc>,
        forget_rate: f64,
    ) -> Vec<(String, TrustScore)> {
        cached_scores
            .into_iter()
            .filter_map(|cached| {
                let years_elapsed = (point_in_time - cached.cached_at).num_days() as f64 / 365.0;
                let age_factor = (1.0 - years_elapsed.abs() * forget_rate).max(0.0);
                
                if age_factor > 0.0 {
                    let aged_score = TrustScore {
                        expected_pv_roi: cached.score.expected_pv_roi,
                        total_volume: cached.score.total_volume * age_factor,
                        data_points: cached.score.data_points,
                    };
                    Some((cached.from_peer, aged_score))
                } else {
                    None
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::SqliteStorage;
    use tempfile::tempdir;
    use uuid::Uuid;

    #[tokio::test]
    async fn test_trust_calculation() -> anyhow::Result<()> {
        let dir = tempdir()?;
        let storage = Arc::new(SqliteStorage::new(&dir.path().join("test.db")).await?);
        let engine = QueryEngine::new(storage.clone());

        let now = Utc::now();
        
        // Add two experiences for the same agent
        storage.add_experience(TrustExperience {
            id: Uuid::new_v4(),
            agent_id: "test_agent".to_string(),
            pv_roi: 1.2,
            invested_volume: 1000.0,
            timestamp: now,
            notes: None,
        }).await?;

        storage.add_experience(TrustExperience {
            id: Uuid::new_v4(),
            agent_id: "test_agent".to_string(),
            pv_roi: 0.8,
            invested_volume: 500.0,
            timestamp: now,
            notes: None,
        }).await?;

        let score = engine.calculate_trust_score("test_agent", now, 0.0).await?;
        
        // Expected: (1.2 * 1000 + 0.8 * 500) / (1000 + 500) = 1.067
        assert!((score.expected_pv_roi - 1.067).abs() < 0.001);
        assert_eq!(score.total_volume, 1500.0);
        assert_eq!(score.data_points, 2);

        Ok(())
    }
}