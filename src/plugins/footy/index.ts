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
import { FootballApiService } from './services/football-api.ts';

// --- SERVICE INSTANCE ---
const apiService = new FootballApiService();

// --- MOCK DATA (Fallback) ---
const MOCK_FIXTURES = [
    { id: 1, home: 'Arsenal', away: 'Tottenham', date: '2025-12-06T12:30:00Z', competition: 'Premier League' },
    { id: 2, home: 'Liverpool', away: 'Man City', date: '2025-12-06T15:00:00Z', competition: 'Premier League' },
    { id: 3, home: 'Real Madrid', away: 'Barcelona', date: '2025-12-07T20:00:00Z', competition: 'La Liga' },
];

const MOCK_FPL_ADVICE = [
    { player: 'Haaland', team: 'Man City', reason: 'High xG against Liverpools high line.', recommendation: 'Captain' },
    { player: 'Saka', team: 'Arsenal', reason: 'Consistent returns, facing a leaky Spurs defense.', recommendation: 'Buy' },
    { player: 'Salah', team: 'Liverpool', reason: 'Always scores in big games.', recommendation: 'Keep' },
];

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
    similes: ['SHOW_MATCHES', 'UPCOMING_GAMES', 'SCHEDULE'],
    description: 'Retrieves the list of upcoming football matches.',
    validate: async (_runtime: IAgentRuntime, _message: Memory) => true,
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ): Promise<ActionResult> => {
        let fixturesText = '';

        try {
            // Try fetching live data
            const fixtures = await apiService.getUpcomingFixtures();
            if (fixtures.length > 0) {
                fixturesText = fixtures.map(
                    (f) => `- ${f.homeTeam.name} vs ${f.awayTeam.name} (${f.league}) on ${new Date(f.date).toDateString()}`
                ).join('\n');
            } else {
                throw new Error("No fixtures found");
            }
        } catch (e) {
            logger.warn("Failed to fetch live fixtures, using mock data.", e);
            fixturesText = MOCK_FIXTURES.map(
                (f) => `- ${f.home} vs ${f.away} (${f.competition}) on ${new Date(f.date).toDateString()} (MOCK DATA)`
            ).join('\n');
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
    ],
};

const getFantasyAdviceAction: Action = {
    name: 'GET_FANTASY_ADVICE',
    similes: ['FPL_TIPS', 'FANTASY_HELP', 'WHO_TO_CAPTAIN'],
    description: 'Provides advice for Fantasy Football (FPL).',
    validate: async (_runtime: IAgentRuntime, _message: Memory) => true,
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ): Promise<ActionResult> => {
        // FPL API usually requires authentication or complex scraping, so keeping mock for now
        const adviceText = MOCK_FPL_ADVICE.map(
            (a) => `- **${a.player}** (${a.team}): ${a.recommendation}. ${a.reason}`
        ).join('\n');

        const response: Content = {
            text: `Here is my FPL advice for this week:\n${adviceText}`,
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

const predictMatchAction: Action = {
    name: 'PREDICT_MATCH',
    similes: ['MATCH_PREDICTION', 'WHO_WILL_WIN'],
    description: 'Predicts the outcome of a football match.',
    validate: async (_runtime: IAgentRuntime, _message: Memory) => true,
    handler: async (
        _runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ): Promise<ActionResult> => {
        // Simple logic to pick a winner based on the message content (mock AI)
        const content = (message.content.text || '').toLowerCase();
        let prediction = "It's too close to call!";

        if (content.includes('arsenal') && content.includes('tottenham')) {
            prediction = "I'm backing **Arsenal** to win 2-1. They have the home advantage and better form.";
        } else if (content.includes('liverpool') && content.includes('city')) {
            prediction = "This is a titan clash. I predict a **2-2 Draw**. Both attacks are too strong.";
        } else {
            prediction = "I'd need to see the lineups first, but I generally favor the home team in these clashes.";
        }

        const response: Content = {
            text: prediction,
            actions: ['PREDICT_MATCH'],
        };

        await callback(response);
        return { success: true };
    },
    examples: [
        [
            { name: '{{name1}}', content: { text: 'Who wins Arsenal vs Spurs?' } },
            { name: '{{name2}}', content: { text: 'I predict Arsenal...', actions: ['PREDICT_MATCH'] } },
        ],
    ],
};

// --- PLUGIN DEFINITION ---

export const footyPlugin: Plugin = {
    name: 'footy',
    description: 'Football data, predictions, and fantasy advice.',
    actions: [getFixturesAction, getFantasyAdviceAction, predictMatchAction],
    providers: [footballDataProvider],
};

export default footyPlugin;
