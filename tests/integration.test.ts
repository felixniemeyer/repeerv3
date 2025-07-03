import { spawn, ChildProcess } from 'child_process';
import { TrustClient } from '../trust-client/src';
import { setTimeout as delay } from 'timers/promises';

interface NodeConfig {
  name: string;
  apiPort: number;
  p2pPort: number;
  process?: ChildProcess;
  client?: TrustClient;
}

const nodes: NodeConfig[] = [
  { name: 'alice', apiPort: 8081, p2pPort: 9001 },
  { name: 'bob', apiPort: 8082, p2pPort: 9002 },
  { name: 'charlie', apiPort: 8083, p2pPort: 9003 },
];

describe('Multi-node Integration Tests', () => {
  beforeAll(async () => {
    // Start all nodes
    for (const node of nodes) {
      console.log(`Starting node ${node.name}...`);
      
      const process = spawn('cargo', [
        'run',
        '--release',
        '--',
        '--user', node.name,
        '--api-port', node.apiPort.toString(),
        '--p2p-port', node.p2pPort.toString(),
        '--data-dir', `./test_data/${node.name}`,
      ], {
        cwd: '../trust-node',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      // Log output for debugging
      process.stdout?.on('data', (data) => {
        console.log(`${node.name} stdout:`, data.toString().trim());
      });
      
      process.stderr?.on('data', (data) => {
        console.log(`${node.name} stderr:`, data.toString().trim());
      });
      
      process.on('exit', (code) => {
        console.log(`${node.name} exited with code:`, code);
      });
      
      node.process = process;
      node.client = new TrustClient(`http://localhost:${node.apiPort}`);
      
      // Wait a bit for the node to start
      await delay(2000);
      
      // Check if node is healthy
      let retries = 5;
      while (retries > 0) {
        try {
          const healthy = await node.client.health();
          if (healthy) {
            console.log(`Node ${node.name} is healthy`);
            break;
          }
        } catch (error) {
          console.log(`Waiting for node ${node.name} to start... (${retries} retries left)`);
          await delay(1000);
          retries--;
        }
      }
      
      if (retries === 0) {
        throw new Error(`Failed to start node ${node.name}`);
      }
    }
  }, 30000);

  afterAll(async () => {
    // Stop all nodes
    for (const node of nodes) {
      if (node.process) {
        console.log(`Stopping node ${node.name}...`);
        node.process.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise<void>((resolve) => {
          node.process!.on('exit', () => resolve());
          const timer = global.setTimeout(() => {
            node.process!.kill('SIGKILL');
            resolve();
          }, 5000);
        });
      }
    }
  });

  test('All nodes should be healthy', async () => {
    for (const node of nodes) {
      const healthy = await node.client!.health();
      expect(healthy).toBe(true);
    }
  });

  test('Alice can add an experience', async () => {
    const alice = nodes[0].client!;
    
    const experience = await alice.addExperience({
      id_domain: 'ethereum',
      agent_id: '0x1234567890123456789012345678901234567890',
      investment: 1000,
      return_value: 1100,
      timeframe_days: 30,
      discount_rate: 0.05,
      notes: 'Good DeFi protocol',
    });
    
    expect(experience.id_domain).toBe('ethereum');
    expect(experience.agent_id).toBe('0x1234567890123456789012345678901234567890');
    expect(experience.invested_volume).toBe(1000);
    expect(experience.pv_roi).toBeCloseTo(1.096, 2); // Approximately 1100 / (1.05^(30/365)) / 1000
  });

  test('Alice can query her own experience', async () => {
    const alice = nodes[0].client!;
    
    const score = await alice.queryTrust('ethereum', '0x1234567890123456789012345678901234567890');
    
    expect(score.expected_pv_roi).toBeGreaterThan(1.0);
    expect(score.total_volume).toBeGreaterThanOrEqual(1000); // May have multiple experiences from other tests
    expect(score.data_points).toBeGreaterThanOrEqual(1);
  });

  test.skip('Bob can add Alice as a peer and get trust recommendations', async () => {
    const alice = nodes[0].client!;
    const bob = nodes[1].client!;
    
    // First, we need Alice's peer ID (in a real scenario, this would be obtained through discovery)
    // For now, let's simulate this by making Bob trust Alice with a high quality score
    
    // Add Alice as Bob's peer (using a mock peer ID since we don't have libp2p discovery working yet)
    await bob.addPeer({
      peer_id: 'alice_peer_id',
      name: 'Alice',
      recommender_quality: 0.8,
    });
    
    const peers = await bob.getPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].name).toBe('Alice');
    expect(peers[0].recommender_quality).toBe(0.8);
  });

  test('Charlie can add experiences for different agents', async () => {
    const charlie = nodes[2].client!;
    
    // Add experience for AliExpress item
    await charlie.addExperience({
      id_domain: 'aliexpress',
      agent_id: '1234567890',
      investment: 50,
      return_value: 45, // Bad experience
      timeframe_days: 14,
      notes: 'Item never arrived',
    });
    
    // Add experience for domain
    await charlie.addExperience({
      id_domain: 'domain',
      agent_id: 'example.com',
      investment: 100, // Time investment valued at $100
      return_value: 120, // Good content/service
      timeframe_days: 1,
      notes: 'Useful website with good information',
    });
    
    const aliScore = await charlie.queryTrust('aliexpress', '1234567890');
    const domainScore = await charlie.queryTrust('domain', 'example.com');
    
    expect(aliScore.expected_pv_roi).toBeLessThan(1.0); // Bad experience
    expect(domainScore.expected_pv_roi).toBeGreaterThan(1.0); // Good experience
  });

  test('Batch trust query works', async () => {
    const alice = nodes[0].client!;
    
    const response = await alice.queryTrustBatch({
      agents: [
        { id_domain: 'ethereum', agent_id: '0x1234567890123456789012345678901234567890' },
        { id_domain: 'aliexpress', agent_id: '1234567890' },
        { id_domain: 'domain', agent_id: 'example.com' },
      ],
      max_depth: 1,
    });
    
    // Should have at least one score (for ethereum)
    expect(response.scores.length).toBeGreaterThanOrEqual(1);
    
    // Alice should have her own experience for Ethereum
    const ethScore = response.scores.find(item => item.id_domain === 'ethereum');
    expect(ethScore).toBeDefined();
    expect(ethScore!.score.data_points).toBeGreaterThan(0);
    
    // Alice may not have scores for other agents yet (no federation setup)
    const aliScore = response.scores.find(item => item.id_domain === 'aliexpress');
    const domainScore = response.scores.find(item => item.id_domain === 'domain');
    
    // These may be undefined if no data exists yet
    // Just checking batch query works properly
  });
});

describe('Adapter Integration', () => {
  test.skip('Ethereum adapter should work end-to-end', async () => {
    const alice = nodes[0].client!;
    
    // Test with a real-looking Etherscan URL
    const etherscanUrl = 'https://etherscan.io/address/0xA0b86a33E6411C28B7fF24C13D3bE9b8e8e3c673';
    
    // In a real browser extension, this would be parsed automatically
    const experiences = await alice.getExperiences('ethereum', '0xa0b86a33e6411c28b7ff24c13d3be9b8e8e3c673');
    expect(Array.isArray(experiences)).toBe(true);
  });

  test.skip('Trust client convenience methods work with real data', async () => {
    const alice = nodes[0].client!;
    
    // Record a positive DeFi experience
    await alice.recordExperience(
      'ethereum',
      '0xabc123',
      500, // $500 invested
      600, // $600 returned
      7,   // 1 week timeframe
      'Successful yield farming'
    );
    
    const score = await alice.getTrustLevel('ethereum', '0xabc123');
    const expectedProfit = alice.calculateExpectedProfit(score, 1000);
    const isTrustworthy = alice.isTrustworthy(score, 400); // Need at least $400 volume
    
    expect(score.expected_pv_roi).toBeGreaterThan(1.0);
    expect(expectedProfit).toBeGreaterThan(0);
    expect(isTrustworthy).toBe(true);
  });
});