import { IDAdapter } from '../types';
import { ethereumAdapter } from './ethereum';
import { aliexpressAdapter } from './aliexpress';
import { domainAdapter } from './domain';

export * from './ethereum';
export * from './aliexpress';
export * from './domain';

export const adapters: IDAdapter[] = [
  ethereumAdapter,
  aliexpressAdapter,
  domainAdapter,
];

export class AdapterRegistry {
  private adapters: Map<string, IDAdapter> = new Map();

  constructor(initialAdapters: IDAdapter[] = adapters) {
    for (const adapter of initialAdapters) {
      this.register(adapter);
    }
  }

  register(adapter: IDAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): IDAdapter | undefined {
    return this.adapters.get(name);
  }

  getAll(): IDAdapter[] {
    return Array.from(this.adapters.values());
  }

  parseUrl(url: string): { adapter: IDAdapter; id: string; trustId: string } | null {
    for (const adapter of this.adapters.values()) {
      const id = adapter.parseId(url);
      if (id && adapter.validateId(id)) {
        return {
          adapter,
          id,
          trustId: `${adapter.name}:${id}`,
        };
      }
    }
    return null;
  }

  parseTrustId(trustId: string): { adapter: IDAdapter; id: string } | null {
    const colonIndex = trustId.indexOf(':');
    if (colonIndex === -1) return null;

    const adapterName = trustId.slice(0, colonIndex);
    const id = trustId.slice(colonIndex + 1);
    
    const adapter = this.adapters.get(adapterName);
    if (!adapter || !adapter.validateId(id)) return null;

    return { adapter, id };
  }

  displayName(trustId: string): string {
    const parsed = this.parseTrustId(trustId);
    if (!parsed) return trustId;
    
    return `${parsed.adapter.name}: ${parsed.adapter.displayName(parsed.id)}`;
  }
}

export const defaultRegistry = new AdapterRegistry();