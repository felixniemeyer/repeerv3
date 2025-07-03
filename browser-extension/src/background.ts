// Background service worker for Repeer extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('Repeer Trust Network extension installed');
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_TRUST_SCORE') {
    // Forward trust score requests to the local trust node
    handleTrustScoreRequest(message.idDomain, message.agentId)
      .then(score => sendResponse({ success: true, score }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true; // Keep message channel open for async response
  }
  
  if (message.type === 'GET_TRUST_SCORES_BATCH') {
    // Handle batch trust score requests from modern adapter system
    handleBatchTrustScoreRequest(message.agentIds)
      .then(scores => sendResponse({ success: true, scores }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true; // Keep message channel open for async response
  }
  
  if (message.type === 'RECORD_EXPERIENCE') {
    // Handle experience recording
    handleRecordExperience(message.experience)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  }
  
  if (message.type === 'OPEN_EXPERIENCE_PAGE') {
    // Handle opening experience recording page
    handleOpenExperiencePage(message.url, message.agentId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  }

  if (message.type === 'ENTER_EXPERIENCE') {
    // Handle adapter-suggested experience entry
    handleEnterExperience(message.idDomain, message.agentId, message.pvRoi, message.volume, message.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  }

  if (message.type === 'SHOW_AGENT_DETAILS') {
    // Handle showing agent details page
    handleShowAgentDetails(message.idDomain, message.agentId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  }

  if (message.type === 'GET_EXPERIENCES') {
    // Handle getting experiences for an agent
    handleGetExperiences(message.idDomain, message.agentId)
      .then(experiences => sendResponse({ success: true, experiences }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  }
});

async function handleTrustScoreRequest(idDomain: string, agentId: string) {
  try {
    // Get the API endpoint from storage
    const result = await chrome.storage.sync.get(['apiEndpoint']);
    const apiEndpoint = result.apiEndpoint || 'http://localhost:8080';
    
    const url = `${apiEndpoint}/trust/${idDomain}/${agentId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch trust score:', error);
    throw error;
  }
}

async function handleBatchTrustScoreRequest(agentIds: string[]) {
  try {
    // Get the API endpoint from storage
    const result = await chrome.storage.sync.get(['apiEndpoint']);
    const apiEndpoint = result.apiEndpoint || 'http://localhost:8080';
    
    // Create batch request
    const scores: Record<string, any> = {};
    
    // Fetch each score (in a real implementation, this could be optimized with a batch API)
    const promises = agentIds.map(async (agentId) => {
      try {
        // Parse agent ID into domain and ID parts
        const colonIndex = agentId.indexOf(':');
        const [idDomain, agentIdPart] = colonIndex > -1 
          ? [agentId.substring(0, colonIndex), agentId.substring(colonIndex + 1)]
          : ['ethereum', agentId]; // Default to ethereum if no domain specified
        
        const response = await fetch(`${apiEndpoint}/trust/${idDomain}/${agentIdPart}`);
        if (response.ok) {
          scores[agentId] = await response.json();
        }
      } catch (error) {
        console.error(`Failed to fetch trust score for ${agentId}:`, error);
      }
    });
    
    await Promise.all(promises);
    return scores;
  } catch (error) {
    console.error('Failed to fetch batch trust scores:', error);
    throw error;
  }
}

async function handleRecordExperience(experience: any) {
  try {
    const result = await chrome.storage.sync.get(['apiEndpoint']);
    const apiEndpoint = result.apiEndpoint || 'http://localhost:8080';
    
    const response = await fetch(`${apiEndpoint}/experiences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(experience),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to record experience:', error);
    throw error;
  }
}

async function handleOpenExperiencePage(url: string, agentId: string) {
  try {
    // Open a new popup window for experience recording
    const window = await chrome.windows.create({
      url: url,
      type: 'popup',
      width: 450,
      height: 600,
      focused: true
    });
    
    console.log(`Opened experience recording window for agent: ${agentId}`);
    return window;
  } catch (error) {
    console.error('Failed to open experience page:', error);
    throw error;
  }
}

async function handleEnterExperience(idDomain: string, agentId: string, pvRoi: number, volume: number, data?: any) {
  try {
    // Open the experience review page with pre-filled data
    const reviewUrl = chrome.runtime.getURL('experience-review/index.html');
    const params = new URLSearchParams({
      idDomain,
      agentId,
      pvRoi: pvRoi.toString(),
      volume: volume.toString(),
      data: data ? JSON.stringify(data) : ''
    });
    
    const window = await chrome.windows.create({
      url: `${reviewUrl}?${params.toString()}`,
      type: 'popup',
      width: 500,
      height: 650,
      focused: true
    });
    
    console.log(`Opened experience review window for agent: ${idDomain}:${agentId}`);
    return window;
  } catch (error) {
    console.error('Failed to open experience review page:', error);
    throw error;
  }
}

async function handleShowAgentDetails(idDomain: string, agentId: string) {
  try {
    // Open the agent details page
    const detailsUrl = chrome.runtime.getURL('agent-details/index.html');
    const params = new URLSearchParams({
      idDomain,
      agentId
    });
    
    const window = await chrome.windows.create({
      url: `${detailsUrl}?${params.toString()}`,
      type: 'popup',
      width: 600,
      height: 800,
      focused: true
    });
    
    console.log(`Opened agent details window for agent: ${idDomain}:${agentId}`);
    return window;
  } catch (error) {
    console.error('Failed to open agent details page:', error);
    throw error;
  }
}

async function handleGetExperiences(idDomain: string, agentId: string) {
  try {
    const result = await chrome.storage.sync.get(['apiEndpoint']);
    const apiEndpoint = result.apiEndpoint || 'http://localhost:8080';
    
    const response = await fetch(`${apiEndpoint}/experiences/${idDomain}/${agentId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch experiences:', error);
    throw error;
  }
}

// Set up context menu for recording experiences (if available)
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.contextMenus) {
    try {
      chrome.contextMenus.create({
        id: 'record-experience',
        title: 'Record Trust Experience',
        contexts: ['page', 'link'],
      });
    } catch (error) {
      console.log('Context menus not available:', error);
    }
  }
});

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'record-experience' && tab?.id) {
      // Send message to content script to show experience recording UI
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_RECORD_UI',
        url: info.pageUrl || info.linkUrl,
      });
    }
  });
}