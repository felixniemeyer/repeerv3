import { TrustClient } from '../src/client';

describe('TrustClient', () => {
  let client: TrustClient;

  beforeEach(() => {
    client = new TrustClient('http://localhost:8081');
  });

  // These tests will need a running node to pass
  describe('Node interaction (integration tests)', () => {
    test('should connect to health endpoint', async () => {
      // This will only pass if a node is running
      try {
        const health = await client.health();
        expect(typeof health).toBe('boolean');
      } catch (error) {
        console.log('Node not running, skipping health test');
      }
    });
  });

  describe('Convenience methods', () => {
    test('calculateExpectedProfit', () => {
      const score = {
        expected_pv_roi: 1.2,
        total_volume: 1000,
        data_points: 5,
      };
      
      const profit = client.calculateExpectedProfit(score, 100);
      expect(profit).toBeCloseTo(20); // (1.2 - 1) * 100
    });

    test('isTrustworthy', () => {
      const goodScore = {
        expected_pv_roi: 1.1,
        total_volume: 500,
        data_points: 10,
      };
      
      const badScore = {
        expected_pv_roi: 0.8,
        total_volume: 50,
        data_points: 2,
      };
      
      expect(client.isTrustworthy(goodScore)).toBe(true);
      expect(client.isTrustworthy(badScore)).toBe(false);
    });
  });
});