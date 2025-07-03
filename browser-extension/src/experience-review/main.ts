// Experience review page for adapter-suggested experiences

interface ExperienceData {
  id_domain: string;
  agent_id: string;
  investment: number;
  return_value: number;
  timeframe_days: number;
  notes?: string;
  data?: any;
}

class ExperienceReviewPage {
  private experienceData: ExperienceData | null = null;

  constructor() {
    this.init();
  }

  private init() {
    this.parseUrlParams();
    this.setupEventListeners();
    this.displayExperience();
  }

  private parseUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    
    const idDomain = urlParams.get('idDomain');
    const agentId = urlParams.get('agentId');
    const pvRoi = urlParams.get('pvRoi');
    const volume = urlParams.get('volume');
    const dataParam = urlParams.get('data');

    if (!idDomain || !agentId || !pvRoi || !volume) {
      this.showError('Missing required experience data in URL parameters');
      return;
    }

    const pvRoiValue = parseFloat(pvRoi);
    const volumeValue = parseFloat(volume);
    
    this.experienceData = {
      id_domain: idDomain,
      agent_id: agentId,
      investment: volumeValue,
      return_value: volumeValue * pvRoiValue,
      timeframe_days: 1, // Default timeframe
      data: dataParam ? JSON.parse(dataParam) : undefined
    };
  }

  private setupEventListeners() {
    const confirmBtn = document.getElementById('confirm-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    confirmBtn?.addEventListener('click', () => this.confirmExperience());
    cancelBtn?.addEventListener('click', () => this.cancelExperience());
  }

  private displayExperience() {
    if (!this.experienceData) {
      return;
    }

    const loadingElement = document.getElementById('loading');
    const formElement = document.getElementById('review-form');
    
    if (loadingElement) loadingElement.style.display = 'none';
    if (formElement) formElement.style.display = 'block';

    // Display agent information
    const agentDisplay = document.getElementById('agent-display');
    if (agentDisplay) {
      agentDisplay.textContent = `${this.experienceData.id_domain}:${this.experienceData.agent_id}`;
    }

    // Display ROI and volume
    this.updateMetrics();

    // Display adapter data if present
    if (this.experienceData.data) {
      const adapterDataElement = document.getElementById('adapter-data');
      const adapterDataContent = document.getElementById('adapter-data-content');
      
      if (adapterDataElement && adapterDataContent) {
        adapterDataElement.style.display = 'block';
        adapterDataContent.textContent = JSON.stringify(this.experienceData.data, null, 2);
      }
    }
  }

  private updateMetrics() {
    if (!this.experienceData) return;

    const pvRoi = this.experienceData.return_value / this.experienceData.investment;
    const volume = this.experienceData.investment;

    // Update ROI display
    const roiElement = document.getElementById('roi-value');
    if (roiElement) {
      const roiPercentage = ((pvRoi - 1) * 100).toFixed(1);
      roiElement.textContent = `${roiPercentage}%`;
    }

    // Update volume display
    const volumeElement = document.getElementById('volume-value');
    if (volumeElement) {
      volumeElement.textContent = this.formatCurrency(volume);
    }

    // Update ROI indicator
    const roiIndicator = document.getElementById('roi-indicator');
    if (roiIndicator) {
      if (pvRoi > 1.1) {
        roiIndicator.className = 'roi-indicator roi-positive';
        roiIndicator.textContent = 'Profitable Experience';
      } else if (pvRoi < 0.9) {
        roiIndicator.className = 'roi-indicator roi-negative';
        roiIndicator.textContent = 'Loss Experience';
      } else {
        roiIndicator.className = 'roi-indicator roi-neutral';
        roiIndicator.textContent = 'Break-even Experience';
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

  private async confirmExperience() {
    if (!this.experienceData) {
      this.showError('No experience data available');
      return;
    }

    const confirmBtn = document.getElementById('confirm-btn') as HTMLButtonElement;
    const notesTextarea = document.getElementById('notes') as HTMLTextAreaElement;

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Recording...';
    }

    try {
      // Get user notes
      const notes = notesTextarea?.value.trim() || undefined;

      // Create experience record with updated notes
      const experienceRecord = {
        id_domain: this.experienceData.id_domain,
        agent_id: this.experienceData.agent_id,
        investment: this.experienceData.investment,
        return_value: this.experienceData.return_value,
        timeframe_days: this.experienceData.timeframe_days,
        notes,
        data: this.experienceData.data
      };

      // Send to background script for recording
      const response = await chrome.runtime.sendMessage({
        type: 'RECORD_EXPERIENCE',
        experience: experienceRecord
      });

      if (response.success) {
        // Show success and close window
        this.showSuccess('Experience recorded successfully!');
        setTimeout(() => {
          window.close();
        }, 1500);
      } else {
        throw new Error(response.error || 'Failed to record experience');
      }

    } catch (error) {
      console.error('Failed to record experience:', error);
      this.showError(`Failed to record experience: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm Experience';
      }
    }
  }

  private cancelExperience() {
    window.close();
  }

  private showError(message: string) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }

    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
      loadingElement.style.display = 'none';
    }
  }

  private showSuccess(message: string) {
    // Replace error div with success styling
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.background = '#10b981';
      errorElement.style.display = 'block';
    }
  }
}

// Initialize the experience review page
new ExperienceReviewPage();