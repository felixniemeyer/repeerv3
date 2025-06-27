CREATE TABLE IF NOT EXISTS experiences (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    pv_roi REAL NOT NULL,
    invested_volume REAL NOT NULL,
    timestamp TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_experiences_agent_id ON experiences(agent_id);
CREATE INDEX idx_experiences_timestamp ON experiences(timestamp);

CREATE TABLE IF NOT EXISTS peers (
    peer_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    recommender_quality REAL NOT NULL DEFAULT 0.5,
    added_at TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_scores (
    agent_id TEXT NOT NULL,
    expected_pv_roi REAL NOT NULL,
    total_volume REAL NOT NULL,
    data_points INTEGER NOT NULL,
    from_peer TEXT NOT NULL,
    cached_at TEXT NOT NULL,
    PRIMARY KEY (agent_id, from_peer)
);

CREATE INDEX idx_cached_scores_agent_id ON cached_scores(agent_id);
CREATE INDEX idx_cached_scores_cached_at ON cached_scores(cached_at);