export interface IDDomain {
  name: string;
  parseId(text: string): string | null;
  validateId(id: string): boolean;
  displayName(id: string): string;
  formatTrustId(id: string): string;
}

export class DomainDomain implements IDDomain {
  name = 'domain';
  
  parseId(text: string): string | null {
    try {
      // Parse URL to extract second-level domain
      let urlStr = text;
      
      // Add protocol if missing
      if (!urlStr.match(/^https?:\/\//)) {
        urlStr = 'https://' + urlStr;
      }
      
      const url = new URL(urlStr);
      const sld = this.extractSecondLevelDomain(url.hostname);
      
      return this.validateId(sld) ? sld : null;
    } catch {
      // If URL parsing fails, try to extract domain from text
      const domainMatch = text.match(/(?:https?:\/\/)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
      if (domainMatch && domainMatch[1]) {
        const sld = this.extractSecondLevelDomain(domainMatch[1]);
        return this.validateId(sld) ? sld : null;
      }
      return null;
    }
  }
  
  private extractSecondLevelDomain(hostname: string): string {
    // Remove www. prefix if present
    hostname = hostname.replace(/^www\./, '');
    
    // Split by dots
    const parts = hostname.split('.');
    
    // Handle common TLDs with second-level domains (co.uk, com.au, etc.)
    const multiPartTLDs = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.za'];
    
    for (const tld of multiPartTLDs) {
      if (hostname.endsWith('.' + tld)) {
        const tldParts = tld.split('.').length;
        if (parts.length > tldParts) {
          return parts[parts.length - tldParts - 1] + '.' + tld;
        }
      }
    }
    
    // For standard TLDs, return domain.tld
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    
    return hostname;
  }
  
  validateId(id: string): boolean {
    // Basic domain validation
    return /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?$/.test(id);
  }
  
  displayName(id: string): string {
    return id;
  }
  
  formatTrustId(id: string): string {
    return `domain:${id.toLowerCase()}`;
  }
}

// Export a singleton instance
export const domainDomain = new DomainDomain();

// Re-export the interface for convenience
export type { IDDomain as IDDomainInterface };