use crate::types::{CachedTrustScore, Peer, TrustExperience, TrustScore};
use anyhow::Result;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{sqlite::SqlitePool, Pool, Sqlite};
use std::path::Path;
use uuid::Uuid;

#[async_trait]
pub trait Storage: Send + Sync {
    async fn add_experience(&self, experience: TrustExperience) -> Result<()>;
    async fn get_experiences(&self, agent_id: &str) -> Result<Vec<TrustExperience>>;
    async fn get_all_experiences(&self) -> Result<Vec<TrustExperience>>;
    async fn remove_experience(&self, experience_id: &str) -> Result<()>;
    
    async fn add_peer(&self, peer: Peer) -> Result<()>;
    async fn get_peers(&self) -> Result<Vec<Peer>>;
    async fn update_peer_quality(&self, peer_id: &str, quality: f64) -> Result<()>;
    async fn remove_peer(&self, peer_id: &str) -> Result<()>;
    
    async fn cache_trust_score(&self, cached: CachedTrustScore) -> Result<()>;
    async fn get_cached_scores(&self, agent_id: &str) -> Result<Vec<CachedTrustScore>>;
}

pub struct SqliteStorage {
    pool: Pool<Sqlite>,
}

impl SqliteStorage {
    pub async fn new(path: &Path) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let db_url = format!("sqlite://{}?mode=rwc", path.display());
        let pool = SqlitePool::connect(&db_url).await?;
        
        // Create tables
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS experiences (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                pv_roi REAL NOT NULL,
                invested_volume REAL NOT NULL,
                timestamp TEXT NOT NULL,
                notes TEXT,
                data TEXT, -- JSON data from adapters
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            "#
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"CREATE INDEX IF NOT EXISTS idx_experiences_agent_id ON experiences(agent_id)"#
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"CREATE INDEX IF NOT EXISTS idx_experiences_timestamp ON experiences(timestamp)"#
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS peers (
                peer_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                recommender_quality REAL NOT NULL DEFAULT 0.5,
                added_at TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            "#
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS cached_scores (
                agent_id TEXT NOT NULL,
                expected_pv_roi REAL NOT NULL,
                total_volume REAL NOT NULL,
                data_points INTEGER NOT NULL,
                from_peer TEXT NOT NULL,
                cached_at TEXT NOT NULL,
                PRIMARY KEY (agent_id, from_peer)
            )
            "#
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"CREATE INDEX IF NOT EXISTS idx_cached_scores_agent_id ON cached_scores(agent_id)"#
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"CREATE INDEX IF NOT EXISTS idx_cached_scores_cached_at ON cached_scores(cached_at)"#
        )
        .execute(&pool)
        .await?;
        
        Ok(Self { pool })
    }
}

#[async_trait]
impl Storage for SqliteStorage {
    async fn add_experience(&self, experience: TrustExperience) -> Result<()> {
        let data_json = experience.data.as_ref()
            .map(|d| serde_json::to_string(d).unwrap_or_else(|_| "{}".to_string()));
            
        sqlx::query(
            r#"
            INSERT INTO experiences (id, agent_id, pv_roi, invested_volume, timestamp, notes, data)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#
        )
        .bind(experience.id.to_string())
        .bind(&experience.agent_id)
        .bind(experience.pv_roi)
        .bind(experience.invested_volume)
        .bind(experience.timestamp.to_rfc3339())
        .bind(&experience.notes)
        .bind(&data_json)
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }

    async fn get_experiences(&self, agent_id: &str) -> Result<Vec<TrustExperience>> {
        #[derive(sqlx::FromRow)]
        struct ExperienceRow {
            id: String,
            agent_id: String,
            pv_roi: f64,
            invested_volume: f64,
            timestamp: String,
            notes: Option<String>,
            data: Option<String>,
        }
        
        let rows = sqlx::query_as::<_, ExperienceRow>(
            r#"
            SELECT id, agent_id, pv_roi, invested_volume, timestamp, notes, data
            FROM experiences
            WHERE agent_id = ?1
            ORDER BY timestamp DESC
            "#
        )
        .bind(agent_id)
        .fetch_all(&self.pool)
        .await?;
        
        let experiences = rows
            .into_iter()
            .map(|row| TrustExperience {
                id: Uuid::parse_str(&row.id).unwrap(),
                agent_id: row.agent_id,
                pv_roi: row.pv_roi,
                invested_volume: row.invested_volume,
                timestamp: DateTime::parse_from_rfc3339(&row.timestamp).unwrap().with_timezone(&Utc),
                notes: row.notes,
                data: row.data.and_then(|d| serde_json::from_str(&d).ok()),
            })
            .collect();
        
        Ok(experiences)
    }

    async fn get_all_experiences(&self) -> Result<Vec<TrustExperience>> {
        #[derive(sqlx::FromRow)]
        struct ExperienceRow {
            id: String,
            agent_id: String,
            pv_roi: f64,
            invested_volume: f64,
            timestamp: String,
            notes: Option<String>,
            data: Option<String>,
        }
        
        let rows = sqlx::query_as::<_, ExperienceRow>(
            r#"
            SELECT id, agent_id, pv_roi, invested_volume, timestamp, notes, data
            FROM experiences
            ORDER BY timestamp DESC
            "#
        )
        .fetch_all(&self.pool)
        .await?;
        
        let experiences = rows
            .into_iter()
            .map(|row| TrustExperience {
                id: Uuid::parse_str(&row.id).unwrap(),
                agent_id: row.agent_id,
                pv_roi: row.pv_roi,
                invested_volume: row.invested_volume,
                timestamp: DateTime::parse_from_rfc3339(&row.timestamp).unwrap().with_timezone(&Utc),
                notes: row.notes,
                data: row.data.and_then(|d| serde_json::from_str(&d).ok()),
            })
            .collect();
        
        Ok(experiences)
    }

    async fn add_peer(&self, peer: Peer) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO peers (peer_id, name, recommender_quality, added_at)
            VALUES (?1, ?2, ?3, ?4)
            "#
        )
        .bind(&peer.peer_id)
        .bind(&peer.name)
        .bind(peer.recommender_quality)
        .bind(peer.added_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }

    async fn get_peers(&self) -> Result<Vec<Peer>> {
        #[derive(sqlx::FromRow)]
        struct PeerRow {
            peer_id: String,
            name: String,
            recommender_quality: f64,
            added_at: String,
        }
        
        let rows = sqlx::query_as::<_, PeerRow>(
            r#"
            SELECT peer_id, name, recommender_quality, added_at
            FROM peers
            ORDER BY added_at DESC
            "#
        )
        .fetch_all(&self.pool)
        .await?;
        
        let peers = rows
            .into_iter()
            .map(|row| Peer {
                peer_id: row.peer_id,
                name: row.name,
                recommender_quality: row.recommender_quality,
                added_at: DateTime::parse_from_rfc3339(&row.added_at).unwrap().with_timezone(&Utc),
            })
            .collect();
        
        Ok(peers)
    }

    async fn update_peer_quality(&self, peer_id: &str, quality: f64) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE peers SET recommender_quality = ?1 WHERE peer_id = ?2
            "#
        )
        .bind(quality)
        .bind(peer_id)
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }

    async fn remove_peer(&self, peer_id: &str) -> Result<()> {
        sqlx::query(
            r#"
            DELETE FROM peers WHERE peer_id = ?1
            "#
        )
        .bind(peer_id)
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }

    async fn remove_experience(&self, experience_id: &str) -> Result<()> {
        sqlx::query(
            r#"
            DELETE FROM experiences WHERE id = ?1
            "#
        )
        .bind(experience_id)
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }

    async fn cache_trust_score(&self, cached: CachedTrustScore) -> Result<()> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO cached_scores 
            (agent_id, expected_pv_roi, total_volume, data_points, from_peer, cached_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#
        )
        .bind(&cached.agent_id)
        .bind(cached.score.expected_pv_roi)
        .bind(cached.score.total_volume)
        .bind(cached.score.data_points as i64)
        .bind(&cached.from_peer)
        .bind(cached.cached_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }

    async fn get_cached_scores(&self, agent_id: &str) -> Result<Vec<CachedTrustScore>> {
        #[derive(sqlx::FromRow)]
        struct CachedScoreRow {
            agent_id: String,
            expected_pv_roi: f64,
            total_volume: f64,
            data_points: i64,
            from_peer: String,
            cached_at: String,
        }
        
        let rows = sqlx::query_as::<_, CachedScoreRow>(
            r#"
            SELECT agent_id, expected_pv_roi, total_volume, data_points, from_peer, cached_at
            FROM cached_scores
            WHERE agent_id = ?1
            ORDER BY cached_at DESC
            "#
        )
        .bind(agent_id)
        .fetch_all(&self.pool)
        .await?;
        
        Ok(rows
            .into_iter()
            .map(|row| CachedTrustScore {
                agent_id: row.agent_id,
                score: TrustScore {
                    expected_pv_roi: row.expected_pv_roi,
                    total_volume: row.total_volume,
                    data_points: row.data_points as usize,
                },
                from_peer: row.from_peer,
                cached_at: DateTime::parse_from_rfc3339(&row.cached_at).unwrap().with_timezone(&Utc),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_storage_operations() -> Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test.db");
        println!("Test database path: {:?}", db_path);
        let storage = SqliteStorage::new(&db_path).await?;
        
        let experience = TrustExperience {
            id: Uuid::new_v4(),
            agent_id: "ethereum:0x123".to_string(),
            pv_roi: 1.1,
            invested_volume: 1000.0,
            timestamp: Utc::now(),
            notes: Some("Test experience".to_string()),
            data: None,
        };
        
        storage.add_experience(experience.clone()).await?;
        
        let experiences = storage.get_experiences("ethereum:0x123").await?;
        assert_eq!(experiences.len(), 1);
        assert_eq!(experiences[0].pv_roi, 1.1);
        
        Ok(())
    }
}