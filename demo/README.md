# Repeer Demo Scenarios

This directory contains scripts to generate realistic demo data for the Repeer trust network.

## Quick Start

1. **Start a demo node:**
   ```bash
   npm run start-node
   ```

2. **Generate demo data:**
   ```bash
   npm run generate
   ```

3. **Or do both at once:**
   ```bash
   npm run demo
   ```

## What Gets Generated

The demo creates realistic trust scenarios across multiple domains:

### 🛒 E-commerce Scenario
- **Reliable AliExpress sellers** with consistent positive ROI (8-15% profit)
- **Unreliable sellers** with poor track records (25-40% losses)
- Realistic product experiences with detailed notes

### 💰 DeFi Scenario  
- **Trusted DeFi protocols** with high volume and good returns
- **Risky protocols** with mixed track records
- **Rug pull examples** with catastrophic losses
- Real Ethereum addresses for testing

### 🛠️ Service Provider Scenario
- **Freelance platforms** (Upwork, Fiverr) with contractor experiences
- **Cloud infrastructure** (AWS, DigitalOcean) with uptime/cost data
- **Sketchy providers** with poor service records

### 🎭 Mixed Reputation Scenario
- **Peer network** with different recommender qualities
- **Controversial cases** with conflicting experiences
- **Complex trust relationships** for testing transitive trust

## Demo Data Structure

Each scenario generates:
- **Trust experiences** with realistic ROI calculations
- **Volume data** varying from $30 to $2500 per transaction
- **Timeframes** from 1 day to 90 days
- **Detailed notes** explaining each experience
- **Peer relationships** for network effects

## Testing the Browser Extension

After generating demo data:

1. **Install the browser extension** (load `browser-extension/dist` as unpacked extension)
2. **Visit test pages:**
   - Etherscan addresses (e.g., `0x1234567890123456789012345678901234567890`)
   - AliExpress products (e.g., item `1005004389551275`)
   - Service domains (e.g., `upwork.com`, `aws.amazon.com`)

3. **See trust scores** overlaid on the pages
4. **Record new experiences** using the extension popup
5. **Manage peers** in the extension settings

## Customization

Edit `generate_demo_data.ts` to:
- Add new platforms/domains
- Adjust ROI distributions  
- Change experience volumes
- Modify peer network topology
- Add custom scenarios

## Node Configuration

The demo node runs with:
- **User:** `demo`
- **API Port:** 8080
- **P2P Port:** 7000
- **Data:** Stored in `trust_data/demo.db`

To reset demo data:
```bash
rm -f ../trust-node/trust_data/demo.db
```