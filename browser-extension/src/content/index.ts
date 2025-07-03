// Modern content script using the new adapter package system
import type { TrustScore, AgentDiscovery } from '@repeer/adapter-interface'
import { adapterRegistry } from '../adapters/registry'
import { PermissionManager, type PermissionRequest } from '../permissions'

class ModernTrustScoreInjector {
  private discoveredAgents = new Set<string>()
  // private pendingRequests = new Map<string, Promise<any>>()
  private batchTimeout: number | null = null
  private readonly batchDelay = 100 // ms

  constructor() {
    this.init()
  }

  private init() {
    // Initialize on page load
    this.scanAndInjectScores()
    
    // Watch for dynamic content changes with debouncing
    const observer = new MutationObserver(() => {
      this.debouncedScan()
    })
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'SHOW_RECORD_UI') {
        this.showRecordExperienceUI(message.agentId)
      } else if (message.type === 'REQUEST_ADAPTER_PERMISSION') {
        this.handleAdapterPermissionRequest(message.data).then(sendResponse)
        return true // Keep the message channel open for async response
      }
    })

    // Expose global API for adapters to call extension functions
    this.exposeAdapterAPI()

    // Handle page navigation
    window.addEventListener('beforeunload', () => {
      adapterRegistry.cleanup()
    })

    // Handle single-page app navigation
    let lastUrl = location.href
    new MutationObserver(() => {
      const url = location.href
      if (url !== lastUrl) {
        lastUrl = url
        this.onPageChange()
      }
    }).observe(document, { subtree: true, childList: true })
  }

  private debouncedScan() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
    }
    this.batchTimeout = window.setTimeout(() => {
      this.scanAndInjectScores()
    }, this.batchDelay)
  }

  private async scanAndInjectScores() {
    try {
      // Use the modern adapter registry to scan the page
      const discoveries = await adapterRegistry.scanCurrentPage()
      
      if (discoveries.length === 0) {
        return
      }

      // Group discoveries by agent ID
      const agentGroups = new Map<string, AgentDiscovery[]>()
      for (const discovery of discoveries) {
        if (!agentGroups.has(discovery.agentId)) {
          agentGroups.set(discovery.agentId, [])
        }
        agentGroups.get(discovery.agentId)!.push(discovery)
      }

      // Fetch trust scores for all discovered agents
      const agentIds = Array.from(agentGroups.keys()).filter(
        agentId => !this.discoveredAgents.has(agentId)
      )

      if (agentIds.length === 0) {
        return
      }

      // Mark as discovered to avoid duplicate requests
      agentIds.forEach(agentId => this.discoveredAgents.add(agentId))

      // Batch request trust scores
      const trustScores = await this.fetchTrustScores(agentIds)

      // Always inject trust scores using the adapters (even if empty to show "unknown" badges)
      await adapterRegistry.injectTrustScores(trustScores)

    } catch (error) {
      console.error('Error scanning and injecting scores:', error)
    }
  }

  private async fetchTrustScores(agentIds: string[]): Promise<Map<string, TrustScore>> {
    const scores = new Map<string, TrustScore>()

    // Batch request to background script
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TRUST_SCORES_BATCH',
        agentIds: agentIds,
      })

      if (response.success && response.scores) {
        for (const [agentId, score] of Object.entries(response.scores)) {
          scores.set(agentId, score as TrustScore)
        }
      }
    } catch (error) {
      console.error('Failed to fetch trust scores:', error)
    }

    return scores
  }

  private async showRecordExperienceUI(agentId: string) {
    try {
      // Use the adapter registry to create an experience prompt
      const experienceData = await adapterRegistry.createExperiencePrompt(agentId)
      
      if (experienceData) {
        // Send to background script to record
        await chrome.runtime.sendMessage({
          type: 'RECORD_EXPERIENCE',
          experience: experienceData,
        })
        
        // Refresh trust scores on the page
        this.discoveredAgents.clear()
        setTimeout(() => this.scanAndInjectScores(), 1000)
      }
    } catch (error) {
      console.error('Failed to show record experience UI:', error)
      // Fallback to simple modal if adapter doesn't support experience prompts
      this.showFallbackRecordUI(agentId)
    }
  }

  private showFallbackRecordUI(agentId: string) {
    // Simple fallback modal (same as old system)
    const modal = document.createElement('div')
    modal.className = 'repeer-record-modal'
    modal.innerHTML = `
      <div class="repeer-modal-content">
        <h3>Record Trust Experience</h3>
        <div class="repeer-form-group">
          <label>Agent: ${agentId}</label>
        </div>
        <div class="repeer-form-group">
          <label>Investment Amount ($):</label>
          <input type="number" id="repeer-investment" placeholder="100">
        </div>
        <div class="repeer-form-group">
          <label>Return Value ($):</label>
          <input type="number" id="repeer-return" placeholder="110">
        </div>
        <div class="repeer-form-group">
          <label>Timeframe (days):</label>
          <input type="number" id="repeer-timeframe" placeholder="30" value="1">
        </div>
        <div class="repeer-form-group">
          <label>Notes (optional):</label>
          <textarea id="repeer-notes" placeholder="Describe your experience..."></textarea>
        </div>
        <div class="repeer-modal-actions">
          <button id="repeer-submit">Record</button>
          <button id="repeer-cancel">Cancel</button>
        </div>
      </div>
    `

    document.body.appendChild(modal)

    // Handle form submission
    modal.querySelector('#repeer-submit')?.addEventListener('click', async () => {
      const investment = (document.getElementById('repeer-investment') as HTMLInputElement).value
      const returnValue = (document.getElementById('repeer-return') as HTMLInputElement).value
      const timeframe = (document.getElementById('repeer-timeframe') as HTMLInputElement).value
      const notes = (document.getElementById('repeer-notes') as HTMLTextAreaElement).value

      if (investment && returnValue) {
        try {
          await chrome.runtime.sendMessage({
            type: 'RECORD_EXPERIENCE',
            experience: {
              agent_id: agentId,
              investment: parseFloat(investment),
              return_value: parseFloat(returnValue),
              timeframe_days: parseFloat(timeframe) || 1,
              notes: notes || undefined,
            },
          })
          
          modal.remove()
          
          // Refresh trust scores on the page
          this.discoveredAgents.clear()
          setTimeout(() => this.scanAndInjectScores(), 1000)
        } catch (error) {
          console.error('Failed to record experience:', error)
        }
      }
    })

    // Handle cancel
    modal.querySelector('#repeer-cancel')?.addEventListener('click', () => {
      modal.remove()
    })

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove()
      }
    })
  }

  private onPageChange() {
    // Notify adapters of page change
    adapterRegistry.onPageChange()
    
    // Clear discovered agents to re-scan new page
    this.discoveredAgents.clear()
    
    // Re-scan after a short delay
    setTimeout(() => this.scanAndInjectScores(), 500)
  }

  /**
   * Handle adapter permission requests for automatic experience creation
   */
  private async handleAdapterPermissionRequest(request: PermissionRequest): Promise<boolean> {
    try {
      // Check if we already have permission
      const hasPermission = await PermissionManager.hasPermission(request.adapterId, request.platform)
      if (hasPermission) {
        return true
      }

      // Request permission from user with dialog
      const granted = await PermissionManager.requestPermission(request)
      return granted
    } catch (error) {
      console.error('Error handling adapter permission request:', error)
      return false
    }
  }

  /**
   * Expose global API for adapters to call extension functions
   */
  private exposeAdapterAPI() {
    // Define the global API interface
    const repeerAPI = {
      /**
       * Suggests an experience to be entered via the extension
       * @param pvRoi - Present value ROI (e.g., 1.2 for 20% return)
       * @param volume - Volume/amount of the experience
       * @param data - Optional adapter-specific data
       */
      enterExperience: async (idDomain: string, agentId: string, pvRoi: number, volume: number, data?: any): Promise<void> => {
        try {
          await chrome.runtime.sendMessage({
            type: 'ENTER_EXPERIENCE',
            idDomain,
            agentId,
            pvRoi,
            volume,
            data
          });
        } catch (error) {
          console.error('Failed to send enter experience message:', error);
          throw error;
        }
      },

      /**
       * Shows the agent details page with manual form, score breakdown, and experiences
       */
      showAgentDetails: async (idDomain: string, agentId: string): Promise<void> => {
        try {
          await chrome.runtime.sendMessage({
            type: 'SHOW_AGENT_DETAILS',
            idDomain,
            agentId
          });
        } catch (error) {
          console.error('Failed to send show agent details message:', error);
          throw error;
        }
      }
    };

    // Expose the API on the window object
    (window as any).repeer = repeerAPI;

    // Also dispatch a custom event to notify adapters that the API is ready
    window.dispatchEvent(new CustomEvent('repeer:api-ready', { detail: repeerAPI }));
  }
}

// Initialize the modern injector when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ModernTrustScoreInjector())
} else {
  new ModernTrustScoreInjector()
}