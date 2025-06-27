// Background service worker for Repeer extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('Repeer Trust Network extension installed');
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_TRUST_SCORE') {
    // Forward trust score requests to the local trust node
    handleTrustScoreRequest(message.agentId)
      .then(score => sendResponse({ success: true, score }))
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
});

async function handleTrustScoreRequest(agentId: string) {
  try {
    // Get the API endpoint from storage
    const result = await chrome.storage.sync.get(['apiEndpoint']);
    const apiEndpoint = result.apiEndpoint || 'http://localhost:8080';
    
    const response = await fetch(`${apiEndpoint}/trust/${agentId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch trust score:', error);
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

// Set up context menu for recording experiences
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'record-experience',
    title: 'Record Trust Experience',
    contexts: ['page', 'link'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'record-experience' && tab?.id) {
    // Send message to content script to show experience recording UI
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_RECORD_UI',
      url: info.pageUrl || info.linkUrl,
    });
  }
});