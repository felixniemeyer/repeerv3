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

  describe('Color calculation', () => {
    it('should calculate correct colors for trust scores', () => {
      // Use shared utility function
      
      // Test ROI = 0, Volume = 1000
      // x = 255 / (1 + 0.001 * 1000) = 255 / 2 = 127.5 ≈ 128
      // RGB(255, 128, 255) for ROI = 0
      let color = calculateTrustColor(0, 1000);
      expect(color).toBe('#ff80ff');
      
      // Test ROI = 2, Volume = 1000  
      // x = 128, interpolate to RGB(128, 255, 255)
      color = calculateTrustColor(2, 1000);
      expect(color).toBe('#80ffff');
      
      // Test ROI = 1, Volume = 1000
      // Should be halfway between magenta and cyan
      color = calculateTrustColor(1, 1000);
      expect(color).toBe('#c0c0ff');
      
      // Test high volume case
      // ROI = 0, Volume = 100000
      // x = 255 / (1 + 100) = 255 / 101 ≈ 2.52 ≈ 3
      color = calculateTrustColor(0, 100000);
      expect(color).toBe('#ff03ff');
      
      // Test low volume case  
      // ROI = 0, Volume = 0
      // x = 255 / (1 + 0) = 255
      color = calculateTrustColor(0, 0);
      expect(color).toBe('#ffffff');
    });
    
    it('should clamp ROI values to 0-2 range', () => {
      // Use shared utility function
      
      // Test negative ROI (should clamp to 0)
      let color = calculateTrustColor(-1, 1000);
      expect(color).toBe('#ff80ff'); // Same as ROI = 0
      
      // Test ROI > 2 (should clamp to 2)
      color = calculateTrustColor(5, 1000);
      expect(color).toBe('#80ffff'); // Same as ROI = 2
    });
  });

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
      
      // Check background color calculation
      // ROI 1.5, Volume 5000: x = 255 / (1 + 5) = 42.5 ≈ 43
      // Interpolation: t = 1.5/2 = 0.75
      // Red: 255 * 0.25 + 43 * 0.75 = 63.75 + 32.25 = 96 (rounded)
      // Green: 43 * 0.25 + 255 * 0.75 = 10.75 + 191.25 = 202 (rounded)
      // Blue: 255
      // RGB: 96, 202, 255
      const bgColor = (trustBox as HTMLElement)?.style.backgroundColor;
      expect(bgColor).toBe('rgb(96, 202, 255)'); // Should be the calculated RGB color
    });
  });

  describe('Experience prompt', () => {
    it('should create experience prompt modal', async () => {
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
      expect(modal?.innerHTML).toContain('Record Experience');
      expect(modal?.innerHTML).toContain('0x1234...7890');
      
      // Click cancel to resolve promise
      const cancelButton = modal?.querySelector('#repeer-cancel') as HTMLButtonElement;
      cancelButton?.click();
      
      const result = await promptPromise;
      expect(result).toBeNull();
    });

    it('should return experience data when form is submitted', async () => {
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
      returnInput.value = '150';
      timeframeInput.value = '30';
      notesInput.value = 'Great interaction';
      
      // Submit form
      const submitButton = document.getElementById('repeer-submit') as HTMLButtonElement;
      submitButton?.click();
      
      const result = await promptPromise;
      
      expect(result).toEqual({
        agent_id: agentId,
        investment: 100,
        return_value: 150,
        timeframe_days: 30,
        notes: 'Great interaction',
        data: {
          source: 'etherscan-advanced',
          address: testAddress,
          url: window.location.href
        }
      });
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
    it('should format volume correctly', () => {
      // Use shared utility function
      
      expect(formatVolume(500)).toBe('500');
      expect(formatVolume(1500)).toBe('1.5K');
      expect(formatVolume(1500000)).toBe('1.5M');
      expect(formatVolume(2300000)).toBe('2.3M');
    });

    it('should darken colors correctly', () => {
      // Use shared utility function
      
      // Test darkening white
      const darkenedWhite = darkenColor('#ffffff', 20);
      expect(darkenedWhite).toBe('#cccccc'); // Should be darker
      
      // Test darkening with specific color
      const darkenedColor = darkenColor('#ff80ff', 10);
      expect(darkenedColor.length).toBe(7); // Should be valid hex color
      expect(darkenedColor.startsWith('#')).toBe(true);
    });
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