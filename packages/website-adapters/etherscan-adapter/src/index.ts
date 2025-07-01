import { WebsiteAdapter, AgentDiscovery, ExperienceData, TrustScore } from '@repeer/adapter-interface';
import { ethereumDomain } from '@repeer/ethereum-domain';
import { AdvancedEtherscanAdapter } from './advanced-etherscan-adapter';

export class EtherscanAdapter implements WebsiteAdapter {
  name = 'etherscan';
  displayName = 'Etherscan';
  domains = ['etherscan.io', 'cn.etherscan.com', 'goerli.etherscan.io', 'sepolia.etherscan.io'];
  idDomains = [ethereumDomain];
  
  private injectedElements = new Set<Element>();
  
  async scanPage(): Promise<AgentDiscovery[]> {
    const discoveries: AgentDiscovery[] = [];
    
    // Find addresses in various Etherscan page types
    
    // 1. Address page header
    const addressHeader = document.querySelector('#mainaddress, .hash-tag');
    if (addressHeader?.textContent) {
      const address = ethereumDomain.parseId(addressHeader.textContent);
      if (address) {
        discoveries.push({
          agentId: ethereumDomain.formatTrustId(address),
          element: addressHeader,
          context: 'address-header'
        });
      }
    }
    
    // 2. Transaction tables - from/to addresses
    const addressCells = document.querySelectorAll(
      'a[href*="/address/"], ' +
      '.hash-tag a[href*="address"], ' +
      'span[data-highlight-target], ' +
      '.text-truncate a[href*="/address/"]'
    );
    
    addressCells.forEach(cell => {
      if (this.injectedElements.has(cell)) return;
      
      const href = (cell as HTMLAnchorElement).href || cell.textContent || '';
      const address = ethereumDomain.parseId(href);
      
      if (address) {
        discoveries.push({
          agentId: ethereumDomain.formatTrustId(address),
          element: cell,
          context: 'transaction-table'
        });
      }
    });
    
    // 3. Token holder tables
    const holderRows = document.querySelectorAll('tr[id^="r_"]');
    holderRows.forEach(row => {
      const addressLink = row.querySelector('a[href*="/address/"]');
      if (addressLink && !this.injectedElements.has(addressLink)) {
        const address = ethereumDomain.parseId(addressLink.getAttribute('href') || '');
        if (address) {
          discoveries.push({
            agentId: ethereumDomain.formatTrustId(address),
            element: addressLink,
            context: 'token-holder'
          });
        }
      }
    });
    
    return discoveries;
  }
  
  injectTrustScores(scores: Map<string, TrustScore>): void {
    scores.forEach((score, agentId) => {
      // Find all elements for this agent
      const elements = document.querySelectorAll(`[data-repeer-agent="${agentId}"]`);
      elements.forEach(element => {
        this.createTrustBadge(element, agentId, score);
      });
    });
  }
  
  private createTrustBadge(element: Element, agentId: string, score: TrustScore): void {
    if (this.injectedElements.has(element)) return;
    this.injectedElements.add(element);
    
    const badge = document.createElement('span');
    badge.className = 'repeer-etherscan-badge';
    badge.setAttribute('data-agent-id', agentId);
    
    const roi = score.expected_pv_roi;
    const roiClass = roi > 1.1 ? 'positive' : roi < 0.9 ? 'negative' : 'neutral';
    const roiPercentage = ((roi - 1) * 100).toFixed(1);
    
    // Etherscan-specific styling
    badge.style.cssText = `
      display: inline-block;
      margin-left: 8px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      vertical-align: middle;
    `;
    
    if (roiClass === 'positive') {
      badge.style.backgroundColor = '#d4edda';
      badge.style.color = '#155724';
    } else if (roiClass === 'negative') {
      badge.style.backgroundColor = '#f8d7da';
      badge.style.color = '#721c24';
    } else {
      badge.style.backgroundColor = '#e2e3e5';
      badge.style.color = '#383d41';
    }
    
    badge.textContent = `Trust: ${roiPercentage}%`;
    badge.title = `Volume: $${this.formatVolume(score.total_volume)} | Data points: ${score.data_points}`;
    
    // Insert after the address element
    if (element.parentNode) {
      element.parentNode.insertBefore(badge, element.nextSibling);
    }
    
    // Add click handler
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.createExperiencePrompt(agentId);
    });
  }
  
  async createExperiencePrompt(agentId: string): Promise<ExperienceData | null> {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      
      // Create modal content
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: white;
        padding: 24px;
        border-radius: 8px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      `;
      
      const address = agentId.replace('ethereum:', '');
      
      modal.innerHTML = `
        <h3 style="margin: 0 0 16px 0;">Record Trust Experience</h3>
        <p style="margin: 0 0 16px 0; color: #666;">
          Address: <code style="background: #f5f5f5; padding: 2px 4px; border-radius: 3px;">${ethereumDomain.displayName(address)}</code>
        </p>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 14px;">Investment (ETH or USD):</label>
          <input type="number" id="repeer-investment" step="0.01" placeholder="100" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 14px;">Return Value:</label>
          <input type="number" id="repeer-return" step="0.01" placeholder="110" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 14px;">Timeframe (days):</label>
          <input type="number" id="repeer-timeframe" value="1" min="1" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-size: 14px;">Notes (optional):</label>
          <textarea id="repeer-notes" rows="3" placeholder="Describe your experience..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical;"></textarea>
        </div>
        
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="repeer-cancel" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button id="repeer-submit" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Record</button>
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
              source: 'etherscan',
              address: address
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
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cancelHandler();
      }, { once: true });
    });
  }
  
  private formatVolume(volume: number): string {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toFixed(0);
  }
  
  // Lifecycle methods
  onPageLoad(): void {
    console.log('Etherscan adapter loaded');
    this.injectedElements.clear();
  }
  
  cleanup(): void {
    this.injectedElements.clear();
  }
}

// Export factory function
export default function createEtherscanAdapter(): WebsiteAdapter {
  return new EtherscanAdapter();
}

// Export advanced adapter
export { AdvancedEtherscanAdapter } from './advanced-etherscan-adapter';

// Export advanced adapter factory function  
export function createAdvancedEtherscanAdapter(): WebsiteAdapter {
  return new AdvancedEtherscanAdapter();
}