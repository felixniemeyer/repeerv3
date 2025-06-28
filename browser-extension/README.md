# Repeer Browser Extension

A browser extension that displays decentralized trust scores on supported websites.

## Building

### For Chrome/Chromium browsers:
```bash
npm run build
```

### For Firefox:
```bash
npm run build:firefox
```

The Firefox build uses a modified manifest that replaces `service_worker` with `scripts` in the background configuration, as Firefox doesn't support service workers in Manifest V3 yet.

## Installing

### Chrome/Edge/Brave:
1. Open browser extensions page (chrome://extensions)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

### Firefox:
1. Build with `npm run build:firefox`
2. Open about:debugging
3. Click "This Firefox"
4. Click "Load Temporary Add-on"
5. Select any file in the `dist` folder

## Features

- Display trust scores on Etherscan addresses
- Show ratings on AliExpress products
- Peer-to-peer trust network integration
- Experience recording interface
- Peer management
- Adapter permission system for security

## Security: Adapter Permissions

To prevent malicious adapters from automatically creating fake trust experiences, the extension includes a permission system:

### How it works:
1. When an adapter wants to automatically create an experience, it must request permission
2. The user sees a dialog asking to allow or deny the request  
3. Users can choose "Always allow for this adapter + platform" to avoid future prompts
4. Permissions can be managed and revoked in Settings → Adapter Permissions

### Permission Dialog:
The dialog shows:
- Which adapter is requesting permission
- What platform/website it's for
- What agent/entity the experience would be created for
- Option to always allow this combination

### Managing Permissions:
In the extension popup → Settings tab → Adapter Permissions:
- View all granted permissions
- See which are set to "Always Allow" vs "Prompt"
- Revoke permissions individually
- See when each permission was granted

This ensures users maintain full control over their trust data while allowing legitimate adapters to automate experience recording when desired.