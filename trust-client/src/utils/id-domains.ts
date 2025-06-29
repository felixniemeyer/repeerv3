/**
 * ID Domain utilities for parsing and validating different types of identifiers
 * These utilities are used by both trust-client and browser-extension
 */

export interface IDDomain {
  name: string;
  parseId(url: string): string;
  validateId(id: string): boolean;
  displayName(id: string): string;
  formatTrustId(id: string): string;
  parseTrustId(trustId: string): string | null;
}

/**
 * Ethereum address ID domain
 */
export const ethereumDomain: IDDomain = {
  name: 'ethereum',
  
  parseId(url: string): string {
    // Extract Ethereum address from various URL formats
    const patterns = [
      /0x[a-fA-F0-9]{40}/, // Direct address
      /\/address\/(0x[a-fA-F0-9]{40})/, // Etherscan-style
      /address=(0x[a-fA-F0-9]{40})/, // Query parameter
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return this.validateId(match[1] || match[0]) ? (match[1] || match[0]) : '';
      }
    }
    
    return '';
  },
  
  validateId(id: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(id);
  },
  
  displayName(id: string): string {
    if (!this.validateId(id)) return id;
    return `${id.slice(0, 6)}...${id.slice(-4)}`;
  },

  formatTrustId(id: string): string {
    return `ethereum:${id.toLowerCase()}`;
  },

  parseTrustId(trustId: string): string | null {
    if (!trustId.startsWith('ethereum:')) return null;
    const address = trustId.slice(9); // Remove 'ethereum:' prefix
    return this.validateId(address) ? address : null;
  }
};

/**
 * AliExpress product ID domain
 */
export const aliexpressDomain: IDDomain = {
  name: 'aliexpress',
  
  parseId(url: string): string {
    // Extract AliExpress item ID from various URL formats
    const patterns = [
      /\/item\/(\d+)/, // Standard item URL
      /item_id=(\d+)/, // Query parameter
      /aliexpress\.com.*?(\d{10,})/, // Long number in URL
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && this.validateId(match[1])) {
        return match[1];
      }
    }
    
    return '';
  },
  
  validateId(id: string): boolean {
    // AliExpress item IDs are typically 10+ digit numbers
    return /^\d{10,}$/.test(id);
  },
  
  displayName(id: string): string {
    if (!this.validateId(id)) return id;
    return `AliExpress Item ${id}`;
  },

  formatTrustId(itemId: string): string {
    return `aliexpress:${itemId}`;
  },

  parseTrustId(trustId: string): string | null {
    if (!trustId.startsWith('aliexpress:')) return null;
    const itemId = trustId.slice(11); // Remove 'aliexpress:' prefix
    return this.validateId(itemId) ? itemId : null;
  }
};

/**
 * Domain ID domain (for websites)
 */
export const domainDomain: IDDomain = {
  name: 'domain',
  
  parseId(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Extract domain, handling multi-part TLDs
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        // For multi-part TLDs like .co.uk, we want to preserve them
        const multiPartTlds = ['co.uk', 'com.au', 'co.jp', 'co.kr', 'com.br'];
        const lastTwo = parts.slice(-2).join('.');
        
        if (parts.length >= 3 && multiPartTlds.includes(lastTwo)) {
          return parts.slice(-3).join('.');
        }
        
        return lastTwo;
      }
      
      return hostname;
    } catch {
      // If URL parsing fails, try to extract domain with regex
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\?]+)/);
      return match ? match[1].toLowerCase() : '';
    }
  },
  
  validateId(id: string): boolean {
    // Basic domain validation
    const domainRegex = /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)*$/;
    return domainRegex.test(id) && id.includes('.');
  },
  
  displayName(id: string): string {
    if (!this.validateId(id)) return id;
    return id;
  },

  formatTrustId(domain: string): string {
    return `domain:${domain.toLowerCase()}`;
  },

  parseTrustId(trustId: string): string | null {
    if (!trustId.startsWith('domain:')) return null;
    const domain = trustId.slice(7); // Remove 'domain:' prefix
    return this.validateId(domain) ? domain : null;
  }
};

/**
 * Registry for ID domains
 */
export class IDDomainRegistry {
  private domains: Map<string, IDDomain> = new Map();

  constructor(initialDomains: IDDomain[] = [ethereumDomain, aliexpressDomain, domainDomain]) {
    for (const domain of initialDomains) {
      this.register(domain);
    }
  }

  register(domain: IDDomain): void {
    this.domains.set(domain.name, domain);
  }

  get(name: string): IDDomain | undefined {
    return this.domains.get(name);
  }

  getAll(): IDDomain[] {
    return Array.from(this.domains.values());
  }

  parseUrl(url: string): { domain: IDDomain; id: string; trustId: string } | null {
    for (const domain of this.domains.values()) {
      const id = domain.parseId(url);
      if (id && domain.validateId(id)) {
        return {
          domain,
          id,
          trustId: domain.formatTrustId(id),
        };
      }
    }
    return null;
  }

  parseTrustId(trustId: string): { domain: IDDomain; id: string } | null {
    const colonIndex = trustId.indexOf(':');
    if (colonIndex === -1) return null;

    const domainName = trustId.slice(0, colonIndex);
    const domain = this.domains.get(domainName);
    
    if (!domain) return null;
    
    const id = domain.parseTrustId(trustId);
    if (!id) return null;

    return { domain, id };
  }

  displayName(trustId: string): string {
    const parsed = this.parseTrustId(trustId);
    if (!parsed) return trustId;
    
    return `${parsed.domain.name}: ${parsed.domain.displayName(parsed.id)}`;
  }
}

export const defaultIDRegistry = new IDDomainRegistry();