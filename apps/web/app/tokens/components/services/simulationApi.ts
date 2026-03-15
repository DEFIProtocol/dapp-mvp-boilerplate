// services/simulationApi.ts
const API_BASE = '/api/contract-simulation';

export class SimulationApi {
  static async healthCheck() {
    const response = await fetch(`${API_BASE}/health`);
    return response.json();
  }

  static async getLatestSimulation(): Promise<SimulationData> {
    const response = await fetch(`${API_BASE}/latest`);
    if (!response.ok) throw new Error('Failed to fetch latest simulation');
    return response.json();
  }

  static async getSimulationRuns(): Promise<{ runs: SimulationRun[] }> {
    const response = await fetch(`${API_BASE}/runs`);
    return response.json();
  }

  static async getSimulationRun(id: string): Promise<SimulationData> {
    const response = await fetch(`${API_BASE}/runs/${id}`);
    return response.json();
  }

  static async getSimulationSummary(id: string): Promise<string> {
    const response = await fetch(`${API_BASE}/runs/${id}/summary`);
    return response.text();
  }
}