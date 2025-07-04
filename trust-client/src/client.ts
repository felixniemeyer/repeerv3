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
  TrustDataExport,
  ImportRequest,
} from './types';

export class TrustClient {
  private client: AxiosInstance;

  constructor(baseURL: string = 'http://localhost:8080') {
    this.client = axios.create({
      baseURL,
      timeout: 10000, // Reduced timeout for faster local testing 
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

  async getExperiences(idDomain: string, agentId: string): Promise<TrustExperience[]> {
    const response = await this.client.get<TrustExperience[]>(`/experiences/${idDomain}/${agentId}`);
    return response.data;
  }

  async removeExperience(experienceId: string): Promise<void> {
    await this.client.delete(`/experiences/${experienceId}`);
  }

  async queryTrust(idDomain: string, agentId: string, params?: TrustQueryParams): Promise<TrustScore> {
    const response = await this.client.get<TrustScore>(`/trust/${idDomain}/${agentId}`, { params });
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

  async getConnectedPeers(): Promise<string[]> {
    const response = await this.client.get<string[]>('/peers/connected');
    return response.data;
  }

  async triggerPeerDiscovery(): Promise<void> {
    await this.client.post('/peers/discover');
  }

  async exportTrustData(): Promise<TrustDataExport> {
    const response = await this.client.get<TrustDataExport>('/export');
    return response.data;
  }

  async importTrustData(data: TrustDataExport, overwrite: boolean = false): Promise<void> {
    await this.client.post('/import', { data, overwrite });
  }

  async exportToFile(filename?: string): Promise<string> {
    const data = await this.exportTrustData();
    const jsonString = JSON.stringify(data, null, 2);
    const exportFilename = filename || `trust-data-${new Date().toISOString().split('T')[0]}.json`;
    
    // In a browser environment, you might want to trigger a download
    // For now, just return the JSON string and filename
    console.log(`Trust data exported to ${exportFilename}`);
    return jsonString;
  }

  async importFromJson(jsonString: string, overwrite: boolean = false): Promise<void> {
    const data = JSON.parse(jsonString) as TrustDataExport;
    await this.importTrustData(data, overwrite);
  }

  // Convenience methods for common use cases
  
  /**
   * Record a trust experience with any ROI value (continuous spectrum from 0.0 to 2.0+)
   * @param idDomain - The ID domain (e.g., "ethereum", "aliexpress")
   * @param agentId - The agent identifier (e.g., "0x123...")
   * @param investment - Amount invested ($)
   * @param returnValue - Amount received back ($)
   * @param timeframeDays - Duration of the experience in days
   * @param notes - Optional description of the experience
   * @param data - Optional adapter-specific data
   */
  async recordExperience(
    idDomain: string,
    agentId: string,
    investment: number,
    returnValue: number,
    timeframeDays: number = 1,
    notes?: string,
    data?: any
  ): Promise<TrustExperience> {
    return this.addExperience({
      id_domain: idDomain,
      agent_id: agentId,
      investment,
      return_value: returnValue,
      timeframe_days: timeframeDays,
      notes,
      data,
    });
  }

  async getTrustLevel(idDomain: string, agentId: string, maxDepth: number = 3): Promise<TrustScore> {
    return this.queryTrust(idDomain, agentId, { max_depth: maxDepth });
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