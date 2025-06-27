import { IDAdapter } from '../types';

export const domainAdapter: IDAdapter = {
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
  }
};

export function formatDomainTrustId(domain: string): string {
  return `domain:${domain.toLowerCase()}`;
}

export function parseDomainTrustId(trustId: string): string | null {
  if (!trustId.startsWith('domain:')) return null;
  const domain = trustId.slice(7); // Remove 'domain:' prefix
  return domainAdapter.validateId(domain) ? domain : null;
}