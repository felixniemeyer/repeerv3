import { IDAdapter } from '../types';

export const ethereumAdapter: IDAdapter = {
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
  }
};

export function formatEthereumTrustId(address: string): string {
  return `ethereum:${address.toLowerCase()}`;
}

export function parseEthereumTrustId(trustId: string): string | null {
  if (!trustId.startsWith('ethereum:')) return null;
  const address = trustId.slice(9); // Remove 'ethereum:' prefix
  return ethereumAdapter.validateId(address) ? address : null;
}