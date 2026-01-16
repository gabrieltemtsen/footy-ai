import { elizaLogger } from "@elizaos/core";

export interface LeagueHealth {
    id: string;
    label: string;
    scoreboardUrl: string;
}

export const leagues: LeagueHealth[] = [
    { id: "epl", label: "EPL", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard" },
    { id: "ucl", label: "UCL", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard" },
    { id: "laliga", label: "La Liga", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard" },
    { id: "bund", label: "Bundesliga", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard" },
    { id: "eng-2", label: "Championship", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/scoreboard" },
    { id: "mls", label: "MLS", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard" },
    { id: "eflcup", label: "EFL Cup", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.league_cup/scoreboard" },
    { id: "uel", label: "UEL", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard" },
    { id: "cwc", label: "Club World Cup", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.cwc/scoreboard" },
    { id: "worldcup-uefa", label: "WCQ UEFA", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldq.uefa/scoreboard" },
    { id: "worldcup-afc", label: "WCQ AFC", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldq.afc/scoreboard" },
    { id: "worldcup-concacaf", label: "WCQ CONCACAF", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldq.concacaf/scoreboard" },
    { id: "worldcup-conmebol", label: "WCQ CONMEBOL", scoreboardUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldq.conmebol/scoreboard" },
];

export interface Fixture {
    id: string;
    date: string;
    status: { short: string; long: string; state?: string };
    homeTeam: { name: string; score: number | null };
    awayTeam: { name: string; score: number | null };
    league: string;
}

export interface LiveMatch extends Fixture {
    minute: string;
    events: MatchEvent[];
}

export interface MatchEvent {
    type: 'goal' | 'card' | 'substitution';
    minute: string;
    team: string;
    player: string;
    detail?: string; // e.g., "Yellow Card", "Red Card", "Penalty"
}

export interface StandingsEntry {
    position: number;
    team: string;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
    form?: string;
}

export class FootballApiService {
    constructor() { }

    private async fetchEspn(url: string) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`ESPN API Error: ${response.statusText}`);
        }
        return await response.json();
    }

    /**
     * Get all currently live matches across configured leagues
     */
    async getLiveMatches(): Promise<LiveMatch[]> {
        const liveMatches: LiveMatch[] = [];

        for (const league of leagues) {
            try {
                const data = await this.fetchEspn(league.scoreboardUrl);
                const events = data.events || [];

                for (const event of events) {
                    const state = event.status?.type?.state;
                    // 'in' = in progress, 'pre' = not started, 'post' = finished
                    if (state === 'in') {
                        const competition = event.competitions[0];
                        const homeComp = competition.competitors.find((c: any) => c.homeAway === 'home');
                        const awayComp = competition.competitors.find((c: any) => c.homeAway === 'away');

                        // Extract match events (goals, cards)
                        const matchEvents: MatchEvent[] = [];
                        const details = competition.details || [];
                        for (const detail of details) {
                            if (detail.type?.text === 'Goal' || detail.type?.text === 'Penalty - Scored') {
                                matchEvents.push({
                                    type: 'goal',
                                    minute: detail.clock?.displayValue || '',
                                    team: detail.team?.displayName || '',
                                    player: detail.athletesInvolved?.[0]?.displayName || 'Unknown',
                                    detail: detail.type?.text
                                });
                            } else if (detail.type?.text?.includes('Card')) {
                                matchEvents.push({
                                    type: 'card',
                                    minute: detail.clock?.displayValue || '',
                                    team: detail.team?.displayName || '',
                                    player: detail.athletesInvolved?.[0]?.displayName || 'Unknown',
                                    detail: detail.type?.text
                                });
                            }
                        }

                        liveMatches.push({
                            id: event.id,
                            date: event.date,
                            status: {
                                short: event.status.type.shortDetail,
                                long: event.status.type.description,
                                state: state
                            },
                            minute: event.status?.displayClock || event.status?.type?.shortDetail || '',
                            homeTeam: {
                                name: homeComp.team.displayName,
                                score: homeComp.score ? parseInt(homeComp.score) : 0
                            },
                            awayTeam: {
                                name: awayComp.team.displayName,
                                score: awayComp.score ? parseInt(awayComp.score) : 0
                            },
                            league: league.label,
                            events: matchEvents
                        });
                    }
                }
            } catch (error) {
                elizaLogger.warn(`Failed to fetch live matches for ${league.label}:`, error);
            }
        }

        return liveMatches;
    }

    /**
     * Get league standings/table
     */
    async getLeagueStandings(leagueId: string = "epl"): Promise<StandingsEntry[]> {
        const league = leagues.find(l => l.id === leagueId) || leagues[0];

        // ESPN standings endpoint format
        const standingsUrl = league.scoreboardUrl.replace('/scoreboard', '/standings');

        try {
            const data = await this.fetchEspn(standingsUrl);
            const standings: StandingsEntry[] = [];

            // ESPN returns standings in children array
            const entries = data.children?.[0]?.standings?.entries || [];

            for (const entry of entries) {
                const stats = entry.stats || [];
                const getStat = (name: string) => {
                    const stat = stats.find((s: any) => s.name === name);
                    return stat?.value ?? 0;
                };

                standings.push({
                    position: parseInt(getStat('rank')) || entries.indexOf(entry) + 1,
                    team: entry.team?.displayName || 'Unknown',
                    played: getStat('gamesPlayed'),
                    wins: getStat('wins'),
                    draws: getStat('ties'),
                    losses: getStat('losses'),
                    goalsFor: getStat('pointsFor'),
                    goalsAgainst: getStat('pointsAgainst'),
                    goalDifference: getStat('pointDifferential'),
                    points: getStat('points'),
                    form: '' // ESPN doesn't provide form in standings
                });
            }

            // Sort by position
            standings.sort((a, b) => a.position - b.position);
            return standings;

        } catch (error) {
            elizaLogger.error(`Failed to fetch standings for ${league.label}:`, error);
            return [];
        }
    }

    async getUpcomingFixtures(leagueId: string | number = "epl", next: number = 5): Promise<Fixture[]> {
        // Map numeric IDs to ESPN codes if possible, or default to EPL
        let selectedLeague = leagues.find(l => l.id === leagueId);

        // Fallback for legacy numeric IDs
        if (!selectedLeague && typeof leagueId === 'number') {
            if (leagueId === 39) selectedLeague = leagues.find(l => l.id === "epl");
            // Add more mappings if needed, but for now default to EPL if not found
        }

        if (!selectedLeague) {
            // If still not found, default to EPL
            selectedLeague = leagues[0];
        }

        try {
            const data = await this.fetchEspn(selectedLeague.scoreboardUrl);
            const events = data.events || [];

            // Filter/slice if needed, though ESPN usually returns the current matchday
            // We'll take the first 'next' events
            const upcoming = events.slice(0, next);

            return upcoming.map((event: any) => {
                const competition = event.competitions[0];
                const homeComp = competition.competitors.find((c: any) => c.homeAway === 'home');
                const awayComp = competition.competitors.find((c: any) => c.homeAway === 'away');

                return {
                    id: event.id,
                    date: event.date,
                    status: {
                        short: event.status.type.shortDetail,
                        long: event.status.type.description
                    },
                    homeTeam: {
                        name: homeComp.team.displayName,
                        score: homeComp.score ? parseInt(homeComp.score) : null
                    },
                    awayTeam: {
                        name: awayComp.team.displayName,
                        score: awayComp.score ? parseInt(awayComp.score) : null
                    },
                    league: selectedLeague!.label
                };
            });

        } catch (error) {
            elizaLogger.error("Failed to fetch fixtures from ESPN:", error);
            return [];
        }
    }

    async getHeadToHead(team1Id: number, team2Id: number): Promise<any> {
        // ESPN public API doesn't have a direct H2H endpoint in the same way.
        // Returning null/empty for now as per plan.
        elizaLogger.warn("getHeadToHead is not supported with ESPN public API currently.");
        return null;
    }
}
