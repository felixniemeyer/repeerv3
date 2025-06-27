import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../src/popup/App.vue'

// Mock the trust client
vi.mock('trust-client', () => ({
  TrustClient: vi.fn().mockImplementation(() => ({
    queryTrust: vi.fn().mockResolvedValue({
      expected_pv_roi: 0.8,
      total_volume: 500,
      data_points: 5
    }),
    getPeers: vi.fn().mockResolvedValue([]),
    addPeer: vi.fn().mockResolvedValue({}),
    health: vi.fn().mockResolvedValue(true)
  })),
  defaultRegistry: {
    parseUrl: vi.fn().mockReturnValue({
      trustId: 'test-id',
      platform: 'ethereum'
    })
  }
}))

// Mock chrome APIs
global.chrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({
        'repeer-settings': {
          nodeUrl: 'http://localhost:8080',
          maxDepth: 3,
          forgetRate: 0.1
        }
      }),
      set: vi.fn().mockResolvedValue({}),
    }
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{
      url: 'https://etherscan.io/address/0x1234567890123456789012345678901234567890'
    }])
  }
} as any

describe('Popup App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    const wrapper = mount(App)
    expect(wrapper.exists()).toBe(true)
  })

  it('displays main tabs', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Search')
    expect(wrapper.text()).toContain('Peers')
    expect(wrapper.text()).toContain('Settings')
  })

  it('initializes with default settings', async () => {
    const wrapper = mount(App)
    await wrapper.vm.$nextTick()
    
    // Settings should be loaded from chrome storage
    expect(chrome.storage.local.get).toHaveBeenCalledWith('repeer-settings')
  })

  it('handles search query input', async () => {
    const wrapper = mount(App)
    await wrapper.vm.$nextTick()
    
    const searchInput = wrapper.find('input[placeholder*="search"]')
    expect(searchInput.exists()).toBe(true)
    
    await searchInput.setValue('0x1234567890123456789012345678901234567890')
    expect(searchInput.element.value).toBe('0x1234567890123456789012345678901234567890')
  })

  it('displays trust score when search is performed', async () => {
    const wrapper = mount(App)
    await wrapper.vm.$nextTick()
    
    // Find search input and button
    const searchInput = wrapper.find('input[placeholder*="search"]')
    const searchButton = wrapper.find('button')
    
    await searchInput.setValue('test-address')
    await searchButton.trigger('click')
    await wrapper.vm.$nextTick()
    
    // Should display trust score
    expect(wrapper.text()).toContain('Trust Score')
  })

  it('updates settings when changed', async () => {
    const wrapper = mount(App)
    await wrapper.vm.$nextTick()
    
    // Switch to settings tab
    const settingsTab = wrapper.findAll('button').find(btn => 
      btn.text().includes('Settings')
    )
    
    if (settingsTab) {
      await settingsTab.trigger('click')
      await wrapper.vm.$nextTick()
      
      // Should show settings form
      expect(wrapper.text()).toContain('Node URL')
    }
  })
})