# Adapter Development Guide

This guide explains how to create custom adapters for the Repeer trust network to support new platforms and identifier types.

## Overview

Adapters enable Repeer to understand and parse different types of identifiers (addresses, user IDs, product IDs, domains, etc.) from various platforms. Each adapter implements a standard interface that allows the system to:

1. **Parse** identifiers from URLs and text
2. **Validate** identifier format
3. **Display** human-readable names
4. **Generate** trust scores for those identifiers

## Architecture

```
Platform URL/Text → Adapter → Trust ID → Query Engine → Trust Score
```

## Creating an Adapter

### 1. Implement the IDAdapter Interface

All adapters must implement the `IDAdapter` interface:

```typescript
interface IDAdapter {
  name: string;
  parseId(input: string): string | null;
  validateId(id: string): boolean;
  displayName(id: string): string;
  canHandle?(url: string): boolean;
}
```

### 2. Basic Example: Social Media Platform

```typescript
// adapters/twitter.ts
import { IDAdapter } from '../types';

export const twitterAdapter: IDAdapter = {
  name: 'twitter',
  
  parseId(input: string): string | null {
    // Handle various Twitter URL formats
    const patterns = [
      /twitter\.com\/([^\/\?]+)/,
      /x\.com\/([^\/\?]+)/,
      /@([a-zA-Z0-9_]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match && match[1] !== 'home' && match[1] !== 'search') {
        return match[1].toLowerCase();
      }
    }
    
    // Direct username
    if (/^[a-zA-Z0-9_]{1,15}$/.test(input)) {
      return input.toLowerCase();
    }
    
    return null;
  },
  
  validateId(id: string): boolean {
    return /^[a-zA-Z0-9_]{1,15}$/.test(id);
  },
  
  displayName(id: string): string {
    return `@${id}`;
  },
  
  canHandle(url: string): boolean {
    return /(?:twitter|x)\.com/.test(url);
  }
};
```

### 3. Complex Example: E-commerce Platform

```typescript
// adapters/amazon.ts
import { IDAdapter } from '../types';

export const amazonAdapter: IDAdapter = {
  name: 'amazon',
  
  parseId(input: string): string | null {
    // Product ASIN patterns
    const patterns = [
      /\/dp\/([A-Z0-9]{10})/,
      /\/product\/([A-Z0-9]{10})/,
      /asin[=:]([A-Z0-9]{10})/i,
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    // Direct ASIN
    if (/^[A-Z0-9]{10}$/.test(input)) {
      return input;
    }
    
    return null;
  },
  
  validateId(id: string): boolean {
    return /^[A-Z0-9]{10}$/.test(id);
  },
  
  displayName(id: string): string {
    return `Amazon Product ${id}`;
  },
  
  canHandle(url: string): boolean {
    return /amazon\.[a-z]{2,3}/.test(url);
  }
};
```

### 4. Blockchain Example: Extended Ethereum

```typescript
// adapters/ethereum-extended.ts
import { IDAdapter } from '../types';

export const ethereumExtendedAdapter: IDAdapter = {
  name: 'ethereum-extended',
  
  parseId(input: string): string | null {
    // ENS domains
    const ensMatch = input.match(/([a-zA-Z0-9-]+\.eth)(?:$|[^a-zA-Z0-9-])/);
    if (ensMatch) {
      return ensMatch[1].toLowerCase();
    }
    
    // Contract addresses from various contexts
    const addressPatterns = [
      /0x[a-fA-F0-9]{40}/,
      /ethereum:0x[a-fA-F0-9]{40}/,
      /(?:address|contract)[=:]?(0x[a-fA-F0-9]{40})/i,
    ];
    
    for (const pattern of addressPatterns) {
      const match = input.match(pattern);
      if (match) {
        const address = match[1] || match[0];
        return address.toLowerCase();
      }
    }
    
    return null;
  },
  
  validateId(id: string): boolean {
    // Ethereum address
    if (/^0x[a-fA-F0-9]{40}$/.test(id)) {
      return true;
    }
    
    // ENS domain
    if (/^[a-zA-Z0-9-]+\.eth$/.test(id)) {
      return true;
    }
    
    return false;
  },
  
  displayName(id: string): string {
    if (id.endsWith('.eth')) {
      return id;
    }
    
    // Shorten address
    if (id.length === 42 && id.startsWith('0x')) {
      return `${id.slice(0, 6)}...${id.slice(-4)}`;
    }
    
    return id;
  }
};
```

## Advanced Features

### 1. Platform-Specific Metadata

```typescript
interface ExtendedAdapter extends IDAdapter {
  getMetadata?(id: string): Promise<PlatformMetadata>;
  getCategories?(): string[];
  getRiskFactors?(id: string): RiskAssessment;
}

interface PlatformMetadata {
  name?: string;
  description?: string;
  verified?: boolean;
  created?: Date;
  category?: string;
}
```

### 2. Multi-Level Identifiers

```typescript
export const redditAdapter: IDAdapter = {
  name: 'reddit',
  
  parseId(input: string): string | null {
    // User: u/username
    const userMatch = input.match(/\/u\/([a-zA-Z0-9_-]+)/);
    if (userMatch) {
      return `user:${userMatch[1]}`;
    }
    
    // Subreddit: r/subreddit
    const subMatch = input.match(/\/r\/([a-zA-Z0-9_]+)/);
    if (subMatch) {
      return `sub:${subMatch[1]}`;
    }
    
    return null;
  },
  
  validateId(id: string): boolean {
    return /^(user|sub):[a-zA-Z0-9_-]+$/.test(id);
  },
  
  displayName(id: string): string {
    const [type, name] = id.split(':');
    return type === 'user' ? `/u/${name}` : `/r/${name}`;
  }
};
```

### 3. Dynamic Validation

```typescript
export const githubAdapter: IDAdapter = {
  name: 'github',
  
  parseId(input: string): string | null {
    // Repository: owner/repo
    const repoMatch = input.match(/github\.com\/([^\/]+\/[^\/\?]+)/);
    if (repoMatch) {
      return repoMatch[1].toLowerCase();
    }
    
    // User profile
    const userMatch = input.match(/github\.com\/([^\/\?]+)(?:$|\?)/);
    if (userMatch && !this.isReservedPath(userMatch[1])) {
      return `user:${userMatch[1].toLowerCase()}`;
    }
    
    return null;
  },
  
  validateId(id: string): boolean {
    if (id.startsWith('user:')) {
      return /^user:[a-zA-Z0-9-]{1,39}$/.test(id);
    }
    return /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(id);
  },
  
  displayName(id: string): string {
    if (id.startsWith('user:')) {
      return id.slice(5); // Remove 'user:' prefix
    }
    return id; // owner/repo format
  },
  
  private isReservedPath(path: string): boolean {
    const reserved = ['login', 'signup', 'settings', 'organizations'];
    return reserved.includes(path.toLowerCase());
  }
};
```

## Registration and Integration

### 1. Register Your Adapter

```typescript
// adapters/index.ts
import { IDAdapter, IDRegistry } from '../types';
import { twitterAdapter } from './twitter';
import { amazonAdapter } from './amazon';
// ... other adapters

export const defaultRegistry = new IDRegistry([
  ethereumAdapter,
  aliexpressAdapter,
  domainAdapter,
  twitterAdapter,    // Your new adapter
  amazonAdapter,     // Another new adapter
]);
```

### 2. Update Browser Extension

```typescript
// content/index.ts
private async injectTwitterScores() {
  if (!window.location.hostname.includes('twitter') && 
      !window.location.hostname.includes('x.com')) return;
  
  const parsed = defaultRegistry.parseUrl(window.location.href);
  if (parsed && parsed.adapter.name === 'twitter') {
    const agentId = parsed.trustId;
    
    if (!this.observedUrls.has(agentId)) {
      this.observedUrls.add(agentId);
      
      // Find profile elements
      const profileElement = document.querySelector('[data-testid="UserName"]');
      if (profileElement) {
        await this.addTrustScoreOverlay(profileElement, agentId);
      }
    }
  }
}
```

### 3. Add Platform Detection

```typescript
// content/index.ts
private async scanAndInjectScores() {
  // Platform-specific injection
  this.injectEthereumScores();
  this.injectAliExpressScores();
  this.injectTwitterScores();    // New platform
  this.injectAmazonScores();     // New platform
  
  // Generic domain-based injection
  this.injectDomainScores();
}
```

## Testing Your Adapter

### 1. Unit Tests

```typescript
// tests/adapters/twitter.test.ts
import { twitterAdapter } from '../src/adapters/twitter';

describe('Twitter Adapter', () => {
  test('parses Twitter URLs correctly', () => {
    expect(twitterAdapter.parseId('https://twitter.com/elonmusk')).toBe('elonmusk');
    expect(twitterAdapter.parseId('https://x.com/jack')).toBe('jack');
    expect(twitterAdapter.parseId('@username')).toBe('username');
  });

  test('validates usernames', () => {
    expect(twitterAdapter.validateId('elonmusk')).toBe(true);
    expect(twitterAdapter.validateId('user_123')).toBe(true);
    expect(twitterAdapter.validateId('invalid@user')).toBe(false);
  });

  test('displays names correctly', () => {
    expect(twitterAdapter.displayName('elonmusk')).toBe('@elonmusk');
  });
});
```

### 2. Integration Tests

```typescript
// tests/integration/platform.test.ts
import { defaultRegistry } from '../src/adapters';

describe('Platform Integration', () => {
  test('handles Twitter URLs end-to-end', () => {
    const url = 'https://twitter.com/elonmusk/status/123456789';
    const parsed = defaultRegistry.parseUrl(url);
    
    expect(parsed).toBeTruthy();
    expect(parsed?.adapter.name).toBe('twitter');
    expect(parsed?.trustId).toBe('elonmusk');
  });
});
```

## Best Practices

### 1. Error Handling

```typescript
parseId(input: string): string | null {
  try {
    // Your parsing logic
    const match = input.match(pattern);
    if (match) {
      return this.normalizeId(match[1]);
    }
  } catch (error) {
    console.warn(`Failed to parse ${this.name} ID:`, error);
  }
  
  return null;
}
```

### 2. Input Sanitization

```typescript
private normalizeId(id: string): string {
  return id
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_.-]/g, ''); // Remove invalid characters
}
```

### 3. Performance Optimization

```typescript
// Cache compiled regexes
const URL_PATTERNS = [
  /pattern1/,
  /pattern2/,
  /pattern3/
];

parseId(input: string): string | null {
  // Use pre-compiled patterns
  for (const pattern of URL_PATTERNS) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}
```

### 4. Platform-Specific Considerations

- **Rate Limiting**: Be aware of API rate limits for metadata fetching
- **Privacy**: Don't log or expose sensitive user information
- **Security**: Validate all inputs to prevent injection attacks
- **Scalability**: Design for high-volume identifier processing

## Platform Categories

### Financial Platforms
- Crypto exchanges (Coinbase, Binance)
- Traditional brokers (Robinhood, E*TRADE)
- Payment systems (PayPal, Venmo)

### E-commerce Platforms  
- Marketplaces (Amazon, eBay, Etsy)
- Regional platforms (Taobao, Mercado Libre)
- Service platforms (Uber, DoorDash)

### Social Platforms
- Social networks (Twitter, LinkedIn, Instagram)
- Professional platforms (GitHub, Stack Overflow)
- Content platforms (YouTube, Twitch, OnlyFans)

### Blockchain Networks
- Layer 1 chains (Ethereum, Bitcoin, Solana)
- Layer 2 solutions (Polygon, Arbitrum, Optimism)
- Cross-chain protocols (Cosmos, Polkadot)

## Deployment

1. **Add adapter to `adapters/` directory**
2. **Export from `adapters/index.ts`**
3. **Register in `defaultRegistry`**
4. **Add platform detection to content script**
5. **Update tests**
6. **Build and test extension**
7. **Submit pull request**

## Community Contributions

We welcome community-contributed adapters! Please:

1. Follow the coding standards in this guide
2. Include comprehensive tests
3. Document any platform-specific quirks
4. Test with real-world data
5. Consider privacy and security implications

For questions or support, open an issue in the Repeer repository.