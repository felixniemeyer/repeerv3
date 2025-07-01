// Modern adapter registry using the new @repeer/* package system
import type { WebsiteAdapter, AgentDiscovery, TrustScore } from '@repeer/adapter-interface'
// Inline utility functions (due to CommonJS import issues)
function calculateTrustColor(roi: number, volume: number): string {
  const x = Math.round(255 / (1 + 0.001 * volume));
  const clampedROI = Math.max(0, Math.min(2, roi));
  const t = clampedROI / 2;
  const red = Math.round(255 * (1 - t) + x * t);
  const green = Math.round(x * (1 - t) + 255 * t);
  const blue = 255;
  const redHex = red.toString(16).padStart(2, '0');
  const greenHex = green.toString(16).padStart(2, '0');
  const blueHex = blue.toString(16).padStart(2, '0');
  return `#${redHex}${greenHex}${blueHex}`;
}

function formatVolume(volume: number): string {
  if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
  return volume.toFixed(0);
}

// Inline Ethereum Domain Logic (due to CommonJS import issues)
const ethereumDomain = {
  name: 'ethereum',
  parseId(text: string): string | null {
    const patterns = [
      /0x[a-fA-F0-9]{40}/,              // Direct address
      /\/address\/(0x[a-fA-F0-9]{40})/, // Etherscan-style
      /address=(0x[a-fA-F0-9]{40})/,    // Query parameter
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const address = match[1] || match[0];
        return this.validateId(address) ? address.toLowerCase() : null;
      }
    }
    return null;
  },
  validateId(id: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/i.test(id);
  },
  displayName(id: string): string {
    if (!this.validateId(id)) return id;
    return `${id.slice(0, 6)}...${id.slice(-4)}`;
  },
  formatTrustId(id: string): string {
    return `ethereum:${id.toLowerCase()}`;
  }
};

// NOTE: AliExpress adapter commented out due to CommonJS import issues
// import createAliExpressAdapter from '@repeer/aliexpress-adapter'

// Inline Advanced Etherscan Adapter (due to CommonJS import issues)
class AdvancedEtherscanAdapter implements WebsiteAdapter {
  name = 'etherscan-advanced';
  displayName = 'Etherscan Advanced';
  domains = ['etherscan.io', 'cn.etherscan.com', 'goerli.etherscan.io', 'sepolia.etherscan.io'];
  idDomains = [ethereumDomain];
  
  private injectedElements = new Set<Element>();
  private hoverBoxes = new Map<string, HTMLElement>();
  private trustScores = new Map<string, TrustScore>();
  
  async scanPage(): Promise<AgentDiscovery[]> {
    const discoveries: AgentDiscovery[] = [];
    
    // Find all Ethereum addresses on the page using various selectors
    const addressSelectors = [
      '#mainaddress',
      '.hash-tag',
      'a[href*="/address/"]',
      'span[data-highlight-target]',
      '.text-truncate a[href*="address"]',
      'tr[id^="r_"] a[href*="/address/"]',
      '[data-highlight-target]',
      '.d-inline-flex.align-items-center.gap-1 span[data-highlight-target]'
    ];
    
    for (const selector of addressSelectors) {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(element => {
        if (this.injectedElements.has(element)) return;
        
        const href = (element as HTMLAnchorElement).href || element.textContent || '';
        const address = ethereumDomain.parseId(href);
        
        if (address) {
          discoveries.push({
            agentId: ethereumDomain.formatTrustId(address),
            element: element,
            context: 'etherscan-page'
          });
        }
      });
    }
    
    return discoveries;
  }
  
  injectTrustScores(scores: Map<string, TrustScore>): void {
    scores.forEach((score, agentId) => {
      this.trustScores.set(agentId, score);
      
      // Find all elements for this agent ID
      const elements = document.querySelectorAll(`[data-repeer-agent="${agentId}"]`);
      elements.forEach(element => {
        this.createTrustIndicator(element, agentId, score);
      });
    });
  }
  
  private createTrustIndicator(element: Element, agentId: string, score: TrustScore): void {
    if (this.injectedElements.has(element)) return;
    this.injectedElements.add(element);
    
    // Create a subtle trust indicator
    const indicator = document.createElement('span');
    indicator.className = 'repeer-trust-indicator';
    indicator.setAttribute('data-agent-id', agentId);
    
    const roi = score.expected_pv_roi;
    const trustColor = calculateTrustColor(roi, score.total_volume);
    
    indicator.style.cssText = `
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: ${trustColor};
      margin-left: 4px;
      cursor: pointer;
      vertical-align: middle;
    `;
    
    // Add hover functionality
    indicator.addEventListener('mouseenter', () => {
      this.showTrustBox(agentId, element as HTMLElement, score);
    });
    
    indicator.addEventListener('mouseleave', () => {
      setTimeout(() => this.hideTrustBox(agentId), 300);
    });
    
    // Insert the indicator after the element
    if (element.parentNode) {
      element.parentNode.insertBefore(indicator, element.nextSibling);
    }
  }
  
  private showTrustBox(agentId: string, element: HTMLElement, score: TrustScore): void {
    // Remove existing box
    this.hideTrustBox(agentId);
    
    const box = document.createElement('div');
    box.className = 'repeer-trust-box';
    
    const roi = score.expected_pv_roi;
    const roiPercentage = ((roi - 1) * 100).toFixed(1);
    const trustColor = calculateTrustColor(roi, score.total_volume);
    
    box.innerHTML = `
      <div style="font-weight: bold; color: ${trustColor};">
        Trust Score: ${roiPercentage}%
      </div>
      <div style="font-size: 12px; color: #666;">
        Volume: $${formatVolume(score.total_volume)}
      </div>
      <div style="font-size: 12px; color: #666;">
        Data points: ${score.data_points}
      </div>
    `;
    
    box.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 10000;
      font-size: 13px;
      min-width: 120px;
    `;
    
    // Position the box
    const rect = element.getBoundingClientRect();
    box.style.left = `${rect.left + window.scrollX}px`;
    box.style.top = `${rect.bottom + window.scrollY + 5}px`;
    
    this.hoverBoxes.set(agentId, box);
    document.body.appendChild(box);
  }
  
  private hideTrustBox(agentId: string): void {
    const box = this.hoverBoxes.get(agentId);
    if (box) {
      box.remove();
      this.hoverBoxes.delete(agentId);
    }
  }
  
  async createExperiencePrompt(agentId: string): Promise<any> {
    // Simple modal implementation
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 20000; display: flex; align-items: center; justify-content: center;">
          <div style="background: white; padding: 20px; border-radius: 8px; max-width: 400px;">
            <h3>Record Trust Experience</h3>
            <p>Address: ${agentId.replace('ethereum:', '')}</p>
            <button onclick="this.closest('div').remove(); return false;">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.addEventListener('click', (e) => {
        if (e.target === modal.firstElementChild) {
          modal.remove();
          resolve(null);
        }
      });
    });
  }
  
  onPageLoad(): void {
    console.log('Advanced Etherscan adapter loaded');
    this.injectedElements.clear();
    this.hoverBoxes.clear();
    this.trustScores.clear();
  }
  
  cleanup(): void {
    this.injectedElements.clear();
    this.hoverBoxes.forEach(box => box.remove());
    this.hoverBoxes.clear();
    this.trustScores.clear();
  }
}

export class AdapterRegistry {
  private adapters: Map<string, WebsiteAdapter> = new Map()
  private domainMap: Map<string, WebsiteAdapter[]> = new Map()

  constructor() {
    this.registerAdapter(new AdvancedEtherscanAdapter())
    // TODO: Re-enable when CommonJS import issues are resolved
    // this.registerAdapter(createAliExpressAdapter())
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
    
    if (!hostname) {
      return adapters
    }
    
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