# Repeer Data Model

## Trust Scores vs Cached Trust Scores

The system distinguishes between two types of trust information:

### Direct Trust Experiences
- **TrustExperience**: Your direct interactions with agents
- Stored in `experiences` table
- Fields: `agent_id`, `pv_roi`, `invested_volume`, `timestamp`, `notes`, `data`

### Cached Peer Recommendations  
- **CachedTrustScore**: Trust scores received from your peers
- Stored in `cached_scores` table
- Fields: `agent_id`, `from_peer`, `score`, `cached_at`

### Key Field Distinctions

**`agent_id`**: The entity being evaluated
- Examples: "ethereum:0x123abc...", "aliexpress:product123", "domain:example.com"
- Same across both tables - identifies WHO you're evaluating

**`from_peer`**: The peer who provided the recommendation (only in cached_scores)
- Examples: "12D3KooWBhvKXo9...", "QmX7Y8Z..."
- Identifies WHO gave you this trust score
- Essential for applying recommender quality factors
- Cannot be removed as it enables transitive trust calculations

### Example Scenario

1. **Alice** has experience with **Ethereum address 0x123**
2. **Bob** asks network for trust info about **0x123** 
3. **Alice's node** responds with her calculated trust score
4. **Bob's node** caches this as:
   - `agent_id`: "ethereum:0x123" (who is being evaluated)
   - `from_peer`: "Alice's PeerId" (who provided the score)
   - `score`: Alice's calculated TrustScore
   - `cached_at`: timestamp

This enables Bob to:
- Weight Alice's recommendation by her recommender_quality factor
- Combine multiple peer recommendations appropriately
- Age cached scores over time
- Distinguish between his own experiences vs peer recommendations