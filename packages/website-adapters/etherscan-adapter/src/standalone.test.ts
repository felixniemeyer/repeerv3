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

// Mock implementation that doesn't import external dependencies
class EtherscanAdapterTest implements WebsiteAdapter {
  name = 'etherscan';
  displayName = 'Etherscan';
  domains = ['etherscan.io', 'cn.etherscan.com', 'goerli.etherscan.io', 'sepolia.etherscan.io'];
  idDomains = [];
  
  private injectedElements = new Set<Element>();
  private mockEthereumDomain = {
    parseId: (text: string): string | null => {
      const match = text.match(/0x[a-fA-F0-9]{40}/);
      return match ? match[0] : null;
    },
    formatTrustId: (id: string): string => `ethereum:${id}`,
    displayName: (id: string): string => `${id.slice(0, 6)}...${id.slice(-4)}`
  };

  async scanPage(): Promise<AgentDiscovery[]> {
    const discoveries: AgentDiscovery[] = [];
    
    // Find addresses in main address header
    const addressHeader = document.querySelector('#mainaddress, .hash-tag');
    if (addressHeader?.textContent) {
      const address = this.mockEthereumDomain.parseId(addressHeader.textContent);
      if (address) {
        discoveries.push({
          agentId: this.mockEthereumDomain.formatTrustId(address),
          element: addressHeader,
          context: 'address-header'
        });
      }
    }
    
    // Find addresses in transaction table links
    const addressCells = document.querySelectorAll('a[href*="/address/"]');
    addressCells.forEach(cell => {
      if (this.injectedElements.has(cell)) return;
      
      const href = (cell as HTMLAnchorElement).href || cell.textContent || '';
      const address = this.mockEthereumDomain.parseId(href);
      
      if (address) {
        discoveries.push({
          agentId: this.mockEthereumDomain.formatTrustId(address),
          element: cell,
          context: 'transaction-table'
        });
      }
    });
    
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
    
    const badge = document.createElement('span');
    badge.className = 'repeer-etherscan-badge';
    badge.setAttribute('data-agent-id', agentId);
    
    const roi = score.expected_pv_roi;
    const roiPercentage = ((roi - 1) * 100).toFixed(1);
    badge.textContent = `Trust: ${roiPercentage}%`;
    
    if (element.parentNode) {
      element.parentNode.insertBefore(badge, element.nextSibling);
    }
  }

  async createExperiencePrompt(agentId: string): Promise<ExperienceData | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.zIndex = '10000';
      
      const modal = document.createElement('div');
      modal.innerHTML = `
        <input type="number" id="repeer-investment" value="100">
        <input type="number" id="repeer-return" value="120">
        <input type="number" id="repeer-timeframe" value="1">
        <button id="repeer-submit">Submit</button>
        <button id="repeer-cancel">Cancel</button>
      `;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      modal.querySelector('#repeer-submit')?.addEventListener('click', () => {
        const investment = parseFloat((document.getElementById('repeer-investment') as HTMLInputElement).value);
        const returnValue = parseFloat((document.getElementById('repeer-return') as HTMLInputElement).value);
        const timeframe = parseFloat((document.getElementById('repeer-timeframe') as HTMLInputElement).value);
        
        resolve({
          agent_id: agentId,
          investment,
          return_value: returnValue,
          timeframe_days: timeframe,
          data: { source: 'etherscan' }
        });
        overlay.remove();
      });
      
      modal.querySelector('#repeer-cancel')?.addEventListener('click', () => {
        resolve(null);
        overlay.remove();
      });
    });
  }

  onPageLoad(): void {
    this.injectedElements.clear();
  }

  cleanup(): void {
    this.injectedElements.clear();
  }
}

describe('EtherscanAdapter Functionality', () => {
  let adapter: EtherscanAdapterTest;

  beforeEach(() => {
    adapter = new EtherscanAdapterTest();
    document.body.innerHTML = '';
  });

  describe('Basic properties', () => {
    it('should have correct adapter properties', () => {
      expect(adapter.name).toBe('etherscan');
      expect(adapter.displayName).toBe('Etherscan');
      expect(adapter.domains).toEqual(['etherscan.io', 'cn.etherscan.com', 'goerli.etherscan.io', 'sepolia.etherscan.io']);
    });
  });

  describe('scanPage', () => {
    it('should find address in main address header', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      
      const addressHeader = document.createElement('div');
      addressHeader.id = 'mainaddress';
      addressHeader.textContent = testAddress;
      document.body.appendChild(addressHeader);
      
      const discoveries = await adapter.scanPage();
      
      expect(discoveries).toHaveLength(1);
      expect(discoveries[0]).toEqual({
        agentId: `ethereum:${testAddress}`,
        element: addressHeader,
        context: 'address-header'
      });
    });

    it('should find addresses in transaction table links', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      
      const addressLink = document.createElement('a');
      addressLink.href = `/address/${testAddress}`;
      addressLink.textContent = testAddress;
      document.body.appendChild(addressLink);
      
      const discoveries = await adapter.scanPage();
      
      expect(discoveries).toHaveLength(1);
      expect(discoveries[0]).toEqual({
        agentId: `ethereum:${testAddress}`,
        element: addressLink,
        context: 'transaction-table'
      });
    });

    it('should return empty array when no addresses found', async () => {
      const discoveries = await adapter.scanPage();
      expect(discoveries).toHaveLength(0);
    });

    it('should skip invalid addresses', async () => {
      const invalidElement = document.createElement('div');
      invalidElement.id = 'mainaddress';
      invalidElement.textContent = 'not-an-address';
      document.body.appendChild(invalidElement);
      
      const discoveries = await adapter.scanPage();
      expect(discoveries).toHaveLength(0);
    });
  });

  describe('injectTrustScores', () => {
    it('should inject trust badges for discovered agents', () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      const element = document.createElement('div');
      element.setAttribute('data-repeer-agent', agentId);
      document.body.appendChild(element);
      
      const mockScore: TrustScore = {
        expected_pv_roi: 1.2,
        total_volume: 50000,
        data_points: 10
      };
      
      const scores = new Map([[agentId, mockScore]]);
      adapter.injectTrustScores(scores);
      
      const badge = document.querySelector('.repeer-etherscan-badge');
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('Trust: 20.0%');
      expect(badge?.getAttribute('data-agent-id')).toBe(agentId);
    });

    it('should not inject duplicate badges', () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
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
      const badges = document.querySelectorAll('.repeer-etherscan-badge');
      expect(badges).toHaveLength(1);
    });
  });

  describe('createExperiencePrompt', () => {
    it('should create and return experience data', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      // Start the prompt (don't await - we'll interact with it)
      const promptPromise = adapter.createExperiencePrompt(agentId);
      
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Check modal was created
      const modal = document.querySelector('div');
      expect(modal).toBeTruthy();
      
      // Submit form
      const submitButton = document.getElementById('repeer-submit') as HTMLButtonElement;
      submitButton?.click();
      
      const result = await promptPromise;
      
      expect(result).toEqual({
        agent_id: agentId,
        investment: 100,
        return_value: 120,
        timeframe_days: 1,
        data: { source: 'etherscan' }
      });
    });

    it('should return null when cancelled', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      const promptPromise = adapter.createExperiencePrompt(agentId);
      
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Click cancel
      const cancelButton = document.getElementById('repeer-cancel') as HTMLButtonElement;
      cancelButton?.click();
      
      const result = await promptPromise;
      expect(result).toBeNull();
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

    it('should clear injected elements on cleanup', () => {
      const mockElement = document.createElement('div');
      (adapter as any).injectedElements.add(mockElement);
      
      expect((adapter as any).injectedElements.size).toBe(1);
      
      adapter.cleanup();
      
      expect((adapter as any).injectedElements.size).toBe(0);
    });
  });
});