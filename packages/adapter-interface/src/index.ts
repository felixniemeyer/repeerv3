// Trust score data structure
export interface TrustScore {
  expected_pv_roi: number;
  total_volume: number;
  data_points: number;
}

// Agent discovery result
export interface AgentDiscovery {
  agentId: string;
  element: Element;
  context?: string;
}

// Experience data for creation
export interface ExperienceData {
  agent_id: string;
  investment: number;
  return_value: number;
  timeframe_days: number;
  notes?: string;
  data?: any;
}

// ID Domain interface (imported by adapters)
export interface IDDomain {
  name: string;
  parseId(text: string): string | null;
  validateId(id: string): boolean;
  displayName(id: string): string;
  formatTrustId(id: string): string;
}

// Main website adapter interface
export interface WebsiteAdapter {
  // Metadata
  name: string;                    // Unique adapter identifier
  displayName: string;             // Human-readable name
  domains: string[];               // Domains this adapter handles
  idDomains: IDDomain[];          // ID types this adapter uses
  
  // Core methods
  scanPage(): Promise<AgentDiscovery[]>;
  injectTrustScores(scores: Map<string, TrustScore>): void;
  createExperiencePrompt(agentId: string): Promise<ExperienceData | null>;
  
  // Lifecycle hooks (optional)
  onPageLoad?(): void;
  onPageChange?(): void;
  cleanup?(): void;
  
  // Configuration (optional)
  isEnabled?(): boolean;
  getSettings?(): Record<string, any>;
}

// Adapter factory function type
export type AdapterFactory = () => WebsiteAdapter;

// Experience tracking for follow-up prompts
export interface ExperienceTracking {
  agentId: string;
  startTime: Date;
  interactionCount: number;
  lastPromptTime?: Date;
}

// Adapter permission request
export interface PermissionRequest {
  adapterId: string;
  adapterName: string;
  platform: string;
  action: string;
  details?: string;
}

// Shared utility functions for all adapters

/**
 * Calculate trust score color using the standardized Repeer color formula.
 * 
 * Formula: Linear interpolation from RGB(255, x, 255) for ROI = 0 to RGB(x, 255, 255) for ROI = 2,
 * where x = 255 / (1 + 0.001 * volume).
 * 
 * The visual encoding provides at-a-glance understanding:
 * - Color indicates performance: Magenta = loss, Purple = break-even, Cyan = profit
 * - Green/Red intensity indicates confidence: Lower values = higher volume = more reliable data
 * 
 * @param roi - Return on Investment (expected_pv_roi from TrustScore)
 * @param volume - Total volume (total_volume from TrustScore)
 * @returns Hex color string (e.g., "#ff80ff")
 */
export function calculateTrustColor(roi: number, volume: number): string {
  // Calculate x = 255 / (1 + 0.001 * volume)
  const x = Math.round(255 / (1 + 0.001 * volume));
  
  // Clamp ROI to 0-2 range for interpolation
  const clampedROI = Math.max(0, Math.min(2, roi));
  
  // Normalize ROI to 0-1 range for interpolation
  const t = clampedROI / 2;
  
  // Linear interpolation from RGB(255, x, 255) to RGB(x, 255, 255)
  const red = Math.round(255 * (1 - t) + x * t);
  const green = Math.round(x * (1 - t) + 255 * t);
  const blue = 255; // Always 255
  
  // Convert to hex
  const redHex = red.toString(16).padStart(2, '0');
  const greenHex = green.toString(16).padStart(2, '0');
  const blueHex = blue.toString(16).padStart(2, '0');
  
  return `#${redHex}${greenHex}${blueHex}`;
}

/**
 * Darken a hex color by a given percentage.
 * Useful for creating border colors or hover effects.
 * 
 * @param hex - Hex color string (e.g., "#ff80ff")
 * @param percent - Percentage to darken (0-100)
 * @returns Darkened hex color string
 */
export function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) - amt;
  const G = (num >> 8 & 0x00FF) - amt;
  const B = (num & 0x0000FF) - amt;
  
  return `#${(0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1)}`;
}

/**
 * Format volume numbers for display.
 * Converts large numbers to K/M notation.
 * 
 * @param volume - Volume number to format
 * @returns Formatted string (e.g., "1.5K", "2.3M")
 */
export function formatVolume(volume: number): string {
  if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
  return volume.toFixed(0);
}