// Modern adapter registry using the new @repeer/* package system
import type { WebsiteAdapter, AgentDiscovery, TrustScore } from '@repeer/adapter-interface'

// Import all available adapters
import createEtherscanAdapter from '@repeer/etherscan-adapter'
import createAliExpressAdapter from '@repeer/aliexpress-adapter'

export class AdapterRegistry {
  private adapters: Map<string, WebsiteAdapter> = new Map()
  private domainMap: Map<string, WebsiteAdapter[]> = new Map()

  constructor() {
    this.registerAdapter(createEtherscanAdapter())
    this.registerAdapter(createAliExpressAdapter())
  }

  private registerAdapter(adapter: WebsiteAdapter) {
    this.adapters.set(adapter.name, adapter)
    
    // Map domains to adapters for quick lookup
    for (const domain of adapter.domains) {
      if (!this.domainMap.has(domain)) {
        this.domainMap.set(domain, [])
      }
      this.domainMap.get(domain)!.push(adapter)
    }
  }

  /**
   * Get adapters that can handle the current domain
   */
  getAdaptersForDomain(hostname: string): WebsiteAdapter[] {
    const adapters: WebsiteAdapter[] = []
    
    // Check exact domain matches
    if (this.domainMap.has(hostname)) {
      adapters.push(...this.domainMap.get(hostname)!)
    }
    
    // Check subdomain matches (e.g., cn.etherscan.com matches etherscan.io)
    for (const [domain, domainAdapters] of this.domainMap) {
      if (hostname.includes(domain) || domain.includes(hostname)) {
        adapters.push(...domainAdapters.filter(a => !adapters.includes(a)))
      }
    }
    
    return adapters
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): WebsiteAdapter[] {
    return Array.from(this.adapters.values())
  }

  /**
   * Get adapter by name
   */
  getAdapter(name: string): WebsiteAdapter | undefined {
    return this.adapters.get(name)
  }

  /**
   * Scan the current page using all applicable adapters
   */
  async scanCurrentPage(): Promise<AgentDiscovery[]> {
    const hostname = window.location.hostname
    const applicableAdapters = this.getAdaptersForDomain(hostname)
    
    const allDiscoveries: AgentDiscovery[] = []
    
    for (const adapter of applicableAdapters) {
      try {
        // Call lifecycle hook
        if (adapter.onPageLoad) {
          adapter.onPageLoad()
        }
        
        const discoveries = await adapter.scanPage()
        allDiscoveries.push(...discoveries)
      } catch (error) {
        console.error(`Error scanning with adapter ${adapter.name}:`, error)
      }
    }
    
    return allDiscoveries
  }

  /**
   * Inject trust scores using all applicable adapters
   */
  async injectTrustScores(scores: Map<string, TrustScore>): Promise<void> {
    const hostname = window.location.hostname
    const applicableAdapters = this.getAdaptersForDomain(hostname)
    
    for (const adapter of applicableAdapters) {
      try {
        adapter.injectTrustScores(scores)
      } catch (error) {
        console.error(`Error injecting scores with adapter ${adapter.name}:`, error)
      }
    }
  }

  /**
   * Create experience prompt using the first applicable adapter
   */
  async createExperiencePrompt(agentId: string): Promise<any> {
    const hostname = window.location.hostname
    const applicableAdapters = this.getAdaptersForDomain(hostname)
    
    if (applicableAdapters.length === 0) {
      throw new Error(`No adapters available for domain: ${hostname}`)
    }
    
    // Use the first adapter that supports experience creation
    const adapter = applicableAdapters[0]
    
    try {
      return await adapter.createExperiencePrompt(agentId)
    } catch (error) {
      console.error(`Error creating experience prompt with adapter ${adapter.name}:`, error)
      throw error
    }
  }

  /**
   * Clean up all adapters
   */
  cleanup(): void {
    for (const adapter of this.adapters.values()) {
      try {
        if (adapter.cleanup) {
          adapter.cleanup()
        }
      } catch (error) {
        console.error(`Error cleaning up adapter ${adapter.name}:`, error)
      }
    }
  }

  /**
   * Handle page changes
   */
  onPageChange(): void {
    for (const adapter of this.adapters.values()) {
      try {
        if (adapter.onPageChange) {
          adapter.onPageChange()
        }
      } catch (error) {
        console.error(`Error handling page change for adapter ${adapter.name}:`, error)
      }
    }
  }
}

// Export singleton instance
export const adapterRegistry = new AdapterRegistry()