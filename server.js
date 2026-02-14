/**
 * VOID RUSH / JAY GENT ARCADE - Game Server
 * REST API + WebSocket for AI agents
 * Static files for human players
 * 
 * v3.0 - Added Supabase auth + social features
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Game engines
const { VoidRushGame } = require('./engine/void-rush');
const { SnakeGame } = require('./engine/snake');
const { PongGame } = require('./engine/pong');
const { FlappyGame } = require('./engine/flappy');
const { TetrisGame } = require('./engine/tetris');
const { BreakerGame } = require('./engine/breaker');
const { AsteroidsGame } = require('./engine/asteroids');
const { InvadersGame } = require('./engine/invaders');
const { GridRunnerGame } = require('./engine/gridrunner');

// Game registry
const GAMES = {
  'void-rush': { Engine: VoidRushGame, name: 'VOID RUSH', desc: 'Space shooter with infinite waves' },
  'snake': { Engine: SnakeGame, name: 'NEON SNAKE', desc: 'Classic snake with powerups' },
  'pong': { Engine: PongGame, name: 'CYBER PONG', desc: 'AI pong battle' },
  'flappy': { Engine: FlappyGame, name: 'NEON FLAP', desc: 'Flappy bird clone' },
  'tetris': { Engine: TetrisGame, name: 'STACK ATTACK', desc: 'Block stacking puzzle' },
  'breaker': { Engine: BreakerGame, name: 'BREAKER', desc: 'Brick breaker with powerups' },
  'asteroids': { Engine: AsteroidsGame, name: 'ASTEROID FIELD', desc: 'Classic asteroids' },
  'invaders': { Engine: InvadersGame, name: 'SPACE INVADERS', desc: 'Alien shooter' },
  'gridrunner': { Engine: GridRunnerGame, name: 'GRID RUNNER', desc: 'Tron lightcycle battle' }
};

// Game action schemas
function getGameActions(gameId) {
  const actions = {
    'void-rush': ['left', 'right', 'up', 'down', 'shoot', 'bomb'],
    'snake': ['left', 'right', 'up', 'down'],
    'pong': ['up', 'down'],
    'flappy': ['flap'],
    'tetris': ['left', 'right', 'down', 'rotate', 'drop'],
    'breaker': ['left', 'right', 'launch'],
    'asteroids': ['left', 'right', 'thrust', 'shoot'],
    'invaders': ['left', 'right', 'shoot'],
    'gridrunner': ['left', 'right', 'up', 'down', 'boost']
  };
  return actions[gameId] || [];
}

// Supabase integration (optional - gracefully degrades if not configured)
let db = null;
try {
  db = require('./lib/supabase');
  if (db.isConfigured) {
    console.log('✅ Supabase connected');
  }
} catch (e) {
  console.log('ℹ️  Supabase not configured - running in guest-only mode');
}

const PORT = process.env.PORT || 8080;
const SCORES_FILE = path.join(__dirname, 'scores.json');

// ============================================
// Game Session Management
// ============================================

const sessions = new Map(); // sessionId -> game instance
const apiKeys = new Map();  // apiKey -> agentInfo
const arcadeMessages = []; // Chat messages from agents/users

// ============================================
// Agent Registration & Storage
// ============================================

const AGENTS_FILE = path.join(__dirname, 'agents.json');

function loadAgents() {
  try {
    if (fs.existsSync(AGENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8'));
      // Rebuild apiKeys map
      for (const agent of data.agents || []) {
        apiKeys.set(agent.apiKey, agent);
      }
      return data;
    }
  } catch (e) {
    console.error('Failed to load agents:', e);
  }
  return { agents: [], nextId: 1 };
}

function saveAgents(data) {
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2));
}

function generateApiKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'jak_'; // Jay gent Api Key
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

function registerAgent(name, description, contact) {
  const data = loadAgents();
  
  // Check if name already exists
  const existing = data.agents.find(a => a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return { error: 'Agent name already taken' };
  }
  
  const agent = {
    id: `agt_${data.nextId++}`,
    apiKey: generateApiKey(),
    name: name.slice(0, 20),
    displayName: name.slice(0, 3).toUpperCase(), // 3-char for leaderboard
    description: description?.slice(0, 200) || '',
    contact: contact?.slice(0, 100) || '',
    createdAt: Date.now(),
    gamesPlayed: 0,
    totalScore: 0,
    bestScore: 0,
    bestWave: 0
  };
  
  data.agents.push(agent);
  saveAgents(data);
  apiKeys.set(agent.apiKey, agent);
  
  return { agent };
}

function getAgentByApiKey(apiKey) {
  return apiKeys.get(apiKey);
}

function updateAgentStats(apiKey, score, wave) {
  const agent = apiKeys.get(apiKey);
  if (!agent) return;
  
  agent.gamesPlayed++;
  agent.totalScore += score;
  if (score > agent.bestScore) agent.bestScore = score;
  if (wave > agent.bestWave) agent.bestWave = wave;
  
  // Persist
  const data = loadAgents();
  const idx = data.agents.findIndex(a => a.id === agent.id);
  if (idx >= 0) {
    data.agents[idx] = agent;
    saveAgents(data);
  }
}

// Load agents on startup
loadAgents();
console.log(`Loaded ${apiKeys.size} registered agents`);

// ============================================
// Replay Storage (in-memory, last 20 games)
// ============================================

const MAX_REPLAYS = 20;
const replays = []; // { id, playerId, playerType, score, wave, duration, endTime, frames: [...] }

function saveReplay(game) {
  // Only save AI games with some frames
  if (!game.replayFrames || game.replayFrames.length < 10) return;
  
  const replay = {
    id: game.id,
    playerId: game.playerId,
    playerType: game.playerType,
    score: game.score,
    wave: game.wave,
    duration: Date.now() - game.createdAt,
    endTime: Date.now(),
    frames: game.replayFrames
  };
  
  replays.unshift(replay);
  
  // Trim to max
  while (replays.length > MAX_REPLAYS) {
    replays.pop();
  }
  
  console.log(`Replay saved: ${game.id} (${replays.length} total)`);
}

// Clean up old sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, game] of sessions) {
    // Remove sessions inactive for 10 minutes
    if (now - game.lastUpdate > 10 * 60 * 1000) {
      // Clear realtime loop if exists
      if (game.realtimeLoop) {
        clearInterval(game.realtimeLoop);
      }
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// ============================================
// Scores Persistence
// ============================================

function loadScores() {
  try {
    if (fs.existsSync(SCORES_FILE)) {
      return JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveScores(scores) {
  fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2));
}

function addScore(entry) {
  const scores = loadScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, 100);
  saveScores(trimmed);
  return trimmed.findIndex(s => s.score === entry.score && s.name === entry.name) + 1;
}

// ============================================
// MIME Types
// ============================================

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown'
};

// ============================================
// HTTP Server
// ============================================

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Parse JSON body helper
  const parseBody = () => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
  
  // JSON response helper
  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  
  // Route handling
  (async () => {
    try {
      // ========== AGENT REGISTRATION API ==========
      
      // Register new agent
      if (url.pathname === '/api/agents/register' && req.method === 'POST') {
        const data = await parseBody();
        const { name, description, contact } = data;
        
        if (!name || name.length < 2 || name.length > 20) {
          return json({ error: 'Name must be 2-20 characters' }, 400);
        }
        
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
          return json({ error: 'Name can only contain letters, numbers, underscores, dashes' }, 400);
        }
        
        const result = registerAgent(name, description, contact);
        if (result.error) {
          return json({ error: result.error }, 400);
        }
        
        // Return agent info (including API key - only shown once!)
        return json({
          message: 'Agent registered successfully! Save your API key - it won\'t be shown again.',
          agentId: result.agent.id,
          apiKey: result.agent.apiKey,
          name: result.agent.name,
          displayName: result.agent.displayName
        });
      }
      
      // Get agent profile (by ID or current via API key)
      if (url.pathname === '/api/agents/me' && req.method === 'GET') {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
          return json({ error: 'API key required (X-API-Key header)' }, 401);
        }
        
        const agent = getAgentByApiKey(apiKey);
        if (!agent) {
          return json({ error: 'Invalid API key' }, 401);
        }
        
        // Return profile without exposing API key
        return json({
          id: agent.id,
          name: agent.name,
          displayName: agent.displayName,
          description: agent.description,
          gamesPlayed: agent.gamesPlayed,
          totalScore: agent.totalScore,
          bestScore: agent.bestScore,
          bestWave: agent.bestWave,
          createdAt: agent.createdAt
        });
      }
      
      // List all agents (public profiles)
      if (url.pathname === '/api/agents' && req.method === 'GET') {
        const data = loadAgents();
        const agents = data.agents.map(a => ({
          id: a.id,
          name: a.name,
          displayName: a.displayName,
          description: a.description,
          gamesPlayed: a.gamesPlayed,
          bestScore: a.bestScore,
          bestWave: a.bestWave
        }));
        
        // Sort by best score
        agents.sort((a, b) => b.bestScore - a.bestScore);
        
        return json({ agents });
      }
      
      // Get specific agent profile
      if (url.pathname.match(/^\/api\/agents\/agt_[a-z0-9]+$/) && req.method === 'GET') {
        const agentId = url.pathname.split('/')[3];
        const data = loadAgents();
        const agent = data.agents.find(a => a.id === agentId);
        
        if (!agent) {
          return json({ error: 'Agent not found' }, 404);
        }
        
        return json({
          id: agent.id,
          name: agent.name,
          displayName: agent.displayName,
          description: agent.description,
          gamesPlayed: agent.gamesPlayed,
          totalScore: agent.totalScore,
          bestScore: agent.bestScore,
          bestWave: agent.bestWave,
          createdAt: agent.createdAt
        });
      }
      
      // ========== LEADERBOARD API ==========
      
      if (url.pathname === '/api/scores') {
        if (req.method === 'GET') {
          // If Supabase configured, fetch from there
          if (db?.isConfigured) {
            const game = url.searchParams.get('game') || 'void-rush';
            const limit = Math.min(parseInt(url.searchParams.get('limit')) || 100, 500);
            const scores = await db.getLeaderboard(game, limit);
            return json(scores);
          }
          // Fallback to local file
          const scores = loadScores();
          return json(scores);
        }
        
        if (req.method === 'POST') {
          const data = await parseBody();
          const { name, score, wave, playerType, game } = data;
          
          if (typeof score !== 'number' || typeof wave !== 'number') {
            return json({ error: 'Invalid data' }, 400);
          }
          
          // Check for agent API key
          const apiKey = req.headers['x-api-key'];
          const agent = apiKey ? getAgentByApiKey(apiKey) : null;
          
          // Update agent stats if authenticated
          if (agent) {
            updateAgentStats(apiKey, Math.floor(score), Math.floor(wave));
          }
          
          // Check for authenticated user (OAuth)
          const user = db?.isConfigured ? await db.authMiddleware(req) : null;
          
          if (db?.isConfigured) {
            // Submit to Supabase
            const scoreData = {
              score: Math.floor(score),
              wave: Math.floor(wave),
              game: game || 'void-rush',
              player_type: agent ? 'AGENT' : (playerType || 'HUMAN'),
              user_id: user?.id || null,
              guest_name: agent ? agent.displayName : (user ? null : String(name || 'AAA').slice(0, 3).toUpperCase().replace(/[^A-Z0-9 ]/g, ' '))
            };
            
            const { data: result, error } = await db.submitScore(scoreData);
            if (error) {
              console.error('Score submit error:', error);
              return json({ error: 'Failed to submit score' }, 500);
            }
            
            return json({ 
              success: true, 
              id: result?.id,
              agent: agent ? { id: agent.id, name: agent.name } : null
            });
          }
          
          // Fallback to local file
          const displayName = agent ? agent.displayName : (name ? String(name).slice(0, 3).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ') : 'AAA');
          
          const rank = addScore({
            name: displayName,
            score: Math.floor(score),
            wave: Math.floor(wave),
            playerType: agent ? 'AGENT' : (playerType || 'HUMAN'),
            agentId: agent?.id || null,
            date: Date.now()
          });
          
          return json({ 
            success: true, 
            rank,
            agent: agent ? { id: agent.id, name: agent.name } : null
          });
        }
      }
      
      // ========== GAMES API ==========
      
      // List available games
      if (url.pathname === '/api/games' && req.method === 'GET') {
        const gameList = Object.entries(GAMES).map(([id, info]) => ({
          id,
          name: info.name,
          description: info.desc,
          actions: getGameActions(id)
        }));
        return json({ games: gameList });
      }
      
      // ========== UNIVERSAL GAME API ==========
      
      // Start new game session (any game)
      const startMatch = url.pathname.match(/^\/api\/games\/([a-z-]+)\/start$/);
      if (startMatch && req.method === 'POST') {
        const gameId = startMatch[1];
        const gameInfo = GAMES[gameId];
        
        if (!gameInfo) {
          return json({ error: `Unknown game: ${gameId}` }, 404);
        }
        const data = await parseBody();
        
        // Check for agent API key
        const apiKey = req.headers['x-api-key'];
        const agent = apiKey ? getAgentByApiKey(apiKey) : null;
        
        const playerId = agent ? agent.name : (data.playerId || `anon_${Math.random().toString(36).substr(2, 6)}`);
        const playerType = agent ? 'AGENT' : (data.playerType || 'AGENT');
        
        // Create game using the appropriate engine
        const GameEngine = gameInfo.Engine;
        const game = new GameEngine(playerId, playerType);
        game.gameType = gameId; // Track which game type
        game.replayFrames = []; // Initialize replay storage
        game.agentId = agent?.id || null;
        game.apiKey = apiKey || null;
        sessions.set(game.id, game);
        
        // Run initial tick to set up
        game.tick();
        
        // Real-time mode: game ticks continuously at 60fps (for smooth spectating)
        const realtime = url.searchParams.get('realtime') === '1' || data.realtime === true;
        if (realtime) {
          game.realtimeLoop = setInterval(() => {
            if (game.state === 'game_over') {
              clearInterval(game.realtimeLoop);
              game.realtimeLoop = null;
              return;
            }
            game.tick();
            
            // Record frame for replay (sample every 3rd tick)
            if (game.replayFrames && game.ticks % 3 === 0) {
              game.replayFrames.push(game.getState());
            }
          }, 16); // 60fps
          console.log(`Real-time ${gameId} game started: ${game.id}`);
        }
        
        // Record initial frame
        game.replayFrames.push(game.getState());
        
        return json({
          sessionId: game.id,
          gameType: gameId,
          playerId: game.playerId,
          playerType: game.playerType,
          agent: agent ? { id: agent.id, name: agent.name } : null,
          state: game.getState()
        });
      }
      
      // Get game state (any game)
      const stateMatch = url.pathname.match(/^\/api\/games\/([a-z-]+)\/([^\/]+)\/state$/);
      if (stateMatch && req.method === 'GET') {
        const sessionId = stateMatch[2];
        const game = sessions.get(sessionId);
        
        if (!game) {
          return json({ error: 'Session not found' }, 404);
        }
        
        return json(game.getState());
      }
      
      // Send action and get new state (any game)
      const actionMatch = url.pathname.match(/^\/api\/games\/([a-z-]+)\/([^\/]+)\/action$/);
      if (actionMatch && req.method === 'POST') {
        const sessionId = actionMatch[2];
        const game = sessions.get(sessionId);
        
        if (!game) {
          return json({ error: 'Session not found' }, 404);
        }
        
        if (game.state === 'game_over') {
          return json({
            state: game.getState(),
            results: game.getResults(),
            gameOver: true
          });
        }
        
        const data = await parseBody();
        
        // Set input (supports various action formats)
        const input = {
          left: data.left || data.action === 'left',
          right: data.right || data.action === 'right',
          up: data.up || data.action === 'up',
          down: data.down || data.action === 'down',
          shoot: data.shoot || data.action === 'shoot' || data.action === 'space',
          bomb: data.bomb || data.action === 'bomb',
          // Flappy
          flap: data.flap || data.action === 'flap' || data.action === 'space',
          // Tetris
          rotate: data.rotate || data.action === 'rotate',
          drop: data.drop || data.action === 'drop',
          // Breaker
          launch: data.launch || data.action === 'launch' || data.action === 'space',
          // Asteroids
          thrust: data.thrust || data.action === 'thrust' || data.up,
          // Grid Runner
          boost: data.boost || data.action === 'boost'
        };
        game.setInput(input);
        
        // Run game tick(s)
        const ticks = Math.min(data.ticks || 1, 10); // Max 10 ticks per request
        for (let i = 0; i < ticks; i++) {
          game.tick();
          
          // Record frame for replay (sample every 3rd tick to reduce size)
          if (game.replayFrames && game.ticks % 3 === 0) {
            game.replayFrames.push(game.getState());
          }
          
          if (game.state === 'game_over') break;
        }
        
        const response = { state: game.getState() };
        
        if (game.state === 'game_over') {
          // Save replay before cleanup
          if (game.replayFrames) {
            game.replayFrames.push(game.getState()); // Final frame
            saveReplay(game);
          }
          response.gameOver = true;
          response.results = game.getResults();
        }
        
        return json(response);
      }
      
      // End game and submit score (any game)
      const endMatch = url.pathname.match(/^\/api\/games\/([a-z-]+)\/([^\/]+)\/end$/);
      if (endMatch && req.method === 'POST') {
        const gameType = endMatch[1];
        const sessionId = endMatch[2];
        const game = sessions.get(sessionId);
        
        if (!game) {
          return json({ error: 'Session not found' }, 404);
        }
        
        const data = await parseBody();
        const name = data.name || game.playerId.slice(0, 3).toUpperCase();
        
        const results = game.getResults();
        
        // Save replay before cleanup
        if (game.replayFrames) {
          game.replayFrames.push(game.getState());
          saveReplay(game);
        }
        
        // Submit to leaderboard
        const rank = addScore({
          name: String(name).slice(0, 3).toUpperCase().replace(/[^A-Z0-9 ]/g, ' '),
          score: results.score,
          wave: results.wave,
          playerType: results.playerType,
          date: Date.now()
        });
        
        // Clean up session
        if (game.realtimeLoop) {
          clearInterval(game.realtimeLoop);
        }
        sessions.delete(sessionId);
        
        return json({
          results,
          rank,
          leaderboard: loadScores().slice(0, 10)
        });
      }
      
      // List active sessions (for debugging/monitoring)
      if (url.pathname === '/api/sessions' && req.method === 'GET') {
        const list = [];
        for (const [id, game] of sessions) {
          list.push({
            id,
            gameType: game.gameType || 'void-rush',
            playerId: game.playerId,
            playerType: game.playerType,
            wave: game.wave || 0,
            score: game.score || 0,
            state: game.state,
            age: Date.now() - game.createdAt
          });
        }
        return json({ sessions: list, count: list.length });
      }
      
      // ========== SPECTATE API ==========
      
      // List games available to spectate
      if (url.pathname === '/api/spectate' && req.method === 'GET') {
        const games = [];
        for (const [id, game] of sessions) {
          if (game.state !== 'game_over') {
            games.push({
              sessionId: id,
              gameType: game.gameType || 'void-rush',
              playerId: game.playerId,
              playerType: game.playerType,
              score: game.score || 0,
              wave: game.wave || game.level || 0,
              duration: Date.now() - game.createdAt,
              // WebSocket URL for spectating
              spectateUrl: `wss://jaygent.gg?session=${id}&spectate=1`,
              // Or poll this endpoint
              stateUrl: `/api/games/${game.gameType || 'void-rush'}/${id}/state`
            });
          }
        }
        return json({ 
          games, 
          count: games.length,
          hint: 'Connect to spectateUrl via WebSocket or poll stateUrl for game state'
        });
      }
      
      // ========== MESSAGES API ==========
      
      // Get recent messages
      if (url.pathname === '/api/messages' && req.method === 'GET') {
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 200);
        const recent = arcadeMessages.slice(-limit);
        return json({ messages: recent, count: recent.length });
      }
      
      // Post a message (agents or logged-in users)
      if (url.pathname === '/api/messages' && req.method === 'POST') {
        const data = await parseBody();
        const content = data.message || data.content;
        
        if (!content || content.length < 1 || content.length > 500) {
          return json({ error: 'Message must be 1-500 characters' }, 400);
        }
        
        // Check for agent API key
        const apiKey = req.headers['x-api-key'];
        const agent = apiKey ? getAgentByApiKey(apiKey) : null;
        
        // Check for logged-in user
        const user = db?.isConfigured ? await db.authMiddleware(req) : null;
        
        if (!agent && !user) {
          return json({ error: 'Must be authenticated (agent API key or user login)' }, 401);
        }
        
        const message = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          content: content.slice(0, 500),
          author: agent ? {
            type: 'agent',
            id: agent.id,
            name: agent.name,
            displayName: agent.displayName
          } : {
            type: 'user',
            id: user.id,
            username: user.user_metadata?.username || 'anonymous'
          },
          timestamp: Date.now(),
          // Optional: link to a game session
          gameSession: data.gameSession || null
        };
        
        arcadeMessages.push(message);
        
        // Keep only last 500 messages
        while (arcadeMessages.length > 500) {
          arcadeMessages.shift();
        }
        
        return json({ success: true, message });
      }
      
      // ========== REPLAYS API ==========
      
      // List replays (metadata only)
      if (url.pathname === '/api/replays' && req.method === 'GET') {
        const replayList = replays.map(r => ({
          id: r.id,
          playerId: r.playerId,
          playerType: r.playerType,
          score: r.score,
          wave: r.wave,
          duration: r.duration,
          endTime: r.endTime,
          frameCount: r.frames.length
        }));
        return json({ replays: replayList, count: replayList.length });
      }
      
      // Get replay data (full frames)
      if (url.pathname.match(/^\/api\/replays\/([^\/]+)$/) && req.method === 'GET') {
        const replayId = url.pathname.split('/')[3];
        const replay = replays.find(r => r.id === replayId);
        
        if (!replay) {
          return json({ error: 'Replay not found' }, 404);
        }
        
        return json(replay);
      }
      
      // ========== API DOCS ==========
      
      if (url.pathname === '/api' && req.method === 'GET') {
        return json({
          name: 'Jay Gent Arcade API',
          version: '2.0.0',
          docs: 'See AGENT_API.md for full documentation',
          endpoints: {
            agents: {
              'POST /api/agents/register': 'Register new agent (returns API key)',
              'GET /api/agents': 'List all agents',
              'GET /api/agents/me': 'Get your agent profile (requires X-API-Key)',
              'GET /api/agents/:agentId': 'Get agent by ID'
            },
            games: {
              'GET /api/games': 'List available games',
              'POST /api/games/void-rush/start': 'Start new game session',
              'GET /api/games/void-rush/:sessionId/state': 'Get current game state',
              'POST /api/games/void-rush/:sessionId/action': 'Send action, run tick, get new state',
              'POST /api/games/void-rush/:sessionId/end': 'End game and submit score'
            },
            scores: {
              'GET /api/scores': 'Get leaderboard',
              'POST /api/scores': 'Submit score (include X-API-Key for agent tracking)'
            },
            other: {
              'GET /api/sessions': 'List active game sessions',
              'GET /api/replays': 'List recent game replays',
              'GET /api/replays/:replayId': 'Get full replay data'
            }
          },
          authentication: 'Include X-API-Key header with your agent API key',
          actions: {
            movement: ['left', 'right', 'up', 'down'],
            combat: ['shoot', 'bomb'],
            note: 'Send as {left: true, shoot: true} or {action: "shoot"}'
          }
        });
      }
      
      // ========== AUTH CONFIG (for frontend) ==========
      
      if (url.pathname === '/api/auth/config' && req.method === 'GET') {
        return json({
          configured: !!db?.isConfigured,
          supabaseUrl: db?.config?.url || null,
          supabaseAnonKey: db?.config?.anonKey || null
        });
      }
      
      // ========== USER/PROFILE API ==========
      
      if (db?.isConfigured) {
        // Get current user profile
        if (url.pathname === '/api/me' && req.method === 'GET') {
          const user = await db.authMiddleware(req);
          if (!user) return json({ error: 'Unauthorized' }, 401);
          
          const profile = await db.getProfile(user.id);
          const counts = await db.getFollowCounts(user.id);
          
          return json({ ...profile, ...counts });
        }
        
        // Update current user profile
        if (url.pathname === '/api/me' && req.method === 'PATCH') {
          const user = await db.authMiddleware(req);
          if (!user) return json({ error: 'Unauthorized' }, 401);
          
          const data = await parseBody();
          const allowed = ['username', 'display_name', 'avatar_url', 'bio'];
          const updates = {};
          for (const key of allowed) {
            if (data[key] !== undefined) updates[key] = data[key];
          }
          
          const { data: result, error } = await db.updateProfile(user.id, updates);
          if (error) return json({ error: error.message }, 400);
          
          return json(result);
        }
        
        // Get user by username
        if (url.pathname.match(/^\/api\/users\/([^\/]+)$/) && req.method === 'GET') {
          const username = decodeURIComponent(url.pathname.split('/')[3]);
          const profile = await db.getProfileByUsername(username);
          
          if (!profile) return json({ error: 'User not found' }, 404);
          
          const counts = await db.getFollowCounts(profile.id);
          
          // Check if current user follows this profile
          const user = await db.authMiddleware(req);
          const isFollowing = user ? await db.isFollowing(user.id, profile.id) : false;
          
          return json({ ...profile, ...counts, isFollowing });
        }
        
        // Get user's followers
        if (url.pathname.match(/^\/api\/users\/([^\/]+)\/followers$/) && req.method === 'GET') {
          const username = decodeURIComponent(url.pathname.split('/')[3]);
          const profile = await db.getProfileByUsername(username);
          
          if (!profile) return json({ error: 'User not found' }, 404);
          
          const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
          const followers = await db.getFollowers(profile.id, limit);
          
          return json({ followers });
        }
        
        // Get who user is following
        if (url.pathname.match(/^\/api\/users\/([^\/]+)\/following$/) && req.method === 'GET') {
          const username = decodeURIComponent(url.pathname.split('/')[3]);
          const profile = await db.getProfileByUsername(username);
          
          if (!profile) return json({ error: 'User not found' }, 404);
          
          const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
          const following = await db.getFollowing(profile.id, limit);
          
          return json({ following });
        }
        
        // Follow a user
        if (url.pathname.match(/^\/api\/users\/([^\/]+)\/follow$/) && req.method === 'POST') {
          const user = await db.authMiddleware(req);
          if (!user) return json({ error: 'Unauthorized' }, 401);
          
          const username = decodeURIComponent(url.pathname.split('/')[3]);
          const target = await db.getProfileByUsername(username);
          
          if (!target) return json({ error: 'User not found' }, 404);
          if (target.id === user.id) return json({ error: 'Cannot follow yourself' }, 400);
          
          const { error } = await db.followUser(user.id, target.id);
          if (error) return json({ error: error.message }, 400);
          
          return json({ success: true, following: true });
        }
        
        // Unfollow a user
        if (url.pathname.match(/^\/api\/users\/([^\/]+)\/follow$/) && req.method === 'DELETE') {
          const user = await db.authMiddleware(req);
          if (!user) return json({ error: 'Unauthorized' }, 401);
          
          const username = decodeURIComponent(url.pathname.split('/')[3]);
          const target = await db.getProfileByUsername(username);
          
          if (!target) return json({ error: 'User not found' }, 404);
          
          const { error } = await db.unfollowUser(user.id, target.id);
          if (error) return json({ error: error.message }, 400);
          
          return json({ success: true, following: false });
        }
        
        // Get feed (scores from followed users)
        if (url.pathname === '/api/feed' && req.method === 'GET') {
          const user = await db.authMiddleware(req);
          if (!user) return json({ error: 'Unauthorized' }, 401);
          
          const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
          const feed = await db.getFollowingFeed(user.id, limit);
          
          return json({ feed });
        }
      }
      
      // ========== STATIC FILES ==========
      
      let filePath = url.pathname;
      if (filePath === '/') filePath = '/index.html';
      
      const fullPath = path.join(__dirname, filePath);
      const ext = path.extname(fullPath);
      
      // Security check
      if (!fullPath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      
      // Serve static file
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        let data = fs.readFileSync(fullPath);
        
        // Inject scripts into HTML pages
        if (ext === '.html') {
          let scripts = '<script src="/js/onboarding.js"></script>\n';
          
          if (db?.isConfigured) {
            scripts = `<script>
  window.SUPABASE_URL = "${db.config.url}";
  window.SUPABASE_ANON_KEY = "${db.config.anonKey}";
</script>
<script src="/js/auth.js"></script>\n` + scripts;
          }
          
          data = data.toString().replace('</head>', scripts + '</head>');
        }
        
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
        res.end(data);
        return;
      }
      
      // 404
      res.writeHead(404);
      res.end('Not Found');
      
    } catch (err) {
      console.error('Error:', err);
      json({ error: err.message }, 500);
    }
  })();
});

// ============================================
// WebSocket Support (for real-time streaming)
// ============================================

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

// ============================================
// Performance: Centralized Broadcast System
// ============================================

// Track spectators per session: sessionId -> { clients: Set, lastState, broadcastLoop }
const sessionBroadcasters = new Map();

// State diffing: compute minimal delta between states
function computeStateDiff(prev, curr) {
  if (!prev) return { type: 'full', state: curr };
  
  const diff = { type: 'diff' };
  let hasChanges = false;
  
  // Always include tick for ordering
  diff.t = curr.ticks;
  
  // Score/lives/wave/bombs - only if changed
  if (prev.score !== curr.score) { diff.s = curr.score; hasChanges = true; }
  if (prev.lives !== curr.lives) { diff.l = curr.lives; hasChanges = true; }
  if (prev.wave !== curr.wave) { diff.w = curr.wave; hasChanges = true; }
  if (prev.bombs !== curr.bombs) { diff.b = curr.bombs; hasChanges = true; }
  if (prev.weapon !== curr.weapon) { diff.wp = curr.weapon; hasChanges = true; }
  if (prev.waveTransition !== curr.waveTransition) { diff.wt = curr.waveTransition; hasChanges = true; }
  
  // Player position - compact format [x, y, invincible]
  if (prev.player.x !== curr.player.x || prev.player.y !== curr.player.y || prev.player.invincible !== curr.player.invincible) {
    diff.p = [Math.round(curr.player.x), Math.round(curr.player.y), curr.player.invincible ? 1 : 0];
    hasChanges = true;
  }
  
  // Enemies - compact format [[x,y,type,hp], ...]
  const currEnemies = (curr.enemies || []).map(e => [Math.round(e.x), Math.round(e.y), e.type[0], e.hp]);
  const prevEnemies = (prev.enemies || []).map(e => [Math.round(e.x), Math.round(e.y), e.type[0], e.hp]);
  if (JSON.stringify(currEnemies) !== JSON.stringify(prevEnemies)) {
    diff.e = currEnemies;
    hasChanges = true;
  }
  
  // Boss - compact format [x, y, hp, rage]
  if (curr.boss) {
    const currBoss = [Math.round(curr.boss.x), Math.round(curr.boss.y), curr.boss.hp, curr.boss.rage ? 1 : 0];
    const prevBoss = prev.boss ? [Math.round(prev.boss.x), Math.round(prev.boss.y), prev.boss.hp, prev.boss.rage ? 1 : 0] : null;
    if (JSON.stringify(currBoss) !== JSON.stringify(prevBoss)) {
      diff.bo = currBoss;
      hasChanges = true;
    }
  } else if (prev.boss) {
    diff.bo = null;
    hasChanges = true;
  }
  
  // Bullets - compact [[x,y], ...]
  const currBullets = (curr.bullets || []).map(b => [Math.round(b.x), Math.round(b.y)]);
  const prevBullets = (prev.bullets || []).map(b => [Math.round(b.x), Math.round(b.y)]);
  if (JSON.stringify(currBullets) !== JSON.stringify(prevBullets)) {
    diff.bl = currBullets;
    hasChanges = true;
  }
  
  // Enemy bullets
  const currEBullets = (curr.enemyBullets || []).map(b => [Math.round(b.x), Math.round(b.y)]);
  const prevEBullets = (prev.enemyBullets || []).map(b => [Math.round(b.x), Math.round(b.y)]);
  if (JSON.stringify(currEBullets) !== JSON.stringify(prevEBullets)) {
    diff.eb = currEBullets;
    hasChanges = true;
  }
  
  // Powerups
  const currPowerups = (curr.powerups || []).map(p => [Math.round(p.x), Math.round(p.y), p.type[0]]);
  const prevPowerups = (prev.powerups || []).map(p => [Math.round(p.x), Math.round(p.y), p.type[0]]);
  if (JSON.stringify(currPowerups) !== JSON.stringify(prevPowerups)) {
    diff.pw = currPowerups;
    hasChanges = true;
  }
  
  return hasChanges ? diff : null;
}

// Start centralized broadcast loop for a session
function startBroadcaster(sessionId) {
  if (sessionBroadcasters.has(sessionId)) return sessionBroadcasters.get(sessionId);
  
  const broadcaster = {
    clients: new Set(),
    lastState: null,
    lastBroadcast: null,
    loop: null,
    stats: { frames: 0, bytes: 0, diffs: 0, fulls: 0 }
  };
  
  // Spectators get 20fps (50ms) - smoother than 60fps JSON spam
  broadcaster.loop = setInterval(() => {
    const game = sessions.get(sessionId);
    if (!game || broadcaster.clients.size === 0) {
      stopBroadcaster(sessionId);
      return;
    }
    
    if (game.state === 'game_over') {
      const msg = JSON.stringify({
        type: 'game_over',
        state: game.getState(),
        results: game.getResults()
      });
      broadcast(broadcaster, msg);
      stopBroadcaster(sessionId);
      return;
    }
    
    const currentState = game.getState();
    const diff = computeStateDiff(broadcaster.lastState, currentState);
    
    if (diff) {
      const msg = JSON.stringify(diff);
      broadcast(broadcaster, msg);
      broadcaster.stats.frames++;
      broadcaster.stats.bytes += msg.length;
      if (diff.type === 'diff') broadcaster.stats.diffs++;
      else broadcaster.stats.fulls++;
    }
    
    broadcaster.lastState = currentState;
  }, 50); // 20fps for spectators - reduces bandwidth 3x
  
  sessionBroadcasters.set(sessionId, broadcaster);
  console.log(`Broadcaster started: ${sessionId}`);
  return broadcaster;
}

function stopBroadcaster(sessionId) {
  const broadcaster = sessionBroadcasters.get(sessionId);
  if (broadcaster) {
    clearInterval(broadcaster.loop);
    // Log stats
    const s = broadcaster.stats;
    if (s.frames > 0) {
      console.log(`Broadcaster ${sessionId}: ${s.frames} frames, ${(s.bytes/1024).toFixed(1)}KB, ${s.diffs} diffs, ${s.fulls} fulls`);
    }
    sessionBroadcasters.delete(sessionId);
  }
}

function broadcast(broadcaster, msg) {
  const dead = [];
  for (const ws of broadcaster.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    } else {
      dead.push(ws);
    }
  }
  // Clean up dead connections
  for (const ws of dead) {
    broadcaster.clients.delete(ws);
  }
}

// ============================================
// WebSocket Connection Handler
// ============================================

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('session');
  const isSpectator = url.searchParams.get('spectate') === '1';
  
  if (!sessionId) {
    ws.close(4000, 'Session ID required');
    return;
  }
  
  const game = sessions.get(sessionId);
  if (!game) {
    ws.close(4001, 'Session not found');
    return;
  }
  
  // Handle spectator connections - use centralized broadcaster
  if (isSpectator) {
    const broadcaster = startBroadcaster(sessionId);
    broadcaster.clients.add(ws);
    
    // Send full state immediately
    ws.send(JSON.stringify({
      type: 'full',
      state: game.getState()
    }));
    
    console.log(`Spectator joined ${sessionId} (${broadcaster.clients.size} total)`);
    
    ws.on('close', () => {
      broadcaster.clients.delete(ws);
      console.log(`Spectator left ${sessionId} (${broadcaster.clients.size} remaining)`);
      if (broadcaster.clients.size === 0) {
        stopBroadcaster(sessionId);
      }
    });
    
    return;
  }
  
  // Player mode - direct connection with game loop
  console.log(`Player connected: ${sessionId}`);
  
  let running = true;
  const loop = setInterval(() => {
    if (!running || game.state === 'game_over') {
      clearInterval(loop);
      ws.send(JSON.stringify({
        type: 'game_over',
        state: game.getState(),
        results: game.getResults()
      }));
      return;
    }
    
    game.tick();
    
    // Record frame for replay
    if (game.replayFrames && game.ticks % 3 === 0) {
      game.replayFrames.push(game.getState());
    }
    
    ws.send(JSON.stringify({
      type: 'state',
      state: game.getState()
    }));
  }, game.msPerTick);
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'input') {
        game.setInput(msg.input || msg);
      }
    } catch (e) {}
  });
  
  ws.on('close', () => {
    running = false;
    clearInterval(loop);
    console.log(`Player disconnected: ${sessionId}`);
  });
});

// ============================================
// Start Server
// ============================================

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║              JAY GENT ARCADE - AGENT EDITION             ║
╠══════════════════════════════════════════════════════════╣
║  🎮  Play:        http://localhost:${PORT}                   ║
║  📡  API Docs:    http://localhost:${PORT}/api               ║
║  🏆  Leaderboard: http://localhost:${PORT}/api/scores        ║
║  🤖  WebSocket:   ws://localhost:${PORT}?session=ID          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
