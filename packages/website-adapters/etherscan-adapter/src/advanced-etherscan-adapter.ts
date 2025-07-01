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
import { createApp, ref, computed } from 'vue';
import type { TrustClient } from '@repeer/trust-client';

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
      this.createExperiencePrompt(agentId);
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
  
  
  injectTrustScores(scores: Map<string, TrustScore>): void {
    // Store scores for hover display
    scores.forEach((score, agentId) => {
      this.trustScores.set(agentId, score);
    });
    
    // No immediate injection - trust scores appear on hover only
  }
  
  async createExperiencePrompt(agentId: string): Promise<ExperienceData | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9999999;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: white;
        padding: 32px;
        border-radius: 12px;
        max-width: 450px;
        width: 90%;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      `;
      
      const address = agentId.replace('ethereum:', '');
      
      modal.innerHTML = `
        <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 700;">Record Experience</h2>
        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px;">
          Address: <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${ethereumDomain.displayName(address)}</code>
        </p>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">Investment Amount (ETH or USD):</label>
          <input type="number" id="repeer-investment" step="0.01" placeholder="100" style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 16px; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">Return Value:</label>
          <input type="number" id="repeer-return" step="0.01" placeholder="110" style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 16px; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">Timeframe (days):</label>
          <input type="number" id="repeer-timeframe" value="1" min="1" style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 16px; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 24px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">Notes (optional):</label>
          <textarea id="repeer-notes" rows="3" placeholder="Describe your experience with this address..." style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; resize: vertical; font-size: 14px; box-sizing: border-box; font-family: inherit;"></textarea>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="repeer-cancel" style="padding: 12px 24px; border: 1px solid #d1d5db; background: white; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; color: #374151;">Cancel</button>
          <button id="repeer-submit" style="padding: 12px 24px; border: none; background: #3b82f6; color: white; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">Record Experience</button>
        </div>
      `;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      // Focus first input
      const firstInput = modal.querySelector('input') as HTMLInputElement;
      firstInput?.focus();
      
      // Handle submit
      modal.querySelector('#repeer-submit')?.addEventListener('click', () => {
        const investment = parseFloat((document.getElementById('repeer-investment') as HTMLInputElement).value);
        const returnValue = parseFloat((document.getElementById('repeer-return') as HTMLInputElement).value);
        const timeframe = parseFloat((document.getElementById('repeer-timeframe') as HTMLInputElement).value);
        const notes = (document.getElementById('repeer-notes') as HTMLTextAreaElement).value;
        
        if (investment && returnValue && timeframe) {
          resolve({
            agent_id: agentId,
            investment,
            return_value: returnValue,
            timeframe_days: timeframe,
            notes: notes || undefined,
            data: {
              source: 'etherscan-advanced',
              address: address,
              url: window.location.href
            }
          });
          overlay.remove();
        }
      });
      
      // Handle cancel
      const cancelHandler = () => {
        resolve(null);
        overlay.remove();
      };
      
      modal.querySelector('#repeer-cancel')?.addEventListener('click', cancelHandler);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cancelHandler();
      });
      
      // Handle escape key
      const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          cancelHandler();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    });
  }
  
  // New UI creation method - creates Vue app instance in provided container
  async createExperienceUI(container: HTMLElement, agentId: string, options?: { client?: TrustClient }): Promise<{
    onSubmit: (callback: (data: ExperienceData) => void) => void;
    onCancel: (callback: () => void) => void;
    destroy: () => void;
  }> {
    const address = agentId.replace('ethereum:', '');
    
    let submitCallback: ((data: ExperienceData) => void) | null = null;
    let cancelCallback: (() => void) | null = null;
    
    // Create Vue app with our UI component
    const app = createApp(UI, {
      agentId,
      address,
      client: options?.client
    });
    
    // Set up event handlers
    app.config.globalProperties.$emit = (event: string, data?: any) => {
      if (event === 'submit' && submitCallback) {
        submitCallback(data);
      } else if (event === 'cancel' && cancelCallback) {
        cancelCallback();
      }
    };
    
    // Mount the app to the container
    const instance = app.mount(container);
    
    // Return the interface
    return {
      onSubmit: (callback: (data: ExperienceData) => void) => {
        submitCallback = callback;
      },
      onCancel: (callback: () => void) => {
        cancelCallback = callback;
      },
      destroy: () => {
        app.unmount();
      }
    };
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