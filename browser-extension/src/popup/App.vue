<template>
  <div class="popup-container">
    <header class="header">
      <h1 class="title">Repeer Trust Network</h1>
      <div class="status" :class="{ connected: isConnected, disconnected: !isConnected }">
        <span class="status-dot"></span>
        {{ isConnected ? 'Connected' : 'Disconnected' }}
      </div>
    </header>

    <nav class="tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="{ active: activeTab === tab.id }"
        class="tab"
      >
        {{ tab.label }}
      </button>
    </nav>

    <main class="content">
      <!-- Trust Scores Tab -->
      <div v-if="activeTab === 'scores'" class="tab-content">
        <div class="search-box">
          <input 
            v-model="searchQuery" 
            placeholder="Search by address, domain, or URL..."
            @keyup.enter="searchTrustScore"
            class="search-input"
          >
          <button @click="searchTrustScore" class="search-btn">Search</button>
        </div>

        <div v-if="currentScore" class="score-display">
          <h3>{{ formatAgentId(currentScore.agentId) }}</h3>
          <div class="trust-score">
            <div class="roi">
              <span class="label">Expected ROI:</span>
              <span class="value" :class="roiClass(currentScore.score.expected_pv_roi)">
                {{ formatRoi(currentScore.score.expected_pv_roi) }}
              </span>
            </div>
            <div class="volume">
              <span class="label">Total Volume:</span>
              <span class="value">${{ formatVolume(currentScore.score.total_volume) }}</span>
            </div>
            <div class="data-points">
              <span class="label">Data Points:</span>
              <span class="value">{{ currentScore.score.data_points }}</span>
            </div>
          </div>
          <button @click="showRecordExperience = true" class="record-btn">
            Record Experience
          </button>
        </div>

        <div v-if="recentScores.length > 0" class="recent-scores">
          <h4>Recent Queries</h4>
          <div 
            v-for="score in recentScores" 
            :key="score.agentId"
            @click="currentScore = score"
            class="recent-item"
          >
            <span class="agent-name">{{ formatAgentId(score.agentId) }}</span>
            <span class="roi" :class="roiClass(score.score.expected_pv_roi)">
              {{ formatRoi(score.score.expected_pv_roi) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Peers Tab -->
      <div v-if="activeTab === 'peers'" class="tab-content">
        <div class="add-peer">
          <input 
            v-model="newPeer.peerId" 
            placeholder="Peer ID or Multiaddr"
            class="input"
          >
          <input 
            v-model="newPeer.name" 
            placeholder="Display Name"
            class="input"
          >
          <input 
            v-model="newPeer.quality" 
            type="number" 
            min="-1" 
            max="1" 
            step="0.1"
            placeholder="Quality (-1 to 1)"
            class="input"
          >
          <button @click="addPeer" class="add-btn">Add Peer</button>
        </div>

        <div v-if="peers.length > 0" class="peers-list">
          <div v-for="peer in peers" :key="peer.peer_id" class="peer-item">
            <div class="peer-info">
              <span class="peer-name">{{ peer.name }}</span>
              <span class="peer-id">{{ formatPeerId(peer.peer_id) }}</span>
              <span class="peer-added">Added: {{ formatDate(peer.added_at) }}</span>
            </div>
            <div class="peer-controls">
              <div class="peer-quality">
                <span class="quality-label">Quality:</span>
                <input 
                  v-model="peer.recommender_quality" 
                  type="number" 
                  min="-1" 
                  max="1" 
                  step="0.1"
                  @change="updatePeerQuality(peer)"
                  class="quality-input"
                >
              </div>
              <button @click="removePeer(peer.peer_id)" class="remove-btn" title="Remove peer">×</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Tab -->
      <div v-if="activeTab === 'settings'" class="tab-content">
        <div class="setting">
          <label class="setting-label">Trust Node API Endpoint:</label>
          <input 
            v-model="settings.apiEndpoint" 
            placeholder="http://localhost:8080"
            @change="saveSettings"
            class="input"
          >
        </div>
        
        <div class="setting">
          <label class="setting-label">Default Max Depth:</label>
          <input 
            v-model="settings.maxDepth" 
            type="number" 
            min="1" 
            max="5"
            @change="saveSettings"
            class="input"
          >
        </div>

        <div class="setting">
          <label class="setting-label">Forget Rate (per year):</label>
          <input 
            v-model="settings.forgetRate" 
            type="number" 
            min="0" 
            max="1" 
            step="0.01"
            @change="saveSettings"
            class="input"
          >
        </div>

        <button @click="testConnection" class="test-btn">Test Connection</button>
        <div v-if="connectionTest" class="connection-result" :class="connectionTest.success ? 'success' : 'error'">
          {{ connectionTest.message }}
        </div>
      </div>
    </main>

    <!-- Record Experience Modal -->
    <div v-if="showRecordExperience" class="modal-overlay" @click="showRecordExperience = false">
      <div class="modal" @click.stop>
        <h3>Record Experience</h3>
        <div class="form-group">
          <label>Agent ID:</label>
          <input v-model="experienceForm.agentId" readonly class="input">
        </div>
        <div class="form-group">
          <label>Investment Amount ($):</label>
          <input v-model="experienceForm.investment" type="number" class="input">
        </div>
        <div class="form-group">
          <label>Return Value ($):</label>
          <input v-model="experienceForm.returnValue" type="number" class="input">
        </div>
        <div class="form-group">
          <label>Timeframe (days):</label>
          <input v-model="experienceForm.timeframeDays" type="number" class="input">
        </div>
        <div class="form-group">
          <label>Notes (optional):</label>
          <textarea v-model="experienceForm.notes" class="textarea"></textarea>
        </div>
        <div class="modal-actions">
          <button @click="recordExperience" class="record-btn">Record</button>
          <button @click="showRecordExperience = false" class="cancel-btn">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { TrustClient, defaultRegistry } from 'trust-client'

interface TrustScoreResult {
  agentId: string
  score: {
    expected_pv_roi: number
    total_volume: number
    data_points: number
  }
}

interface Peer {
  peer_id: string
  name: string
  recommender_quality: number
  added_at: string
}

const activeTab = ref('scores')
const searchQuery = ref('')
const currentScore = ref<TrustScoreResult | null>(null)
const recentScores = ref<TrustScoreResult[]>([])
const peers = ref<Peer[]>([])
const isConnected = ref(false)
const showRecordExperience = ref(false)

const newPeer = ref({
  peerId: '',
  name: '',
  quality: 0.5
})

const settings = ref({
  apiEndpoint: 'http://localhost:8080',
  maxDepth: 3,
  forgetRate: 0.0
})

const experienceForm = ref({
  agentId: '',
  investment: 0,
  returnValue: 0,
  timeframeDays: 1,
  notes: ''
})

const connectionTest = ref<{ success: boolean, message: string } | null>(null)

const tabs = [
  { id: 'scores', label: 'Trust Scores' },
  { id: 'peers', label: 'Peers' },
  { id: 'settings', label: 'Settings' }
]

let client: TrustClient

onMounted(async () => {
  await loadSettings()
  await loadPeers()
  await checkConnection()
})

const formatAgentId = (agentId: string) => {
  return defaultRegistry.displayName(agentId)
}

const formatPeerId = (peerId: string) => {
  return peerId.length > 20 ? `${peerId.slice(0, 8)}...${peerId.slice(-8)}` : peerId
}

const formatRoi = (roi: number) => {
  const percentage = ((roi - 1) * 100).toFixed(1)
  return `${percentage}%`
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString()
}

const formatVolume = (volume: number) => {
  if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`
  return volume.toFixed(0)
}

const roiClass = (roi: number) => {
  if (roi > 1.1) return 'positive'
  if (roi < 0.9) return 'negative'
  return 'neutral'
}

const searchTrustScore = async () => {
  if (!searchQuery.value.trim()) return

  try {
    // Try to parse the query as a URL first
    const parsed = defaultRegistry.parseUrl(searchQuery.value)
    const agentId = parsed ? parsed.trustId : searchQuery.value

    const score = await client.queryTrust(agentId, {
      max_depth: settings.value.maxDepth,
      forget_rate: settings.value.forgetRate
    })

    const result: TrustScoreResult = { agentId, score }
    currentScore.value = result
    
    // Add to recent scores
    const existingIndex = recentScores.value.findIndex(s => s.agentId === agentId)
    if (existingIndex >= 0) {
      recentScores.value.splice(existingIndex, 1)
    }
    recentScores.value.unshift(result)
    recentScores.value = recentScores.value.slice(0, 10) // Keep only 10 recent

    // Prepare record experience form
    experienceForm.value.agentId = agentId
  } catch (error) {
    console.error('Error searching trust score:', error)
  }
}

const addPeer = async () => {
  if (!newPeer.value.peerId || !newPeer.value.name) return

  try {
    const peer = await client.addPeer({
      peer_id: newPeer.value.peerId,
      name: newPeer.value.name,
      recommender_quality: newPeer.value.quality
    })

    peers.value.push(peer)
    newPeer.value = { peerId: '', name: '', quality: 0.5 }
  } catch (error) {
    console.error('Error adding peer:', error)
  }
}

const updatePeerQuality = async (peer: Peer) => {
  try {
    await client.updatePeerQuality(peer.peer_id, { quality: peer.recommender_quality })
  } catch (error) {
    console.error('Error updating peer quality:', error)
  }
}

const removePeer = async (peerId: string) => {
  if (!confirm('Are you sure you want to remove this peer?')) return
  
  try {
    await client.removePeer(peerId)
    peers.value = peers.value.filter(p => p.peer_id !== peerId)
  } catch (error) {
    console.error('Error removing peer:', error)
  }
}

const recordExperience = async () => {
  try {
    await client.addExperience({
      agent_id: experienceForm.value.agentId,
      investment: experienceForm.value.investment,
      return_value: experienceForm.value.returnValue,
      timeframe_days: experienceForm.value.timeframeDays,
      notes: experienceForm.value.notes || undefined
    })

    showRecordExperience.value = false
    // Refresh the current score
    if (currentScore.value) {
      await searchTrustScore()
    }
  } catch (error) {
    console.error('Error recording experience:', error)
  }
}

const loadSettings = async () => {
  try {
    const result = await chrome.storage.sync.get(['settings'])
    if (result.settings) {
      settings.value = { ...settings.value, ...result.settings }
    }
    client = new TrustClient(settings.value.apiEndpoint)
  } catch (error) {
    client = new TrustClient(settings.value.apiEndpoint)
  }
}

const saveSettings = async () => {
  try {
    await chrome.storage.sync.set({ settings: settings.value })
    client = new TrustClient(settings.value.apiEndpoint)
    await checkConnection()
  } catch (error) {
    console.error('Error saving settings:', error)
  }
}

const loadPeers = async () => {
  try {
    peers.value = await client.getPeers()
  } catch (error) {
    console.error('Error loading peers:', error)
  }
}

const checkConnection = async () => {
  try {
    isConnected.value = await client.health()
  } catch (error) {
    isConnected.value = false
  }
}

const testConnection = async () => {
  try {
    const healthy = await client.health()
    connectionTest.value = {
      success: healthy,
      message: healthy ? 'Connection successful!' : 'Connection failed'
    }
  } catch (error) {
    connectionTest.value = {
      success: false,
      message: `Connection failed: ${error}`
    }
  }
}
</script>

<style scoped>
.popup-container {
  padding: 0;
  background: #fff;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px;
  text-align: center;
}

.title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
}

.status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.connected .status-dot {
  background: #4ade80;
}

.disconnected .status-dot {
  background: #f87171;
}

.tabs {
  display: flex;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.tab {
  flex: 1;
  padding: 12px;
  border: none;
  background: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.tab:hover {
  background: #e2e8f0;
}

.tab.active {
  background: white;
  border-bottom: 2px solid #667eea;
}

.content {
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
}

.search-box {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.search-btn {
  padding: 8px 16px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.score-display {
  background: #f8fafc;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.trust-score {
  display: grid;
  gap: 8px;
  margin: 12px 0;
}

.trust-score > div {
  display: flex;
  justify-content: space-between;
}

.label {
  font-weight: 500;
  color: #6b7280;
}

.value {
  font-weight: 600;
}

.value.positive {
  color: #059669;
}

.value.negative {
  color: #dc2626;
}

.value.neutral {
  color: #6b7280;
}

.record-btn {
  width: 100%;
  padding: 10px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.recent-scores {
  margin-top: 16px;
}

.recent-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 6px;
  margin-bottom: 4px;
  cursor: pointer;
}

.recent-item:hover {
  background: #e2e8f0;
}

.add-peer {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}

.input {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.add-btn {
  padding: 10px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.peers-list {
  display: grid;
  gap: 12px;
}

.peer-item {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px;
}

.peer-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.peer-name {
  font-weight: 600;
}

.peer-id {
  font-size: 12px;
  color: #6b7280;
  font-family: monospace;
}

.peer-added {
  font-size: 11px;
  color: #9ca3af;
}

.peer-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.peer-quality {
  display: flex;
  align-items: center;
  gap: 8px;
}

.remove-btn {
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-btn:hover {
  background: #dc2626;
}

.quality-input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.setting {
  margin-bottom: 16px;
}

.setting-label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  color: #374151;
}

.test-btn {
  width: 100%;
  padding: 10px;
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.connection-result {
  margin-top: 8px;
  padding: 8px;
  border-radius: 4px;
  text-align: center;
}

.connection-result.success {
  background: #d1fae5;
  color: #065f46;
}

.connection-result.error {
  background: #fee2e2;
  color: #991b1b;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.textarea {
  width: 100%;
  min-height: 60px;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  resize: vertical;
}

.modal-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

.cancel-btn {
  flex: 1;
  padding: 10px;
  background: #6b7280;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>