export interface TrustExperience {
  id: string;
  agent_id: string;
  pv_roi: number;
  invested_volume: number;
  timestamp: string;
  notes?: string;
}

export interface TrustScore {
  expected_pv_roi: number;
  total_volume: number;
  data_points: number;
}

export interface Peer {
  peer_id: string;
  name: string;
  recommender_quality: number;
  added_at: string;
}

export interface TrustQuery {
  agent_ids: string[];
  max_depth: number;
  point_in_time?: string;
  forget_rate?: number;
}

export interface TrustResponse {
  scores: [string, TrustScore][];
  timestamp: string;
}

export interface AddExperienceRequest {
  agent_id: string;
  investment: number;
  return_value: number;
  timeframe_days: number;
  discount_rate?: number;
  notes?: string;
}

export interface AddPeerRequest {
  peer_id: string;
  name: string;
  recommender_quality?: number;
}

export interface UpdateQualityRequest {
  quality: number;
}

export interface TrustQueryParams {
  max_depth?: number;
  forget_rate?: number;
}

export interface IDAdapter {
  name: string;
  parseId(url: string): string;
  validateId(id: string): boolean;
  displayName(id: string): string;
}