# Repeer - Decentralized Subjective Trust Network

## Executive Summary

Repeer is a decentralized system for tracking and sharing subjective trust experiences, mirroring how humans naturally build trust networks. Users document their experiences with agents (sellers, services, addresses) and access friends' experiences to calculate trust scores for future interactions.

**Key Innovation:** Trust is measured using Present Value Return on Investment (PV-ROI) combined with interaction volume, creating an economically rigorous foundation for subjective trust decisions.

## Core Philosophy

### Trust Fundamentals
The only source of trust is personal experience. Even when relying on centralized authorities, we trust them based on prior experiences. Once we build initial trust, we can rely on recommendations from trusted parties to guide interactions with unknown agents (transitive trust).

### Why Decentralized Trust Matters
Any Web3 interaction benefits from trust information - whether booking accommodation on a decentralized Airbnb or choosing contractors on freelance markets. This is cyber anarchy: you are responsible for your own trust decisions. While centralized systems appear to offer more security through dispute resolution, in reality you become dependent on their survival. Repeer offers an alternative where you build and own your trust network.

## Trust Model

### Core Components

Trust consists of two metrics:

```rust
struct TrustScore {
    pv_roi: f64,            // Present value return on investment (e.g., 0.5 = lost 50%, 2.0 = doubled)
    invested_volume: f64,    // Economic weight (e.g., $1 vs $1,000,000)
    timestamp: Timestamp,    // When interaction occurred
}
```

### Present Value Return on Investment (PV-ROI)

PV-ROI normalizes all interactions to be comparable regardless of timeframe by accounting for time value:

**Example 1 - Lending:** Lend 10 BTC, receive 11.55 BTC after one year with 5% global interest rate:
- PV-ROI = (11.55 / 1.05) / 10 = 1.1

**Example 2 - Product Purchase:** Buy monitor for $200, productivity gain of $0.2/day for 2 years, sell for $80 (assuming 0% interest):
- Total return = $80 + ($0.2 × 365 × 2) = $226
- PV-ROI = $226 / $200 = 1.13

**Benefits:**
- All interactions comparable regardless of timeframe
- Fast resolution naturally scores higher
- Accounts for opportunity cost
- Subjective valuations supported (users judge non-monetary returns)

### Volume Weighting

Volume indicates the economic weight of experiences:
- High PV-ROI with low volume (lent $1, got $2 back) suggests limited trust capacity
- Volume weighting prevents over-reliance on small positive experiences
- Essential for combining multiple experiences meaningfully

### Combining Experiences

Multiple interactions with the same agent are combined using volume-weighted averages with temporal decay:

```
Example: Combining two experiences with 25% annual forget rate
- 2-year-old: 1000 volume @ 1.1 ROI → aged volume = 1000 × (1 - 2 × 0.25) = 500
- Recent: 1000 volume @ 1.0 ROI → aged volume = 1000
- Combined: (500 × 1.1 + 1000 × 1.0) / (500 + 1000) = 1.033
```

Users can set `forget_rate` (0 = never forget, 0.25 = 25% reduction per year).

### Network Trust (Transitive Trust)

Friends' experiences enrich trust calculations through recommender quality factors:

**Recommender Quality Scale:**
- `+1.0` = Perfect recommender (trust completely)
- `+0.5` = Decent recommender (50% weight)
- `0.0` = Ignore recommendations
- `-0.5` = Contrarian indicator (do 50% opposite)
- `-1.0` = Perfect reverse indicator

Friends' reported volumes are multiplied by this factor before incorporation. Own experiences always have factor 1.0.

## System Architecture

### Federation Model

One libp2p node per user, no data replication:

```
Alice's Node ←─ libp2p ─→ Bob's Node ←─ libp2p ─→ Charlie's Node
(PeerId: 12D3...)     (PeerId: QmX7...)     (PeerId: Qm9Y...)
    ↑                        ↑                      ↑
Browser Ext              Browser Ext           Browser Ext
(Local API)              (Local API)           (Local API)
```

### Query Propagation

When querying trust for an agent with depth=3:

```
        Me (depth=3)
       /  \
    Friend A (depth=2)    Friend B (depth=2)  
   /   \                 /   \
Friend C  Friend D   Friend E  Friend F
(depth=1) (depth=1)  (depth=1) (depth=1)
```

Each node decreases depth before forwarding, combines personal + friend information (if depth > 0), and applies recommender quality filtering.

### Caching Strategy

To handle offline peers, nodes cache aggregated trust scores:

```rust
async fn query_trust(target: &str, max_depth: u8) -> TrustScore {
    // 1. Get aged personal information
    let my_info = self.get_aged_personal_information(target);
    
    // 2. Try fresh network query (if depth allows)
    let fresh_info = if max_depth > 0 {
        self.query_network(target, max_depth).await.unwrap_or_default()
    } else { Vec::new() };
    
    // 3. Use aged cache as fallback if no fresh data
    let cached_info = if fresh_info.is_empty() {
        self.get_aged_cached_information(target)
    } else { Vec::new() };
    
    // 4. Combine using volume-based weighting
    combine_information([my_info, fresh_info, cached_info].concat())
}
```

Cached scores age using the same forget_rate as personal experiences, ensuring mathematical consistency.

## Technical Implementation

### Component Structure

```
├── trust-node/              # Rust libp2p nodes
│   ├── src/
│   │   ├── node.rs          # Core trust node logic
│   │   ├── protocols.rs     # libp2p trust protocols
│   │   ├── storage.rs       # Local experience storage
│   │   ├── query_engine.rs  # Tree traversal + caching
│   │   └── adapters/        # ID parsing adapters
├── trust-client/            # TypeScript client library
│   ├── src/
│   │   ├── client.ts        # HTTP API to local node
│   │   ├── types.ts         # Trust data structures
│   │   └── adapters/        # Website integration adapters
├── browser-extension/       # Browser extension
│   ├── src/
│   │   ├── popup.ts         # Trust management UI
│   │   ├── content.ts       # Inject trust scores
│   │   └── adapters/        # Platform-specific logic
└── tests/
    ├── multi_node.rs        # Federation testing
    └── integration.rs       # End-to-end scenarios
```

### Protocols

**trust-query:**
- List of agent IDs to evaluate
- Maximum depth (remaining hops)
- Optional: point in time (default: now)
- Optional: forget_rate override

**trust-response:**
- Aggregated trust score (PV-ROI + volume) per agent ID
- No individual experience details shared

### Platform Adapters

Adapters parse platform-specific IDs and integrate trust scores:

```typescript
interface IDAdapter {
    name: string;                    
    parseId(url: string): string;    
    validateId(id: string): boolean; 
    displayName(id: string): string; 
}

// Examples:
// - Ethereum: "ethereum:0x123..." 
// - AliExpress: "aliexpress:12345"
// - Domains: "domain:example.com"
```

Adapters can also:
- Automate experience recording (e.g., DeFi transactions)
- Provide UI guidance for subjective valuations
- Implement platform-specific trust visualization

### Trust Score Visualization

When no data exists: ROI = 1.0, volume = 0

Suggested color coding:
- Red (#f0f) for ROI = 0 (complete loss)
- Green (#0f0) for ROI = 2 (doubled investment)
- Opacity based on volume: `opacity = 1 / (1 + 0.001 × volume)`

## User Experience

### Browser Extension Features
- Inject trust scores on supported websites
- Add/manage recommenders via peer IDs or QR codes
- Record experiences (manual or automated)
- Request re-evaluation after time periods

### Integration Methods
1. **Extension-based:** Works on any website with an adapter
2. **Native integration:** Platforms implement Repeer directly
3. **Modular adapters:** Community-driven, similar to yt-dlp

## Use Cases

### Primary: DeFi Trust
- Ethereum address reputation on Etherscan
- Rate DeFi protocols, DEX trades, NFT purchases
- Clear ROI metrics from actual profit/loss

### Secondary: E-commerce Trust
- Product trust scores for AliExpress items
- Rate delivery, quality, seller reliability
- Aggregate friends' shopping experiences

### Tertiary: Website Trust
- Rate any website (valuable or waste of time)
- Optional blocking of low-trust domains
- General web browsing quality filter

## Development Roadmap

### Phase 1: Core Infrastructure
1. Rust trust node with libp2p protocols
2. TypeScript client library with local API
3. Multi-node test setup
4. Volume-weighted trust calculation
5. Ethereum + AliExpress + domain adapters

### Phase 2: Integration
1. Browser extension using client library
2. Real website integrations
3. Experience recording automation
4. Peer management UI

### Phase 3: Polish & Launch
1. UI/UX refinement
2. Performance optimization
3. Adapter development kit
4. Documentation and tutorials

## Testing Strategy

### Test-Driven Development
- Rust unit tests for node logic
- TypeScript integration tests using 3+ local nodes
- Playwright end-to-end tests for browser extension

### Example Test Scenario
```typescript
// Alice records high-volume positive experience
await alice.recordInteraction("ethereum:0x123...", {
    investment: 10000,     // $10K
    return_value: 12000,   // $12K return
    timeframe_days: 14,
    discount_rate: 0.05
});

// Bob queries through network
const score = await bob.queryTrust("ethereum:0x123...");
assert(score.expected_roi > 1.0);
assert(score.total_volume >= 10000);
```

## Future Considerations

### Technical Enhancements
- **Cross-platform identity linking** (connect same entity across platforms)
- **Variance metrics** for trust score confidence
- **Automatic recommender quality adjustment** based on prediction accuracy
- **Additional trust dimensions** (e.g., information reliability for social media)

### Economic Model
- **Micropayments** for query responses
  - Incentivize accurate reviews
  - Support specialized trust providers
  - Credit system for reciprocal sharing
- **Third-party node hosting** (similar to IPFS pinning services)

### Advanced Features
- **Temporal analysis** charts showing trust evolution
- **Predictive modeling** based on historical patterns
- **Specialized trust providers** doing extensive aggregation and analysis

## Key Benefits

1. **Subjective by Design:** Trust reflects personal networks, not global consensus
2. **Economically Rigorous:** PV-ROI enables fair comparison across all interaction types
3. **True Ownership:** Each user controls their identity and data
4. **Cross-Platform:** Works across Web2 and Web3 identities
5. **Volume-Aware:** Large investments naturally carry appropriate influence
6. **Modular Architecture:** Open adapter system for any platform
7. **Offline-Resilient:** Caching ensures functionality despite peer availability

## Success Metrics

### Hackathon Goals
- Multi-node federation working reliably
- Trust scores displaying on Etherscan + AliExpress + domains
- Browser extension installable and functional
- Clear value demonstration

### Long-term Vision
- Portable reputation across all internet services
- Measurable fraud reduction for network participants
- Thriving ecosystem of platform adapters
- Alternative to centralized trust systems