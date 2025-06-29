import { domainDomain } from './index';

describe('DomainDomain', () => {
  describe('parseId', () => {
    it('should parse full URLs', () => {
      expect(domainDomain.parseId('https://example.com/path')).toBe('example.com');
      expect(domainDomain.parseId('http://subdomain.example.org')).toBe('example.org');
    });

    it('should parse URLs without protocol', () => {
      expect(domainDomain.parseId('example.com')).toBe('example.com');
      expect(domainDomain.parseId('www.example.com')).toBe('example.com');
    });

    it('should handle multi-part TLDs', () => {
      expect(domainDomain.parseId('https://example.co.uk')).toBe('example.co.uk');
      expect(domainDomain.parseId('subdomain.example.com.au')).toBe('example.com.au');
      expect(domainDomain.parseId('test.example.co.nz')).toBe('example.co.nz');
    });

    it('should remove www prefix', () => {
      expect(domainDomain.parseId('www.example.com')).toBe('example.com');
      expect(domainDomain.parseId('https://www.subdomain.example.org')).toBe('example.org');
    });

    it('should handle complex URLs', () => {
      expect(domainDomain.parseId('https://shop.example.com/products/item?id=123')).toBe('example.com');
      expect(domainDomain.parseId('http://api.service.example.co.uk/v1/data')).toBe('example.co.uk');
    });

    it('should return null for invalid domains', () => {
      expect(domainDomain.parseId('not-a-domain')).toBeNull();
      expect(domainDomain.parseId('http://')).toBeNull();
      expect(domainDomain.parseId('')).toBeNull();
      expect(domainDomain.parseId('123.456.789')).toBeNull();
    });

    it('should handle edge cases', () => {
      expect(domainDomain.parseId('localhost')).toBeNull(); // No TLD
      expect(domainDomain.parseId('example')).toBeNull(); // No TLD
      expect(domainDomain.parseId('192.168.1.1')).toBeNull(); // IP address
    });
  });

  describe('validateId', () => {
    it('should validate correct domains', () => {
      expect(domainDomain.validateId('example.com')).toBe(true);
      expect(domainDomain.validateId('subdomain.example.org')).toBe(true);
      expect(domainDomain.validateId('example.co.uk')).toBe(true);
      expect(domainDomain.validateId('test-site.example.io')).toBe(true);
    });

    it('should reject invalid domains', () => {
      expect(domainDomain.validateId('example')).toBe(false); // No TLD
      expect(domainDomain.validateId('example.')).toBe(false); // Trailing dot
      expect(domainDomain.validateId('.example.com')).toBe(false); // Leading dot
      expect(domainDomain.validateId('example..com')).toBe(false); // Double dot
      expect(domainDomain.validateId('')).toBe(false); // Empty
      expect(domainDomain.validateId('192.168.1.1')).toBe(false); // IP address format
    });

    it('should handle special characters', () => {
      expect(domainDomain.validateId('example_test.com')).toBe(false); // Underscore not allowed
      expect(domainDomain.validateId('example-test.com')).toBe(true); // Hyphen allowed
      expect(domainDomain.validateId('example.com!')).toBe(false); // Special char in domain
    });
  });

  describe('displayName', () => {
    it('should return the domain as display name', () => {
      expect(domainDomain.displayName('example.com')).toBe('example.com');
      expect(domainDomain.displayName('test.co.uk')).toBe('test.co.uk');
    });

    it('should return original string for any input', () => {
      expect(domainDomain.displayName('invalid')).toBe('invalid');
      expect(domainDomain.displayName('')).toBe('');
    });
  });

  describe('formatTrustId', () => {
    it('should format trust ID with domain prefix', () => {
      expect(domainDomain.formatTrustId('example.com')).toBe('domain:example.com');
      expect(domainDomain.formatTrustId('Test.CO.UK')).toBe('domain:test.co.uk');
    });

    it('should convert to lowercase', () => {
      expect(domainDomain.formatTrustId('EXAMPLE.COM')).toBe('domain:example.com');
      expect(domainDomain.formatTrustId('MixedCase.Org')).toBe('domain:mixedcase.org');
    });
  });

  describe('name property', () => {
    it('should have correct domain name', () => {
      expect(domainDomain.name).toBe('domain');
    });
  });
});