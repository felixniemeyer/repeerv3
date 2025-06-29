import { WebsiteAdapter, AgentDiscovery, ExperienceData, TrustScore } from '@repeer/adapter-interface';
import { aliexpressDomain } from '@repeer/aliexpress-domain';

export class AliExpressAdapter implements WebsiteAdapter {
  name = 'aliexpress';
  displayName = 'AliExpress';
  domains = ['aliexpress.com', 'www.aliexpress.com', 'aliexpress.us', 'm.aliexpress.com'];
  idDomains = [aliexpressDomain];
  
  private injectedElements = new Set<Element>();
  private trackingTimer: number | null = null;
  
  async scanPage(): Promise<AgentDiscovery[]> {
    const discoveries: AgentDiscovery[] = [];
    
    // Get product ID from current URL
    const productId = aliexpressDomain.parseId(window.location.href);
    if (!productId) return discoveries;
    
    const agentId = aliexpressDomain.formatTrustId(productId);
    
    // Find key elements to inject trust scores
    
    // 1. Product title area
    const titleSelectors = [
      'h1.product-title-text',
      '.product-title h1',
      '[data-pl="product-title"]',
      '.product-main-title'
    ];
    
    for (const selector of titleSelectors) {
      const titleElement = document.querySelector(selector);
      if (titleElement && !this.injectedElements.has(titleElement)) {
        discoveries.push({
          agentId,
          element: titleElement,
          context: 'product-title'
        });
        break;
      }
    }
    
    // 2. Price area
    const priceSelectors = [
      '.product-price-value',
      '.snow-price_SnowPrice__mainM__18x8np',
      '[data-pl="product-price"]',
      '.product-price'
    ];
    
    for (const selector of priceSelectors) {
      const priceElement = document.querySelector(selector);
      if (priceElement && !this.injectedElements.has(priceElement)) {
        discoveries.push({
          agentId,
          element: priceElement,
          context: 'product-price'
        });
        break;
      }
    }
    
    // 3. Store info area
    const storeElement = document.querySelector('.store-info, .shop-name, [data-pl="store-info"]');
    if (storeElement && !this.injectedElements.has(storeElement)) {
      discoveries.push({
        agentId,
        element: storeElement,
        context: 'store-info'
      });
    }
    
    return discoveries;
  }
  
  injectTrustScores(scores: Map<string, TrustScore>): void {
    scores.forEach((score, agentId) => {
      const elements = document.querySelectorAll(`[data-repeer-agent="${agentId}"]`);
      elements.forEach(element => {
        this.createTrustBadge(element, agentId, score);
      });
    });
  }
  
  private createTrustBadge(element: Element, agentId: string, score: TrustScore): void {
    if (this.injectedElements.has(element)) return;
    this.injectedElements.add(element);
    
    const badge = document.createElement('div');
    badge.className = 'repeer-aliexpress-badge';
    badge.setAttribute('data-agent-id', agentId);
    
    const roi = score.expected_pv_roi;
    const roiClass = roi > 1.1 ? 'positive' : roi < 0.9 ? 'negative' : 'neutral';
    const roiPercentage = ((roi - 1) * 100).toFixed(1);
    
    // AliExpress-specific styling
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      margin: 8px 0;
      padding: 8px 12px;
      background: ${roiClass === 'positive' ? '#f0f9ff' : roiClass === 'negative' ? '#fef2f2' : '#f9fafb'};
      border: 1px solid ${roiClass === 'positive' ? '#0ea5e9' : roiClass === 'negative' ? '#ef4444' : '#9ca3af'};
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    
    badge.innerHTML = `
      <span style="font-weight: 600; color: ${roiClass === 'positive' ? '#0284c7' : roiClass === 'negative' ? '#dc2626' : '#6b7280'};">
        ⭐ Trust Score: ${roiPercentage}%
      </span>
      <span style="margin-left: 12px; color: #6b7280; font-size: 12px;">
        ${score.data_points} reviews | $${this.formatVolume(score.total_volume)} volume
      </span>
    `;
    
    // Insert based on context
    const context = element.getAttribute('data-repeer-context');
    if (context === 'product-title') {
      element.parentNode?.insertBefore(badge, element.nextSibling);
    } else {
      element.appendChild(badge);
    }
    
    // Hover effect
    badge.addEventListener('mouseenter', () => {
      badge.style.transform = 'scale(1.02)';
      badge.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    });
    
    badge.addEventListener('mouseleave', () => {
      badge.style.transform = 'scale(1)';
      badge.style.boxShadow = 'none';
    });
    
    // Click handler
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.createExperiencePrompt(agentId);
    });
  }
  
  async createExperiencePrompt(agentId: string): Promise<ExperienceData | null> {
    // Start tracking user interaction time
    this.startInteractionTracking(agentId);
    
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 999999;
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
      `;
      
      const productId = agentId.replace('aliexpress:', '');
      
      modal.innerHTML = `
        <h2 style="margin: 0 0 20px 0; color: #1f2937;">Record Product Experience</h2>
        <p style="margin: 0 0 20px 0; color: #6b7280;">
          Product: ${aliexpressDomain.displayName(productId)}
        </p>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #374151;">Order Value (USD):</label>
          <input type="number" id="repeer-investment" step="0.01" placeholder="25.99" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 16px;">
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #374151;">Actual Value Received:</label>
          <input type="number" id="repeer-return" step="0.01" placeholder="30.00" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 16px;">
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #6b7280;">Consider quality, durability, and satisfaction</p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #374151;">Delivery Time (days):</label>
          <input type="number" id="repeer-timeframe" value="30" min="1" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 16px;">
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #374151;">Review (optional):</label>
          <textarea id="repeer-notes" rows="3" placeholder="Product quality, shipping experience, seller communication..." style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; resize: vertical; font-size: 14px;"></textarea>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="repeer-cancel" style="padding: 10px 20px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; font-weight: 500;">Cancel</button>
          <button id="repeer-submit" style="padding: 10px 20px; border: none; background: #ff6900; color: white; border-radius: 6px; cursor: pointer; font-weight: 500;">Submit Review</button>
        </div>
      `;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
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
              source: 'aliexpress',
              productId: productId,
              productUrl: window.location.href
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
    });
  }
  
  private formatVolume(volume: number): string {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toFixed(0);
  }
  
  private startInteractionTracking(agentId: string): void {
    // Track how long user spends on product page
    const startTime = Date.now();
    const trackingKey = `repeer:tracking:${agentId}`;
    
    // Store interaction start time
    sessionStorage.setItem(trackingKey, JSON.stringify({
      startTime,
      pageViews: 1
    }));
    
    // Set up timer to prompt for review after certain time
    if (this.trackingTimer) clearTimeout(this.trackingTimer);
    
    this.trackingTimer = window.setTimeout(() => {
      this.promptForDelayedReview(agentId);
    }, 5 * 60 * 1000); // 5 minutes
  }
  
  private promptForDelayedReview(agentId: string): void {
    // Simple notification-style prompt
    const prompt = document.createElement('div');
    prompt.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 300px;
      z-index: 9999;
    `;
    
    prompt.innerHTML = `
      <p style="margin: 0 0 12px 0; font-weight: 500;">Share your experience?</p>
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #6b7280;">
        You've been viewing this product for a while. Would you like to record your thoughts?
      </p>
      <div style="display: flex; gap: 8px;">
        <button id="repeer-prompt-yes" style="padding: 6px 12px; background: #ff6900; color: white; border: none; border-radius: 4px; cursor: pointer;">Yes</button>
        <button id="repeer-prompt-no" style="padding: 6px 12px; background: #f3f4f6; color: #374151; border: none; border-radius: 4px; cursor: pointer;">Not now</button>
      </div>
    `;
    
    document.body.appendChild(prompt);
    
    prompt.querySelector('#repeer-prompt-yes')?.addEventListener('click', () => {
      this.createExperiencePrompt(agentId);
      prompt.remove();
    });
    
    prompt.querySelector('#repeer-prompt-no')?.addEventListener('click', () => {
      prompt.remove();
    });
    
    // Auto-remove after 10 seconds
    setTimeout(() => prompt.remove(), 10000);
  }
  
  // Lifecycle methods
  onPageLoad(): void {
    console.log('AliExpress adapter loaded');
    this.injectedElements.clear();
  }
  
  onPageChange(): void {
    // Clear injections when navigating to new product
    this.injectedElements.clear();
    if (this.trackingTimer) {
      clearTimeout(this.trackingTimer);
      this.trackingTimer = null;
    }
  }
  
  cleanup(): void {
    this.injectedElements.clear();
    if (this.trackingTimer) {
      clearTimeout(this.trackingTimer);
      this.trackingTimer = null;
    }
  }
}

// Export factory function
export default function createAliExpressAdapter(): WebsiteAdapter {
  return new AliExpressAdapter();
}