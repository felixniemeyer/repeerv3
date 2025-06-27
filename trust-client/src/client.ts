import axios, { AxiosInstance } from 'axios';
import {
  TrustExperience,
  TrustScore,
  Peer,
  TrustQuery,
  TrustResponse,
  AddExperienceRequest,
  AddPeerRequest,
  UpdateQualityRequest,
  TrustQueryParams,
} from './types';

export class TrustClient {
  private client: AxiosInstance;

  constructor(baseURL: string = 'http://localhost:8080') {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async health(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async addExperience(request: AddExperienceRequest): Promise<TrustExperience> {
    const response = await this.client.post<TrustExperience>('/experiences', request);
    return response.data;
  }

  async getExperiences(agentId: string): Promise<TrustExperience[]> {
    const response = await this.client.get<TrustExperience[]>(`/experiences/${agentId}`);
    return response.data;
  }

  async queryTrust(agentId: string, params?: TrustQueryParams): Promise<TrustScore> {
    const response = await this.client.get<TrustScore>(`/trust/${agentId}`, { params });
    return response.data;
  }

  async queryTrustBatch(query: TrustQuery): Promise<TrustResponse> {
    const response = await this.client.post<TrustResponse>('/trust/batch', query);
    return response.data;
  }

  async getPeers(): Promise<Peer[]> {
    const response = await this.client.get<Peer[]>('/peers');
    return response.data;
  }

  async addPeer(request: AddPeerRequest): Promise<Peer> {
    const response = await this.client.post<Peer>('/peers', request);
    return response.data;
  }

  async updatePeerQuality(peerId: string, request: UpdateQualityRequest): Promise<void> {
    await this.client.post(`/peers/${peerId}/quality`, request);
  }

  async removePeer(peerId: string): Promise<void> {
    await this.client.delete(`/peers/${peerId}`);
  }

  // Convenience methods for common use cases
  
  async recordPositiveExperience(
    agentId: string,
    investment: number,
    returnValue: number,
    timeframeDays: number = 1,
    notes?: string
  ): Promise<TrustExperience> {
    return this.addExperience({
      agent_id: agentId,
      investment,
      return_value: returnValue,
      timeframe_days: timeframeDays,
      notes,
    });
  }

  async recordNegativeExperience(
    agentId: string,
    investment: number,
    loss: number,
    timeframeDays: number = 1,
    notes?: string
  ): Promise<TrustExperience> {
    return this.addExperience({
      agent_id: agentId,
      investment,
      return_value: investment - loss,
      timeframe_days: timeframeDays,
      notes,
    });
  }

  async getTrustLevel(agentId: string, maxDepth: number = 3): Promise<TrustScore> {
    return this.queryTrust(agentId, { max_depth: maxDepth });
  }

  async addTrustedPeer(peerId: string, name: string, quality: number = 0.8): Promise<Peer> {
    return this.addPeer({
      peer_id: peerId,
      name,
      recommender_quality: quality,
    });
  }

  async addContrarian(peerId: string, name: string, quality: number = -0.5): Promise<Peer> {
    return this.addPeer({
      peer_id: peerId,
      name,
      recommender_quality: quality,
    });
  }

  // Helper to calculate expected profit from trust score
  calculateExpectedProfit(score: TrustScore, plannedInvestment: number): number {
    return plannedInvestment * (score.expected_pv_roi - 1);
  }

  // Helper to check if an agent is trustworthy based on score
  isTrustworthy(score: TrustScore, minVolume: number = 100, minRoi: number = 1.0): boolean {
    return score.total_volume >= minVolume && score.expected_pv_roi >= minRoi;
  }
}