import { spawn, ChildProcess } from 'child_process';
import { TrustClient } from '../trust-client/src';
import { setTimeout as delay } from 'timers/promises';
import * as fs from 'fs/promises';
import * as path from 'path';

interface NodeConfig {
  name: string;
  apiPort: number;
  p2pPort: number;
  process?: ChildProcess;
  client?: TrustClient;
  peerId?: string;
}

const nodes: NodeConfig[] = [
  { name: 'alice', apiPort: 8091, p2pPort: 9011 },
  { name: 'bob', apiPort: 8092, p2pPort: 9012 },
  { name: 'charlie', apiPort: 8093, p2pPort: 9013 },
  { name: 'dave', apiPort: 8094, p2pPort: 9014 },
];

describe('Federation and Trust Propagation Tests', () => {
  beforeAll(async () => {
    // Clean up test data directories
    for (const node of nodes) {
      const dataDir = path.join(__dirname, '..', 'trust-node', 'test_data', `federation_${node.name}`);
      await fs.rm(dataDir, { recursive: true, force: true });
    }

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
        '--data-dir', `./test_data/federation_${node.name}`,
      ], {
        cwd: '../trust-node',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      let peerIdCaptured = false;
      
      // Capture peer ID from stdout
      process.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        console.log(`${node.name} stdout:`, output);
        
        // Extract peer ID from log output
        if (!peerIdCaptured && output.includes('Local peer id:')) {
          const match = output.match(/Local peer id: (\w+)/);
          if (match) {
            node.peerId = match[1];
            peerIdCaptured = true;
            console.log(`Captured ${node.name}'s peer ID: ${node.peerId}`);
          }
        }
      });
      
      process.stderr?.on('data', (data) => {
        console.log(`${node.name} stderr:`, data.toString().trim());
      });
      
      process.on('exit', (code) => {
        console.log(`${node.name} exited with code:`, code);
      });
      
      node.process = process;
      node.client = new TrustClient(`http://localhost:${node.apiPort}`);
      
      // Wait for the node to start and capture peer ID
      await delay(1500);
      
      // Check if node is healthy with faster polling
      let retries = 15;
      while (retries > 0) {
        try {
          const healthy = await node.client.health();
          if (healthy) {
            console.log(`Node ${node.name} is healthy`);
            break;
          }
        } catch (error) {
          console.log(`Waiting for node ${node.name} to start... (${retries} retries left)`);
          await delay(200); // Faster polling
          retries--;
        }
      }
      
      if (retries === 0) {
        throw new Error(`Failed to start node ${node.name}`);
      }
    }
    
    // Give nodes a bit more time to fully initialize
    await delay(500);
  }, 60000);

  afterAll(async () => {
    // Stop all nodes
    for (const node of nodes) {
      if (node.process) {
        console.log(`Stopping node ${node.name}...`);
        node.process.kill('SIGTERM');
        await delay(1000);
        if (!node.process.killed) {
          node.process.kill('SIGKILL');
        }
      }
    }
    
    // Clean up test data
    for (const node of nodes) {
      const dataDir = path.join(__dirname, '..', 'trust-node', 'test_data', `federation_${node.name}`);
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  }, 10000);

  test('Nodes can connect to each other', async () => {
    const alice = nodes[0];
    const bob = nodes[1];
    
    // Bob connects to Alice using multiaddr
    const aliceMultiaddr = `/ip4/127.0.0.1/tcp/${alice.p2pPort}/p2p/${alice.peerId}`;
    console.log(`Bob connecting to Alice at: ${aliceMultiaddr}`);
    
    // Add Alice as Bob's peer
    await bob.client!.addPeer({
      peer_id: aliceMultiaddr,
      name: 'Alice',
      recommender_quality: 0.9,
    });
    
    // Verify Bob has Alice as a peer
    const bobPeers = await bob.client!.getPeers();
    expect(bobPeers.length).toBeGreaterThanOrEqual(1);
    expect(bobPeers.some(p => p.name === 'Alice')).toBe(true);
    
    // Charlie connects to Bob
    const bobMultiaddr = `/ip4/127.0.0.1/tcp/${bob.p2pPort}/p2p/${bob.peerId}`;
    console.log(`Charlie connecting to Bob at: ${bobMultiaddr}`);
    
    await nodes[2].client!.addPeer({
      peer_id: bobMultiaddr,
      name: 'Bob',
      recommender_quality: 0.8,
    });
    
    // Dave connects to Charlie to create a chain: Alice -> Bob -> Charlie -> Dave
    const charlieMultiaddr = `/ip4/127.0.0.1/tcp/${nodes[2].p2pPort}/p2p/${nodes[2].peerId}`;
    console.log(`Dave connecting to Charlie at: ${charlieMultiaddr}`);
    
    await nodes[3].client!.addPeer({
      peer_id: charlieMultiaddr,
      name: 'Charlie',
      recommender_quality: 0.7,
    });
    
    // Give the network time to stabilize
    await delay(2000);
  });

  test('Trust scores propagate through the network', async () => {
    const alice = nodes[0].client!;
    const bob = nodes[1].client!;
    const charlie = nodes[2].client!;
    const dave = nodes[3].client!;
    
    // Ensure peer connections are established
    // Bob connects to Alice
    const aliceMultiaddr = `/ip4/127.0.0.1/tcp/${nodes[0].p2pPort}/p2p/${nodes[0].peerId}`;
    try {
      await bob.addPeer({
        peer_id: aliceMultiaddr,
        name: 'Alice',
        recommender_quality: 0.9,
      });
    } catch (error: any) {
      // Ignore 409 conflicts (peer already exists)
      if (error.response?.status !== 409) {
        throw error;
      }
    }
    
    // Charlie connects to Bob
    const bobMultiaddr = `/ip4/127.0.0.1/tcp/${nodes[1].p2pPort}/p2p/${nodes[1].peerId}`;
    try {
      await charlie.addPeer({
        peer_id: bobMultiaddr,
        name: 'Bob',
        recommender_quality: 0.8,
      });
    } catch (error: any) {
      if (error.response?.status !== 409) throw error;
    }
    
    // Dave connects to Charlie
    const charlieMultiaddr = `/ip4/127.0.0.1/tcp/${nodes[2].p2pPort}/p2p/${nodes[2].peerId}`;
    try {
      await dave.addPeer({
        peer_id: charlieMultiaddr,
        name: 'Charlie',
        recommender_quality: 0.7,
      });
    } catch (error: any) {
      if (error.response?.status !== 409) throw error;
    }
    
    // Alice adds a positive experience for an Ethereum address
    const ethAddress = '0xdeadbeef1234567890123456789012345678dead';
    await alice.addExperience({
      id_domain: 'ethereum',
      agent_id: ethAddress,
      investment: 1000,
      return_value: 1200,
      timeframe_days: 30,
      discount_rate: 0.05,
      notes: 'Alice had a great experience',
    });
    
    // Alice can query her own experience
    const aliceScore = await alice.queryTrust('ethereum', ethAddress);
    expect(aliceScore.expected_pv_roi).toBeGreaterThan(1.0);
    expect(aliceScore.data_points).toBe(1);
    
    // Give time for peer connectivity to establish
    await delay(5000);
    
    // Bob should be able to query through Alice (depth 1)
    const bobScore = await bob.queryTrust('ethereum', ethAddress, { max_depth: 1 });
    console.log('Bob score:', bobScore);
    expect(bobScore.expected_pv_roi).toBeGreaterThan(1.0);
    expect(bobScore.data_points).toBe(1);
    
    // Charlie should be able to query through Bob->Alice (depth 2)
    const charlieScore = await charlie.queryTrust('ethereum', ethAddress, { max_depth: 2 });
    console.log('Charlie score:', charlieScore);
    
    // Check Charlie's peers
    const charliePeers = await charlie.getPeers();
    console.log('Charlie peers:', charliePeers.map(p => p.name));
    
    expect(charlieScore.expected_pv_roi).toBeGreaterThan(1.0);
    expect(charlieScore.data_points).toBe(1);
    
    // Dave should be able to query through Charlie->Bob->Alice (depth 3)
    const daveScore = await dave.queryTrust('ethereum', ethAddress, { max_depth: 3 });
    expect(daveScore.expected_pv_roi).toBeGreaterThan(1.0);
    expect(daveScore.data_points).toBe(1);
    
    // With depth 1, Dave shouldn't see Alice's data (should return default score)
    const daveShallowScore = await dave.queryTrust('ethereum', ethAddress, { max_depth: 1 });
    // Should return default trust score: PV-ROI=1, volume=0, data_points=0
    expect(daveShallowScore.expected_pv_roi).toBe(1.0);
    expect(daveShallowScore.total_volume).toBe(0.0);
    expect(daveShallowScore.data_points).toBe(0);
  });

  test('Multiple experiences from different peers aggregate correctly', async () => {
    const alice = nodes[0].client!;
    const bob = nodes[1].client!;
    const charlie = nodes[2].client!;
    
    const domainAgent = 'trustworthy.com';
    
    // Check Bob's peers at start of test
    let initialBobPeers = await bob.getPeers();
    console.log('Bob initial peers:', initialBobPeers.map(p => ({ name: p.name, peer_id: p.peer_id })));
    
    // Bob needs to be connected to both Alice and Charlie to aggregate their experiences
    // Connect Bob to Alice
    const aliceMultiaddr = `/ip4/127.0.0.1/tcp/${nodes[0].p2pPort}/p2p/${nodes[0].peerId}`;
    try {
      await bob.addPeer({
        peer_id: aliceMultiaddr,
        name: 'Alice',
        recommender_quality: 0.9,
      });
    } catch (error: any) {
      if (error.response?.status !== 409) throw error;
    }
    
    // Connect Bob to Charlie as well
    const charlieMultiaddr = `/ip4/127.0.0.1/tcp/${nodes[2].p2pPort}/p2p/${nodes[2].peerId}`;
    try {
      await bob.addPeer({
        peer_id: charlieMultiaddr,
        name: 'Charlie',
        recommender_quality: 0.8,
      });
    } catch (error: any) {
      if (error.response?.status !== 409) throw error;
    }
    
    // Give time for connection to establish
    await delay(2000);
    
    // Alice has a positive experience
    await alice.addExperience({
      id_domain: 'domain',
      agent_id: domainAgent,
      investment: 100,
      return_value: 120,
      timeframe_days: 7,
      discount_rate: 0.05,
    });
    
    // Charlie has a negative experience
    await charlie.addExperience({
      id_domain: 'domain',
      agent_id: domainAgent,
      investment: 200,
      return_value: 150,
      timeframe_days: 7,
      discount_rate: 0.05,
    });
    
    // Give time for experiences to be stored
    await delay(2000);
    
    // Check Bob's peers before querying
    const bobPeers = await bob.getPeers();
    console.log('Bob peers:', bobPeers.map(p => ({ name: p.name, peer_id: p.peer_id })));
    
    // Check what experiences Alice and Charlie have
    const aliceExperiences = await alice.getExperiences('domain', domainAgent);
    const charlieExperiences = await charlie.getExperiences('domain', domainAgent);
    console.log('Alice experiences:', aliceExperiences.length);
    console.log('Charlie experiences:', charlieExperiences.length);
    
    // Bob queries with depth 2 to see both experiences
    const bobAggregatedScore = await bob.queryTrust('domain', domainAgent, { max_depth: 2 });
    
    // Bob should see aggregated data from both Alice and Charlie
    expect(bobAggregatedScore.data_points).toBe(2);
    expect(bobAggregatedScore.total_volume).toBe(300); // 100 + 200
    
    // The ROI should be weighted by volume
    // Alice: 100 investment, ~120% ROI (positive)
    // Charlie: 200 investment, ~75% ROI (negative)
    // Weighted average should be closer to Charlie's experience
    expect(bobAggregatedScore.expected_pv_roi).toBeLessThan(1.0);
  });

  test('Recommender quality affects trust propagation', async () => {
    const alice = nodes[0].client!;
    const bob = nodes[1].client!;
    
    // Ensure Bob is connected to Alice for this test
    const aliceMultiaddr = `/ip4/127.0.0.1/tcp/${nodes[0].p2pPort}/p2p/${nodes[0].peerId}`;
    try {
      await bob.addPeer({
        peer_id: aliceMultiaddr,
        name: 'Alice',
        recommender_quality: 0.9,
      });
    } catch (error: any) {
      // Ignore 409 conflicts (peer already exists)
      if (error.response?.status !== 409) {
        throw error;
      }
    }
    
    // Give time for connection to establish
    await delay(2000);
    
    const riskyAgent = 'risky-seller';
    
    // Alice adds a very negative experience
    await alice.addExperience({
      id_domain: 'aliexpress',
      agent_id: riskyAgent,
      investment: 500,
      return_value: 100, // Lost 80%
      timeframe_days: 30,
      discount_rate: 0.05,
    });
    
    // Give time for experience to propagate
    await delay(3000);
    
    // Bob queries through Alice (who has 0.9 recommender quality)
    const bobScore = await bob.queryTrust('aliexpress', riskyAgent, { 
      max_depth: 1,
      forget_rate: 0.0, // No time decay for this test
    });
    
    // The negative experience should be propagated
    expect(bobScore.expected_pv_roi).toBeLessThan(0.3); // Very bad ROI
    expect(bobScore.data_points).toBe(1);
    
    // TODO: Once the trust node implements recommender quality weighting,
    // we should test that lower quality recommenders have less impact
  });

  test('Batch queries work across federated network', async () => {
    const bob = nodes[1].client!;
    
    // Query multiple agents at once
    const batchResponse = await bob.queryTrustBatch({
      agents: [
        {id_domain: 'ethereum', agent_id: '0xdeadbeef1234567890123456789012345678dead'}, // From test 2
        {id_domain: 'domain', agent_id: 'trustworthy.com'}, // From test 3
        {id_domain: 'aliexpress', agent_id: 'risky-seller'}, // From test 4
        {id_domain: 'domain', agent_id: 'unknown.com'}, // No data
      ],
      max_depth: 3,
    });
    
    // Should get scores for agents with data
    expect(batchResponse.scores.length).toBeGreaterThanOrEqual(3);
    
    // Check specific agents
    const ethScore = batchResponse.scores.find(s => s.id_domain === 'ethereum');
    expect(ethScore).toBeDefined();
    expect(ethScore!.score.expected_pv_roi).toBeGreaterThan(1.0);
    
    const domainScore = batchResponse.scores.find(s => s.agent_id === 'trustworthy.com');
    expect(domainScore).toBeDefined();
    
    const riskyScore = batchResponse.scores.find(s => s.agent_id === 'risky-seller');
    expect(riskyScore).toBeDefined();
    expect(riskyScore!.score.expected_pv_roi).toBeLessThan(0.3);
  });

  test('Network handles peer disconnections gracefully', async () => {
    const charlie = nodes[2];
    const dave = nodes[3].client!;
    
    // Add an experience through Charlie
    await charlie.client!.addExperience({
      id_domain: 'domain',
      agent_id: 'charlie-special.com',
      investment: 300,
      return_value: 400,
      timeframe_days: 14,
      discount_rate: 0.05,
    });
    
    // Give time for experience to propagate
    await delay(3000);
    
    // Dave can see it through Charlie
    const scoreBeforeDisconnect = await dave.queryTrust('domain', 'charlie-special.com', { max_depth: 1 });
    expect(scoreBeforeDisconnect.data_points).toBe(1);
    
    // Disconnect Charlie
    console.log('Disconnecting Charlie...');
    charlie.process!.kill('SIGTERM');
    await delay(3000);
    
    // Dave should no longer see Charlie's data with depth 1 (should return default score)
    const scoreAfterDisconnect = await dave.queryTrust('domain', 'charlie-special.com', { max_depth: 1 });
    // Should return default trust score when peer is offline and no cached data
    expect(scoreAfterDisconnect.expected_pv_roi).toBe(1.0);
    expect(scoreAfterDisconnect.total_volume).toBe(0.0);
    expect(scoreAfterDisconnect.data_points).toBe(0);
    console.log('Query returned default score after peer disconnect (expected)');
  });
});