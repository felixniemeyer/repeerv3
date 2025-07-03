// Agent details page showing trust score, manual form, and experience history

interface AgentData {
  idDomain: string;
  agentId: string;
}

interface TrustScore {
  expected_pv_roi: number;
  total_volume: number;
  data_points: number;
}

interface Experience {
  id: string;
  id_domain: string;
  agent_id: string;
  pv_roi: number;
  invested_volume: number;
  timestamp: string;
  notes?: string;
  data?: any;
}

class AgentDetailsPage {
  private agentData: AgentData | null = null;
  private currentTab = 'manual';

  constructor() {
    this.init();
  }

  private init() {
    this.parseUrlParams();
    this.setupEventListeners();
    this.displayAgentInfo();
  }

  private parseUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    
    const idDomain = urlParams.get('idDomain');
    const agentId = urlParams.get('agentId');

    if (!idDomain || !agentId) {
      this.showError('Missing agent information in URL parameters');
      return;
    }

    this.agentData = { idDomain, agentId };
  }

  private setupEventListeners() {
    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabName = target.getAttribute('data-tab');
        if (tabName) {
          this.switchTab(tabName);
        }
      });
    });

    // Form submission
    const form = document.getElementById('experience-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitExperience();
    });

    // ROI preview
    const investmentInput = document.getElementById('investment') as HTMLInputElement;
    const returnInput = document.getElementById('return-value') as HTMLInputElement;
    
    [investmentInput, returnInput].forEach(input => {
      input?.addEventListener('input', () => this.updateROIPreview());
    });
  }

  private displayAgentInfo() {
    if (!this.agentData) return;

    const agentDisplay = document.getElementById('agent-display');
    if (agentDisplay) {
      agentDisplay.textContent = `${this.agentData.idDomain}:${this.agentData.agentId}`;
    }

    // Load data for the current tab
    this.loadTabContent(this.currentTab);
  }

  private switchTab(tabName: string) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
    });

    // Update tab content
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    this.currentTab = tabName;
    this.loadTabContent(tabName);
  }

  private loadTabContent(tabName: string) {
    switch (tabName) {
      case 'breakdown':
        this.loadTrustScore();
        break;
      case 'history':
        this.loadExperienceHistory();
        break;
      // 'manual' tab doesn't need loading
    }
  }

  private async loadTrustScore() {
    if (!this.agentData) return;

    const loadingElement = document.getElementById('score-loading');
    const contentElement = document.getElementById('score-content');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TRUST_SCORE',
        idDomain: this.agentData.idDomain,
        agentId: this.agentData.agentId
      });

      if (response.success && response.score) {
        this.displayTrustScore(response.score);
        if (loadingElement) loadingElement.style.display = 'none';
        if (contentElement) contentElement.style.display = 'block';
      } else {
        throw new Error(response.error || 'Failed to load trust score');
      }
    } catch (error) {
      console.error('Failed to load trust score:', error);
      if (loadingElement) {
        loadingElement.textContent = 'Failed to load trust score';
      }
    }
  }

  private displayTrustScore(score: TrustScore) {
    const expectedRoi = document.getElementById('expected-roi');
    const totalVolume = document.getElementById('total-volume');
    const dataPoints = document.getElementById('data-points');

    if (expectedRoi) {
      expectedRoi.textContent = `${((score.expected_pv_roi - 1) * 100).toFixed(1)}%`;
    }

    if (totalVolume) {
      totalVolume.textContent = this.formatCurrency(score.total_volume);
    }

    if (dataPoints) {
      dataPoints.textContent = score.data_points.toString();
    }

    // Add score breakdown info
    const breakdown = document.getElementById('score-breakdown');
    if (breakdown) {
      breakdown.innerHTML = `
        <div style="color: #9ca3af; font-size: 0.9rem;">
          <p>Expected PV ROI: ${score.expected_pv_roi.toFixed(3)}</p>
          <p>Total Volume: ${this.formatCurrency(score.total_volume)}</p>
          <p>Data Points: ${score.data_points}</p>
          <br>
          <p style="font-style: italic;">
            This score is calculated based on your personal experiences and recommendations from trusted peers.
          </p>
        </div>
      `;
    }
  }

  private async loadExperienceHistory() {
    if (!this.agentData) return;

    const loadingElement = document.getElementById('history-loading');
    const contentElement = document.getElementById('history-content');
    const listElement = document.getElementById('experiences-list');
    const emptyElement = document.getElementById('no-experiences');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_EXPERIENCES',
        idDomain: this.agentData.idDomain,
        agentId: this.agentData.agentId
      });

      if (response.success && response.experiences) {
        const experiences: Experience[] = response.experiences;
        
        if (loadingElement) loadingElement.style.display = 'none';
        if (contentElement) contentElement.style.display = 'block';

        if (experiences.length === 0) {
          if (listElement) listElement.style.display = 'none';
          if (emptyElement) emptyElement.style.display = 'block';
        } else {
          if (emptyElement) emptyElement.style.display = 'none';
          if (listElement) listElement.style.display = 'block';
          this.displayExperiences(experiences);
        }
      } else {
        throw new Error(response.error || 'Failed to load experiences');
      }
    } catch (error) {
      console.error('Failed to load experiences:', error);
      if (loadingElement) {
        loadingElement.textContent = 'Failed to load experience history';
      }
    }
  }

  private displayExperiences(experiences: Experience[]) {
    const listElement = document.getElementById('experiences-list');
    if (!listElement) return;

    listElement.innerHTML = experiences.map(exp => {
      const roi = exp.pv_roi;
      const roiPercentage = ((roi - 1) * 100).toFixed(1);
      
      let roiClass = 'roi-neutral';
      if (roi > 1.1) roiClass = 'roi-positive';
      else if (roi < 0.9) roiClass = 'roi-negative';

      const date = new Date(exp.timestamp).toLocaleDateString();

      return `
        <div class="experience-item">
          <div class="experience-header">
            <span class="experience-roi ${roiClass}">${roiPercentage}% ROI</span>
            <span style="font-size: 0.8rem; color: #9ca3af;">${date}</span>
          </div>
          <div class="experience-details">
            Volume: ${this.formatCurrency(exp.invested_volume)} → ${this.formatCurrency(exp.invested_volume * exp.pv_roi)}
          </div>
          ${exp.notes ? `<div class="experience-notes">"${exp.notes}"</div>` : ''}
          ${exp.data ? `<div style="font-size: 0.7rem; color: #6b7280; margin-top: 0.5rem;">Has adapter data</div>` : ''}
        </div>
      `;
    }).join('');
  }

  private updateROIPreview() {
    const investmentInput = document.getElementById('investment') as HTMLInputElement;
    const returnInput = document.getElementById('return-value') as HTMLInputElement;
    const previewElement = document.getElementById('roi-preview');
    const valueElement = document.getElementById('roi-preview-value');
    const descElement = document.getElementById('roi-preview-description');

    const investment = parseFloat(investmentInput.value);
    const returnValue = parseFloat(returnInput.value);

    if (investment && returnValue && investment > 0) {
      const roi = returnValue / investment;
      const roiPercentage = ((roi - 1) * 100).toFixed(1);

      let description = 'Break-even';
      let className = '';

      if (roi > 1.2) {
        description = 'Excellent return';
        className = 'roi-positive';
      } else if (roi > 1.0) {
        description = 'Profitable';
        className = 'roi-positive';
      } else if (roi > 0.8) {
        description = 'Minor loss';
        className = 'roi-negative';
      } else {
        description = 'Major loss';
        className = 'roi-negative';
      }

      if (valueElement) valueElement.textContent = `${roiPercentage}%`;
      if (descElement) descElement.textContent = description;
      if (previewElement) {
        previewElement.className = `roi-calculation ${className}`;
        previewElement.style.display = 'block';
      }
    } else {
      if (previewElement) previewElement.style.display = 'none';
    }
  }

  private async submitExperience() {
    if (!this.agentData) return;

    const investmentInput = document.getElementById('investment') as HTMLInputElement;
    const returnInput = document.getElementById('return-value') as HTMLInputElement;
    const timeframeInput = document.getElementById('timeframe') as HTMLInputElement;
    const notesInput = document.getElementById('notes') as HTMLTextAreaElement;
    const submitBtn = document.querySelector('#experience-form button[type="submit"]') as HTMLButtonElement;

    const investment = parseFloat(investmentInput.value);
    const returnValue = parseFloat(returnInput.value);
    const timeframeDays = parseFloat(timeframeInput.value) || 1;
    const notes = notesInput.value.trim() || undefined;

    if (!investment || !returnValue || investment <= 0 || returnValue < 0) {
      this.showError('Please enter valid investment and return amounts');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Recording...';
    }

    try {
      const experienceData = {
        id_domain: this.agentData.idDomain,
        agent_id: this.agentData.agentId,
        investment,
        return_value: returnValue,
        timeframe_days: timeframeDays,
        notes
      };

      const response = await chrome.runtime.sendMessage({
        type: 'RECORD_EXPERIENCE',
        experience: experienceData
      });

      if (response.success) {
        this.showSuccess('Experience recorded successfully!');
        
        // Reset form
        (document.getElementById('experience-form') as HTMLFormElement).reset();
        document.getElementById('roi-preview')!.style.display = 'none';
        
        // Reload data if we're on those tabs
        if (this.currentTab === 'breakdown') {
          this.loadTrustScore();
        } else if (this.currentTab === 'history') {
          this.loadExperienceHistory();
        }
      } else {
        throw new Error(response.error || 'Failed to record experience');
      }
    } catch (error) {
      console.error('Failed to record experience:', error);
      this.showError(`Failed to record experience: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Record Experience';
      }
    }
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  }

  private showError(message: string) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }

    // Hide after 5 seconds
    setTimeout(() => {
      if (errorElement) errorElement.style.display = 'none';
    }, 5000);
  }

  private showSuccess(message: string) {
    const successElement = document.getElementById('success-message');
    if (successElement) {
      successElement.textContent = message;
      successElement.style.display = 'block';
    }

    // Hide after 3 seconds
    setTimeout(() => {
      if (successElement) successElement.style.display = 'none';
    }, 3000);
  }
}

// Initialize the agent details page
new AgentDetailsPage();