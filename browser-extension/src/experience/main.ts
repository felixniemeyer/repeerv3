// Experience recording page main script

interface ExperienceData {
  agent_id: string;
  investment: number;
  return_value: number;
  timeframe_days: number;
  notes?: string;
}

class ExperienceRecorder {
  private agentId: string = '';
  private agentType: string = '';
  private address: string = '';

  constructor() {
    this.init();
  }

  private init() {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    this.agentId = urlParams.get('agent') || '';
    this.agentType = urlParams.get('type') || '';
    this.address = urlParams.get('address') || '';

    if (!this.agentId) {
      this.showError('Missing agent information');
      return;
    }

    // Display agent information
    this.displayAgentInfo();

    // Set up form handlers
    this.setupFormHandlers();
  }

  private displayAgentInfo() {
    const addressElement = document.getElementById('agent-address');
    if (addressElement) {
      if (this.agentType === 'ethereum') {
        addressElement.textContent = this.address || this.agentId.replace('ethereum:', '');
      } else {
        addressElement.textContent = this.agentId;
      }
    }
  }

  private setupFormHandlers() {
    const form = document.getElementById('experience-form') as HTMLFormElement;
    const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
    const investmentInput = document.getElementById('investment') as HTMLInputElement;
    const returnValueInput = document.getElementById('return-value') as HTMLInputElement;

    // ROI calculation
    const updateROI = () => {
      const investment = parseFloat(investmentInput.value) || 0;
      const returnValue = parseFloat(returnValueInput.value) || 0;
      
      if (investment > 0) {
        const roi = (returnValue / investment);
        const roiPercentage = ((roi - 1) * 100).toFixed(1);
        const roiDisplay = document.getElementById('roi-display');
        const roiPercentageSpan = document.getElementById('roi-percentage');
        const roiDescriptionSpan = document.getElementById('roi-description');
        
        if (roiDisplay && roiPercentageSpan && roiDescriptionSpan) {
          roiPercentageSpan.textContent = roiPercentage;
          
          if (roi > 1.2) {
            roiDescriptionSpan.textContent = 'excellent';
            roiDescriptionSpan.style.color = '#2e7d32';
          } else if (roi > 1.0) {
            roiDescriptionSpan.textContent = 'profitable';
            roiDescriptionSpan.style.color = '#2e7d32';
          } else if (roi > 0.8) {
            roiDescriptionSpan.textContent = 'minor loss';
            roiDescriptionSpan.style.color = '#f57c00';
          } else {
            roiDescriptionSpan.textContent = 'major loss';
            roiDescriptionSpan.style.color = '#c62828';
          }
          
          roiDisplay.style.display = 'block';
        }
      } else {
        const roiDisplay = document.getElementById('roi-display');
        if (roiDisplay) {
          roiDisplay.style.display = 'none';
        }
      }
    };

    investmentInput.addEventListener('input', updateROI);
    returnValueInput.addEventListener('input', updateROI);

    // Form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitExperience();
    });

    // Cancel button
    cancelBtn.addEventListener('click', () => {
      window.close();
    });
  }

  private async submitExperience() {
    const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
    
    // Get form data
    const investment = parseFloat((document.getElementById('investment') as HTMLInputElement).value);
    const returnValue = parseFloat((document.getElementById('return-value') as HTMLInputElement).value);
    const timeframeDays = parseInt((document.getElementById('timeframe') as HTMLInputElement).value);
    const notes = (document.getElementById('notes') as HTMLTextAreaElement).value.trim();

    // Validate
    if (!investment || !returnValue || !timeframeDays) {
      this.showError('Please fill in all required fields');
      return;
    }

    if (investment <= 0 || returnValue < 0 || timeframeDays <= 0) {
      this.showError('Please enter valid positive numbers');
      return;
    }

    // Disable form
    submitBtn.disabled = true;
    submitBtn.textContent = 'Recording...';

    try {
      // Parse agent ID from URL params
      const urlParams = new URLSearchParams(window.location.search);
      const idDomain = urlParams.get('idDomain') || this.agentType || 'ethereum';
      const agentIdPart = urlParams.get('agentId') || this.agentId;
      
      const experienceData: ExperienceData = {
        id_domain: idDomain,
        agent_id: agentIdPart,
        investment,
        return_value: returnValue,
        timeframe_days: timeframeDays,
        notes: notes || undefined
      };

      // Send to background script
      const response = await chrome.runtime.sendMessage({
        type: 'RECORD_EXPERIENCE',
        experience: experienceData
      });

      if (response && response.success) {
        this.showSuccess('Experience recorded successfully!');
        
        // Close window after a short delay
        setTimeout(() => {
          window.close();
        }, 1500);
      } else {
        throw new Error(response?.error || 'Failed to record experience');
      }
    } catch (error) {
      console.error('Error recording experience:', error);
      this.showError(error instanceof Error ? error.message : 'Failed to record experience');
    } finally {
      // Re-enable form
      submitBtn.disabled = false;
      submitBtn.textContent = 'Record Experience';
    }
  }

  private showError(message: string) {
    const errorElement = document.getElementById('error-message');
    const successElement = document.getElementById('success-message');
    
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
    
    if (successElement) {
      successElement.style.display = 'none';
    }
  }

  private showSuccess(message: string) {
    const errorElement = document.getElementById('error-message');
    const successElement = document.getElementById('success-message');
    
    if (successElement) {
      successElement.textContent = message;
      successElement.style.display = 'block';
    }
    
    if (errorElement) {
      errorElement.style.display = 'none';
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ExperienceRecorder());
} else {
  new ExperienceRecorder();
}