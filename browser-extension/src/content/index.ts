// Content script for Repeer trust score injection
import { defaultRegistry } from 'trust-client'

interface TrustScore {
  expected_pv_roi: number
  total_volume: number
  data_points: number
}

class TrustScoreInjector {
  private observedUrls = new Set<string>()
  private pendingRequests = new Map<string, Promise<any>>()
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
    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
      if (message.type === 'SHOW_RECORD_UI') {
        this.showRecordExperienceUI(message.url)
      }
    })
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
    // Ethereum addresses
    this.injectEthereumScores()
    
    // AliExpress products
    this.injectAliExpressScores()
    
    // Domain trust for external links
    this.injectDomainScores()
  }

  private async injectEthereumScores() {
    // Find Ethereum addresses on the page
    const addressRegex = /0x[a-fA-F0-9]{40}/g
    const addressElements = this.findElementsWithPattern(addressRegex)
    
    for (const element of addressElements) {
      const address = element.textContent?.match(addressRegex)?.[0]
      if (address && !this.observedUrls.has(address)) {
        this.observedUrls.add(address)
        await this.addTrustScoreOverlay(element, `ethereum:${address.toLowerCase()}`)
      }
    }
  }

  private async injectAliExpressScores() {
    if (!window.location.hostname.includes('aliexpress')) return
    
    // Use the AliExpress adapter to parse the current URL
    const parsed = defaultRegistry.parseUrl(window.location.href)
    if (parsed && parsed.adapter.name === 'aliexpress') {
      const agentId = parsed.trustId
      
      if (!this.observedUrls.has(agentId)) {
        this.observedUrls.add(agentId)
        
        // Find a good place to inject the trust score (product title area)
        const titleElement = document.querySelector('h1, .product-title, [data-spm-anchor-id], .product-title-text')
        if (titleElement) {
          await this.addTrustScoreOverlay(titleElement, agentId)
        }
        
        // Also try to inject near price elements
        const priceElement = document.querySelector('.product-price, .price, .notranslate')
        if (priceElement && priceElement !== titleElement) {
          await this.addTrustScoreOverlay(priceElement, agentId)
        }
      }
    }
  }

  private async injectDomainScores() {
    // Find external links
    const links = document.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>
    
    for (const link of links) {
      try {
        const url = new URL(link.href)
        
        // Skip same-domain links
        if (url.hostname === window.location.hostname) continue
        
        const parsed = defaultRegistry.parseUrl(link.href)
        if (parsed && parsed.adapter.name === 'domain') {
          const agentId = parsed.trustId
          
          if (!this.observedUrls.has(agentId)) {
            this.observedUrls.add(agentId)
            await this.addTrustScoreOverlay(link, agentId, 'link')
          }
        }
      } catch (error) {
        // Skip invalid URLs
      }
    }
  }

  private findElementsWithPattern(pattern: RegExp): Element[] {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    )

    const elements: Element[] = []
    let node

    while ((node = walker.nextNode())) {
      if (node.textContent && pattern.test(node.textContent)) {
        const parent = node.parentElement
        if (parent && !parent.hasAttribute('data-repeer-injected')) {
          elements.push(parent)
          parent.setAttribute('data-repeer-injected', 'true')
        }
      }
    }

    return elements
  }

  private async addTrustScoreOverlay(element: Element, agentId: string, type: 'default' | 'link' = 'default') {
    try {
      // Check if we already have a pending request for this agentId
      if (this.pendingRequests.has(agentId)) {
        const response = await this.pendingRequests.get(agentId)
        if (response?.success) {
          this.createTrustScoreElement(element, agentId, response.score, type)
        }
        return
      }

      // Create new request and cache it
      const requestPromise = chrome.runtime.sendMessage({
        type: 'GET_TRUST_SCORE',
        agentId: agentId,
      })
      
      this.pendingRequests.set(agentId, requestPromise)
      
      const response = await requestPromise
      
      // Clean up the pending request
      this.pendingRequests.delete(agentId)

      if (response.success) {
        this.createTrustScoreElement(element, agentId, response.score, type)
      }
    } catch (error) {
      console.error('Failed to get trust score:', error)
      this.pendingRequests.delete(agentId)
    }
  }

  private createTrustScoreElement(element: Element, agentId: string, score: TrustScore, type: 'default' | 'link') {
    const trustElement = document.createElement('div')
    trustElement.className = `repeer-trust-score repeer-trust-${type}`
    trustElement.setAttribute('data-agent-id', agentId)
    
    const roi = score.expected_pv_roi
    const roiClass = roi > 1.1 ? 'positive' : roi < 0.9 ? 'negative' : 'neutral'
    const roiPercentage = ((roi - 1) * 100).toFixed(1)
    
    trustElement.innerHTML = `
      <div class="repeer-score-content">
        <span class="repeer-score-label">Trust:</span>
        <span class="repeer-score-value repeer-${roiClass}">${roiPercentage}%</span>
        <span class="repeer-score-volume">(${this.formatVolume(score.total_volume)})</span>
      </div>
      <div class="repeer-score-tooltip">
        <div><strong>${defaultRegistry.displayName(agentId)}</strong></div>
        <div>Expected ROI: ${roiPercentage}%</div>
        <div>Volume: $${this.formatVolume(score.total_volume)}</div>
        <div>Data Points: ${score.data_points}</div>
        <button class="repeer-record-btn" data-agent-id="${agentId}">Record Experience</button>
      </div>
    `

    // Add click handler for record button
    const recordBtn = trustElement.querySelector('.repeer-record-btn') as HTMLElement
    recordBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.showRecordExperienceUI(agentId)
    })

    // Position the trust score element
    if (type === 'link') {
      (element as HTMLElement).style.position = 'relative'
      trustElement.style.position = 'absolute'
      trustElement.style.top = '-25px'
      trustElement.style.right = '0px'
      trustElement.style.zIndex = '1000'
    } else {
      trustElement.style.display = 'inline-block'
      trustElement.style.marginLeft = '8px'
    }

    element.appendChild(trustElement)
  }

  private formatVolume(volume: number): string {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`
    return volume.toFixed(0)
  }

  private showRecordExperienceUI(agentId: string) {
    // Create modal for recording experience
    const modal = document.createElement('div')
    modal.className = 'repeer-record-modal'
    modal.innerHTML = `
      <div class="repeer-modal-content">
        <h3>Record Trust Experience</h3>
        <div class="repeer-form-group">
          <label>Agent: ${defaultRegistry.displayName(agentId)}</label>
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
          this.observedUrls.clear()
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
}

// Initialize the injector when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new TrustScoreInjector())
} else {
  new TrustScoreInjector()
}