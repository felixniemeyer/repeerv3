// Adapter permission system for experience creation

export interface AdapterPermission {
  adapterId: string;
  platform: string;
  allowed: boolean;
  alwaysAllow: boolean; // "always allow for this adapter + platform"
  createdAt: string;
}

export interface PermissionRequest {
  adapterId: string;
  platform: string;
  agentId: string;
  experienceData: any;
}

export class PermissionManager {
  private static STORAGE_KEY = 'repeer_adapter_permissions';

  static async getPermissions(): Promise<AdapterPermission[]> {
    const result = await chrome.storage.sync.get(this.STORAGE_KEY);
    return result[this.STORAGE_KEY] || [];
  }

  static async savePermissions(permissions: AdapterPermission[]): Promise<void> {
    await chrome.storage.sync.set({
      [this.STORAGE_KEY]: permissions
    });
  }

  static async hasPermission(adapterId: string, platform: string): Promise<boolean> {
    const permissions = await this.getPermissions();
    const permission = permissions.find(p => 
      p.adapterId === adapterId && 
      p.platform === platform
    );
    
    return permission?.allowed && permission?.alwaysAllow || false;
  }

  static async requestPermission(request: PermissionRequest): Promise<boolean> {
    // Check if already has permission
    if (await this.hasPermission(request.adapterId, request.platform)) {
      return true;
    }

    // Show permission dialog
    const granted = await this.showPermissionDialog(request);
    
    if (granted.allowed) {
      // Save permission if user chose "always allow"
      if (granted.alwaysAllow) {
        await this.grantPermission(request.adapterId, request.platform, true);
      }
      return true;
    }
    
    return false;
  }

  private static async showPermissionDialog(request: PermissionRequest): Promise<{allowed: boolean, alwaysAllow: boolean}> {
    return new Promise((resolve) => {
      // Create modal dialog
      const modal = this.createPermissionModal(request, resolve);
      document.body.appendChild(modal);
    });
  }

  private static createPermissionModal(
    request: PermissionRequest, 
    resolve: (result: {allowed: boolean, alwaysAllow: boolean}) => void
  ): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'repeer-permission-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 24px;
      max-width: 400px;
      margin: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #333;">
        🔒 Repeer Permission Request
      </h3>
      <p style="margin: 0 0 8px 0; color: #666; line-height: 1.4;">
        The <strong>${request.adapterId}</strong> adapter wants to create a trust experience for:
      </p>
      <div style="background: #f5f5f5; padding: 12px; border-radius: 4px; margin: 12px 0; font-family: monospace; font-size: 14px;">
        Platform: ${request.platform}<br>
        Agent: ${request.agentId}
      </div>
      <div style="margin: 16px 0;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="alwaysAllow">
          <span style="color: #666; font-size: 14px;">Always allow for this adapter + platform</span>
        </label>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;">
        <button id="deny" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">
          Deny
        </button>
        <button id="allow" style="padding: 8px 16px; border: none; background: #007cba; color: white; border-radius: 4px; cursor: pointer;">
          Allow
        </button>
      </div>
    `;

    const allowBtn = dialog.querySelector('#allow') as HTMLButtonElement;
    const denyBtn = dialog.querySelector('#deny') as HTMLButtonElement;
    const alwaysAllowCheck = dialog.querySelector('#alwaysAllow') as HTMLInputElement;

    allowBtn.onclick = () => {
      modal.remove();
      resolve({
        allowed: true,
        alwaysAllow: alwaysAllowCheck.checked
      });
    };

    denyBtn.onclick = () => {
      modal.remove();
      resolve({
        allowed: false,
        alwaysAllow: false
      });
    };

    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve({
          allowed: false,
          alwaysAllow: false
        });
      }
    };

    modal.appendChild(dialog);
    return modal;
  }

  static async grantPermission(adapterId: string, platform: string, alwaysAllow: boolean): Promise<void> {
    const permissions = await this.getPermissions();
    const existing = permissions.findIndex(p => 
      p.adapterId === adapterId && p.platform === platform
    );

    const permission: AdapterPermission = {
      adapterId,
      platform,
      allowed: true,
      alwaysAllow,
      createdAt: new Date().toISOString()
    };

    if (existing >= 0) {
      permissions[existing] = permission;
    } else {
      permissions.push(permission);
    }

    await this.savePermissions(permissions);
  }

  static async revokePermission(adapterId: string, platform: string): Promise<void> {
    const permissions = await this.getPermissions();
    const filtered = permissions.filter(p => 
      !(p.adapterId === adapterId && p.platform === platform)
    );
    await this.savePermissions(filtered);
  }
}