import { ethereumDomain } from './index';

describe('EthereumDomain', () => {
  describe('parseId', () => {
    it('should parse direct Ethereum addresses', () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f89590';
      expect(ethereumDomain.parseId(address)).toBe(address.toLowerCase());
    });

    it('should parse Etherscan-style URLs', () => {
      const url = 'https://etherscan.io/address/0x742d35Cc6634C0532925a3b844Bc9e7595f89590';
      expect(ethereumDomain.parseId(url)).toBe('0x742d35cc6634c0532925a3b844bc9e7595f89590');
    });

    it('should parse addresses from query parameters', () => {
      const url = 'https://example.com?address=0x742d35Cc6634C0532925a3b844Bc9e7595f89590';
      expect(ethereumDomain.parseId(url)).toBe('0x742d35cc6634c0532925a3b844bc9e7595f89590');
    });

    it('should return null for invalid addresses', () => {
      expect(ethereumDomain.parseId('not-an-address')).toBeNull();
      expect(ethereumDomain.parseId('0x123')).toBeNull(); // Too short
    });
  });

  describe('validateId', () => {
    it('should validate correct Ethereum addresses', () => {
      expect(ethereumDomain.validateId('0x742d35Cc6634C0532925a3b844Bc9e7595f89590')).toBe(true);
      expect(ethereumDomain.validateId('0x742d35cc6634c0532925a3b844bc9e7595f89590')).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(ethereumDomain.validateId('0x123')).toBe(false);
      expect(ethereumDomain.validateId('not-an-address')).toBe(false);
      expect(ethereumDomain.validateId('0xGGGG35Cc6634C0532925a3b844Bc9e7595f89590')).toBe(false);
    });
  });

  describe('displayName', () => {
    it('should format address for display', () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f89590';
      expect(ethereumDomain.displayName(address)).toBe('0x742d...9590');
    });

    it('should return original string for invalid addresses', () => {
      expect(ethereumDomain.displayName('invalid')).toBe('invalid');
    });
  });

  describe('formatTrustId', () => {
    it('should format trust ID with ethereum prefix', () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f89590';
      expect(ethereumDomain.formatTrustId(address)).toBe('ethereum:0x742d35cc6634c0532925a3b844bc9e7595f89590');
    });
  });
});