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