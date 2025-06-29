use tempfile::TempDir;
use trust_node::{
    query_engine::QueryEngine,
    storage::{Storage, SqliteStorage},
    types::{TrustExperience, TrustQuery, Peer},
};
use uuid::Uuid;
use chrono::Utc;
use std::sync::Arc;

#[tokio::test]  
async fn test_storage_operations() {
    // Use an in-memory database for testing
    let db_path = std::path::PathBuf::from(":memory:");
    let storage = SqliteStorage::new(&db_path).await.unwrap();

    // Test adding and retrieving experiences
    let experience = TrustExperience {
        id: Uuid::new_v4(),
        agent_id: "test_agent".to_string(),
        pv_roi: 0.8,
        invested_volume: 100.0,
        timestamp: Utc::now(),
        notes: Some("Test experience".to_string()),
        data: None,
    };

    storage.add_experience(experience.clone()).await.unwrap();
    let retrieved = storage.get_experiences("test_agent").await.unwrap();
    
    assert_eq!(retrieved.len(), 1);
    assert_eq!(retrieved[0].agent_id, experience.agent_id);
    assert_eq!(retrieved[0].pv_roi, experience.pv_roi);
}

#[tokio::test]
async fn test_volume_weighted_calculations() {
    // Use an in-memory database for testing
    let db_path = std::path::PathBuf::from(":memory:");
    let storage = Arc::new(SqliteStorage::new(&db_path).await.unwrap());
    let query_engine = QueryEngine::new(storage.clone());

    // Use a fixed timestamp to avoid aging effects
    let timestamp = Utc::now();
    
    // Add multiple experiences with different volumes
    let experiences = vec![
        TrustExperience {
            id: Uuid::new_v4(),
            agent_id: "target".to_string(),
            pv_roi: 0.5,
            invested_volume: 50.0,
            timestamp,
            notes: None,
            data: None,
        },
        TrustExperience {
            id: Uuid::new_v4(),
            agent_id: "target".to_string(),
            pv_roi: 0.9,
            invested_volume: 150.0,
            timestamp,
            notes: None,
            data: None,
        },
        TrustExperience {
            id: Uuid::new_v4(),
            agent_id: "target".to_string(),
            pv_roi: 0.3,
            invested_volume: 100.0,
            timestamp,
            notes: None,
            data: None,
        },
    ];

    for exp in experiences {
        storage.add_experience(exp).await.unwrap();
    }

    // Query trust score using the same timestamp
    let result = query_engine.calculate_trust_score(
        "target", 
        timestamp, 
        0.1
    ).await.unwrap();

    // Expected weighted average: (0.5*50 + 0.9*150 + 0.3*100) / (50 + 150 + 100) = 190/300 = 0.6333...
    let expected_roi = (0.5 * 50.0 + 0.9 * 150.0 + 0.3 * 100.0) / 300.0;
    assert!((result.expected_pv_roi - expected_roi).abs() < 0.01);
    assert_eq!(result.total_volume, 300.0);
    assert_eq!(result.data_points, 3);
}

#[tokio::test]
async fn test_peer_management() {
    // Use an in-memory database for testing
    let db_path = std::path::PathBuf::from(":memory:");
    let storage = SqliteStorage::new(&db_path).await.unwrap();

    // Test adding and retrieving peers
    let peer = Peer {
        peer_id: "test_peer".to_string(),
        name: "Test Peer".to_string(),
        recommender_quality: 0.8,
        added_at: Utc::now(),
    };

    storage.add_peer(peer.clone()).await.unwrap();
    let peers = storage.get_peers().await.unwrap();
    
    assert_eq!(peers.len(), 1);
    assert_eq!(peers[0].peer_id, peer.peer_id);
    assert_eq!(peers[0].recommender_quality, peer.recommender_quality);
}