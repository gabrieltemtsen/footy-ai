import { elizaLogger } from '@elizaos/core';

const CHANCEDB_API_BASE_URL = process.env.CHANCEDB_API_BASE_URL || 'https://api.chancedb.com/v1';
const CHANCEDB_CAPABILITY_JWT = process.env.CHANCEDB_CAPABILITY_JWT || process.env.BWAPS_API_KEY;
const CHANCEDB_X402_PAYMENT = process.env.CHANCEDB_X402_PAYMENT;

export interface BwapsLease {
  leaseId: string;
  eventKey?: string;
  createdAt: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  isPast: boolean;
  sourceUrls: string[];
}

export interface BwapsLeasesResponse {
  count: number;
  leases: BwapsLease[];
}

export interface SnapshotLatestResponse {
  eventKey: string;
  snapshotId?: string;
  asOf?: string;
  canonicalEvent?: {
    homeTeam?: { name?: string };
    awayTeam?: { name?: string };
  };
  snapshot?: {
    asOf?: string;
    pmf?: { outcomes: string[]; probs: number[] };
    qualitySignals?: { liquidity?: number; volume?: number; sourceCount?: number };
  };
  pmf?: { outcomes: string[]; probs: number[] };
  qualitySignals?: { liquidity?: number; volume?: number; sourceCount?: number };
}

export interface X402Challenge {
  error: string;
  x402?: {
    amount: string;
    currency: string;
    instructions: string;
  };
}

export class BwapsApiService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = CHANCEDB_API_BASE_URL;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };

    if (CHANCEDB_CAPABILITY_JWT) {
      headers['Authorization'] = `Bearer ${CHANCEDB_CAPABILITY_JWT}`;
    }

    if (CHANCEDB_X402_PAYMENT) {
      headers['x-payment'] = CHANCEDB_X402_PAYMENT;
    }

    return headers;
  }

  private async fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options?.headers,
      },
    });

    if (response.status === 402) {
      const challenge = (await response.json()) as X402Challenge;
      throw new Error(
        challenge?.x402
          ? `Payment required: ${challenge.x402.amount} ${challenge.x402.currency}. ${challenge.x402.instructions}`
          : 'Payment required by ChanceDB (x402).'
      );
    }

    if (!response.ok) {
      const body = await response.text();
      elizaLogger.error(`ChanceDB API error (${response.status}) ${endpoint}: ${body}`);
      throw new Error(`ChanceDB API error ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  async getHelp(): Promise<unknown> {
    return this.fetchApi<unknown>('/help');
  }

  async getCapabilities(): Promise<unknown> {
    return this.fetchApi<unknown>('/capabilities');
  }

  async getActiveLeases(): Promise<BwapsLeasesResponse> {
    return this.fetchApi<BwapsLeasesResponse>('/bwaps/leases');
  }

  async getLatestSnapshot(eventKey: string): Promise<SnapshotLatestResponse> {
    const q = encodeURIComponent(eventKey);
    return this.fetchApi<SnapshotLatestResponse>(`/snapshots/latest?eventKey=${q}`);
  }

  async getMatchProbabilities(eventKey: string): Promise<{
    eventKey: string;
    homeTeam: string;
    awayTeam: string;
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    liquidity: number;
    volume: number;
    sourceCount: number;
    asOf: string;
  }> {
    const data = await this.getLatestSnapshot(eventKey);
    const pmf = data.snapshot?.pmf || data.pmf;
    const signals = data.snapshot?.qualitySignals || data.qualitySignals;

    if (!pmf?.outcomes?.length || !pmf?.probs?.length) {
      throw new Error('No probability data found for this event.');
    }

    const outcomes = pmf.outcomes.map((o) => o.toUpperCase());
    const homeIdx = outcomes.findIndex((o) => o.includes('HOME'));
    const drawIdx = outcomes.findIndex((o) => o.includes('DRAW'));
    const awayIdx = outcomes.findIndex((o) => o.includes('AWAY'));

    return {
      eventKey: data.eventKey,
      homeTeam: data.canonicalEvent?.homeTeam?.name || 'Home',
      awayTeam: data.canonicalEvent?.awayTeam?.name || 'Away',
      homeWinProb: homeIdx >= 0 ? pmf.probs[homeIdx] : 0,
      drawProb: drawIdx >= 0 ? pmf.probs[drawIdx] : 0,
      awayWinProb: awayIdx >= 0 ? pmf.probs[awayIdx] : 0,
      liquidity: signals?.liquidity || 0,
      volume: signals?.volume || 0,
      sourceCount: signals?.sourceCount || 0,
      asOf: data.snapshot?.asOf || data.asOf || new Date().toISOString(),
    };
  }
}

export const bwapsApiService = new BwapsApiService();
