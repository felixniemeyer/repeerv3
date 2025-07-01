# Etherscan Adapter Implementation Plan

## Overview
Implement a complete Etherscan integration that shows trust score indicators for all Ethereum addresses and provides an adapter-specific UI for recording and viewing trust experiences.

## Current State
- ✅ Basic Etherscan adapter exists in `/browser-extension/src/adapters/registry.ts`
- ✅ Trust indicators show for addresses with data
- ✅ Extension experience page created at `/browser-extension/src/experience/`
- ⚠️ Indicators don't show for addresses without data
- ⚠️ Click handler opens extension page but UI is generic, not adapter-specific

## Visual Design

### Trust Indicators on Etherscan
Every Ethereum address on Etherscan pages will show a small circular indicator:

```
[0x1234...5678] • ← Trust indicator
```

- **With trust data**: Colored circle based on ROI/volume (using `calculateTrustColor()`)
- **Without trust data**: White circle with black border and "?" symbol
- **On hover**: Tooltip showing trust score or "No trust data" message
- **On click**: Opens extension page with adapter-specific UI

### Extension Page UI (Adapter-Specific)

```
┌─────────────────────────────────────┐
│ Repeer Trust - Ethereum Address     │
├─────────────────────────────────────┤
│ [Overview] [Details] [Experiences]  │ ← Tabs
├─────────────────────────────────────┤
│                                     │
│ Address: 0x1234567890...67890      │
│ ─────────────────────────────────── │
│                                     │
│ 📝 Record New Experience            │
│ ┌─────────────────────────────────┐ │
│ │ Investment: [$______] USD       │ │
│ │ Return:     [$______] USD       │ │
│ │ Timeframe:  [___] days          │ │
│ │ Notes:      [__________________]│ │
│ │            [__________________]│ │
│ │ [Cancel] [Record Experience]   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 📊 Your Experiences                 │
│ ┌─────────────────────────────────┐ │
│ │ • 2024-12-15: $1000 → $1200    │ │
│ │   ROI: 1.2 (20% gain)          │ │
│ │   "Great DeFi protocol"        │ │
│ │                                │ │
│ │ • 2024-11-20: $500 → $450      │ │
│ │   ROI: 0.9 (10% loss)         │ │
│ │   "Gas fees too high"         │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Implementation Steps

### 1. Update Etherscan Adapter (registry.ts)
- ✅ Already shows indicators for all addresses (with or without data)
- ✅ White + "?" for addresses without trust data
- ✅ Click handler sends message to open extension page
- ⚠️ Need to pass more context (adapter type, tab to open)

### 2. Enhance Experience Page Structure
Create tab-based UI in `/browser-extension/src/experience/`:

**Files to modify/create:**
- `ExperienceApp.vue` - Main component with tab navigation
- `EthereumDetails.vue` - Ethereum-specific details tab
- `ExperienceList.vue` - Component to show user's experiences
- `ExperienceForm.vue` - Reusable form component

### 3. Tab Components

#### Overview Tab
- Summary of trust score (if available)
- Quick stats: Total volume, average ROI, number of experiences
- Visual trust indicator (large version)

#### Details Tab (Default when clicking trust indicator)
- Full Ethereum address (copyable)
- ENS name resolution (if available)
- Etherscan links (transactions, token holdings)
- **Experience recording form** (prominent placement)
- List of user's experiences with this address

#### Experiences Tab
- Detailed list of all experiences
- Sortable by date, ROI, volume
- Edit/delete functionality
- Export options

### 4. Message Flow
1. User clicks trust indicator on Etherscan
2. Content script sends `OPEN_EXPERIENCE_PAGE` message with:
   ```javascript
   {
     type: 'OPEN_EXPERIENCE_PAGE',
     url: chrome.runtime.getURL(`src/experience/index.html?${params}`),
     context: {
       agentId: 'ethereum:0x123...',
       adapter: 'etherscan',
       tab: 'details',  // Open details tab by default
       address: '0x123...',
       currentScore: { ... } // If available
     }
   }
   ```
3. Background script opens extension page
4. Experience page reads URL params and shows appropriate UI

### 5. API Integration
The experience page needs to:
- Fetch user's experiences for this address: `GET /experiences/{agentId}`
- Submit new experiences: `POST /experiences`
- Get current trust score: `GET /trust/{agentId}`

### 6. State Management
Use Vue 3's reactive state for:
- Current address info
- List of experiences
- Form state
- Active tab
- Loading/error states

### 7. Error Handling
- Invalid addresses
- Network errors
- No connection to trust node
- Form validation errors

## Code Changes Summary

### 1. Update registry.ts
```typescript
private openExperienceRecording(agentId: string): void {
  const address = agentId.replace('ethereum:', '');
  const params = new URLSearchParams({
    agent: agentId,
    type: 'ethereum',
    adapter: 'etherscan',
    address: address,
    tab: 'details'  // Open details tab by default
  });
  
  const url = chrome.runtime.getURL(`src/experience/index.html?${params}`);
  
  chrome.runtime.sendMessage({
    type: 'OPEN_EXPERIENCE_PAGE',
    url: url,
    agentId: agentId,
    context: {
      adapter: 'etherscan',
      tab: 'details'
    }
  });
}
```

### 2. Create tabbed UI components
- Implement Vue components with proper TypeScript types
- Use Vue 3 Composition API for reactive state
- Style with CSS that matches extension design

### 3. Handle deep linking
- Parse URL params to determine initial tab
- Support direct links to specific tabs
- Maintain tab state in URL for refresh

## Testing Plan

1. **Unit tests**: Component logic, form validation
2. **Integration tests**: API calls, state management
3. **E2E tests**: Full flow from Etherscan click to experience submission
4. **Manual testing**:
   - Various Etherscan pages (address, transaction, token pages)
   - Different address formats (checksummed, ENS names)
   - Error scenarios (offline node, invalid data)

## Future Enhancements

1. **Batch operations**: Record multiple experiences at once
2. **Import from Etherscan**: Parse transaction history
3. **ENS integration**: Resolve and display ENS names
4. **Address labeling**: Custom labels for known addresses
5. **Experience templates**: Quick-fill common scenarios
6. **Charts/graphs**: Visualize ROI over time

## Success Criteria

1. ✅ Every Ethereum address on Etherscan shows a trust indicator
2. ✅ Clicking indicator opens adapter-specific UI with tabs
3. ✅ Details tab is default, shows form + experience list
4. ✅ Can record new experiences from the extension page
5. ✅ Can view/manage existing experiences
6. ✅ UI is intuitive and matches Ethereum/DeFi aesthetic
7. ✅ Works on all Etherscan pages (mainnet, testnets)
8. ✅ Graceful handling of errors and edge cases

## Federation Testing

After implementation:
1. Connect to Alice node (port 8080)
2. Add experience for address 0x1234...
3. Switch to Bob node (port 8081)
4. See combined trust score (Alice's + Bob's experiences weighted by recommender quality)
5. Verify caching works when peers go offline

This plan provides a complete, adapter-specific experience for Ethereum addresses on Etherscan while maintaining the flexibility to add similar adapters for other platforms.