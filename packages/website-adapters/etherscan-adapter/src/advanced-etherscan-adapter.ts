import { 
  WebsiteAdapter, 
  AgentDiscovery, 
  ExperienceData, 
  TrustScore,
  calculateTrustColor,
  darkenColor,
  formatVolume
} from '@repeer/adapter-interface';
import { ethereumDomain } from '@repeer/ethereum-domain';

export class AdvancedEtherscanAdapter implements WebsiteAdapter {
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
      // Main address headers
      '#mainaddress',
      '.hash-tag',
      
      // Address links in transaction tables
      'a[href*="/address/"]',
      'span[data-highlight-target]',
      '.text-truncate a[href*="address"]',
      
      // Token holder tables
      'tr[id^="r_"] a[href*="/address/"]',
      
      // Any element containing Ethereum addresses
      '[data-highlight-target]',
      
      // Transaction from/to addresses
      '.d-inline-flex.align-items-center.gap-1 span[data-highlight-target]'
    ];
    
    for (const selector of addressSelectors) {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(element => {
        if (this.injectedElements.has(element)) return;
        
        // Extract address from various sources
        let address = null;
        
        // Try data-highlight-target attribute first
        const highlightTarget = element.getAttribute('data-highlight-target');
        if (highlightTarget) {
          address = ethereumDomain.parseId(highlightTarget);
        }
        
        // Try href attribute
        if (!address && element instanceof HTMLAnchorElement) {
          address = ethereumDomain.parseId(element.href);
        }
        
        // Try text content
        if (!address) {
          address = ethereumDomain.parseId(element.textContent || '');
        }
        
        if (address) {
          const agentId = ethereumDomain.formatTrustId(address);
          
          discoveries.push({
            agentId,
            element,
            context: this.getElementContext(element)
          });
          
          // Setup hover listeners immediately
          this.setupHoverListeners(element, agentId);
        }
      });
    }
    
    return discoveries;
  }
  
  private getElementContext(element: Element): string {
    // Determine context based on element location and structure
    if (element.id === 'mainaddress' || element.closest('.hash-tag')) {
      return 'address-header';
    }
    
    if (element.closest('tr[id^="r_"]')) {
      return 'token-holder';
    }
    
    if (element.closest('.row') && element.textContent?.includes('From')) {
      return 'transaction-from';
    }
    
    if (element.closest('.row') && element.textContent?.includes('To')) {
      return 'transaction-to';
    }
    
    if (element.closest('table')) {
      return 'transaction-table';
    }
    
    return 'general';
  }
  
  private setupHoverListeners(element: Element, agentId: string): void {
    if (this.injectedElements.has(element)) return;
    this.injectedElements.add(element);
    
    let hoverTimeout: number | null = null;
    let isHovering = false;
    
    const showBox = () => {
      if (!isHovering) return;
      
      const trustScore = this.trustScores.get(agentId);
      if (trustScore) {
        this.showTrustBox(element, agentId, trustScore);
      }
    };
    
    const hideBox = () => {
      isHovering = false;
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      this.hideTrustBox(agentId);
    };
    
    element.addEventListener('mouseenter', () => {
      isHovering = true;
      hoverTimeout = window.setTimeout(showBox, 300); // 300ms delay
    });
    
    element.addEventListener('mouseleave', hideBox);
    
    // Also hide on scroll
    window.addEventListener('scroll', hideBox, { passive: true });
  }
  
  private showTrustBox(element: Element, agentId: string, trustScore: TrustScore): void {
    // Remove existing box if any
    this.hideTrustBox(agentId);
    
    const box = this.createTrustBox(agentId, trustScore);
    this.hoverBoxes.set(agentId, box);
    
    // Position the box relative to the element
    this.positionTrustBox(box, element);
    
    document.body.appendChild(box);
    
    // Add hover listeners to the box itself to keep it open
    let boxHoverTimeout: number | null = null;
    
    box.addEventListener('mouseenter', () => {
      if (boxHoverTimeout) {
        clearTimeout(boxHoverTimeout);
        boxHoverTimeout = null;
      }
    });
    
    box.addEventListener('mouseleave', () => {
      boxHoverTimeout = window.setTimeout(() => {
        this.hideTrustBox(agentId);
      }, 100);
    });
  }
  
  private createTrustBox(agentId: string, trustScore: TrustScore): HTMLElement {
    const box = document.createElement('div');
    box.className = 'repeer-trust-box';
    
    const address = agentId.replace('ethereum:', '');
    const displayAddress = ethereumDomain.displayName(address);
    
    // Calculate color based on ROI and volume using the shared formula
    const color = calculateTrustColor(trustScore.expected_pv_roi, trustScore.total_volume);
    
    // Format ROI as percentage
    const roiPercentage = ((trustScore.expected_pv_roi - 1) * 100).toFixed(1);
    const roiSign = trustScore.expected_pv_roi >= 1 ? '+' : '';
    
    // Format volume
    const formattedVolume = formatVolume(trustScore.total_volume);
    
    box.innerHTML = `
      <div class="repeer-trust-header">
        <div class="repeer-trust-address">${displayAddress}</div>
        <div class="repeer-trust-logo">⭐ Repeer</div>
      </div>
      <div class="repeer-trust-content">
        <div class="repeer-trust-roi">
          <span class="repeer-roi-value">${roiSign}${roiPercentage}%</span>
          <span class="repeer-roi-label">ROI</span>
        </div>
        <div class="repeer-trust-volume">
          <span class="repeer-volume-value">$${formattedVolume}</span>
          <span class="repeer-volume-label">Volume</span>
        </div>
        <div class="repeer-trust-data-points">
          <span class="repeer-data-value">${trustScore.data_points}</span>
          <span class="repeer-data-label">Reviews</span>
        </div>
      </div>
      <div class="repeer-trust-footer">
        <button class="repeer-add-experience-btn">Add Experience</button>
      </div>
    `;
    
    // Style the box with the calculated trust color
    box.style.cssText = `
      position: absolute;
      z-index: 999999;
      background: ${color};
      border: 1px solid ${darkenColor(color, 20)};
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      width: 280px;
      padding: 0;
      overflow: hidden;
    `;
    
    // Style internal elements
    const style = document.createElement('style');
    style.textContent = `
      .repeer-trust-box .repeer-trust-header {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(255, 255, 255, 0.1);
      }
      
      .repeer-trust-box .repeer-trust-address {
        font-weight: 600;
        color: #1a202c;
        font-size: 13px;
      }
      
      .repeer-trust-box .repeer-trust-logo {
        font-size: 11px;
        color: #4a5568;
        font-weight: 500;
      }
      
      .repeer-trust-box .repeer-trust-content {
        padding: 16px;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 12px;
        background: rgba(255, 255, 255, 0.95);
      }
      
      .repeer-trust-box .repeer-trust-roi,
      .repeer-trust-box .repeer-trust-volume,
      .repeer-trust-box .repeer-trust-data-points {
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .repeer-trust-box .repeer-roi-value,
      .repeer-trust-box .repeer-volume-value,
      .repeer-trust-box .repeer-data-value {
        font-weight: 700;
        font-size: 16px;
        line-height: 1;
        color: #1a202c;
      }
      
      .repeer-trust-box .repeer-roi-label,
      .repeer-trust-box .repeer-volume-label,
      .repeer-trust-box .repeer-data-label {
        font-size: 11px;
        color: #718096;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 500;
      }
      
      .repeer-trust-box .repeer-trust-footer {
        padding: 12px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.1);
      }
      
      .repeer-trust-box .repeer-add-experience-btn {
        width: 100%;
        padding: 8px 12px;
        background: #4299e1;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
      }
      
      .repeer-trust-box .repeer-add-experience-btn:hover {
        background: #3182ce;
      }
    `;
    
    document.head.appendChild(style);
    
    // Add click handler for experience button
    const addExpBtn = box.querySelector('.repeer-add-experience-btn') as HTMLButtonElement;
    addExpBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openAgentDetailsPage(agentId);
      this.hideTrustBox(agentId);
    });
    
    return box;
  }
  
  
  private positionTrustBox(box: HTMLElement, element: Element): void {
    const rect = element.getBoundingClientRect();
    const boxWidth = 280;
    const boxHeight = 160; // Estimated height
    
    // Calculate optimal position
    let left = rect.left + rect.width / 2 - boxWidth / 2;
    let top = rect.bottom + 8;
    
    // Adjust if box would go off screen
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Horizontal adjustment
    if (left < 8) {
      left = 8;
    } else if (left + boxWidth > windowWidth - 8) {
      left = windowWidth - boxWidth - 8;
    }
    
    // Vertical adjustment (show above if not enough space below)
    if (top + boxHeight > windowHeight - 8) {
      top = rect.top - boxHeight - 8;
    }
    
    // Final boundary check
    if (top < 8) {
      top = 8;
    }
    
    box.style.left = `${left + window.scrollX}px`;
    box.style.top = `${top + window.scrollY}px`;
  }
  
  private hideTrustBox(agentId: string): void {
    const box = this.hoverBoxes.get(agentId);
    if (box && box.parentNode) {
      box.parentNode.removeChild(box);
      this.hoverBoxes.delete(agentId);
    }
  }

  /**
   * Inject visual trust badges next to discovered addresses
   */
  private injectVisualTrustBadges(scores: Map<string, TrustScore>): void {
    scores.forEach((score, agentId) => {
      // Find all elements that could contain this agent ID
      const addressPattern = agentId.replace('ethereum:', '');
      
      // Look for elements containing this address
      const elements = document.querySelectorAll(`[data-highlight-target*="${addressPattern}"], a[href*="${addressPattern}"]`);
      
      elements.forEach(element => {
        if (this.injectedElements.has(element)) return;
        this.injectedElements.add(element);
        
        this.createVisualTrustBadge(element, agentId, score);
      });
    });
  }

  /**
   * Create a visual trust badge next to an address element
   */
  private createVisualTrustBadge(element: Element, agentId: string, score: TrustScore): void {
    const badge = document.createElement('span');
    badge.className = 'repeer-trust-badge';
    badge.setAttribute('data-agent-id', agentId);
    
    const roi = score.expected_pv_roi;
    const roiClass = roi > 1.1 ? 'positive' : roi < 0.9 ? 'negative' : 'neutral';
    const roiPercentage = ((roi - 1) * 100).toFixed(1);
    const roiSign = roi >= 1 ? '+' : '';
    
    // Calculate color using the same formula as hover boxes
    const color = calculateTrustColor(score.expected_pv_roi, score.total_volume);
    
    badge.style.cssText = `
      display: inline-block;
      margin-left: 8px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      vertical-align: middle;
      background: ${color};
      color: #1a202c;
      border: 1px solid ${darkenColor(color, 20)};
      text-decoration: none;
    `;
    
    badge.textContent = `${roiSign}${roiPercentage}%`;
    badge.title = `Repeer Trust Score: ${roiSign}${roiPercentage}% ROI | Volume: $${formatVolume(score.total_volume)} | ${score.data_points} reviews`;
    
    // Insert after the address element
    if (element.parentNode) {
      element.parentNode.insertBefore(badge, element.nextSibling);
    }
    
    // Add click handler to open experience form
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openAgentDetailsPage(agentId);
    });
  }

  /**
   * Inject "unknown" badges for addresses that don't have trust scores yet
   */
  private injectUnknownScoreBadges(knownScores: Map<string, TrustScore>): void {
    // Find all Ethereum addresses on the page that weren't injected yet
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
        
        // Extract address from various sources
        let address = null;
        
        // Try data-highlight-target attribute first
        const highlightTarget = element.getAttribute('data-highlight-target');
        if (highlightTarget) {
          address = ethereumDomain.parseId(highlightTarget);
        }
        
        // Try href attribute
        if (!address && element instanceof HTMLAnchorElement) {
          address = ethereumDomain.parseId(element.href);
        }
        
        // Try text content
        if (!address) {
          address = ethereumDomain.parseId(element.textContent || '');
        }
        
        if (address) {
          const agentId = ethereumDomain.formatTrustId(address);
          
          // Only create unknown badge if we don't have a known score
          if (!knownScores.has(agentId)) {
            this.injectedElements.add(element);
            this.createUnknownScoreBadge(element, agentId);
          }
        }
      });
    }
  }

  /**
   * Create an "unknown" badge for addresses without trust scores
   */
  private createUnknownScoreBadge(element: Element, agentId: string): void {
    const badge = document.createElement('span');
    badge.className = 'repeer-unknown-badge';
    badge.setAttribute('data-agent-id', agentId);
    
    badge.style.cssText = `
      display: inline-block;
      margin-left: 8px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      vertical-align: middle;
      background: #f7f7f7;
      color: #666;
      border: 1px solid #ddd;
      text-decoration: none;
    `;
    
    badge.textContent = '?';
    badge.title = 'Repeer Trust Score: Unknown - Click to add experience';
    
    // Insert after the address element
    if (element.parentNode) {
      element.parentNode.insertBefore(badge, element.nextSibling);
    }
    
    // Add click handler to open experience form
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openAgentDetailsPage(agentId);
    });
  }
  
  
  injectTrustScores(scores: Map<string, TrustScore>): void {
    // Store scores for hover display
    scores.forEach((score, agentId) => {
      this.trustScores.set(agentId, score);
    });
    
    // Also inject visible trust badges immediately
    this.injectVisualTrustBadges(scores);
    
    // Also inject "unknown" badges for addresses without scores
    this.injectUnknownScoreBadges(scores);
  }
  
  async createExperiencePrompt(agentId: string): Promise<ExperienceData | null> {
    // Use the new message-based API to open agent details page
    this.openAgentDetailsPage(agentId);
    return null; // No longer returns data directly
  }

  /**
   * Opens the agent details page via extension message API
   */
  private openAgentDetailsPage(agentId: string): void {
    const [idDomain, agentIdPart] = this.splitAgentId(agentId);
    
    // Send message to background script to open agent details
    if (typeof (window as any).chrome !== 'undefined' && (window as any).chrome.runtime) {
      (window as any).chrome.runtime.sendMessage({
        type: 'SHOW_AGENT_DETAILS',
        idDomain,
        agentId: agentIdPart
      }).catch((error: any) => {
        console.error('Failed to open agent details page:', error);
        // Fallback: show an alert
        alert('Please install or enable the Repeer browser extension to record experiences.');
      });
    } else {
      console.warn('Chrome extension API not available');
      alert('Please install the Repeer browser extension to record experiences.');
    }
  }

  /**
   * Suggests an experience to be entered via the extension
   * @param pvRoi - Present value ROI (e.g., 1.2 for 20% return)
   * @param volume - Volume/amount of the experience
   * @param data - Additional adapter-specific data
   */
  async enterExperience(agentId: string, pvRoi: number, volume: number, data?: any): Promise<void> {
    const [idDomain, agentIdPart] = this.splitAgentId(agentId);
    
    // Send message to background script to suggest experience
    if (typeof (window as any).chrome !== 'undefined' && (window as any).chrome.runtime) {
      (window as any).chrome.runtime.sendMessage({
        type: 'ENTER_EXPERIENCE',
        idDomain,
        agentId: agentIdPart,
        pvRoi,
        volume,
        data: {
          source: 'etherscan-advanced',
          address: agentIdPart,
          url: window.location.href,
          ...data
        }
      }).catch((error: any) => {
        console.error('Failed to suggest experience:', error);
      });
    } else {
      console.warn('Chrome extension API not available');
    }
  }

  /**
   * Helper to split agent ID into domain and ID parts
   */
  private splitAgentId(agentId: string): [string, string] {
    const colonIndex = agentId.indexOf(':');
    if (colonIndex === -1) {
      return ['ethereum', agentId]; // Default to ethereum domain
    }
    return [
      agentId.substring(0, colonIndex),
      agentId.substring(colonIndex + 1)
    ];
  }
  
  // Lifecycle methods
  onPageLoad(): void {
    console.log('Advanced Etherscan adapter loaded');
    this.injectedElements.clear();
    this.cleanup();
  }
  
  onPageChange(): void {
    this.cleanup();
  }
  
  cleanup(): void {
    this.injectedElements.clear();
    
    // Remove all hover boxes
    this.hoverBoxes.forEach((box, agentId) => {
      this.hideTrustBox(agentId);
    });
    this.hoverBoxes.clear();
    
    // Clear trust scores
    this.trustScores.clear();
  }
}

// Export factory function
export default function createAdvancedEtherscanAdapter(): WebsiteAdapter {
  return new AdvancedEtherscanAdapter();
}