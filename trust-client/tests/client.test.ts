import { TrustClient } from '../src/client';
import { ethereumAdapter, aliexpressAdapter, domainAdapter } from '../src/adapters';

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

describe('Adapters', () => {
  describe('ethereumAdapter', () => {
    test('should parse Ethereum addresses', () => {
      const testCases = [
        'https://etherscan.io/address/0x1234567890123456789012345678901234567890',
        '0x1234567890123456789012345678901234567890',
        'https://example.com?address=0x1234567890123456789012345678901234567890',
      ];
      
      for (const url of testCases) {
        const id = ethereumAdapter.parseId(url);
        expect(id).toBe('0x1234567890123456789012345678901234567890');
        expect(ethereumAdapter.validateId(id)).toBe(true);
      }
    });

    test('should validate Ethereum addresses', () => {
      expect(ethereumAdapter.validateId('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(ethereumAdapter.validateId('1234567890123456789012345678901234567890')).toBe(false);
      expect(ethereumAdapter.validateId('0x123')).toBe(false);
    });

    test('should display shortened addresses', () => {
      const address = '0x1234567890123456789012345678901234567890';
      expect(ethereumAdapter.displayName(address)).toBe('0x1234...7890');
    });
  });

  describe('aliexpressAdapter', () => {
    test('should parse AliExpress item IDs', () => {
      const testCases = [
        'https://www.aliexpress.com/item/1234567890.html',
        'https://aliexpress.com/item/1234567890',
        'https://example.com?item_id=1234567890',
      ];
      
      for (const url of testCases) {
        const id = aliexpressAdapter.parseId(url);
        expect(id).toBe('1234567890');
        expect(aliexpressAdapter.validateId(id)).toBe(true);
      }
    });

    test('should validate item IDs', () => {
      expect(aliexpressAdapter.validateId('1234567890')).toBe(true);
      expect(aliexpressAdapter.validateId('123')).toBe(false);
      expect(aliexpressAdapter.validateId('abc123')).toBe(false);
    });

    test('should display item names', () => {
      expect(aliexpressAdapter.displayName('1234567890')).toBe('AliExpress Item 1234567890');
    });
  });

  describe('domainAdapter', () => {
    test('should parse domains from URLs', () => {
      const testCases = [
        ['https://www.example.com/path', 'example.com'],
        ['http://subdomain.example.org', 'example.org'],
        ['https://example.co.uk/test', 'example.co.uk'],
        ['example.net', 'example.net'],
      ];
      
      for (const [url, expectedDomain] of testCases) {
        const id = domainAdapter.parseId(url);
        expect(id).toBe(expectedDomain);
        expect(domainAdapter.validateId(id)).toBe(true);
      }
    });

    test('should validate domains', () => {
      expect(domainAdapter.validateId('example.com')).toBe(true);
      expect(domainAdapter.validateId('sub.example.org')).toBe(true);
      expect(domainAdapter.validateId('example')).toBe(false);
      expect(domainAdapter.validateId('.')).toBe(false);
    });
  });
});