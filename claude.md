# Repeer - Decentralized Subjective Trust Network

## Project Overview

Repeer is a decentralized system for tracking and sharing subjective trust experiences, mirroring how humans naturally build trust networks. Users document their experiences with agents (sellers, services, addresses) and access friends' experiences to calculate trust scores for future interactions.

### Motivation 
Any interaction e.g. booking a place for a holiday on a web3 version of airBnb or choosing a contractor on a web3 freelance market benefits from information whether that agent can be trusted. 

### Core Philosophy
The only source of trust is personal experience. Even when relying on centralized authorities we actually trust them based on prior experiences. Once we have built some trust, we can rely on recommendations from those we trust to guide our attempts to interact with yet unknown agents (transitive trust). 

### Trust Metric consists of ROI and volume

```rust
struct TrustScore {
    pv_roi: f64,            // present value return of invest. 0.5 (lost 50%) or 2.0 (doubled money)
    invested_volume: f64,    // $1,000,000 or $1 (economic weight)
    timestamp: Timestamp,    // When this interaction occurred
}
```

#### present time return of invest as a metric for past experiences
We measure how much we trust an agent in Present Value Return on Investment (PV-ROI). 

E.g. if we borrowed 10 Bitcoin and received 11.55 back a year later with a global average interest rate of 5% our trust for that agent is represented as a expected PV-ROI of (11.55 / 1.05) / 10 = 11 / 10 = 1.1. 

Other examples would be collaborating with someone. Or buying a product on AliExpress. In these cases the valuation is more nouanced. 

But let's say, you invest in a new monitor that costs 200 USD and makes your work more productive until you sell it 2 years later for 80 USD. The productivity gain was 0.2 USD per day and let's assume global interest rate is 0, then (80 + 0.2 * 365 * 2) / 200 = 1.13 would be the trust score for this product or for this merchant. 

**Time Normalization Benefits:**
- All interactions comparable regardless of timeframe
- Fast resolution naturally scores higher (no discounting penalty)
- Accounts for opportunity cost and time preference
- Economically rigorous foundation for trust decisions

#### volume 
To make an informed decision what size of investment we can entrust someone, it is important to know how much volume the ROI-metric is based on. 

If someone has given us 2 EUR back when we borrowed him 1, that gives us a very high trust score of 2 PV-ROI but it's crucial to know that this value is based on just tiny interaction. In this case we should not assume that giving that person half a million EUR will yield a duplication as well. 

Therefore along with every interaction we store the investment volume. The volume is also very important to know when combining experiences with the same agent into one metric. 

#### combining experiences
Often we interact with the same agent multiple times. 

In order to make an informed decision about whether we can trust them for a future interaction, we want to combine all experiences into one metric. 

Therefore we calculate the average of PV-ROIs weighted by the experience volumes. 

#### relying on friends' and friends of friends' experiences
Often we don't havn't made experiences with agents yet but our friends have. Even if we have made own experiences, our trust score can be enriched with additional experiences people we trust have made. 
In order to draw from the experiences of our network, their recommendations are automatically requested and combined into the final score. 

Friends' nodes report their estimates (maybe even forwarding the request to their network first), and we weigh them based on our trust level for them. 

Therefore users maintain a recommender quality factor for their friends. The volumes friends report are multiplied with that factor before being incorporated into the final score. 

**Recommendation Quality Scale:**
- `+1.0` = Perfect recommender (trust completely, as much as youself)
- `+0.5` = Decent recommender (50% weight)
- `0.0` = Ignore this person's recommendations  
- `-0.5` = Contrarian indicator (do 50% opposite)
- `-1.0` = Perfect reverse indicator (do complete opposite)

**Economic Logic:** Recommender quality affects information **weight** (how much to trust it) rather than **content** (what actually happened).

Own experiences are taken as they are (factor 1) so a factor of > 1 might make sense in rare cases where you trust someone's experiences more than your own. 

**Future consideration:** Automatic recommender quality adjustments based on prediction accuracy. 

```
        Me (Query depth=3)
       /  \
    Friend A (depth=2)    Friend B (depth=2)  
   /   \                 /   \
Friend C  Friend D   Friend E  Friend F
(depth=1) (depth=1)  (depth=1) (depth=1)
```

**Query Algorithm:**
1. Each node decreases depth by 1 before forwarding
2. Nodes combine: personal information + filtered friend information (if depth > 0)  
3. Information bubbles up with volume-based weighting at each level
4. Cache all information with timestamps for offline scenarios
5. Recommendation quality filtering applied at each intermediary step

#### sometimes it might be interesting to see the temporal change in trustworthyness
Therefore the volume of any experience can be reduced according to the distance to a specific point in time. 

One similar use case may be to rely on more recent experiences more than on older ones.

When evaluating experiences for a point in time t we consider their age like this: 
```
volume *= (0, 1 - toYears(abs(t - t_experience)) * forget_rate)
```

The `forget_rate` can be set by the user and expresses how much we linearly decrease the weight of an experience per year. It can be 0 (never forget). 

### User experience
There is an extension that 
  - injects trust scores along ids
  - keeps track of interactions and asks for experience evaluation
    - may ask for experience evaluation reevaluation after a year

Various adapters for different websites exist. 
Anyone can add an adapter for a website

Websites, Platforms and Marketplaces can decide to implement repeer natively in their webapps (then no extension is needed). 

## Architecture: One Node Per User

### libp2p Federation Model
```
Alice's Node ←─ libp2p ─→ Bob's Node ←─ libp2p ─→ Charlie's Node
(PeerId: 12D3...)     (PeerId: QmX7...)     (PeerId: Qm9Y...)
    ↑                        ↑                      ↑
Browser Ext              Browser Ext           Browser Ext
(Local API)              (Local API)           (Local API)
```

#### Key Design Decisions
- **One libp2p node per user** - each user has their own PeerId and sovereign identity
- **Local data storage only** - each node stores only that user's experiences
- **On-demand network traversal** - no gossip, no data replication
- **Smart response caching** - cache query results to handle offline friends

For now, users need to run their own nodes. 

Maybe companies will provide nodes as a service at some point. Similar to IPFS pinning services or gateways. 

#### Adding Peers
Peers are added by entering their peer id along with a local name and the recommender quality factor. 

#### TypeScript library
There will be a typescipt library that makes communication with the libp2p rust node easy. 
This library will be used 
  - by the browser extension that injects agent trust scores on websites 
  - by websites that choose to integrate repeer natively
  - by the test suite

#### Modularity
Anyone can write modules for any website. 
E.g. x.com, github, amazon, netflix, ...

Similar to yt-dlp (youtube-downloader: initially for downloading videos from youtube now has adapters to download videos from many different websites). 

## Open questions

### Multiple Trust Dimensions
So far we have only discussed the ROI dimension of trust and the recommender quality factor, but there might be others, too. 

Or maybe the recommender quality dimension could be eliminated and the trust score (PV-ROI and volume) could be used for weighing recommendations, too. 
But currently it seems like to independent qualities: 
"How much can I invest with someone" (may it be time or money) vs. "How much can I rely on someones recommendations"

But maybe we could even allow more dimensions in the future. 
E.g. "how much can I rely on the information spread by someone to be truthful?" (for social media use cases). 

On the other hand it would be nice if we could measure trust in a single dimension. 

## Technical Implementation

### Tech Stack
- **Nodes:** Rust with libp2p
- **Client Library:** TypeScript (browser extension, mobile apps)
- **Integration:** Modular adapter system for websites
- **Testing:** Multi-node local federation

### Component Architecture
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
│   │   └── adapters/        # Ethereum, AliExpress, etc.
└── tests/
    ├── multi_node.rs        # Federation testing
    └── integration.rs       # End-to-end scenarios
```

### libp2p Protocols
trust-query: 
- list of agent-ids to get trust score for
- max depth (remaining hops to make)
- point in time (usually now)
- forget rate

trust-response: 
- list of experience score for every every agent-id from the query

reminder: reputation score has two components: 
  - PV-ROI 
  - volume

### ID Adapters
An adapter integrates repeer into existing websites or platforms. 

Each platform needs an adapter to parse canonical IDs:

```typescript
interface IDAdapter {
    name: string;                    // "ethereum", "aliexpress", "github"
    parseId(url: string): string;    // Extract canonical ID from URL
    validateId(id: string): boolean; // Validate ID format
    displayName(id: string): string; // Human-readable name
}

// Ethereum adapter
const ethereumAdapter: IDAdapter = {
    name: "ethereum",
    parseId: (url) => url.match(/0x[a-fA-F0-9]{40}/)?.[0] || "",
    validateId: (id) => /^0x[a-fA-F0-9]{40}$/.test(id),
    displayName: (id) => `${id.slice(0,6)}...${id.slice(-4)}`
};

// AliExpress adapter  
const aliexpressAdapter: IDAdapter = {
    name: "aliexpress",
    parseId: (url) => url.match(/item\/(\d+)/)?.[1] || "",
    validateId: (id) => /^\d+$/.test(id),
    displayName: (id) => `AliExpress Item ${id}`
};

// second level domain adapter
const sldAdapter: IDAdapter = {
  ...
}; 

```

For example the second level domain adapter will 
  - show a trust score for every link that leads to an external website. 
  - optionally 
    - show an experience rating tool 
    - ask for a experience review after total 15 minutes, 5h, 10 days usage of using the website

### Caching Strategy

Many people will use nodes that are offline sometimes (similar to IPFS local node that is being used by IPFS companion). Therefore, whenever receiving a trust score from a peer, we cache that value so that we at least have slightly outdated information in case the peer is offline. 

**Simple Fallback Model:**
```rust
async fn query_trust(target: &str, max_depth: u8) -> TrustScore {
    // 1. Get my aged personal information
    let my_info = self.get_aged_personal_information(target);
    
    // 2. Always try fresh network query first (if depth allows)
    let fresh_info = if max_depth > 0 {
        self.query_network(target, max_depth).await.unwrap_or_default()
    } else { Vec::new() };
    
    // 3. If no fresh information, use aged cache as fallback
    let cached_info = if fresh_info.is_empty() {
        self.get_aged_cached_information(target)
    } else { Vec::new() };
    
    // 4. Combine all using volume-based weighting
    combine_information([my_info].concat(fresh_info, cached_info))
}
```

**Mathematical Consistency for cache age:**
Cache entries contain an age. As long as the kernel is linear, we get the same result when age weighing a cache entry compared to requesting the trust score from out peer, given that no relevant experiences were changed or added in the meantime. 

### Volume-Weighted Information Combination

```rust
fn combine_information(infos: Vec<TrustInformation>) -> TrustScore {
    let total_weight: f64 = infos.iter().map(|i| i.aged_weight()).sum();
    let weighted_roi: f64 = infos.iter()
        .map(|i| i.pv_roi * i.aged_weight())
        .sum::<f64>() / total_weight;
    
    TrustScore {
        expected_pv_roi: weighted_roi,
        confidence: total_weight,  // More volume = more confidence
        data_points: infos.len(),
    }
}

impl TrustInformation {
    fn weight(&self) -> f64 {
        self.invested_volume  // Simple linear weighting by volume
    }
    
    fn aged_weight(&self) -> f64 {
        // For now: no age decay - we never forget
        // Future: temporal weighting feature
        self.weight()
    }
}
```

**Weighted Average by Volume:**
- 1 EUR @ ROI 2.0 + 100 EUR @ ROI 1.1 = (1×2.0 + 100×1.1) / (1+100) = 1.109
- Large investments naturally dominate the average
- Simple, intuitive, economically sound

## Testing
Let's take a test driven development approach. 

### Nodes and Protocol
Unit tests in rust. 
The test command spins up 3 nodes and then executes typescript tests that use the repeer typescript package for interacting with the nodes. 

### Extension and adapters
Unit tests.
End to end tests with playwright. 

## Demo Use Cases

### Primary: DeFi Trust Scores
**Browser extension showing trust scores for Ethereum addresses:**
- Visit Etherscan → see trust overlays for addresses
- Rate DeFi protocols, DEX trades, NFT purchases
- Clear ROI metric: actual profit/loss from interactions
- Friends' experiences aggregate to show risk/reward

### Secondary: AliExpress Product Trust
**Product trust scores for AliExpress items:**
- Browser extension shows aggregated trust for products
- Rate delivery, quality, seller reliability
- Friends' experiences help avoid scam products

### Tertiary: second level domains
Rate websites in general. Valuable or waste of time? 
Maybe block especially bad websites. 

### Future Integrations
- GitHub users (code quality, collaboration reliability)
- Twitter handles (information reliability)
- Amazon sellers, eBay listings
- Any identifiable web entity

## Development Plan

### Phase 1: Core Infrastructure 
1. Rust trust node with libp2p protocols
2. TypeScript client library with local API
3. Multi-node test setup (3+ nodes locally)
4. Basic trust calculation with volume weighting
5. Ethereum + AliExpress + domain adapters

### Phase 2: Integration 
1. Browser extension using client library
2. Etherscan integration (trust overlays)
3. AliExpress integration (product scores)
4. Multi-client testing across nodes

### Phase 3: Demo Polish 
1. UI/UX refinement
2. Demo scenarios with realistic data
3. Performance optimization
4. Adapter development documentation

## Testing Strategy

### Multi-Node Federation Testing
```bash
# Launch 3 nodes locally
cargo run --bin trust-node -- --port 8001 --user alice
cargo run --bin trust-node -- --port 8002 --user bob
cargo run --bin trust-node -- --port 8003 --user charlie

# Nodes auto-discover via libp2p DHT
```

### Integration Testing
```typescript
// Simulate realistic scenarios with volume-weighted information
const alice = new TrustClient("http://localhost:8001");
const bob = new TrustClient("http://localhost:8002");

// Alice records high-volume interaction with Ethereum address
await alice.recordInteraction("ethereum:0x123...", {
    investment: 10000,     // $10K investment
    return_value: 12000,   // $12K return
    timeframe_days: 14,
    discount_rate: 0.05
}); // High weight due to volume

// Bob queries (should get Alice's volume-weighted information)
const score = await bob.queryTrust("ethereum:0x123...");
assert(score.expected_roi > 1.0);
assert(score.total_confidence > 10); // High confidence from Alice's large investment
```

## Economic Model

### Simple Node Operation
- **Local nodes:** Free (users run their own companion nodes)
- **Query costs:** Free (encourage network growth)
- **Discount rate:** Default 5% (user-configurable for personal time preference)

### Future Considerations
- Third-party hosting services (separate business opportunity)
- micropayments for request responses 
  - some server costs involved for responding to trust score requests
    - make the receiver pay 
  - incentive 
    - for more caching
    - enter accurate experience reviews (high response quality)
      - you could even earn that way => specialized trust providers doing extensive data aggregation, analysis and prediction (the protocol becomes a p2p market for trust estimation)
  - credit system
- automatic recommender quality adjustment (the factor by which recommendations are weighted)

## Key Benefits

1. **Subjective by Design:** Trust reflects personal networks, not global consensus
3. **Cross-Platform:** Works across Web2 and Web3 identities
4. **Volume-Weighted Trust:** Large investments naturally carry more network influence
5. **Economically Rigorous:** Present value calculations enable fair comparison across interaction types
6. **Modular Architecture:** Open adapter system for any platform
7. **True Decentralization:** Each user owns their identity and data

## Success Metrics

### Hackathon Goals
- Multi-node federation working reliably
- Trust scores displaying on real websites 
  - Etherscan + 
  - AliExpress + 
  - second level domains
- Browser extension installable and functional
- Clear value proposition demonstrable to judges

### Long-term Vision
- Portable reputation across all internet services
- Measurable reduction in fraud for network participants
- Open-source ecosystem of platform adapters

This architecture provides a mathematically sound, practically deployable foundation for decentralized trust networks that preserves user sovereignty while enabling real-world adoption.

This is cyber anarchy. You are responsible yourself. This reputation system is an alternative to nanny-dispute resolution systems. You build trust. There is no alternative anyways - if you trust big systems, it appears you have more security but in reality you die with them. 
