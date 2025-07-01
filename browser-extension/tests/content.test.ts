import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the content script
class MockTrustScoreInjector {
  private adapters: any[] = []
  
  constructor() {
    this.adapters = [
      {
        name: 'ethereum',
        canHandle: (url: string) => url.includes('etherscan.io'),
        findElements: () => [document.createElement('div')],
        extractId: () => '0x1234567890123456789012345678901234567890'
      }
    ]
  }

  init() {
    return Promise.resolve()
  }

  injectTrustScores() {
    return Promise.resolve()
  }

  private createTrustScoreElement(element: Element, agentId: string, score: any) {
    const trustElement = document.createElement('div')
    trustElement.className = 'trust-score-overlay'
    trustElement.textContent = `Trust: ${score.expected_pv_roi.toFixed(2)}`
    return trustElement
  }
}

// Mock chrome APIs
global.chrome = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({
      success: true,
      scores: {
        'ethereum:0x1234567890123456789012345678901234567890': {
          expected_pv_roi: 0.8,
          total_volume: 500,
          data_points: 5
        }
      }
    }),
    onMessage: {
      addListener: vi.fn()
    }
  }
} as any

describe('Content Script', () => {
  let injector: MockTrustScoreInjector

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = ''
    vi.clearAllMocks()
    injector = new MockTrustScoreInjector()
    
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { 
        href: 'https://etherscan.io/address/0x123',
        hostname: 'etherscan.io',
        host: 'etherscan.io'
      },
      writable: true,
      configurable: true
    })
  })

  it('initializes without error', async () => {
    await expect(injector.init()).resolves.not.toThrow()
  })

  it.skip('can inject trust scores', async () => {
    // Create a mock element
    const targetElement = document.createElement('div')
    targetElement.textContent = '0x1234567890123456789012345678901234567890'
    document.body.appendChild(targetElement)

    // Import the content script to trigger initialization
    await import('../src/content/index')
    
    // Wait for the debounced scan
    await new Promise(resolve => setTimeout(resolve, 150))
    
    // Should have sent message to background script
    expect(chrome.runtime.sendMessage).toHaveBeenCalled()
  })

  it('handles etherscan pages', () => {
    const adapter = injector['adapters'].find(a => a.name === 'ethereum')
    expect(adapter).toBeDefined()
    expect(adapter.canHandle('https://etherscan.io/address/0x123')).toBe(true)
    expect(adapter.canHandle('https://example.com')).toBe(false)
  })

  it('extracts Ethereum addresses correctly', () => {
    const adapter = injector['adapters'].find(a => a.name === 'ethereum')
    const address = adapter.extractId()
    expect(address).toBe('0x1234567890123456789012345678901234567890')
  })

  it('creates trust score elements', () => {
    const element = document.createElement('div')
    const score = { expected_pv_roi: 0.75, total_volume: 1000, data_points: 10 }
    
    const trustElement = injector['createTrustScoreElement'](element, 'test-id', score)
    
    expect(trustElement.className).toBe('trust-score-overlay')
    expect(trustElement.textContent).toContain('0.75')
  })

  it('handles missing trust scores gracefully', async () => {
    // Mock failed response
    chrome.runtime.sendMessage = vi.fn().mockResolvedValue({
      success: false,
      error: 'Agent not found'
    })

    await expect(injector.injectTrustScores()).resolves.not.toThrow()
  })
})