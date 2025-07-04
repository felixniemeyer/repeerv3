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
jest.mock('@repeer/adapter-interface', () => ({
  calculateTrustColor: jest.fn((roi: number, volume: number) => {
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
  }),
  darkenColor: jest.fn((hex: string) => hex),
  formatVolume: jest.fn((volume: number) => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toFixed(0);
  })
}));
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
import { AdvancedEtherscanAdapter } from './advanced-etherscan-adapter';
import { calculateTrustColor, darkenColor, formatVolume } from '@repeer/adapter-interface';

describe('AdvancedEtherscanAdapter', () => {
  let adapter: AdvancedEtherscanAdapter;

  beforeEach(() => {
    adapter = new AdvancedEtherscanAdapter();
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
    adapter.cleanup();
  });

  describe('Basic properties', () => {
    it('should have correct adapter properties', () => {
      expect(adapter.name).toBe('etherscan-advanced');
      expect(adapter.displayName).toBe('Etherscan Advanced');
      expect(adapter.domains).toEqual(['etherscan.io', 'cn.etherscan.com', 'goerli.etherscan.io', 'sepolia.etherscan.io']);
      expect(adapter.idDomains).toEqual([mockEthereumDomain]);
    });
  });

  // Color calculation tests are in @repeer/adapter-interface package

  describe('scanPage', () => {
    it('should find addresses with data-highlight-target attributes', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      
      // Create element with data-highlight-target
      const addressSpan = document.createElement('span');
      addressSpan.setAttribute('data-highlight-target', testAddress);
      addressSpan.textContent = '0x1234...7890';
      document.body.appendChild(addressSpan);
      
      mockEthereumDomain.parseId.mockReturnValue(testAddress);
      mockEthereumDomain.formatTrustId.mockReturnValue(`ethereum:${testAddress}`);
      
      const discoveries = await adapter.scanPage();
      
      expect(discoveries).toHaveLength(1);
      expect(discoveries[0]).toEqual({
        agentId: `ethereum:${testAddress}`,
        element: addressSpan,
        context: 'general'
      });
    });

    it('should find addresses in transaction table links', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      
      // Create address link
      const addressLink = document.createElement('a');
      addressLink.href = `/address/${testAddress}`;
      addressLink.textContent = '0x1234...7890';
      document.body.appendChild(addressLink);
      
      mockEthereumDomain.parseId.mockReturnValue(testAddress);
      mockEthereumDomain.formatTrustId.mockReturnValue(`ethereum:${testAddress}`);
      
      const discoveries = await adapter.scanPage();
      
      expect(discoveries).toHaveLength(1);
      expect(discoveries[0].agentId).toBe(`ethereum:${testAddress}`);
    });

    it('should setup hover listeners for discovered addresses', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      
      const addressSpan = document.createElement('span');
      addressSpan.setAttribute('data-highlight-target', testAddress);
      document.body.appendChild(addressSpan);
      
      mockEthereumDomain.parseId.mockReturnValue(testAddress);
      mockEthereumDomain.formatTrustId.mockReturnValue(`ethereum:${testAddress}`);
      
      // Spy on addEventListener
      const addEventListenerSpy = jest.spyOn(addressSpan, 'addEventListener');
      
      await adapter.scanPage();
      
      // Should have added mouseenter and mouseleave listeners
      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseenter', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
      
      addEventListenerSpy.mockRestore();
    });
  });

  describe('Trust score injection and hover', () => {
    it('should store trust scores for hover display', () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      const mockScore: TrustScore = {
        expected_pv_roi: 1.5,
        total_volume: 10000,
        data_points: 5
      };
      
      const scores = new Map([[agentId, mockScore]]);
      adapter.injectTrustScores(scores);
      
      // Check that score is stored (via accessing private property)
      const trustScores = (adapter as any).trustScores;
      expect(trustScores.get(agentId)).toEqual(mockScore);
    });

    it('should show trust box on hover with correct color', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      // Setup element
      const addressSpan = document.createElement('span');
      addressSpan.setAttribute('data-highlight-target', testAddress);
      document.body.appendChild(addressSpan);
      
      mockEthereumDomain.parseId.mockReturnValue(testAddress);
      mockEthereumDomain.formatTrustId.mockReturnValue(`ethereum:${testAddress}`);
      mockEthereumDomain.displayName.mockReturnValue('0x1234...7890');
      
      // Scan page to setup listeners
      await adapter.scanPage();
      
      // Inject trust scores
      const mockScore: TrustScore = {
        expected_pv_roi: 1.5,
        total_volume: 5000,
        data_points: 3
      };
      
      const scores = new Map([[agentId, mockScore]]);
      adapter.injectTrustScores(scores);
      
      // Trigger hover directly (simulating the timeout)
      const showTrustBox = (adapter as any).showTrustBox.bind(adapter);
      showTrustBox(addressSpan, agentId, mockScore);
      
      // Check that trust box was created
      const trustBox = document.querySelector('.repeer-trust-box');
      expect(trustBox).toBeTruthy();
      expect(trustBox?.innerHTML).toContain('0x1234...7890');
      expect(trustBox?.innerHTML).toContain('+50.0%'); // (1.5 - 1) * 100
      expect(trustBox?.innerHTML).toContain('$5.0K'); // Formatted volume
      expect(trustBox?.innerHTML).toContain('3'); // Data points
      
      // Check that trust box has a background color set
      const bgColor = (trustBox as HTMLElement)?.style.backgroundColor;
      expect(bgColor).toBeTruthy(); // Should have some background color
    });
  });

  describe('Experience prompt', () => {
    it('should open agent details page when chrome extension API is available', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      // Mock chrome runtime API
      const mockSendMessage = jest.fn().mockResolvedValue({});
      (global as any).chrome = {
        runtime: {
          sendMessage: mockSendMessage
        }
      };
      (global as any).window.chrome = (global as any).chrome;
      
      const result = await adapter.createExperiencePrompt(agentId);
      
      // Should open agent details page via message API
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'SHOW_AGENT_DETAILS',
        idDomain: 'ethereum',
        agentId: testAddress
      });
      
      // Should return null since we're not creating a modal anymore
      expect(result).toBeNull();
      
      // Cleanup
      delete (global as any).chrome;
      delete (global as any).window.chrome;
    });

    it('should show fallback message when chrome extension API is not available', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      // Mock window.alert to prevent jsdom error
      const mockAlert = jest.fn();
      global.alert = mockAlert;
      
      // Ensure chrome API is not available
      delete (global as any).chrome;
      delete (global as any).window.chrome;
      
      const result = await adapter.createExperiencePrompt(agentId);
      
      // Should show alert about missing extension
      expect(mockAlert).toHaveBeenCalledWith('Please install the Repeer browser extension to record experiences.');
      
      // Should return null since no modal is created
      expect(result).toBeNull();
      
      // Cleanup
      delete (global as any).alert;
    });
  });

  describe('Context detection', () => {
    it('should detect different element contexts', () => {
      const getElementContext = (adapter as any).getElementContext.bind(adapter);
      
      // Test address header context
      const headerElement = document.createElement('div');
      headerElement.id = 'mainaddress';
      expect(getElementContext(headerElement)).toBe('address-header');
      
      // Test token holder context
      const tokenRow = document.createElement('tr');
      tokenRow.id = 'r_1';
      const tokenElement = document.createElement('span');
      tokenRow.appendChild(tokenElement);
      expect(getElementContext(tokenElement)).toBe('token-holder');
      
      // Test general context
      const generalElement = document.createElement('span');
      expect(getElementContext(generalElement)).toBe('general');
    });
  });

  describe('Utility methods', () => {
    // Utility function tests are in @repeer/adapter-interface package
  });

  describe('Lifecycle methods', () => {
    it('should clean up properly', () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const agentId = `ethereum:${testAddress}`;
      
      // Add some data to clean up
      (adapter as any).trustScores.set(agentId, { expected_pv_roi: 1.0, total_volume: 1000, data_points: 1 });
      (adapter as any).injectedElements.add(document.createElement('div'));
      
      expect((adapter as any).trustScores.size).toBe(1);
      expect((adapter as any).injectedElements.size).toBe(1);
      
      adapter.cleanup();
      
      expect((adapter as any).trustScores.size).toBe(0);
      expect((adapter as any).injectedElements.size).toBe(0);
    });

    it('should handle page load and page change', () => {
      const cleanupSpy = jest.spyOn(adapter, 'cleanup');
      
      adapter.onPageLoad();
      expect(cleanupSpy).toHaveBeenCalled();
      
      cleanupSpy.mockClear();
      
      adapter.onPageChange();
      expect(cleanupSpy).toHaveBeenCalled();
      
      cleanupSpy.mockRestore();
    });
  });
});