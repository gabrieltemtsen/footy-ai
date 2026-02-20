import {
    type Action,
    type ActionResult,
    type Content,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type Plugin,
    type Provider,
    type State,
    logger,
} from '@elizaos/core';
import { FootballApiService, leagues, type Fixture, type LiveMatch, type StandingsEntry } from './services/football-api.ts';
import { bwapsApiService, type BwapsLease } from './services/bwaps-api.ts';

// --- SERVICE INSTANCES ---
const apiService = new FootballApiService();

// --- PROVIDER ---

const footballDataProvider: Provider = {
    name: 'football_data_provider',
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        return {
            text: `Current Football Context:
- Next Big Match: Arsenal vs Tottenham (North London Derby)
- Key Storyline: Man City chasing Liverpool for the title.
- FPL Deadline: Friday 11:00 AM.`,
        };
    },
};

// --- ACTIONS ---

const getFixturesAction: Action = {
    name: 'GET_FIXTURES',
    similes: ['SHOW_MATCHES', 'UPCOMING_GAMES', 'SCHEDULE', 'ALL_FIXTURES'],
    description: 'Retrieves the list of upcoming football matches. Can fetch for specific leagues or all major leagues.',
    validate: async (_runtime: IAgentRuntime, _message: Memory) => true,
    handler: async (
        _runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ): Promise<ActionResult> => {
        let fixturesText = '';
        const content = (message.content.text || '').toLowerCase();

        // 1. Detect League
        let targetLeagues: string[] = [];

        // Check for specific league mentions
        if (content.includes('premier league') || content.includes('epl') || content.includes('english')) {
            targetLeagues.push('epl');
        }
        if (content.includes('la liga') || content.includes('spanish')) {
            targetLeagues.push('laliga');
        }
        if (content.includes('bundesliga') || content.includes('german')) {
            targetLeagues.push('bund');
        }
        if (content.includes('champions league') || content.includes('ucl')) {
            targetLeagues.push('ucl');
        }
        if (content.includes('mls') || content.includes('major league soccer')) {
            targetLeagues.push('mls');
        }

        // If "all" is requested or no specific league found, fetch top leagues
        if (content.includes('all') || targetLeagues.length === 0) {
            targetLeagues = ['epl', 'laliga', 'bund', 'ucl', 'mls'];
        }

        try {
            const allFixtures: Fixture[] = [];

            for (const leagueId of targetLeagues) {
                const fixtures = await apiService.getUpcomingFixtures(leagueId);
                if (fixtures.length > 0) {
                    allFixtures.push(...fixtures);
                }
            }

            if (allFixtures.length > 0) {
                // Group by league for better readability
                const grouped = allFixtures.reduce((acc, f) => {
                    if (!acc[f.league]) acc[f.league] = [];
                    acc[f.league].push(f);
                    return acc;
                }, {} as Record<string, Fixture[]>);

                fixturesText = Object.entries(grouped).map(([leagueName, leagueFixtures]) => {
                    const leagueHeader = `\n**${leagueName}**\n`;
                    const matches = leagueFixtures.map(
                        (f) => `- ${f.homeTeam.name} vs ${f.awayTeam.name} on ${new Date(f.date).toDateString()} (${f.status.short})`
                    ).join('\n');
                    return leagueHeader + matches;
                }).join('\n');

            } else {
                fixturesText = "No upcoming fixtures found for the requested leagues.";
            }
        } catch (e) {
            logger.warn("Failed to fetch fixtures:", e);
            fixturesText = "Unable to fetch fixtures at this time. Please try again later.";
        }

        const response: Content = {
            text: `Here are the upcoming fixtures:\n${fixturesText}`,
            actions: ['GET_FIXTURES'],
        };

        await callback(response);
        return { success: true };
    },
    examples: [
        [
            { name: '{{name1}}', content: { text: 'What games are on this weekend?' } },
            { name: '{{name2}}', content: { text: 'Here are the upcoming fixtures...', actions: ['GET_FIXTURES'] } },
        ],
        [
            { name: '{{name1}}', content: { text: 'Show me La Liga matches' } },
            { name: '{{name2}}', content: { text: 'Here are the upcoming La Liga fixtures...', actions: ['GET_FIXTURES'] } },
        ],
        [
            { name: '{{name1}}', content: { text: 'Get all fixtures' } },
            { name: '{{name2}}', content: { text: 'Here are fixtures for EPL, La Liga, and others...', actions: ['GET_FIXTURES'] } },
        ]
    ],
};

// --- BETTING MARKETS ACTION (BWAPs) ---

const getBettingMarketsAction: Action = {
    name: 'GET_BETTING_MARKETS',
    similes: ['BETTING_ODDS', 'PREDICTION_MARKETS', 'ACTIVE_MARKETS', 'AVAILABLE_BETS', 'MARKET_ODDS'],
    description: 'Lists all active soccer betting markets with prediction market data from Polymarket and Kalshi.',
    validate: async (_runtime: IAgentRuntime, _message: Memory) => true,
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ): Promise<ActionResult> => {
        try {
            const leases = await bwapsApiService.getActiveLeases();

            if (leases.count === 0) {
                const response: Content = {
                    text: "📊 **No active betting markets found.**\n\nCheck back later for upcoming matches with prediction market odds.",
                    actions: ['GET_BETTING_MARKETS'],
                };
                await callback(response);
                return { success: true };
            }

            // Filter to only show upcoming matches (not past)
            const upcomingLeases = leases.leases.filter(l => !l.isPast);

            let responseText = "📊 **Active Betting Markets**\n\n";
            responseText += `Found **${upcomingLeases.length}** matches with prediction market odds:\n\n`;

            for (const lease of upcomingLeases.slice(0, 10)) { // Limit to 10
                const matchDate = new Date(lease.startTime);
                const dateStr = matchDate.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                responseText += `⚽ **${lease.homeTeam}** vs **${lease.awayTeam}**\n`;
                responseText += `   📅 ${dateStr}\n`;
                responseText += `   🔗 Sources: ${lease.sourceUrls.length} prediction markets\n\n`;
            }

            responseText += "\n💡 *Ask me for specific match odds, e.g. 'What are the odds for Tottenham vs West Ham?'*";

            const response: Content = {
                text: responseText,
                actions: ['GET_BETTING_MARKETS'],
            };

            await callback(response);
            return { success: true };

        } catch (error) {
            logger.error('Error fetching betting markets:', error);
            const response: Content = {
                text: "Sorry, I couldn't fetch the betting markets right now. Please try again in a moment.",
                actions: ['GET_BETTING_MARKETS'],
            };
            await callback(response);
            return { success: false };
        }
    },
    examples: [
        [
            { name: '{{name1}}', content: { text: 'What betting markets are available?' } },
            { name: '{{name2}}', content: { text: '📊 Active Betting Markets...', actions: ['GET_BETTING_MARKETS'] } },
        ],
        [
            { name: '{{name1}}', content: { text: 'Show me prediction markets' } },
            { name: '{{name2}}', content: { text: '📊 Active Betting Markets...', actions: ['GET_BETTING_MARKETS'] } },
        ],
        [
            { name: '{{name1}}', content: { text: 'What matches have odds?' } },
            { name: '{{name2}}', content: { text: '📊 Active Betting Markets...', actions: ['GET_BETTING_MARKETS'] } },
        ],
    ],
};

// --- MATCH ODDS ACTION (BWAPs) ---

const getMatchOddsAction: Action = {
    name: 'GET_MATCH_ODDS',
    similes: ['MATCH_PROBABILITIES', 'WIN_PROBABILITY', 'ODDS_FOR_MATCH', 'BETTING_ODDS_MATCH'],
    description: 'Gets aggregated prediction market probabilities for a specific soccer match using belief-weighted aggregation from Polymarket and Kalshi.',
    validate: async (_runtime: IAgentRuntime, _message: Memory) => true,
    handler: async (
        _runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ): Promise<ActionResult> => {
        const content = (message.content.text || '').toLowerCase();

        try {
            // First, get all active leases
            const leases = await bwapsApiService.getActiveLeases();

            if (leases.count === 0) {
                const response: Content = {
                    text: "No active prediction markets found. Check back later for upcoming matches.",
                    actions: ['GET_MATCH_ODDS'],
                };
                await callback(response);
                return { success: true };
            }

            // Try to find a matching lease based on team names in the message
            let matchingLease: BwapsLease | null = null;

            for (const lease of leases.leases) {
                const homeTeamLower = lease.homeTeam.toLowerCase();
                const awayTeamLower = lease.awayTeam.toLowerCase();

                // Check if both teams are mentioned in the message
                const homeWords = homeTeamLower.split(' ');
                const awayWords = awayTeamLower.split(' ');

                const homeMatch = homeWords.some(word => word.length > 3 && content.includes(word));
                const awayMatch = awayWords.some(word => word.length > 3 && content.includes(word));

                if (homeMatch && awayMatch) {
                    matchingLease = lease;
                    break;
                }

                // Also check for common abbreviations
                if (content.includes('tottenham') || content.includes('spurs')) {
                    if (homeTeamLower.includes('tottenham') || awayTeamLower.includes('tottenham')) {
                        matchingLease = lease;
                    }
                }
            }

            if (!matchingLease) {
                // If no match found, show available markets
                const availableMatches = leases.leases
                    .filter(l => !l.isPast)
                    .slice(0, 5)
                    .map(l => `• ${l.homeTeam} vs ${l.awayTeam}`)
                    .join('\n');

                const response: Content = {
                    text: `I couldn't find odds for that match. Here are the available markets:\n\n${availableMatches}\n\nTry asking about one of these matches!`,
                    actions: ['GET_MATCH_ODDS'],
                };
                await callback(response);
                return { success: true };
            }

            // Fetch the prediction probabilities
            const probs = await bwapsApiService.getMatchProbabilities(matchingLease.eventKey || matchingLease.leaseId);

            // Format probabilities as percentages
            const homePercent = (probs.homeWinProb * 100).toFixed(1);
            const drawPercent = (probs.drawProb * 100).toFixed(1);
            const awayPercent = (probs.awayWinProb * 100).toFixed(1);

            // Create a visual bar for each probability
            const createBar = (prob: number) => {
                const filled = Math.round(prob * 10);
                return '█'.repeat(filled) + '░'.repeat(10 - filled);
            };

            let responseText = `🎯 **Prediction Market Odds**\n\n`;
            responseText += `**${probs.homeTeam}** vs **${probs.awayTeam}**\n\n`;
            responseText += `| Outcome | Probability |\n`;
            responseText += `|---------|-------------|\n`;
            responseText += `| 🏠 Home Win | ${createBar(probs.homeWinProb)} **${homePercent}%** |\n`;
            responseText += `| 🤝 Draw | ${createBar(probs.drawProb)} **${drawPercent}%** |\n`;
            responseText += `| ✈️ Away Win | ${createBar(probs.awayWinProb)} **${awayPercent}%** |\n\n`;

            // Market quality signals
            responseText += `📈 **Market Quality**\n`;
            responseText += `• Liquidity: $${probs.liquidity.toLocaleString()}\n`;
            responseText += `• Volume: $${probs.volume.toLocaleString()}\n`;
            responseText += `• Sources: ${probs.sourceCount} prediction markets\n`;
            responseText += `• Updated: ${new Date(probs.asOf).toLocaleString()}\n\n`;

            // Determine the favorite
            const maxProb = Math.max(probs.homeWinProb, probs.drawProb, probs.awayWinProb);
            let favoriteText = '';
            if (maxProb === probs.homeWinProb) {
                favoriteText = `🔮 **Prediction:** ${probs.homeTeam} is favored to win`;
            } else if (maxProb === probs.awayWinProb) {
                favoriteText = `🔮 **Prediction:** ${probs.awayTeam} is favored to win`;
            } else {
                favoriteText = `🔮 **Prediction:** This match is expected to be a draw`;
            }
            responseText += favoriteText;

            const response: Content = {
                text: responseText,
                actions: ['GET_MATCH_ODDS'],
            };

            await callback(response);
            return { success: true };

        } catch (error) {
            logger.error('Error fetching match odds:', error);
            const response: Content = {
                text: `Sorry, I couldn't fetch the odds for that match. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                actions: ['GET_MATCH_ODDS'],
            };
            await callback(response);
            return { success: false };
        }
    },
    examples: [
        [
            { name: '{{name1}}', content: { text: 'What are the odds for Tottenham vs West Ham?' } },
            { name: '{{name2}}', content: { text: '🎯 Prediction Market Odds...', actions: ['GET_MATCH_ODDS'] } },
        ],
        [
            { name: '{{name1}}', content: { text: 'Who is favored to win Arsenal vs Chelsea?' } },
            { name: '{{name2}}', content: { text: '🎯 Prediction Market Odds...', actions: ['GET_MATCH_ODDS'] } },
        ],
        [
            { name: '{{name1}}', content: { text: 'Show me the betting probabilities for Liverpool vs Man City' } },
            { name: '{{name2}}', content: { text: '🎯 Prediction Market Odds...', actions: ['GET_MATCH_ODDS'] } },
        ],
    ],
};

// --- PREDICT MATCH ACTION (Enhanced with BWAPs) ---

const predictMatchAction: Action = {
    name: 'PREDICT_MATCH',
    similes: ['MATCH_PREDICTION', 'WHO_WILL_WIN', 'PREDICT_WINNER'],
    description: 'Predicts the outcome of a football match using real prediction market data from Polymarket and Kalshi.',
    validate: async (_runtime: IAgentRuntime, _message: Memory) => true,
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ): Promise<ActionResult> => {
        const content = (message.content.text || '').toLowerCase();

        try {
            // First, try to get BWAPs data for this match
            const leases = await bwapsApiService.getActiveLeases();
            let matchingLease: BwapsLease | null = null;

            for (const lease of leases.leases) {
                const homeTeamLower = lease.homeTeam.toLowerCase();
                const awayTeamLower = lease.awayTeam.toLowerCase();

                const homeWords = homeTeamLower.split(' ');
                const awayWords = awayTeamLower.split(' ');

                const homeMatch = homeWords.some(word => word.length > 3 && content.includes(word));
                const awayMatch = awayWords.some(word => word.length > 3 && content.includes(word));

                if (homeMatch || awayMatch) {
                    matchingLease = lease;
                    break;
                }
            }

            if (matchingLease) {
                // We have BWAPs data - use real probabilities
                const probs = await bwapsApiService.getMatchProbabilities(matchingLease.eventKey || matchingLease.leaseId);

                const homePercent = (probs.homeWinProb * 100).toFixed(1);
                const drawPercent = (probs.drawProb * 100).toFixed(1);
                const awayPercent = (probs.awayWinProb * 100).toFixed(1);

                let prediction = '';
                let confidence = '';

                // Determine prediction based on probabilities
                const maxProb = Math.max(probs.homeWinProb, probs.drawProb, probs.awayWinProb);
                const margin = maxProb - (1 - maxProb) / 2;

                if (margin > 0.2) {
                    confidence = "High confidence";
                } else if (margin > 0.1) {
                    confidence = "Moderate confidence";
                } else {
                    confidence = "Low confidence - this is a close match!";
                }

                if (maxProb === probs.homeWinProb) {
                    prediction = `🏆 **${probs.homeTeam}** to win at home`;
                } else if (maxProb === probs.awayWinProb) {
                    prediction = `🏆 **${probs.awayTeam}** to win away`;
                } else {
                    prediction = `🤝 **Draw** is the most likely outcome`;
                }

                let responseText = `🔮 **Match Prediction**\n\n`;
                responseText += `**${probs.homeTeam}** vs **${probs.awayTeam}**\n\n`;
                responseText += `${prediction}\n\n`;
                responseText += `📊 **Market Probabilities:**\n`;
                responseText += `• Home: ${homePercent}%\n`;
                responseText += `• Draw: ${drawPercent}%\n`;
                responseText += `• Away: ${awayPercent}%\n\n`;
                responseText += `📈 **${confidence}**\n`;
                responseText += `💰 Based on $${probs.volume.toLocaleString()} in trading volume from ${probs.sourceCount} prediction markets.`;

                const response: Content = {
                    text: responseText,
                    actions: ['PREDICT_MATCH'],
                };

                await callback(response);
                return { success: true };
            }

            // No BWAPs data available - fall back to general response
            const response: Content = {
                text: "I don't have prediction market data for that match. Try asking about matches from the active betting markets!\n\nSay 'show betting markets' to see available matches with odds.",
                actions: ['PREDICT_MATCH'],
            };

            await callback(response);
            return { success: true };

        } catch (error) {
            logger.error('Error in PREDICT_MATCH:', error);
            const response: Content = {
                text: "Sorry, I couldn't generate a prediction at this time. Please try again.",
                actions: ['PREDICT_MATCH'],
            };
            await callback(response);
            return { success: false };
        }
    },
    examples: [
        [
            { name: '{{name1}}', content: { text: 'Who wins Arsenal vs Spurs?' } },
            { name: '{{name2}}', content: { text: '🔮 Match Prediction...', actions: ['PREDICT_MATCH'] } },
        ],
        [
            { name: '{{name1}}', content: { text: 'Predict the Liverpool vs Man City match' } },
            { name: '{{name2}}', content: { text: '🔮 Match Prediction...', actions: ['PREDICT_MATCH'] } },
        ],
    ],
};

// --- FPL ADVICE ACTION ---

const getFantasyAdviceAction: Action = {
    name: 'GET_FANTASY_ADVICE',
    similes: ['FPL_TIPS', 'FANTASY_HELP', 'WHO_TO_CAPTAIN'],
    description: 'Provides advice for Fantasy Football (FPL) based on upcoming fixture data.',
    validate: async (_runtime: IAgentRuntime, _message: Memory) => true,
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ): Promise<ActionResult> => {
        // Try to get betting markets for context
        let contextText = "";
        try {
            const leases = await bwapsApiService.getActiveLeases();
            if (leases.count > 0) {
                const upcomingMatches = leases.leases
                    .filter(l => !l.isPast)
                    .slice(0, 3)
                    .map(l => `${l.homeTeam} vs ${l.awayTeam}`)
                    .join(', ');
                contextText = `\n\n📅 **Upcoming matches with market data:** ${upcomingMatches}`;
            }
        } catch (e) {
            logger.warn("Could not fetch betting markets for FPL context");
        }

        const response: Content = {
            text: `Here is my FPL advice for this week:

📋 **General Tips:**
- Check prediction market odds before picking your captain
- Players from teams with high win probability are safer picks
- Consider home advantage in close fixtures

💡 **Pro Tip:** Use the "get match odds" command to see real-time probabilities for specific fixtures!${contextText}`,
            actions: ['GET_FANTASY_ADVICE'],
        };

        await callback(response);
        return { success: true };
    },
    examples: [
        [
            { name: '{{name1}}', content: { text: 'Who should I captain?' } },
            { name: '{{name2}}', content: { text: 'Here is my FPL advice...', actions: ['GET_FANTASY_ADVICE'] } },
        ],
    ],
};

// --- LIVE SCORES ACTION ---

const getLiveScoresAction: Action = {
    name: 'GET_LIVE_SCORES',
    similes: ['LIVE_MATCHES', 'CURRENT_SCORES', 'WHATS_HAPPENING', 'LIVE_GAMES', 'SCORES_NOW'],
    description: 'Gets the current live match scores from all major football leagues.',
    validate: async (_runtime: IAgentRuntime, _message: Memory) => true,
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ): Promise<ActionResult> => {
        try {
            const liveMatches = await apiService.getLiveMatches();

            if (liveMatches.length === 0) {
                // No live matches, show next upcoming fixtures instead
                const upcomingFixtures = await apiService.getUpcomingFixtures('epl', 3);
                let responseText = "⚽ **No matches are live right now.**\n\n";

                if (upcomingFixtures.length > 0) {
                    responseText += "**Coming up next:**\n";
                    responseText += upcomingFixtures.map(
                        (f) => `- ${f.homeTeam.name} vs ${f.awayTeam.name} (${f.league}) - ${new Date(f.date).toLocaleString()}`
                    ).join('\n');
                }

                const response: Content = {
                    text: responseText,
                    actions: ['GET_LIVE_SCORES'],
                };
                await callback(response);
                return { success: true };
            }

            // Format live matches with scores and events
            let responseText = "🔴 **LIVE MATCHES**\n\n";

            // Group by league
            const byLeague = liveMatches.reduce((acc, match) => {
                if (!acc[match.league]) acc[match.league] = [];
                acc[match.league].push(match);
                return acc;
            }, {} as Record<string, LiveMatch[]>);

            for (const [league, matches] of Object.entries(byLeague)) {
                responseText += `**${league}**\n`;
                for (const match of matches) {
                    responseText += `⚽ **${match.homeTeam.name} ${match.homeTeam.score} - ${match.awayTeam.score} ${match.awayTeam.name}** (${match.minute})\n`;

                    // Show goal scorers if any
                    const goals = match.events.filter(e => e.type === 'goal');
                    if (goals.length > 0) {
                        const goalText = goals.map(g => `  ⚽ ${g.player} (${g.minute})`).join('\n');
                        responseText += goalText + '\n';
                    }
                }
                responseText += '\n';
            }

            const response: Content = {
                text: responseText.trim(),
                actions: ['GET_LIVE_SCORES'],
            };

            await callback(response);
            return { success: true };

        } catch (error) {
            logger.error('Error fetching live scores:', error);
            const response: Content = {
                text: "Sorry, I couldn't fetch live scores right now. Please try again in a moment.",
                actions: ['GET_LIVE_SCORES'],
            };
            await callback(response);
            return { success: false };
        }
    },
    examples: [
        [
            { name: '{{name1}}', content: { text: 'What are the live scores?' } },
            { name: '{{name2}}', content: { text: '🔴 LIVE MATCHES...', actions: ['GET_LIVE_SCORES'] } },
        ],
        [
            { name: '{{name1}}', content: { text: 'Any games on right now?' } },
            { name: '{{name2}}', content: { text: '🔴 LIVE MATCHES...', actions: ['GET_LIVE_SCORES'] } },
        ],
        [
            { name: '{{name1}}', content: { text: "What's the current score?" } },
            { name: '{{name2}}', content: { text: '🔴 LIVE MATCHES...', actions: ['GET_LIVE_SCORES'] } },
        ],
    ],
};

// --- STANDINGS ACTION ---

const getStandingsAction: Action = {
    name: 'GET_STANDINGS',
    similes: ['LEAGUE_TABLE', 'SHOW_TABLE', 'POSITIONS', 'STANDINGS', 'TABLE'],
    description: 'Gets the current league standings/table for a specified football league.',
    validate: async (_runtime: IAgentRuntime, _message: Memory) => true,
    handler: async (
        _runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ): Promise<ActionResult> => {
        const content = (message.content.text || '').toLowerCase();

        // Detect which league the user wants
        let leagueId = 'epl'; // Default to EPL
        let leagueName = 'Premier League';

        if (content.includes('la liga') || content.includes('spanish')) {
            leagueId = 'laliga';
            leagueName = 'La Liga';
        } else if (content.includes('bundesliga') || content.includes('german')) {
            leagueId = 'bund';
            leagueName = 'Bundesliga';
        } else if (content.includes('mls') || content.includes('major league')) {
            leagueId = 'mls';
            leagueName = 'MLS';
        } else if (content.includes('championship') || content.includes('eng 2')) {
            leagueId = 'eng-2';
            leagueName = 'Championship';
        }

        try {
            const standings = await apiService.getLeagueStandings(leagueId);

            if (standings.length === 0) {
                const response: Content = {
                    text: `Sorry, I couldn't fetch the ${leagueName} standings right now.`,
                    actions: ['GET_STANDINGS'],
                };
                await callback(response);
                return { success: false };
            }

            // Show top 10 (or all if less)
            const top = standings.slice(0, 10);
            let responseText = `📊 **${leagueName} Standings**\n\n`;
            responseText += "| Pos | Team | Pts | P | W | D | L | GD |\n";
            responseText += "|-----|------|-----|---|---|---|---|----|\ n";

            for (const entry of top) {
                const gd = entry.goalDifference >= 0 ? `+${entry.goalDifference}` : `${entry.goalDifference}`;
                responseText += `| ${entry.position} | ${entry.team} | **${entry.points}** | ${entry.played} | ${entry.wins} | ${entry.draws} | ${entry.losses} | ${gd} |\n`;
            }

            const response: Content = {
                text: responseText,
                actions: ['GET_STANDINGS'],
            };

            await callback(response);
            return { success: true };

        } catch (error) {
            logger.error('Error fetching standings:', error);
            const response: Content = {
                text: `Sorry, I couldn't fetch the ${leagueName} standings right now. Please try again.`,
                actions: ['GET_STANDINGS'],
            };
            await callback(response);
            return { success: false };
        }
    },
    examples: [
        [
            { name: '{{name1}}', content: { text: 'Show me the Premier League table' } },
            { name: '{{name2}}', content: { text: '📊 Premier League Standings...', actions: ['GET_STANDINGS'] } },
        ],
        [
            { name: '{{name1}}', content: { text: 'La Liga standings' } },
            { name: '{{name2}}', content: { text: '📊 La Liga Standings...', actions: ['GET_STANDINGS'] } },
        ],
        [
            { name: '{{name1}}', content: { text: "Who's top of the league?" } },
            { name: '{{name2}}', content: { text: '📊 Premier League Standings...', actions: ['GET_STANDINGS'] } },
        ],
    ],
};

// --- WATCHLIST ACTIONS (Telegram/Farcaster friendly) ---

const watchlist = new Map<string, { eventKey: string; thresholdPct?: number; direction: 'up' | 'down' | 'any' }>();

const watchMatchAction: Action = {
    name: 'WATCH_MATCH',
    similes: ['WATCH_ODDS', 'ALERT_MATCH', 'TRACK_MATCH'],
    description: 'Watch a ChanceDB eventKey and alert when probabilities move past threshold.',
    validate: async () => true,
    handler: async (_runtime, message, _state, _options, callback) => {
        const text = message.content.text || '';
        const keyMatch = text.match(/eventKey\s*[:=]?\s*([a-zA-Z0-9_:\-.]+)/i) || text.match(/\b(ev_[a-zA-Z0-9_:\-.]+)\b/i);
        const thresholdMatch = text.match(/(\d{1,2}(?:\.\d+)?)\s?%/);
        const direction: 'up' | 'down' | 'any' = /\bdown|drop|below\b/i.test(text)
            ? 'down'
            : /\bup|rise|above\b/i.test(text)
            ? 'up'
            : 'any';

        if (!keyMatch?.[1]) {
            await callback({
                text: 'Use: watch eventKey <EVENT_KEY> [threshold %]. Example: watch eventKey ev_arsenal_spurs_1x2 5%',
                actions: ['WATCH_MATCH'],
            });
            return { success: false };
        }

        const eventKey = keyMatch[1];
        const thresholdPct = thresholdMatch ? Number(thresholdMatch[1]) : undefined;
        watchlist.set(eventKey, { eventKey, thresholdPct, direction });

        await callback({
            text: `✅ Watching ${eventKey}${thresholdPct ? ` (threshold ${thresholdPct}%)` : ''}. I'll track movement and surface updates in chat.`,
            actions: ['WATCH_MATCH'],
        });
        return { success: true };
    },
    examples: [],
};

const unwatchMatchAction: Action = {
    name: 'UNWATCH_MATCH',
    similes: ['REMOVE_WATCH', 'STOP_WATCHING'],
    description: 'Stop watching a ChanceDB eventKey.',
    validate: async () => true,
    handler: async (_runtime, message, _state, _options, callback) => {
        const text = message.content.text || '';
        const keyMatch = text.match(/eventKey\s*[:=]?\s*([a-zA-Z0-9_:\-.]+)/i) || text.match(/\b(ev_[a-zA-Z0-9_:\-.]+)\b/i);
        if (!keyMatch?.[1]) {
            await callback({ text: 'Tell me which eventKey to unwatch.', actions: ['UNWATCH_MATCH'] });
            return { success: false };
        }

        const removed = watchlist.delete(keyMatch[1]);
        await callback({
            text: removed ? `🛑 Stopped watching ${keyMatch[1]}.` : `I wasn't watching ${keyMatch[1]}.`,
            actions: ['UNWATCH_MATCH'],
        });
        return { success: true };
    },
    examples: [],
};

const listWatchesAction: Action = {
    name: 'LIST_WATCHES',
    similes: ['WATCHLIST', 'LIST_ALERTS'],
    description: 'List current ChanceDB event watches.',
    validate: async () => true,
    handler: async (_runtime, _message, _state, _options, callback) => {
        if (watchlist.size === 0) {
            await callback({ text: 'No active watches yet. Add one with: watch eventKey <EVENT_KEY> 5%', actions: ['LIST_WATCHES'] });
            return { success: true };
        }

        const lines = [...watchlist.values()].map((w) => `• ${w.eventKey}${w.thresholdPct ? ` | ${w.direction} ${w.thresholdPct}%` : ''}`);
        await callback({ text: `📌 Active watches:\n${lines.join('\n')}`, actions: ['LIST_WATCHES'] });
        return { success: true };
    },
    examples: [],
};

// --- PLUGIN DEFINITION ---

export const footyPlugin: Plugin = {
    name: 'footy',
    description: 'Football data, predictions with real market odds, live scores, standings, and fantasy advice.',
    actions: [
        getFixturesAction,
        getBettingMarketsAction,  // NEW: BWAPs integration
        getMatchOddsAction,       // NEW: BWAPs integration  
        predictMatchAction,       // UPDATED: Uses BWAPs data
        getFantasyAdviceAction,
        getLiveScoresAction,
        getStandingsAction,
        watchMatchAction,
        unwatchMatchAction,
        listWatchesAction,
    ],
    providers: [footballDataProvider],
};

export default footyPlugin;
