use trust_node::{
    storage::{Storage, SqliteStorage},
    types::{CachedTrustScore, TrustScore},
};
use chrono::Utc;
use std::path::PathBuf;

#[tokio::test]
async fn test_trust_score_caching() {
    // Use an in-memory database for testing
    let db_path = PathBuf::from(":memory:");
    let storage = SqliteStorage::new(&db_path).await.unwrap();

    let agent_id = "test_agent";
    let from_peer = "peer123";
    
    // Create a cached trust score
    let cached_score = CachedTrustScore {
        id_domain: "test".to_string(),
        agent_id: agent_id.to_string(),
        score: TrustScore {
            expected_pv_roi: 1.2,
            total_volume: 1000.0,
            data_points: 5,
        },
        from_peer: from_peer.to_string(),
        cached_at: Utc::now(),
    };

    // Cache the score
    storage.cache_trust_score(cached_score.clone()).await.unwrap();

    // Retrieve cached scores
    let retrieved = storage.get_cached_scores("test", agent_id).await.unwrap();
    
    assert_eq!(retrieved.len(), 1);
    assert_eq!(retrieved[0].agent_id, agent_id);
    assert_eq!(retrieved[0].from_peer, from_peer);
    assert_eq!(retrieved[0].score.expected_pv_roi, 1.2);
    assert_eq!(retrieved[0].score.total_volume, 1000.0);
    assert_eq!(retrieved[0].score.data_points, 5);
}

#[tokio::test]
async fn test_multiple_peer_caching() {
    let db_path = PathBuf::from(":memory:");
    let storage = SqliteStorage::new(&db_path).await.unwrap();

    let agent_id = "test_agent";
    
    // Cache scores from multiple peers
    for i in 0..3 {
        let cached_score = CachedTrustScore {
            id_domain: "test".to_string(),
            agent_id: agent_id.to_string(),
            score: TrustScore {
                expected_pv_roi: 1.0 + (i as f64 * 0.1),
                total_volume: 100.0 * (i + 1) as f64,
                data_points: i + 1,
            },
            from_peer: format!("peer{}", i),
            cached_at: Utc::now(),
        };
        storage.cache_trust_score(cached_score).await.unwrap();
    }

    // Retrieve all cached scores for the agent
    let retrieved = storage.get_cached_scores("test", agent_id).await.unwrap();
    
    assert_eq!(retrieved.len(), 3);
    
    // Verify each peer's score is present
    for i in 0..3 {
        let peer_score = retrieved.iter()
            .find(|s| s.from_peer == format!("peer{}", i))
            .expect("Should find peer score");
        
        assert_eq!(peer_score.score.expected_pv_roi, 1.0 + (i as f64 * 0.1));
        assert_eq!(peer_score.score.total_volume, 100.0 * (i + 1) as f64);
        assert_eq!(peer_score.score.data_points, i + 1);
    }
}

#[tokio::test]
async fn test_cache_update() {
    let db_path = PathBuf::from(":memory:");
    let storage = SqliteStorage::new(&db_path).await.unwrap();

    let agent_id = "test_agent";
    let from_peer = "peer123";
    
    // Cache initial score
    let initial_score = CachedTrustScore {
        id_domain: "test".to_string(),
        agent_id: agent_id.to_string(),
        score: TrustScore {
            expected_pv_roi: 1.0,
            total_volume: 100.0,
            data_points: 1,
        },
        from_peer: from_peer.to_string(),
        cached_at: Utc::now(),
    };
    storage.cache_trust_score(initial_score).await.unwrap();

    // Update with new score from same peer
    let updated_score = CachedTrustScore {
        id_domain: "test".to_string(),
        agent_id: agent_id.to_string(),
        score: TrustScore {
            expected_pv_roi: 1.5,
            total_volume: 200.0,
            data_points: 2,
        },
        from_peer: from_peer.to_string(),
        cached_at: Utc::now(),
    };
    storage.cache_trust_score(updated_score).await.unwrap();

    // Should only have one score (updated)
    let retrieved = storage.get_cached_scores("test", agent_id).await.unwrap();
    
    assert_eq!(retrieved.len(), 1);
    assert_eq!(retrieved[0].score.expected_pv_roi, 1.5);
    assert_eq!(retrieved[0].score.total_volume, 200.0);
    assert_eq!(retrieved[0].score.data_points, 2);
}