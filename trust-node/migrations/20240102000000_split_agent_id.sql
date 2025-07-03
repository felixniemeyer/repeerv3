-- Add id_domain split and data field to experiences table
-- Since this is not a live system, we just drop and recreate

-- 1. Drop old tables
DROP TABLE IF EXISTS experiences;
DROP TABLE IF EXISTS cached_scores;

-- 2. Create experiences table with new structure
CREATE TABLE experiences (
    id TEXT PRIMARY KEY,
    id_domain TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    pv_roi REAL NOT NULL,
    invested_volume REAL NOT NULL,
    timestamp TEXT NOT NULL,
    notes TEXT,
    data TEXT, -- JSON for adapter-specific data
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create indexes for experiences
CREATE INDEX idx_experiences_id_domain ON experiences(id_domain);
CREATE INDEX idx_experiences_agent_id ON experiences(agent_id);
CREATE INDEX idx_experiences_composite ON experiences(id_domain, agent_id);
CREATE INDEX idx_experiences_timestamp ON experiences(timestamp);

-- 4. Create cached_scores table with new structure
CREATE TABLE cached_scores (
    id_domain TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    expected_pv_roi REAL NOT NULL,
    total_volume REAL NOT NULL,
    data_points INTEGER NOT NULL,
    from_peer TEXT NOT NULL,
    cached_at TEXT NOT NULL,
    PRIMARY KEY (id_domain, agent_id, from_peer)
);

-- 5. Create indexes for cached_scores
CREATE INDEX idx_cached_scores_id_domain ON cached_scores(id_domain);
CREATE INDEX idx_cached_scores_agent_id ON cached_scores(agent_id);
CREATE INDEX idx_cached_scores_composite ON cached_scores(id_domain, agent_id);
CREATE INDEX idx_cached_scores_cached_at ON cached_scores(cached_at);