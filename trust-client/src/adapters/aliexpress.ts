import { IDAdapter } from '../types';

export const aliexpressAdapter: IDAdapter = {
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
  }
};

export function formatAliExpressTrustId(itemId: string): string {
  return `aliexpress:${itemId}`;
}

export function parseAliExpressTrustId(trustId: string): string | null {
  if (!trustId.startsWith('aliexpress:')) return null;
  const itemId = trustId.slice(11); // Remove 'aliexpress:' prefix
  return aliexpressAdapter.validateId(itemId) ? itemId : null;
}