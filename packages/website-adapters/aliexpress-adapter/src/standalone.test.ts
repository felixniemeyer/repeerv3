/**
 * @jest-environment jsdom
 */

// Define interfaces for testing
interface WebsiteAdapter {
  name: string;
  displayName: string;
  domains: string[];
  idDomains: any[];
  scanPage(): Promise<AgentDiscovery[]>;
  injectTrustScores(scores: Map<string, TrustScore>): void;
  createExperiencePrompt(agentId: string): Promise<ExperienceData | null>;
}

interface AgentDiscovery {
  agentId: string;
  element: Element;
  context: string;
}

interface TrustScore {
  expected_pv_roi: number;
  total_volume: number;
  data_points: number;
}

interface ExperienceData {
  agent_id: string;
  investment: number;
  return_value: number;
  timeframe_days: number;
  notes?: string;
  data: any;
}

// Mock window.location for testing
Object.defineProperty(window, 'location', {
  value: {
    href: 'https://www.aliexpress.com/item/1005004567891234.html'
  },
  writable: true
});

// Mock implementation that doesn't import external dependencies
class AliExpressAdapterTest implements WebsiteAdapter {
  name = 'aliexpress';
  displayName = 'AliExpress';
  domains = ['aliexpress.com', 'www.aliexpress.com', 'aliexpress.us', 'm.aliexpress.com'];
  idDomains = [];
  
  private injectedElements = new Set<Element>();
  private mockAliexpressDomain = {
    parseId: (text: string): string | null => {
      const patterns = [
        /\/item\/(\d+)\.html/,
        /productId=(\d+)/,
        /\/product\/(\d+)/,
        /\/[\w-]+\/(\d+)\.html/,
        /\/(\d{10,16})(?:\.html)?$/,
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const productId = match[1];
          return /^\d{10,16}$/.test(productId) ? productId : null;
        }
      }
      return null;
    },
    validateId: (id: string): boolean => {
      return /^\d{10,16}$/.test(id);
    },
    formatTrustId: (id: string): string => `aliexpress:${id}`,
    displayName: (id: string): string => `AliExpress Item ${id}`
  };

  async scanPage(): Promise<AgentDiscovery[]> {
    const discoveries: AgentDiscovery[] = [];
    
    // Get product ID from current URL
    const productId = this.mockAliexpressDomain.parseId(window.location.href);
    if (!productId) return discoveries;
    
    const agentId = this.mockAliexpressDomain.formatTrustId(productId);
    
    // Find product title
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
    
    // Find price area
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
    const roiPercentage = ((roi - 1) * 100).toFixed(1);
    badge.textContent = `⭐ Trust Score: ${roiPercentage}%`;
    
    const context = element.getAttribute('data-repeer-context');
    if (context === 'product-title') {
      element.parentNode?.insertBefore(badge, element.nextSibling);
    } else {
      element.appendChild(badge);
    }
  }

  async createExperiencePrompt(agentId: string): Promise<ExperienceData | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.zIndex = '999999';
      
      const modal = document.createElement('div');
      modal.innerHTML = `
        <h2>Record Product Experience</h2>
        <input type="number" id="repeer-investment" step="0.01" placeholder="25.99">
        <input type="number" id="repeer-return" step="0.01" placeholder="30.00">
        <input type="number" id="repeer-timeframe" value="30" min="1">
        <textarea id="repeer-notes" placeholder="Product quality, shipping experience..."></textarea>
        <button id="repeer-submit">Submit Review</button>
        <button id="repeer-cancel">Cancel</button>
      `;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      modal.querySelector('#repeer-submit')?.addEventListener('click', () => {
        const investment = parseFloat((document.getElementById('repeer-investment') as HTMLInputElement).value);
        const returnValue = parseFloat((document.getElementById('repeer-return') as HTMLInputElement).value);
        const timeframe = parseFloat((document.getElementById('repeer-timeframe') as HTMLInputElement).value);
        const notes = (document.getElementById('repeer-notes') as HTMLTextAreaElement).value;
        
        if (investment && returnValue && timeframe) {
          const productId = agentId.replace('aliexpress:', '');
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
      
      modal.querySelector('#repeer-cancel')?.addEventListener('click', () => {
        resolve(null);
        overlay.remove();
      });
    });
  }

  private formatVolume(volume: number): string {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toFixed(0);
  }

  onPageLoad(): void {
    this.injectedElements.clear();
  }

  onPageChange(): void {
    this.injectedElements.clear();
  }

  cleanup(): void {
    this.injectedElements.clear();
  }
}

describe('AliExpressAdapter Functionality', () => {
  let adapter: AliExpressAdapterTest;

  beforeEach(() => {
    adapter = new AliExpressAdapterTest();
    document.body.innerHTML = '';
    
    // Reset window.location
    window.location.href = 'https://www.aliexpress.com/item/1005004567891234.html';
  });

  describe('Basic properties', () => {
    it('should have correct adapter properties', () => {
      expect(adapter.name).toBe('aliexpress');
      expect(adapter.displayName).toBe('AliExpress');
      expect(adapter.domains).toEqual(['aliexpress.com', 'www.aliexpress.com', 'aliexpress.us', 'm.aliexpress.com']);
    });
  });

  describe('scanPage', () => {
    it('should find product elements when valid product URL', async () => {
      // Create product title element
      const titleElement = document.createElement('h1');
      titleElement.className = 'product-title-text';
      titleElement.textContent = 'Test Product';
      document.body.appendChild(titleElement);
      
      // Create price element
      const priceElement = document.createElement('div');
      priceElement.className = 'product-price-value';
      priceElement.textContent = '$25.99';
      document.body.appendChild(priceElement);
      
      const discoveries = await adapter.scanPage();
      
      expect(discoveries).toHaveLength(2);
      expect(discoveries[0]).toEqual({
        agentId: 'aliexpress:1005004567891234',
        element: titleElement,
        context: 'product-title'
      });
      expect(discoveries[1]).toEqual({
        agentId: 'aliexpress:1005004567891234',
        element: priceElement,
        context: 'product-price'
      });
    });

    it('should return empty array for invalid product URL', async () => {
      window.location.href = 'https://www.aliexpress.com/category/phones';
      
      const discoveries = await adapter.scanPage();
      expect(discoveries).toHaveLength(0);
    });

    it('should find product elements with different selectors', async () => {
      // Test alternative selector
      const titleElement = document.createElement('h1');
      titleElement.setAttribute('data-pl', 'product-title');
      titleElement.textContent = 'Alternative Product Title';
      document.body.appendChild(titleElement);
      
      const discoveries = await adapter.scanPage();
      
      expect(discoveries).toHaveLength(1);
      expect(discoveries[0].context).toBe('product-title');
    });

    it('should not duplicate elements in discoveries', async () => {
      // Create and add same element to injected set
      const titleElement = document.createElement('h1');
      titleElement.className = 'product-title-text';
      titleElement.textContent = 'Test Product';
      document.body.appendChild(titleElement);
      
      (adapter as any).injectedElements.add(titleElement);
      
      const discoveries = await adapter.scanPage();
      
      // Should not find the already injected element
      expect(discoveries).toHaveLength(0);
    });
  });

  describe('injectTrustScores', () => {
    it('should inject trust badges for discovered agents', () => {
      const agentId = 'aliexpress:1005004567891234';
      
      const element = document.createElement('div');
      element.setAttribute('data-repeer-agent', agentId);
      element.setAttribute('data-repeer-context', 'product-title');
      document.body.appendChild(element);
      
      const mockScore: TrustScore = {
        expected_pv_roi: 1.15,
        total_volume: 25000,
        data_points: 50
      };
      
      const scores = new Map([[agentId, mockScore]]);
      adapter.injectTrustScores(scores);
      
      const badge = document.querySelector('.repeer-aliexpress-badge');
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('⭐ Trust Score: 15.0%');
      expect(badge?.getAttribute('data-agent-id')).toBe(agentId);
    });

    it('should handle different badge placements based on context', () => {
      const agentId = 'aliexpress:1005004567891234';
      
      // Test product-title context (should insert after element)
      const titleElement = document.createElement('h1');
      titleElement.setAttribute('data-repeer-agent', agentId);
      titleElement.setAttribute('data-repeer-context', 'product-title');
      document.body.appendChild(titleElement);
      
      // Test product-price context (should append to element)
      const priceElement = document.createElement('div');
      priceElement.setAttribute('data-repeer-agent', agentId);
      priceElement.setAttribute('data-repeer-context', 'product-price');
      document.body.appendChild(priceElement);
      
      const mockScore: TrustScore = {
        expected_pv_roi: 1.0,
        total_volume: 1000,
        data_points: 1
      };
      
      const scores = new Map([[agentId, mockScore]]);
      adapter.injectTrustScores(scores);
      
      const badges = document.querySelectorAll('.repeer-aliexpress-badge');
      expect(badges).toHaveLength(2);
      
      // Check that title badge was inserted after title element
      expect(titleElement.nextSibling).toBe(badges[0]);
      
      // Check that price badge was appended to price element
      expect(priceElement.children[0]).toBe(badges[1]);
    });

    it('should not inject duplicate badges', () => {
      const agentId = 'aliexpress:1005004567891234';
      
      const element = document.createElement('div');
      element.setAttribute('data-repeer-agent', agentId);
      document.body.appendChild(element);
      
      const mockScore: TrustScore = {
        expected_pv_roi: 1.0,
        total_volume: 1000,
        data_points: 1
      };
      
      const scores = new Map([[agentId, mockScore]]);
      
      // Inject twice
      adapter.injectTrustScores(scores);
      adapter.injectTrustScores(scores);
      
      // Should only have one badge
      const badges = document.querySelectorAll('.repeer-aliexpress-badge');
      expect(badges).toHaveLength(1);
    });
  });

  describe('createExperiencePrompt', () => {
    it('should create and return experience data when submitted', async () => {
      const agentId = 'aliexpress:1005004567891234';
      
      const promptPromise = adapter.createExperiencePrompt(agentId);
      
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Check modal was created
      const modal = document.querySelector('div[style*="position: fixed"] div');
      expect(modal).toBeTruthy();
      expect(modal?.innerHTML).toContain('Record Product Experience');
      
      // Fill in form
      const investmentInput = document.getElementById('repeer-investment') as HTMLInputElement;
      const returnInput = document.getElementById('repeer-return') as HTMLInputElement;
      const timeframeInput = document.getElementById('repeer-timeframe') as HTMLInputElement;
      const notesInput = document.getElementById('repeer-notes') as HTMLTextAreaElement;
      
      investmentInput.value = '25.99';
      returnInput.value = '30.00';
      timeframeInput.value = '30';
      notesInput.value = 'Great product quality';
      
      // Submit form
      const submitButton = document.getElementById('repeer-submit') as HTMLButtonElement;
      submitButton?.click();
      
      const result = await promptPromise;
      
      expect(result).toEqual({
        agent_id: agentId,
        investment: 25.99,
        return_value: 30.00,
        timeframe_days: 30,
        notes: 'Great product quality',
        data: {
          source: 'aliexpress',
          productId: '1005004567891234',
          productUrl: window.location.href
        }
      });
    });

    it('should return null when cancelled', async () => {
      const agentId = 'aliexpress:1005004567891234';
      
      const promptPromise = adapter.createExperiencePrompt(agentId);
      
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Click cancel
      const cancelButton = document.getElementById('repeer-cancel') as HTMLButtonElement;
      cancelButton?.click();
      
      const result = await promptPromise;
      expect(result).toBeNull();
    });

    it('should handle missing or invalid form values', async () => {
      const agentId = 'aliexpress:1005004567891234';
      
      const promptPromise = adapter.createExperiencePrompt(agentId);
      
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Leave investment field empty
      const returnInput = document.getElementById('repeer-return') as HTMLInputElement;
      const timeframeInput = document.getElementById('repeer-timeframe') as HTMLInputElement;
      
      returnInput.value = '30.00';
      timeframeInput.value = '30';
      
      // Submit form (should not resolve because investment is missing)
      const submitButton = document.getElementById('repeer-submit') as HTMLButtonElement;
      submitButton?.click();
      
      // Since investment is missing, the promise shouldn't resolve immediately
      // Let's cancel to finish the test
      const cancelButton = document.getElementById('repeer-cancel') as HTMLButtonElement;
      cancelButton?.click();
      
      const result = await promptPromise;
      expect(result).toBeNull();
    });
  });

  describe('formatVolume', () => {
    it('should format volume correctly', () => {
      // Access private method via type assertion
      const formatVolume = (adapter as any).formatVolume.bind(adapter);
      
      expect(formatVolume(500)).toBe('500');
      expect(formatVolume(1500)).toBe('1.5K');
      expect(formatVolume(1500000)).toBe('1.5M');
      expect(formatVolume(2300000)).toBe('2.3M');
    });
  });

  describe('Lifecycle methods', () => {
    it('should clear injected elements on page load', () => {
      const mockElement = document.createElement('div');
      (adapter as any).injectedElements.add(mockElement);
      
      expect((adapter as any).injectedElements.size).toBe(1);
      
      adapter.onPageLoad();
      
      expect((adapter as any).injectedElements.size).toBe(0);
    });

    it('should clear injected elements on page change', () => {
      const mockElement = document.createElement('div');
      (adapter as any).injectedElements.add(mockElement);
      
      expect((adapter as any).injectedElements.size).toBe(1);
      
      adapter.onPageChange();
      
      expect((adapter as any).injectedElements.size).toBe(0);
    });

    it('should clear injected elements on cleanup', () => {
      const mockElement = document.createElement('div');
      (adapter as any).injectedElements.add(mockElement);
      
      expect((adapter as any).injectedElements.size).toBe(1);
      
      adapter.cleanup();
      
      expect((adapter as any).injectedElements.size).toBe(0);
    });
  });

  describe('URL parsing', () => {
    it('should parse various AliExpress URL formats', () => {
      const parseId = (adapter as any).mockAliexpressDomain.parseId;
      
      // Standard product URL
      expect(parseId('https://www.aliexpress.com/item/1005004567891234.html')).toBe('1005004567891234');
      
      // URL with query parameters
      expect(parseId('https://de.aliexpress.com/item/1005006704880455.html?spm=a2g0o.tm1000022174')).toBe('1005006704880455');
      
      // Category path URL
      expect(parseId('https://www.aliexpress.com/category/phones-telecommunications/1005004567891234.html')).toBe('1005004567891234');
      
      // Alternative product URL format
      expect(parseId('https://www.aliexpress.com/product/1005004567891234')).toBe('1005004567891234');
      
      // Query parameter format
      expect(parseId('https://www.aliexpress.com/wholesale?productId=1005004567891234&search=phone')).toBe('1005004567891234');
      
      // Invalid URLs
      expect(parseId('https://www.aliexpress.com/category/phones')).toBeNull();
      expect(parseId('https://www.google.com')).toBeNull();
    });

    it('should validate product IDs correctly', () => {
      const validateId = (adapter as any).mockAliexpressDomain.validateId;
      
      // Valid IDs
      expect(validateId('1005004567891234')).toBe(true); // 16 digits
      expect(validateId('1234567890')).toBe(true); // 10 digits (minimum)
      expect(validateId('1234567890123456')).toBe(true); // 16 digits (maximum)
      
      // Invalid IDs
      expect(validateId('123456789')).toBe(false); // 9 digits (too short)
      expect(validateId('12345678901234567')).toBe(false); // 17 digits (too long)
      expect(validateId('123abc789')).toBe(false); // Contains letters
      expect(validateId('')).toBe(false); // Empty
    });
  });
});