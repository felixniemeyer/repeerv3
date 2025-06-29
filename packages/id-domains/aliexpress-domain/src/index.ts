export interface IDDomain {
  name: string;
  parseId(text: string): string | null;
  validateId(id: string): boolean;
  displayName(id: string): string;
  formatTrustId(id: string): string;
}

export class AliExpressDomain implements IDDomain {
  name = 'aliexpress-product';
  
  parseId(text: string): string | null {
    // Extract AliExpress product ID from various URL formats
    const patterns = [
      /item\/(\d+)\.html/,                    // Standard product URL
      /productId=(\d+)/,                      // Query parameter
      /\/product\/(\d+)/,                     // Alternative URL format
      /aliexpress\.com\/[\w-]+\/(\d+)\.html/, // With category path
      /\/(\d{10,})(?:\.html)?$/,              // Direct ID at end of path
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const productId = match[1];
        return this.validateId(productId) ? productId : null;
      }
    }
    
    return null;
  }
  
  validateId(id: string): boolean {
    // AliExpress product IDs are typically 10-15 digit numbers
    return /^\d{10,15}$/.test(id);
  }
  
  displayName(id: string): string {
    if (!this.validateId(id)) return id;
    return `AliExpress Item ${id}`;
  }
  
  formatTrustId(id: string): string {
    return `aliexpress:${id}`;
  }
}

// Export a singleton instance
export const aliexpressDomain = new AliExpressDomain();

// Re-export the interface for convenience
export type { IDDomain as IDDomainInterface };