# Repeer Trust Network - Pseudocode Translation

## Core Concepts

The Repeer system implements a decentralized trust network that calculates reputation scores based on peer-to-peer experiences using Present Value Return on Investment (PV-ROI) calculations.

## Data Structures

```pseudocode
STRUCT TrustExperience:
    id: UUID
    agent_id: STRING              // Who/what this experience is about (e.g., "ethereum:0x123")
    pv_roi: FLOAT                 // Present value return on investment
    invested_volume: FLOAT        // Amount invested/risked
    timestamp: DATETIME           // When this experience occurred
    notes: OPTIONAL[STRING]       // Human-readable description
    data: OPTIONAL[JSON]          // Adapter-specific metadata

STRUCT TrustScore:
    expected_pv_roi: FLOAT        // Weighted average expected return
    total_volume: FLOAT           // Sum of aged invested volumes
    data_points: INT              // Number of experiences contributing

STRUCT Peer:
    peer_id: STRING               // Network identifier
    name: STRING                  // Human-readable name
    recommender_quality: FLOAT    // How much to trust this peer's recommendations (-1 to 1)
    added_at: DATETIME

STRUCT CachedTrustScore:
    agent_id: STRING              // Who this score is for
    score: TrustScore            // The calculated trust score
    from_peer: STRING            // Which peer provided this recommendation
    cached_at: DATETIME          // When this was cached
```

## Core Algorithms

### PV-ROI Calculation
```pseudocode
FUNCTION calculate_pv_roi(investment, return_value, timeframe_days, discount_rate = 0.05):
    years = timeframe_days / 365.0
    present_value = return_value / (1 + discount_rate) ^ years
    pv_roi = present_value / investment
    RETURN pv_roi
```

### Trust Score Aggregation
```pseudocode
FUNCTION calculate_trust_score(experiences[], point_in_time, forget_rate = 0.0):
    total_weighted_roi = 0.0
    total_aged_volume = 0.0
    
    FOR EACH experience IN experiences:
        // Apply temporal decay to reduce weight of old experiences
        years_elapsed = (point_in_time - experience.timestamp) / 365.0
        age_factor = MAX(0.0, 1.0 - years_elapsed * forget_rate)
        aged_volume = experience.invested_volume * age_factor
        
        total_weighted_roi += experience.pv_roi * aged_volume
        total_aged_volume += aged_volume
    
    IF total_aged_volume > 0:
        expected_roi = total_weighted_roi / total_aged_volume
    ELSE:
        expected_roi = 1.0  // Neutral
    
    RETURN TrustScore(expected_roi, total_aged_volume, COUNT(experiences))
```

### Transitive Trust Calculation
```pseudocode
FUNCTION calculate_transitive_trust(agent_id, max_depth, current_depth = 0):
    IF current_depth >= max_depth:
        RETURN default_trust_score()
    
    // Get direct experiences for this agent
    direct_experiences = storage.get_experiences(agent_id)
    direct_score = calculate_trust_score(direct_experiences)
    
    // Get recommendations from trusted peers
    peer_recommendations = []
    FOR EACH peer IN get_trusted_peers():
        peer_score = request_trust_score_from_peer(peer, agent_id)
        IF peer_score EXISTS:
            // Weight by peer's recommender quality
            weighted_score = peer_score * peer.recommender_quality
            peer_recommendations.ADD(weighted_score)
    
    // Combine direct experience with peer recommendations
    combined_score = combine_scores(direct_score, peer_recommendations)
    RETURN combined_score
```

## Network Architecture

### P2P Node Components
```pseudocode
CLASS TrustNode:
    PROPERTIES:
        p2p_network: LibP2P_Swarm
        storage: Database_Interface
        query_engine: Query_Engine
        api_server: HTTP_Server
        command_queue: Message_Queue
    
    FUNCTION initialize(p2p_port, api_port, storage, bootstrap_peers):
        setup_libp2p_network(p2p_port)
        connect_to_bootstrap_peers(bootstrap_peers)
        start_http_api_server(api_port)
        start_command_processing_loop()
    
    FUNCTION run():
        LOOP FOREVER:
            SELECT:
                CASE p2p_message_received:
                    handle_p2p_message(message)
                CASE api_command_received:
                    process_api_command(command)
                CASE periodic_maintenance:
                    discover_new_peers()
                    cleanup_expired_cache()
```

### P2P Protocol Messages
```pseudocode
ENUM MessageType:
    TrustQueryRequest
    TrustQueryResponse

FUNCTION handle_trust_query_request(query, from_peer):
    scores = query_engine.calculate_trust_scores(query.agent_ids, query.max_depth)
    response = TrustQueryResponse(scores, current_timestamp)
    send_to_peer(from_peer, response)

// Note: No experience syncing! Each node only stores its own experiences.
// We cache query RESULTS (trust scores) from peers, not raw experiences.
```

## API Layer

### REST Endpoints
```pseudocode
API_ROUTES:
    GET /health                          -> "OK"
    POST /experiences                    -> add_experience(request)
    GET /experiences/:agent_id           -> get_experiences(agent_id)
    DELETE /experiences/:experience_id   -> delete_experience(experience_id)
    GET /trust/:agent_id                 -> query_trust(agent_id, params)
    POST /trust/batch                    -> query_trust_batch(query)
    GET /peers                           -> get_peers()
    POST /peers                          -> add_peer(peer_data)
    DELETE /peers/:peer_id               -> delete_peer(peer_id)
    GET /export                          -> export_trust_data()
    POST /import                         -> import_trust_data(data)

FUNCTION add_experience(request):
    pv_roi = calculate_pv_roi(
        request.investment, 
        request.return_value, 
        request.timeframe_days,
        request.discount_rate OR 0.05
    )
    
    experience = TrustExperience(
        id: generate_uuid(),
        agent_id: request.agent_id,
        pv_roi: pv_roi,
        invested_volume: request.investment,
        timestamp: current_time(),
        notes: request.notes,
        data: request.data
    )
    
    storage.save_experience(experience)
    RETURN experience
```

## Storage Layer

### Database Operations
```pseudocode
INTERFACE Storage:
    FUNCTION get_experiences(agent_id) -> TrustExperience[]
    FUNCTION add_experience(experience) -> VOID
    FUNCTION remove_experience(experience_id) -> VOID
    FUNCTION get_peers() -> Peer[]
    FUNCTION add_peer(peer) -> VOID
    FUNCTION remove_peer(peer_id) -> VOID
    FUNCTION cache_trust_score(cached_score) -> VOID
    FUNCTION get_cached_scores(agent_id) -> CachedTrustScore[]

CLASS SqliteStorage IMPLEMENTS Storage:
    FUNCTION initialize(database_path):
        connection = sqlite.connect(database_path + "?mode=rwc")
        run_migrations()
    
    FUNCTION get_experiences(agent_id):
        query = "SELECT * FROM experiences WHERE agent_id = ? ORDER BY timestamp DESC"
        results = connection.execute(query, [agent_id])
        RETURN map_to_trust_experiences(results)
```

## Browser Extension Integration

### Content Script Injection
```pseudocode
CLASS TrustScoreInjector:
    FUNCTION scan_page_for_identifiers():
        // Find Ethereum addresses
        ethereum_addresses = find_regex_matches("0x[a-fA-F0-9]{40}")
        
        // Find AliExpress products
        IF current_domain CONTAINS "aliexpress":
            product_id = extract_aliexpress_product_id(current_url)
        
        // Find external domain links
        external_links = find_all_external_links()
        
        FOR EACH identifier IN all_identifiers:
            trust_score = request_trust_score_from_background(identifier)
            inject_trust_badge(identifier, trust_score)

FUNCTION inject_trust_badge(element, agent_id, score):
    badge = create_element("div")
    badge.className = "repeer-trust-score"
    badge.innerHTML = format_trust_display(score)
    
    // Add click handler for recording experiences
    badge.onclick = show_experience_recording_modal(agent_id)
    
    element.appendChild(badge)
```

## Main Application Flow

```pseudocode
FUNCTION main():
    args = parse_command_line_arguments()
    
    // Initialize components
    storage = SqliteStorage.new(args.data_dir + "/" + args.user + ".db")
    trust_node = TrustNode.new(args.p2p_port, args.api_port, storage, args.bootstrap_peers)
    
    // Run both P2P node and API server concurrently
    PARALLEL:
        trust_node.run()              // P2P networking and command processing
        api_server.run()              // HTTP API for browser extension
    
    // The application runs indefinitely, handling:
    // 1. P2P messages for trust score queries and peer discovery
    // 2. HTTP API requests from browser extension
    // 3. Periodic maintenance (cache cleanup, peer discovery)
```

## Key Design Principles

1. **Decentralized Trust**: No central authority; trust scores computed from peer experiences
2. **PV-ROI Based**: Financial risk/return model provides quantitative trust metric  
3. **Temporal Decay**: Older experiences have less weight to reflect changing reliability
4. **Transitive Trust**: Leverage peer recommendations for entities with limited direct experience
5. **Adapter Pattern**: Extensible system for different platforms (Ethereum, AliExpress, domains)
6. **P2P Resilience**: Distributed network with no single point of failure
7. **Privacy Preserving**: Share aggregated scores, not raw experience details

This pseudocode captures the essential algorithms and architecture while remaining language-agnostic and focusing on the core trust computation logic.