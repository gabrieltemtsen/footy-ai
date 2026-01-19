import { elizaLogger } from "@elizaos/core";

const BWAPS_BASE_URL = process.env.BWAPS_BASE_URL || "https://chancedb.com/api";
const BWAPS_API_KEY = process.env.BWAPS_API_KEY;

// --- TYPES ---

export interface BwapsLease {
    leaseId: string;
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

export interface BwapsProbability {
    outcomes: string[]; // ["HOME", "DRAW", "AWAY"]
    probs: number[];    // [0.282, 0.282, 0.437]
    sumRaw?: number;
    overroundRaw?: number;
}

export interface BwapsQualitySignals {
    liquidity: number;
    volume: number;
    overround: number;
    sourceCount: number;
}

export interface BwapsSnapshot {
    pmf: BwapsProbability;
    asOf: string;
    qualitySignals: BwapsQualitySignals;
}

export interface BwapsIngestResponse {
    eventKey: string;
    snapshotId: string;
    canonicalEvent: {
        sport: string;
        marketType: string;
        homeTeam: { name: string };
        awayTeam: { name: string };
        startTime: string;
    };
    snapshot: BwapsSnapshot;
}

export interface BwapsDiscoverResponse {
    readyToIngest: {
        leaseId: string;
        canonicalEvent?: any;
        sourceRefs?: any[];
    };
    next: {
        method: string;
        path: string;
        preferred: string;
        body: any;
    };
    assumptions: string[];
    warnings: string[];
}

export interface BwapsHealthResponse {
    ok: boolean;
    name: string;
    ts: string;
}

// x402 Payment challenge response
export interface X402Challenge {
    error: string;
    x402: {
        amount: string;
        currency: string;
        network: string;
        scheme: string;
        receiver: {
            address: string;
            network: string;
            asset: string;
            scheme: string;
        };
        facilitator: string;
        idempotencyKey: string;
        instructions: string;
    };
}

// --- SERVICE CLASS ---

export class BwapsApiService {
    private baseUrl: string;
    private apiKey: string | undefined;

    constructor() {
        this.baseUrl = BWAPS_BASE_URL;
        this.apiKey = BWAPS_API_KEY;
    }

    private getHeaders(): HeadersInit {
        const headers: HeadersInit = {
            "Content-Type": "application/json",
        };

        if (this.apiKey) {
            headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        return headers;
    }

    private async fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        elizaLogger.info(`BWAPs API Request: ${options?.method || 'GET'} ${endpoint}`);

        const response = await fetch(url, {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options?.headers,
            },
        });

        if (response.status === 402) {
            // x402 Payment Required
            const challenge = await response.json() as X402Challenge;
            elizaLogger.warn("BWAPs API requires payment:", challenge.x402.instructions);
            throw new Error(`Payment required: ${challenge.x402.amount} ${challenge.x402.currency}. ${challenge.x402.instructions}`);
        }

        if (!response.ok) {
            const errorText = await response.text();
            elizaLogger.error(`BWAPs API Error (${response.status}):`, errorText);
            throw new Error(`BWAPs API Error: ${response.statusText} - ${errorText}`);
        }

        return await response.json() as T;
    }

    /**
     * Health check endpoint (FREE)
     */
    async checkHealth(): Promise<BwapsHealthResponse> {
        return this.fetchApi<BwapsHealthResponse>("/health");
    }

    /**
     * Get all active betting market leases (FREE)
     * Returns soccer matches with active prediction markets
     */
    async getActiveLeases(): Promise<BwapsLeasesResponse> {
        return this.fetchApi<BwapsLeasesResponse>("/bwaps/leases");
    }

    /**
     * Discover event from source URLs and get a leaseId
     * Requires authentication (Bearer token or x402 payment)
     * @param polymarketUrl - Polymarket event URL
     * @param kalshiUrl - Kalshi market URL
     */
    async discoverEvent(
        polymarketUrl: string,
        kalshiUrl: string
    ): Promise<BwapsDiscoverResponse> {
        const body = {
            sources: {
                polymarket: { url: polymarketUrl },
                kalshi: { url: kalshiUrl },
            },
            options: {
                includeLease: true,
            },
        };

        return this.fetchApi<BwapsDiscoverResponse>("/sources/discover", {
            method: "POST",
            body: JSON.stringify(body),
        });
    }

    /**
     * Ingest prediction data for a leaseId
     * Returns aggregated probabilities from multiple sources
     * Requires authentication (Bearer token or x402 payment)
     * @param leaseId - The lease ID from getActiveLeases or discoverEvent
     */
    async ingestPrediction(leaseId: string): Promise<BwapsIngestResponse> {
        const body = {
            leaseId,
            options: {
                include: {
                    signals: true,
                    quotes: true,
                    checks: true,
                },
            },
        };

        return this.fetchApi<BwapsIngestResponse>("/bwaps/ingest", {
            method: "POST",
            body: JSON.stringify(body),
        });
    }

    /**
     * Get prediction probabilities for a match using its leaseId
     * Convenience method that returns formatted probability data
     */
    async getMatchProbabilities(leaseId: string): Promise<{
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
        const data = await this.ingestPrediction(leaseId);
        const pmf = data.snapshot.pmf;
        const signals = data.snapshot.qualitySignals;

        // Find probabilities by outcome
        const homeIdx = pmf.outcomes.indexOf("HOME");
        const drawIdx = pmf.outcomes.indexOf("DRAW");
        const awayIdx = pmf.outcomes.indexOf("AWAY");

        return {
            homeTeam: data.canonicalEvent.homeTeam.name,
            awayTeam: data.canonicalEvent.awayTeam.name,
            homeWinProb: homeIdx >= 0 ? pmf.probs[homeIdx] : 0,
            drawProb: drawIdx >= 0 ? pmf.probs[drawIdx] : 0,
            awayWinProb: awayIdx >= 0 ? pmf.probs[awayIdx] : 0,
            liquidity: signals.liquidity,
            volume: signals.volume,
            sourceCount: signals.sourceCount,
            asOf: data.snapshot.asOf,
        };
    }

    /**
     * Find a lease by team names (fuzzy matching)
     * @param homeTeam - Home team name to search for
     * @param awayTeam - Away team name to search for
     */
    async findLeaseByTeams(homeTeam: string, awayTeam: string): Promise<BwapsLease | null> {
        const leases = await this.getActiveLeases();

        const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const homeNorm = normalize(homeTeam);
        const awayNorm = normalize(awayTeam);

        for (const lease of leases.leases) {
            const leaseHome = normalize(lease.homeTeam);
            const leaseAway = normalize(lease.awayTeam);

            // Check if either order matches (handle home/away confusion)
            if (
                (leaseHome.includes(homeNorm) || homeNorm.includes(leaseHome)) &&
                (leaseAway.includes(awayNorm) || awayNorm.includes(leaseAway))
            ) {
                return lease;
            }
            if (
                (leaseHome.includes(awayNorm) || awayNorm.includes(leaseHome)) &&
                (leaseAway.includes(homeNorm) || homeNorm.includes(leaseAway))
            ) {
                return lease;
            }
        }

        return null;
    }
}

// Export singleton instance
export const bwapsApiService = new BwapsApiService();
