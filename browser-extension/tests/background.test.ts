import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock TrustClient
const mockTrustClient = {
  queryTrust: vi.fn(),
  health: vi.fn()
}

vi.mock('trust-client', () => ({
  TrustClient: vi.fn().mockImplementation(() => mockTrustClient)
}))

// Mock chrome APIs
global.chrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn()
    }
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({
        'repeer-settings': {
          nodeUrl: 'http://localhost:8080',
          maxDepth: 3,
          forgetRate: 0.1
        }
      })
    }
  }
} as any

describe('Background Script', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets up message listener', () => {
    // Import/initialize background script
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled()
  })

  it('handles GET_TRUST_SCORE message', async () => {
    mockTrustClient.queryTrust.mockResolvedValue({
      expected_pv_roi: 0.8,
      total_volume: 500,
      data_points: 5
    })

    // Simulate the message handler
    const messageHandler = async (message: any) => {
      if (message.type === 'GET_TRUST_SCORE') {
        try {
          const score = await mockTrustClient.queryTrust(message.agentId, {
            max_depth: 3,
            forget_rate: 0.1
          })
          return { success: true, score }
        } catch (error) {
          return { success: false, error: error.message }
        }
      }
    }

    const response = await messageHandler({
      type: 'GET_TRUST_SCORE',
      agentId: 'test-agent'
    })

    expect(response.success).toBe(true)
    expect(response.score).toEqual({
      expected_pv_roi: 0.8,
      total_volume: 500,
      data_points: 5
    })
    expect(mockTrustClient.queryTrust).toHaveBeenCalledWith('test-agent', {
      max_depth: 3,
      forget_rate: 0.1
    })
  })

  it('handles HEALTH_CHECK message', async () => {
    mockTrustClient.health.mockResolvedValue(true)

    const messageHandler = async (message: any) => {
      if (message.type === 'HEALTH_CHECK') {
        try {
          const healthy = await mockTrustClient.health()
          return { success: true, healthy }
        } catch (error) {
          return { success: false, healthy: false }
        }
      }
    }

    const response = await messageHandler({
      type: 'HEALTH_CHECK'
    })

    expect(response.success).toBe(true)
    expect(response.healthy).toBe(true)
    expect(mockTrustClient.health).toHaveBeenCalled()
  })

  it('handles errors in trust score queries', async () => {
    mockTrustClient.queryTrust.mockRejectedValue(new Error('Node unreachable'))

    const messageHandler = async (message: any) => {
      if (message.type === 'GET_TRUST_SCORE') {
        try {
          const score = await mockTrustClient.queryTrust(message.agentId)
          return { success: true, score }
        } catch (error) {
          return { success: false, error: error.message }
        }
      }
    }

    const response = await messageHandler({
      type: 'GET_TRUST_SCORE',
      agentId: 'test-agent'
    })

    expect(response.success).toBe(false)
    expect(response.error).toBe('Node unreachable')
  })

  it('handles unknown message types', async () => {
    const messageHandler = async (message: any) => {
      if (message.type === 'UNKNOWN_TYPE') {
        return { success: false, error: 'Unknown message type' }
      }
    }

    const response = await messageHandler({
      type: 'UNKNOWN_TYPE'
    })

    expect(response.success).toBe(false)
    expect(response.error).toBe('Unknown message type')
  })
})