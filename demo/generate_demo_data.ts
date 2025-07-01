import { TrustClient } from '../trust-client/src/client';

// Demo data generator for realistic trust scenarios
class DemoDataGenerator {
  private client: TrustClient;

  constructor(nodeUrl: string = 'http://localhost:8080') {
    this.client = new TrustClient(nodeUrl);
  }

  async generateRealisticData() {
    console.log('🚀 Generating realistic demo data for Repeer trust network...\n');

    // Scenario 1: E-commerce and Trading
    await this.generateEcommerceScenario();
    
    // Scenario 2: DeFi and Crypto Trading
    await this.generateDeFiScenario();
    
    // Scenario 3: Service Providers and Freelancers
    await this.generateServiceProviderScenario();
    
    // Scenario 4: Mixed reputation with some bad actors
    await this.generateMixedReputationScenario();

    console.log('\n✅ Demo data generation complete!');
    console.log('You can now test the browser extension with realistic trust scores.');
  }

  private async generateEcommerceScenario() {
    console.log('📦 Generating E-commerce scenario...');

    // Reliable AliExpress sellers
    const reliableSellers = [
      { id: '1005004389551275', name: 'TechGear Store', avgRoi: 1.15 },
      { id: '1005002345678901', name: 'Quality Electronics', avgRoi: 1.08 },
      { id: '1005003456789012', name: 'Fashion Plus', avgRoi: 1.12 }
    ];

    // Unreliable sellers  
    const unreliableSellers = [
      { id: '1005001234567890', name: 'Cheap Goods Co', avgRoi: 0.75 },
      { id: '1005005678901234', name: 'Fake Brand Store', avgRoi: 0.60 }
    ];

    // Generate experiences for reliable sellers
    for (const seller of reliableSellers) {
      for (let i = 0; i < 8; i++) {
        const investment = 50 + Math.random() * 200; // $50-250
        const roi = seller.avgRoi + (Math.random() - 0.5) * 0.3; // ±15% variance
        const returnValue = investment * roi;
        
        await this.client.recordExperience(
          seller.id,
          investment,
          returnValue,
          Math.floor(7 + Math.random() * 14), // 7-21 days
          this.generateProductNotes(seller.name, roi > 1.0)
        );
      }
    }

    // Generate experiences for unreliable sellers
    for (const seller of unreliableSellers) {
      for (let i = 0; i < 5; i++) {
        const investment = 30 + Math.random() * 100; // $30-130
        const roi = seller.avgRoi + (Math.random() - 0.5) * 0.2;
        const returnValue = investment * roi;
        
        await this.client.recordExperience(
          seller.id,
          investment,
          returnValue,
          Math.floor(7 + Math.random() * 30),
          this.generateProductNotes(seller.name, roi > 1.0)
        );
      }
    }

    console.log('  ✓ Generated AliExpress seller trust data');
  }

  private async generateDeFiScenario() {
    console.log('💰 Generating DeFi scenario...');

    // Ethereum addresses with different reputation levels
    const defiAddresses = [
      { 
        address: '0x1234567890123456789012345678901234567890', 
        name: 'Trusted DeFi Protocol',
        avgRoi: 1.25,
        volume: 'high'
      },
      { 
        address: '0xabcdef1234567890123456789012345678901234', 
        name: 'Reliable Yield Farm',
        avgRoi: 1.18,
        volume: 'medium'
      },
      { 
        address: '0x9876543210987654321098765432109876543210', 
        name: 'Risky DEX',
        avgRoi: 0.85,
        volume: 'low'
      },
      { 
        address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 
        name: 'Rug Pull Protocol',
        avgRoi: 0.15,
        volume: 'medium'
      }
    ];

    for (const protocol of defiAddresses) {
      const numExperiences = protocol.volume === 'high' ? 12 : 
                           protocol.volume === 'medium' ? 7 : 4;
      
      for (let i = 0; i < numExperiences; i++) {
        const investment = 500 + Math.random() * 2000; // $500-2500
        const roi = protocol.avgRoi + (Math.random() - 0.5) * 0.4;
        const returnValue = investment * roi;
        
        await this.client.recordExperience(
          protocol.address,
          investment,
          returnValue,
          Math.floor(1 + Math.random() * 90), // 1-90 days
          this.generateDeFiNotes(protocol.name, roi < 0.5)
        );
      }
    }

    console.log('  ✓ Generated Ethereum DeFi trust data');
  }

  private async generateServiceProviderScenario() {
    console.log('🛠️ Generating Service Provider scenario...');

    // Domain-based service providers
    const serviceProviders = [
      { domain: 'upwork.com', avgRoi: 1.35, type: 'freelance' },
      { domain: 'fiverr.com', avgRoi: 1.20, type: 'freelance' },
      { domain: 'aws.amazon.com', avgRoi: 1.95, type: 'infrastructure' },
      { domain: 'digitalocean.com', avgRoi: 1.75, type: 'infrastructure' },
      { domain: 'sketchy-hosting.com', avgRoi: 0.70, type: 'infrastructure' }
    ];

    for (const provider of serviceProviders) {
      const numExperiences = Math.floor(3 + Math.random() * 7); // 3-9 experiences
      
      for (let i = 0; i < numExperiences; i++) {
        const investment = provider.type === 'infrastructure' ? 
          100 + Math.random() * 400 : // $100-500 for infrastructure
          200 + Math.random() * 800;  // $200-1000 for freelance
        
        const roi = provider.avgRoi + (Math.random() - 0.5) * 0.3;
        const returnValue = investment * roi;
        
        await this.client.recordExperience(
          provider.domain,
          investment,
          returnValue,
          Math.floor(7 + Math.random() * 21), // 7-28 days
          this.generateServiceNotes(provider.domain, provider.type, roi > 1.0)
        );
      }
    }

    console.log('  ✓ Generated service provider trust data');
  }

  private async generateMixedReputationScenario() {
    console.log('🎭 Generating mixed reputation scenario...');

    // Add some peers to the network
    const peers = [
      { id: 'alice-node-12345', name: 'Alice (Conservative)', quality: 0.8 },
      { id: 'bob-node-67890', name: 'Bob (Aggressive)', quality: 0.6 },
      { id: 'charlie-node-54321', name: 'Charlie (Contrarian)', quality: -0.3 }
    ];

    for (const peer of peers) {
      await this.client.addTrustedPeer(peer.id, peer.name, peer.quality);
    }

    // Generate some controversial cases
    const controversialCases = [
      { id: 'controversial-trader-001', description: 'Pump and dump trader' },
      { id: 'questionable-nft-project', description: 'NFT project with mixed reviews' },
      { id: 'new-defi-protocol-2024', description: 'Unproven new protocol' }
    ];

    for (const case_ of controversialCases) {
      // Generate mixed experiences
      for (let i = 0; i < 6; i++) {
        const investment = 100 + Math.random() * 300;
        const isPositive = Math.random() > 0.5;
        
        let returnValue: number;
        let notes: string;
        
        if (isPositive) {
          returnValue = investment * (1.1 + Math.random() * 0.4);
          notes = `${case_.description} - Had a good experience this time`;
        } else {
          returnValue = investment * (0.2 + Math.random() * 0.6);
          notes = `${case_.description} - Lost money as expected`;
        }
        
        await this.client.recordExperience(
          case_.id,
          investment,
          returnValue,
          Math.floor(1 + Math.random() * 30),
          notes
        );
      }
    }

    console.log('  ✓ Generated mixed reputation data and peer network');
  }

  private generateProductNotes(sellerName: string, isPositive: boolean): string {
    if (isPositive) {
      const positiveNotes = [
        `Great quality product from ${sellerName}. Fast shipping and exactly as described.`,
        `${sellerName} delivered on time. Product quality exceeded expectations.`,
        `Reliable seller ${sellerName}. Would buy again.`,
        `${sellerName} has excellent customer service. Product was perfect.`,
        `High quality item from ${sellerName}. Very satisfied with purchase.`
      ];
      return positiveNotes[Math.floor(Math.random() * positiveNotes.length)];
    } else {
      const negativeNotes = [
        `${sellerName} sent counterfeit product. Poor quality, not as advertised.`,
        `Slow shipping from ${sellerName}. Product arrived damaged.`,
        `${sellerName} has poor customer service. Item was wrong size/color.`,
        `Cheap knockoff from ${sellerName}. Broke after few days of use.`,
        `${sellerName} falsely advertised product features. Disappointed.`
      ];
      return negativeNotes[Math.floor(Math.random() * negativeNotes.length)];
    }
  }

  private generateDeFiNotes(protocolName: string, isRugPull: boolean): string {
    if (isRugPull) {
      return `${protocolName} appears to be a rug pull. Lost significant funds when liquidity was drained.`;
    }
    
    const defiNotes = [
      `${protocolName} provided steady yields. Good APY and reliable returns.`,
      `Smooth interaction with ${protocolName}. No impermanent loss issues.`,
      `${protocolName} has transparent tokenomics. Earned expected rewards.`,
      `Good liquidity on ${protocolName}. Easy to enter and exit positions.`,
      `${protocolName} delivered on promised APY. No unexpected fees.`,
      `High gas fees but ${protocolName} yields compensated well.`,
      `${protocolName} had some smart contract bugs but team fixed quickly.`,
      `Market volatility affected ${protocolName} returns but protocol held up.`
    ];
    return defiNotes[Math.floor(Math.random() * defiNotes.length)];
  }

  private generateServiceNotes(domain: string, type: string, isPositive: boolean): string {
    if (isPositive) {
      if (type === 'freelance') {
        const notes = [
          `Excellent work delivered through ${domain}. Freelancer was professional and on-time.`,
          `${domain} connected me with skilled developer. Project completed successfully.`,
          `Great experience hiring through ${domain}. Quality work, fair pricing.`,
          `${domain} freelancer exceeded expectations. Will use platform again.`
        ];
        return notes[Math.floor(Math.random() * notes.length)];
      } else {
        const notes = [
          `${domain} infrastructure services very reliable. 99.9% uptime achieved.`,
          `Great performance from ${domain}. Fast deployment and excellent support.`,
          `${domain} provided cost-effective hosting. No downtime issues.`,
          `Excellent developer experience with ${domain}. Easy to scale.`
        ];
        return notes[Math.floor(Math.random() * notes.length)];
      }
    } else {
      if (type === 'freelance') {
        const notes = [
          `Poor communication through ${domain}. Freelancer missed deadlines.`,
          `${domain} freelancer delivered subpar work. Had to hire someone else.`,
          `Bad experience with ${domain} contractor. Ghosted after partial payment.`,
          `${domain} dispute resolution was unhelpful. Lost money on failed project.`
        ];
        return notes[Math.floor(Math.random() * notes.length)];
      } else {
        const notes = [
          `${domain} had frequent outages. Lost revenue due to downtime.`,
          `Poor customer support from ${domain}. Issues took days to resolve.`,
          `${domain} services were overpriced for quality provided.`,
          `Data loss incident with ${domain}. Backup systems failed.`
        ];
        return notes[Math.floor(Math.random() * notes.length)];
      }
    }
  }
}

// Run demo data generation
async function main() {
  try {
    const generator = new DemoDataGenerator();
    await generator.generateRealisticData();
  } catch (error) {
    console.error('❌ Error generating demo data:', error);
    console.log('\n💡 Make sure the trust node is running on http://localhost:8080');
    console.log('   Start it with: cd trust-node && cargo run -- --user demo');
  }
}

if (require.main === module) {
  main();
}

export { DemoDataGenerator };