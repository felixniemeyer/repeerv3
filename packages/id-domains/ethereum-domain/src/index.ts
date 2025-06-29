export interface IDDomain {
  name: string;
  parseId(text: string): string | null;
  validateId(id: string): boolean;
  displayName(id: string): string;
  formatTrustId(id: string): string;
}

export class EthereumDomain implements IDDomain {
  name = 'ethereum';
  
  parseId(text: string): string | null {
    // Extract Ethereum address from various formats
    const patterns = [
      /0x[a-fA-F0-9]{40}/,              // Direct address
      /\/address\/(0x[a-fA-F0-9]{40})/, // Etherscan-style
      /address=(0x[a-fA-F0-9]{40})/,   // Query parameter
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const address = match[1] || match[0];
        return this.validateId(address) ? address.toLowerCase() : null;
      }
    }
    
    return null;
  }
  
  validateId(id: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/i.test(id);
  }
  
  displayName(id: string): string {
    if (!this.validateId(id)) return id;
    return `${id.slice(0, 6)}...${id.slice(-4)}`;
  }
  
  formatTrustId(id: string): string {
    return `ethereum:${id.toLowerCase()}`;
  }
}

// Export a singleton instance
export const ethereumDomain = new EthereumDomain();

// Re-export the interface for convenience
export type { IDDomain as IDDomainInterface };