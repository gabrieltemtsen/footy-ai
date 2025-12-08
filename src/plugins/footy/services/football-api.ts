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
    status: { short: string; long: string };
    homeTeam: { name: string; score: number | null };
    awayTeam: { name: string; score: number | null };
    league: string;
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
