<template>
  <div class="etherscan-experience">
    <div class="header">
      <h2>Record Trust Experience</h2>
      <p class="subtitle">Ethereum Address: {{ displayAddress }}</p>
    </div>
    
    <!-- Experience Recording Form -->
    <form @submit.prevent="submitExperience" class="experience-form">
      <div class="form-group">
        <label for="investment">Investment Amount (USD)</label>
        <input 
          type="number" 
          id="investment" 
          v-model.number="form.investment"
          step="0.01" 
          min="0" 
          placeholder="1000" 
          required
          @input="updateROI"
        >
        <div class="help-text">How much did you invest or stake?</div>
      </div>
      
      <div class="form-group">
        <label for="returnValue">Return Value (USD)</label>
        <input 
          type="number" 
          id="returnValue" 
          v-model.number="form.returnValue"
          step="0.01" 
          min="0" 
          placeholder="1200" 
          required
          @input="updateROI"
        >
        <div class="help-text">How much did you get back (or current value)?</div>
        <div v-if="roiInfo.show" class="roi-info" :class="roiInfo.class">
          ROI: {{ roiInfo.percentage }}% ({{ roiInfo.description }})
        </div>
      </div>
      
      <div class="form-group">
        <label for="timeframe">Timeframe (days)</label>
        <input 
          type="number" 
          id="timeframe" 
          v-model.number="form.timeframeDays"
          min="1" 
          placeholder="30" 
          required
        >
        <div class="help-text">How long was the investment period?</div>
      </div>
      
      <div class="form-group">
        <label for="notes">Notes (optional)</label>
        <textarea 
          id="notes" 
          v-model="form.notes"
          placeholder="Describe your experience with this address..."
          rows="3"
        ></textarea>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" @click="cancel">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="!isFormValid">
          Record Experience
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { TrustClient } from '@repeer/trust-client'

interface Props {
  agentId: string
  address: string
  client: TrustClient
}

const props = defineProps<Props>()
const emit = defineEmits<{
  submit: [data: any]
  cancel: []
}>()

const form = ref({
  investment: null as number | null,
  returnValue: null as number | null,
  timeframeDays: 30,
  notes: ''
})

const roiInfo = ref({
  show: false,
  percentage: '0.0',
  description: 'break-even',
  class: ''
})

const displayAddress = computed(() => {
  return props.address ? `${props.address.slice(0, 6)}...${props.address.slice(-4)}` : 'Loading...'
})

const isFormValid = computed(() => {
  return form.value.investment && 
         form.value.returnValue && 
         form.value.timeframeDays &&
         form.value.investment > 0 &&
         form.value.returnValue >= 0 &&
         form.value.timeframeDays > 0
})

const updateROI = () => {
  const investment = form.value.investment
  const returnValue = form.value.returnValue
  
  if (investment && returnValue && investment > 0) {
    const roi = returnValue / investment
    const percentage = ((roi - 1) * 100).toFixed(1)
    
    let description = 'break-even'
    let className = ''
    
    if (roi > 1.2) {
      description = 'excellent'
      className = 'positive'
    } else if (roi > 1.0) {
      description = 'profitable'
      className = 'positive'
    } else if (roi > 0.8) {
      description = 'minor loss'
      className = 'negative'
    } else {
      description = 'major loss'
      className = 'negative'
    }
    
    roiInfo.value = {
      show: true,
      percentage,
      description,
      class: className
    }
  } else {
    roiInfo.value.show = false
  }
}

const submitExperience = async () => {
  if (!isFormValid.value) return
  
  try {
    await props.client.recordExperience(
      props.agentId,
      form.value.investment!,
      form.value.returnValue!,
      form.value.timeframeDays,
      form.value.notes || undefined
    )
    
    emit('submit', {
      agent_id: props.agentId,
      investment: form.value.investment,
      return_value: form.value.returnValue,
      timeframe_days: form.value.timeframeDays,
      notes: form.value.notes || undefined
    })
  } catch (error) {
    console.error('Failed to record experience:', error)
    // Could emit an error event here
  }
}

const cancel = () => {
  emit('cancel')
}
</script>

<style scoped>
.etherscan-experience {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a1a;
  color: #ffffff;
  padding: 1.5rem;
  border-radius: 0.75rem;
  max-width: 25rem;
}

.header h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.subtitle {
  margin: 0 0 1.5rem 0;
  color: #888;
  font-size: 0.875rem;
  font-family: 'SF Mono', Monaco, monospace;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #333;
  border-radius: 0.5rem;
  background: #2d2d2d;
  color: #ffffff;
  font-size: 0.875rem;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #4a9eff;
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.1);
}

.help-text {
  font-size: 0.75rem;
  color: #888;
  margin-top: 0.25rem;
}

.roi-info {
  background: #1e3a8a;
  color: #93c5fd;
  padding: 0.5rem;
  border-radius: 0.375rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
}

.roi-info.positive {
  background: #065f46;
  color: #6ee7b7;
}

.roi-info.negative {
  background: #7f1d1d;
  color: #fca5a5;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  justify-content: flex-end;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: #374151;
  color: #d1d5db;
}

.btn-secondary:hover {
  background: #4b5563;
}

.btn-primary {
  background: #4a9eff;
  color: #ffffff;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-primary:disabled {
  background: #374151;
  color: #6b7280;
  cursor: not-allowed;
}
</style>