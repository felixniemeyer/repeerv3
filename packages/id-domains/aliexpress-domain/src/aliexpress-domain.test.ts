import { aliexpressDomain } from './index';

describe('AliExpressDomain', () => {
  describe('parseId', () => {
    it('should parse standard product URLs', () => {
      const url = 'https://www.aliexpress.com/item/1005004567891234.html';
      expect(aliexpressDomain.parseId(url)).toBe('1005004567891234');
    });

    it('should parse URLs with category paths', () => {
      const url = 'https://www.aliexpress.com/category/phones-telecommunications/1005004567891234.html';
      expect(aliexpressDomain.parseId(url)).toBe('1005004567891234');
    });

    it('should parse URLs with query parameters', () => {
      const url = 'https://www.aliexpress.com/wholesale?productId=1005004567891234&search=phone';
      expect(aliexpressDomain.parseId(url)).toBe('1005004567891234');
    });

    it('should parse alternative product URL formats', () => {
      const url = 'https://www.aliexpress.com/product/1005004567891234';
      expect(aliexpressDomain.parseId(url)).toBe('1005004567891234');
    });

    it('should parse direct product ID at end of path', () => {
      const url = 'https://m.aliexpress.com/1005004567891234.html';
      expect(aliexpressDomain.parseId(url)).toBe('1005004567891234');
    });

    it('should handle URLs without .html extension', () => {
      const url = 'https://www.aliexpress.com/1005004567891234';
      expect(aliexpressDomain.parseId(url)).toBe('1005004567891234');
    });

    it('should parse real AliExpress URLs with query parameters', () => {
      const url = 'https://de.aliexpress.com/item/1005006704880455.html?spm=a2g0o.tm1000022174.d0.1.9e601a6fr8Bd6V&pvid=7549099c-64f4-4095-9ff0-e8e59b56bccc';
      expect(aliexpressDomain.parseId(url)).toBe('1005006704880455');
    });

    it('should return null for invalid URLs', () => {
      expect(aliexpressDomain.parseId('https://www.google.com')).toBeNull();
      expect(aliexpressDomain.parseId('not-a-url')).toBeNull();
    });

    it('should return null for too short IDs', () => {
      const url = 'https://www.aliexpress.com/item/123.html';
      expect(aliexpressDomain.parseId(url)).toBeNull();
    });

    it('should return null for too long IDs', () => {
      const url = 'https://www.aliexpress.com/item/12345678901234567.html';
      expect(aliexpressDomain.parseId(url)).toBeNull();
    });
  });

  describe('validateId', () => {
    it('should validate correct product IDs', () => {
      expect(aliexpressDomain.validateId('1005004567891234')).toBe(true);
      expect(aliexpressDomain.validateId('1234567890')).toBe(true); // 10 digits minimum
      expect(aliexpressDomain.validateId('123456789012345')).toBe(true); // 15 digits
      expect(aliexpressDomain.validateId('1234567890123456')).toBe(true); // 16 digits maximum
    });

    it('should reject IDs that are too short', () => {
      expect(aliexpressDomain.validateId('123456789')).toBe(false); // 9 digits
      expect(aliexpressDomain.validateId('12345')).toBe(false);
    });

    it('should reject IDs that are too long', () => {
      expect(aliexpressDomain.validateId('12345678901234567')).toBe(false); // 17 digits
    });

    it('should reject non-numeric IDs', () => {
      expect(aliexpressDomain.validateId('abcdefghij')).toBe(false);
      expect(aliexpressDomain.validateId('123abc789')).toBe(false);
      expect(aliexpressDomain.validateId('')).toBe(false);
    });
  });

  describe('displayName', () => {
    it('should format product ID for display', () => {
      const productId = '1005004567891234';
      expect(aliexpressDomain.displayName(productId)).toBe('AliExpress Item 1005004567891234');
    });

    it('should return original string for invalid IDs', () => {
      expect(aliexpressDomain.displayName('invalid')).toBe('invalid');
      expect(aliexpressDomain.displayName('123')).toBe('123');
    });
  });

  describe('formatTrustId', () => {
    it('should format trust ID with aliexpress prefix', () => {
      const productId = '1005004567891234';
      expect(aliexpressDomain.formatTrustId(productId)).toBe('aliexpress:1005004567891234');
    });
  });

  describe('name property', () => {
    it('should have correct domain name', () => {
      expect(aliexpressDomain.name).toBe('aliexpress-product');
    });
  });
});