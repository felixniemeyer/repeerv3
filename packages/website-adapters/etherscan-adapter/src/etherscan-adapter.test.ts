/**
 * @jest-environment jsdom
 */

// Mock the external dependencies
const mockEthereumDomain = {
  parseId: jest.fn(),
  validateId: jest.fn(),
  displayName: jest.fn(),
  formatTrustId: jest.fn(),
  name: 'ethereum'
};

// Mock the modules
jest.mock('@repeer/adapter-interface', () => ({}));
jest.mock('@repeer/ethereum-domain', () => ({
  ethereumDomain: mockEthereumDomain
}));

// Define interfaces locally for testing
interface TrustScore {
  expected_pv_roi: number;
  total_volume: number;
  data_points: number;
}

// Import after mocking
import { EtherscanAdapter } from './index';

describe('EtherscanAdapter', () => {
  let adapter: EtherscanAdapter;

  beforeEach(() => {
    adapter = new EtherscanAdapter();
    
    // Reset DOM
    document.body.innerHTML = '';
    
    // Setup default mock implementations
    mockEthereumDomain.parseId.mockImplementation((text: string) => {
      const match = text.match(/0x[a-fA-F0-9]{40}/);
      return match ? match[0] : null;
    });
    
    mockEthereumDomain.validateId.mockImplementation((id: string) => {
      return /^0x[a-fA-F0-9]{40}$/.test(id);
    });
    
    mockEthereumDomain.displayName.mockImplementation((id: string) => {
      return `${id.slice(0, 6)}...${id.slice(-4)}`;
    });
    
    mockEthereumDomain.formatTrustId.mockImplementation((id: string) => {
      return `ethereum:${id}`;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic properties', () => {
    it('should have correct adapter properties', () => {
      expect(adapter.name).toBe('etherscan');
      expect(adapter.displayName).toBe('Etherscan');
      expect(adapter.domains).toEqual(['etherscan.io', 'cn.etherscan.com', 'goerli.etherscan.io', 'sepolia.etherscan.io']);
      expect(adapter.idDomains).toEqual([mockEthereumDomain]);
    });
  });

  describe('scanPage', () => {
    it('should find address in main address header', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      
      // Create address header element
      const addressHeader = document.createElement('div');
      addressHeader.id = 'mainaddress';
      addressHeader.textContent = testAddress;
      document.body.appendChild(addressHeader);
      
      mockEthereumDomain.parseId.mockReturnValue(testAddress);
      mockEthereumDomain.formatTrustId.mockReturnValue(`ethereum:${testAddress}`);
      
      const discoveries = await adapter.scanPage();
      
      expect(discoveries).toHaveLength(1);
      expect(discoveries[0]).toEqual({
        agentId: `ethereum:${testAddress}`,
        element: addressHeader,
        context: 'address-header'
      });
      expect(mockEthereumDomain.parseId).toHaveBeenCalledWith(testAddress);
    });

    it('should find addresses in transaction table links', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      
      // Create transaction table with address link
      const addressLink = document.createElement('a');
      addressLink.href = `/address/${testAddress}`;
      addressLink.textContent = testAddress;
      document.body.appendChild(addressLink);
      
      mockEthereumDomain.parseId.mockReturnValue(testAddress);
      mockEthereumDomain.formatTrustId.mockReturnValue(`ethereum:${testAddress}`);
      
      const discoveries = await adapter.scanPage();
      
      expect(discoveries).toHaveLength(1);
      expect(discoveries[0]).toEqual({
        agentId: `ethereum:${testAddress}`,
        element: addressLink,
        context: 'transaction-table'
      });
    });

    it('should find addresses in token holder tables', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      
      // Create token holder row
      const holderRow = document.createElement('tr');
      holderRow.id = 'r_1';
      
      const addressLink = document.createElement('a');
      addressLink.href = `/address/${testAddress}`;
      addressLink.textContent = testAddress;
      holderRow.appendChild(addressLink);
      
      document.body.appendChild(holderRow);
      
      mockEthereumDomain.parseId.mockReturnValue(testAddress);
      mockEthereumDomain.formatTrustId.mockReturnValue(`ethereum:${testAddress}`);
      
      const discoveries = await adapter.scanPage();
      
      // Should find the address through both selectors
      expect(discoveries.length).toBeGreaterThanOrEqual(1);
      
      // Should have at least one token-holder context discovery
      const tokenHolderDiscovery = discoveries.find(d => d.context === 'token-holder');
      expect(tokenHolderDiscovery).toBeDefined();
      expect(tokenHolderDiscovery?.agentId).toBe(`ethereum:${testAddress}`);
      expect(tokenHolderDiscovery?.element).toBe(addressLink);
      expect(tokenHolderDiscovery?.context).toBe('token-holder');
    });

    it('should return empty array when no addresses found', async () => {
      const discoveries = await adapter.scanPage();
      expect(discoveries).toHaveLength(0);
    });

    it('should skip elements that return null from parseId', async () => {
      const invalidElement = document.createElement('div');
      invalidElement.id = 'mainaddress';
      invalidElement.textContent = 'not-an-address';
      document.body.appendChild(invalidElement);
      
      mockEthereumDomain.parseId.mockReturnValue(null);
      
      const discoveries = await adapter.scanPage();
      expect(discoveries).toHaveLength(0);
    });
  });

  describe('injectTrustScores', () => {
    it('should inject trust badges for discovered agents', () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      // Create element with agent data attribute
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
      
      // Check that badge was created
      const badge = document.querySelector('.repeer-etherscan-badge');
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toBe('Trust: 20.0%');
      expect(badge?.getAttribute('data-agent-id')).toBe(agentId);
    });

    it('should style badges based on ROI', () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      const element = document.createElement('div');
      element.setAttribute('data-repeer-agent', agentId);
      document.body.appendChild(element);
      
      // Test positive ROI
      const positiveScore: TrustScore = {
        expected_pv_roi: 1.5,
        total_volume: 10000,
        data_points: 5
      };
      
      adapter.injectTrustScores(new Map([[agentId, positiveScore]]));
      
      const positiveBadge = document.querySelector('.repeer-etherscan-badge') as HTMLElement;
      expect(positiveBadge?.style.backgroundColor).toBe('rgb(212, 237, 218)');
      expect(positiveBadge?.style.color).toBe('rgb(21, 87, 36)');
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
    it('should create experience modal', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      mockEthereumDomain.displayName.mockReturnValue('0x1234...7890');
      
      // Start the prompt (don't await - we'll interact with it)
      const promptPromise = adapter.createExperiencePrompt(agentId);
      
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Check modal was created
      const overlay = document.querySelector('div[style*="position: fixed"]');
      expect(overlay).toBeTruthy();
      
      // Check modal content
      const modal = overlay?.querySelector('div[style*="background: white"]');
      expect(modal).toBeTruthy();
      expect(modal?.innerHTML).toContain('Record Trust Experience');
      expect(modal?.innerHTML).toContain('0x1234...7890');
      
      // Click cancel to resolve promise
      const cancelButton = modal?.querySelector('#repeer-cancel') as HTMLButtonElement;
      cancelButton?.click();
      
      const result = await promptPromise;
      expect(result).toBeNull();
    });

    it('should return experience data when submitted', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      mockEthereumDomain.displayName.mockReturnValue('0x1234...7890');
      
      const promptPromise = adapter.createExperiencePrompt(agentId);
      
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Fill in form
      const investmentInput = document.getElementById('repeer-investment') as HTMLInputElement;
      const returnInput = document.getElementById('repeer-return') as HTMLInputElement;
      const timeframeInput = document.getElementById('repeer-timeframe') as HTMLInputElement;
      const notesInput = document.getElementById('repeer-notes') as HTMLTextAreaElement;
      
      investmentInput.value = '100';
      returnInput.value = '120';
      timeframeInput.value = '30';
      notesInput.value = 'Test experience';
      
      // Submit form
      const submitButton = document.getElementById('repeer-submit') as HTMLButtonElement;
      submitButton?.click();
      
      const result = await promptPromise;
      
      expect(result).toEqual({
        agent_id: agentId,
        investment: 100,
        return_value: 120,
        timeframe_days: 30,
        notes: 'Test experience',
        data: {
          source: 'etherscan',
          address: testAddress
        }
      });
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
      // Add some mock injected elements
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

  describe('Factory function', () => {
    it('should create EtherscanAdapter instance', () => {
      const createEtherscanAdapter = require('./index').default;
      const instance = createEtherscanAdapter();
      expect(instance).toBeInstanceOf(EtherscanAdapter);
    });
  });
});