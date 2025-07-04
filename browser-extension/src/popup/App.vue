<template>
  <div class="popup-container">
    <header class="header">
      <div class="header-content">
        <h1 class="title">Repeer Trust Network</h1>
      </div>
      <div class="status" :class="connectionState">
        <span class="status-dot"></span>
        <div class="status-info">
          <div class="status-text">{{ statusText }}</div>
          <div class="status-endpoint">{{ endpointDisplay }}</div>
        </div>
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

      <!-- Contact Tab -->
      <div v-if="activeTab === 'contact'" class="tab-content">
        <div class="contact-section">
          <h3 class="setting-title">Your Peer ID</h3>
          <p class="setting-description">
            Share this ID with others so they can add you as a trusted peer.
          </p>
          
          <div v-if="!peerInfo.id" class="loading-state">
            Loading peer information...
          </div>
          
          <div v-else class="peer-id-section">
            <div class="peer-id-display">
              <label class="setting-label">Peer ID:</label>
              <div class="peer-id-container">
                <input 
                  :value="peerInfo.id" 
                  readonly 
                  class="peer-id-input"
                  @click="copyToClipboard(peerInfo.id)"
                >
                <button @click="copyToClipboard(peerInfo.id)" class="copy-btn" title="Copy to clipboard">
                  📋
                </button>
              </div>
            </div>
            
            <div class="multiaddr-display">
              <label class="setting-label">Connection Address:</label>
              <div class="peer-id-container">
                <input 
                  :value="peerInfo.multiaddr" 
                  readonly 
                  class="peer-id-input"
                  @click="copyToClipboard(peerInfo.multiaddr)"
                >
                <button @click="copyToClipboard(peerInfo.multiaddr)" class="copy-btn" title="Copy to clipboard">
                  📋
                </button>
              </div>
            </div>
            
            <div class="qr-section">
              <h4 class="setting-label">QR Code</h4>
              <div class="qr-container">
                <canvas ref="qrCanvas" class="qr-canvas"></canvas>
              </div>
              <p class="qr-description">
                Others can scan this QR code to add you as a peer.
              </p>
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
            @change="testConnection"
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

        <div class="setting">
          <h3 class="setting-title">Adapter Permissions</h3>
          <p class="setting-description">
            Control which adapters can automatically create trust experiences on your behalf.
          </p>
          
          <div v-if="permissions.length === 0" class="empty-state">
            No adapter permissions configured yet.
          </div>
          
          <div v-for="permission in permissions" :key="`${permission.adapterId}-${permission.platform}`" class="permission-item">
            <div class="permission-info">
              <strong>{{ permission.adapterId }}</strong> on {{ permission.platform }}
              <div class="permission-status">
                <span v-if="permission.alwaysAllow" class="status-badge allowed">Always Allow</span>
                <span v-else class="status-badge denied">Prompt</span>
                <span class="permission-date">Added {{ formatDate(permission.createdAt) }}</span>
              </div>
            </div>
            <button @click="revokePermission(permission.adapterId, permission.platform)" class="revoke-btn">
              Revoke
            </button>
          </div>
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
import { ref, onMounted, computed } from 'vue'
import { TrustClient } from 'trust-client'

// Simple adapter registry for popup (inline to avoid import issues)
const popupRegistry = {
  parseUrl(url: string): { trustId: string } | null {
    // Simple Ethereum address pattern matching
    const ethPattern = /0x[a-fA-F0-9]{40}/;
    const match = url.match(ethPattern);
    if (match) {
      return { trustId: `ethereum:${match[0].toLowerCase()}` };
    }
    
    // If input looks like a trust ID, use as-is
    if (url.includes(':')) {
      return { trustId: url };
    }
    
    return null;
  },
  
  displayName(trustId: string): string {
    if (trustId.startsWith('ethereum:')) {
      const address = trustId.replace('ethereum:', '');
      if (address.length === 42) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
      }
    }
    return trustId;
  }
}
import { PermissionManager, type AdapterPermission } from '../permissions'

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

type ConnectionState = 'connected' | 'connecting' | 'failed'

const permissions = ref<AdapterPermission[]>([])
const connectionState = ref<ConnectionState>('failed')
const testedEndpoint = ref('')

const peerInfo = ref({
  id: '',
  multiaddr: ''
})

const qrCanvas = ref<HTMLCanvasElement | null>(null)

const tabs = [
  { id: 'scores', label: 'Trust Scores' },
  { id: 'peers', label: 'Peers' },
  { id: 'contact', label: 'Contact' },
  { id: 'settings', label: 'Settings' }
]

let client: TrustClient

onMounted(async () => {
  await loadSettings()
  await loadPeers()
  await loadPermissions()
  await loadPeerInfo()
  await checkConnection()
})

const formatAgentId = (agentId: string) => {
  return popupRegistry.displayName(agentId)
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
    const parsed = popupRegistry.parseUrl(searchQuery.value)
    const agentId = parsed ? parsed.trustId : searchQuery.value

    // Parse agent ID - expect format "domain:id"
    const colonIndex = agentId.indexOf(':');
    const [idDomain, agentIdPart] = colonIndex > -1 
      ? [agentId.substring(0, colonIndex), agentId.substring(colonIndex + 1)]
      : ['ethereum', agentId] // Default to ethereum if no domain specified
    
    const score = await client.queryTrust(idDomain, agentIdPart, {
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
    connectionState.value = 'failed'
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
    connectionState.value = 'failed'
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
    // Parse agent ID - expect format "domain:id"
    const colonIndex = experienceForm.value.agentId.indexOf(':');
    const [idDomain, agentIdPart] = colonIndex > -1 
      ? [experienceForm.value.agentId.substring(0, colonIndex), experienceForm.value.agentId.substring(colonIndex + 1)]
      : ['ethereum', experienceForm.value.agentId] // Default to ethereum if no domain specified
    
    await client.addExperience({
      id_domain: idDomain,
      agent_id: agentIdPart,
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

const testConnection = async () => {
  // Validate URL format first
  try {
    new URL(settings.value.apiEndpoint)
  } catch (urlError) {
    console.error('Invalid URL format:', urlError)
    testedEndpoint.value = settings.value.apiEndpoint
    connectionState.value = 'failed'
    return
  }
  
  // Store the endpoint we're about to test
  testedEndpoint.value = settings.value.apiEndpoint
  
  // Set connecting state immediately
  connectionState.value = 'connecting'
  
  // Clear previous node state when switching nodes
  peers.value = []
  peerInfo.value = { id: '', multiaddr: '' }
  currentScore.value = null
  recentScores.value = []
  
  try {
    // Test the new endpoint
    client = new TrustClient(settings.value.apiEndpoint)
    const isHealthy = await client.health()
    
    if (isHealthy) {
      // Save successful connection
      await chrome.storage.sync.set({ settings: settings.value })
      connectionState.value = 'connected'
      
      // Reload data from the new node
      await loadPeers()
      await loadPeerInfo()
    } else {
      connectionState.value = 'failed'
    }
  } catch (error) {
    console.error('Connection failed:', error)
    connectionState.value = 'failed'
  }
}

const saveSettings = async () => {
  // Just save other settings (non-endpoint changes)
  try {
    await chrome.storage.sync.set({ settings: settings.value })
  } catch (error) {
    console.error('Error saving settings:', error)
  }
}

const loadPeers = async () => {
  try {
    peers.value = await client.getPeers()
  } catch (error) {
    console.error('Error loading peers:', error)
    connectionState.value = 'failed'
  }
}

const loadPermissions = async () => {
  try {
    permissions.value = await PermissionManager.getPermissions()
  } catch (error) {
    console.error('Error loading permissions:', error)
  }
}

const revokePermission = async (adapterId: string, platform: string) => {
  try {
    await PermissionManager.revokePermission(adapterId, platform)
    await loadPermissions() // Reload permissions
  } catch (error) {
    console.error('Error revoking permission:', error)
  }
}

const checkConnection = async () => {
  testedEndpoint.value = settings.value.apiEndpoint
  try {
    const healthy = await client.health()
    connectionState.value = healthy ? 'connected' : 'failed'
  } catch (error) {
    connectionState.value = 'failed'
  }
}

const loadPeerInfo = async () => {
  try {
    // Fetch self peer ID from the trust node
    const response = await fetch(`${settings.value.apiEndpoint}/peers/self`)
    if (response.ok) {
      const data = await response.json()
      peerInfo.value.id = data.peer_id
      peerInfo.value.multiaddr = data.multiaddr || `${data.peer_id}`
      
      // Generate QR code when peer info is loaded
      await generateQRCode()
    }
  } catch (error) {
    console.error('Error loading peer info:', error)
  }
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    // Could add a toast notification here
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
  }
}

const generateQRCode = async () => {
  // Simple QR code generation without external libraries
  // For a production app, you'd use a proper QR code library
  if (!qrCanvas.value || !peerInfo.value.id) return
  
  const canvas = qrCanvas.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  // Set canvas size
  canvas.width = 200
  canvas.height = 200
  
  // Simple placeholder - in a real implementation, use a QR code library
  ctx.fillStyle = '#f0f0f0'
  ctx.fillRect(0, 0, 200, 200)
  
  ctx.fillStyle = '#333'
  ctx.font = '10px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('QR Code', 100, 30)
  ctx.fillText('(placeholder)', 100, 45)
  
  // Draw a simple grid pattern to represent QR code
  ctx.fillStyle = '#000'
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 15; j++) {
      if ((i + j) % 3 === 0) {
        ctx.fillRect(20 + i * 10, 60 + j * 10, 8, 8)
      }
    }
  }
  
  ctx.fillStyle = '#666'
  ctx.font = '8px monospace'
  ctx.fillText('Scan to add peer', 100, 185)
}


const statusText = computed(() => {
  switch (connectionState.value) {
    case 'connecting': return 'Connecting...'
    case 'connected': return 'Connected'
    case 'failed': return 'Disconnected'
  }
})

const endpointDisplay = computed(() => {
  // Show the endpoint that was actually tested
  if (!testedEndpoint.value) return ''
  try {
    const url = new URL(testedEndpoint.value)
    return `${url.hostname}:${url.port}`
  } catch {
    return 'Invalid URL'
  }
})

</script>

<style scoped>
.popup-container {
  padding: 0;
  background: #fff;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem;
  text-align: center;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.logo {
  color: white;
  flex-shrink: 0;
}

.title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  font-size: 0.75rem;
}

.status-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
}

.status-text {
  font-weight: 500;
}

.status-endpoint {
  font-size: 0.625rem;
  opacity: 0.8;
  font-family: monospace;
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.connected .status-dot {
  background: #4ade80;
}

.failed .status-dot {
  background: #f87171;
}

.connecting .status-dot {
  background: #f59e0b;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.tabs {
  display: flex;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.tab {
  flex: 1;
  padding: 0.75rem;
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
  padding: 1rem;
  max-height: 25rem;
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

/* Permissions UI */
.setting-title {
  margin: 16px 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.setting-description {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #6b7280;
  line-height: 1.4;
}

.permission-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 8px;
}

.permission-info {
  flex: 1;
}

.permission-status {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.allowed {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.denied {
  background: #fee2e2;
  color: #991b1b;
}

.permission-date {
  font-size: 12px;
  color: #9ca3af;
}

.revoke-btn {
  padding: 6px 12px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.revoke-btn:hover {
  background: #dc2626;
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: #6b7280;
  font-style: italic;
}

/* Contact Tab Styles */
.contact-section {
  padding: 0;
}

.peer-id-section {
  margin-top: 16px;
}

.peer-id-display,
.multiaddr-display {
  margin-bottom: 16px;
}

.peer-id-container {
  display: flex;
  gap: 8px;
  align-items: center;
}

.peer-id-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  background: #f9fafb;
  cursor: pointer;
}

.peer-id-input:hover {
  background: #f3f4f6;
}

.copy-btn {
  padding: 8px 12px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  min-width: 40px;
}

.copy-btn:hover {
  background: #5a67d8;
}

.qr-section {
  margin-top: 24px;
  text-align: center;
}

.qr-container {
  margin: 12px 0;
  display: flex;
  justify-content: center;
}

.qr-canvas {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
}

.qr-description {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: #6b7280;
}

.loading-state {
  padding: 40px 20px;
  text-align: center;
  color: #6b7280;
  font-style: italic;
}
</style>