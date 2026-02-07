/**
 * VOID RUSH / JAY GENT ARCADE - Game Server
 * REST API + WebSocket for AI agents
 * Static files for human players
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { VoidRushGame } = require('./engine/void-rush');

const PORT = process.env.PORT || 8080;
const SCORES_FILE = path.join(__dirname, 'scores.json');

// ============================================
// Game Session Management
// ============================================

const sessions = new Map(); // sessionId -> game instance
const apiKeys = new Map();  // apiKey -> agentInfo

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
  '.ico': 'image/x-icon'
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
      // ========== LEADERBOARD API ==========
      
      if (url.pathname === '/api/scores') {
        if (req.method === 'GET') {
          const scores = loadScores();
          return json(scores);
        }
        
        if (req.method === 'POST') {
          const data = await parseBody();
          const { name, score, wave, playerType } = data;
          
          if (!name || typeof score !== 'number' || typeof wave !== 'number') {
            return json({ error: 'Invalid data' }, 400);
          }
          
          const cleanName = String(name).slice(0, 3).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ');
          const rank = addScore({
            name: cleanName,
            score: Math.floor(score),
            wave: Math.floor(wave),
            playerType: playerType || 'HUMAN',
            date: Date.now()
          });
          
          return json({ success: true, rank });
        }
      }
      
      // ========== GAMES API ==========
      
      // List available games
      if (url.pathname === '/api/games' && req.method === 'GET') {
        return json({
          games: [
            {
              id: 'void-rush',
              name: 'VOID RUSH',
              description: 'Space shooter with infinite waves',
              dimensions: { width: 550, height: 650 },
              actions: ['left', 'right', 'up', 'down', 'shoot', 'bomb']
            }
          ]
        });
      }
      
      // ========== VOID RUSH GAME API ==========
      
      // Start new game session
      if (url.pathname === '/api/games/void-rush/start' && req.method === 'POST') {
        const data = await parseBody();
        const playerId = data.playerId || `anon_${Math.random().toString(36).substr(2, 6)}`;
        const playerType = data.playerType || 'AGENT';
        
        const game = new VoidRushGame(playerId, playerType);
        game.replayFrames = []; // Initialize replay storage
        sessions.set(game.id, game);
        
        // Run initial tick to set up
        game.tick();
        
        // Record initial frame
        game.replayFrames.push(game.getState());
        
        return json({
          sessionId: game.id,
          playerId: game.playerId,
          playerType: game.playerType,
          state: game.getState()
        });
      }
      
      // Get game state
      if (url.pathname.match(/^\/api\/games\/void-rush\/([^\/]+)\/state$/) && req.method === 'GET') {
        const sessionId = url.pathname.split('/')[4];
        const game = sessions.get(sessionId);
        
        if (!game) {
          return json({ error: 'Session not found' }, 404);
        }
        
        return json(game.getState());
      }
      
      // Send action and get new state (tick)
      if (url.pathname.match(/^\/api\/games\/void-rush\/([^\/]+)\/action$/) && req.method === 'POST') {
        const sessionId = url.pathname.split('/')[4];
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
        
        // Set input
        game.setInput({
          left: data.left || data.action === 'left',
          right: data.right || data.action === 'right',
          up: data.up || data.action === 'up',
          down: data.down || data.action === 'down',
          shoot: data.shoot || data.action === 'shoot',
          bomb: data.bomb || data.action === 'bomb'
        });
        
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
      
      // End game and submit score
      if (url.pathname.match(/^\/api\/games\/void-rush\/([^\/]+)\/end$/) && req.method === 'POST') {
        const sessionId = url.pathname.split('/')[4];
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
            playerId: game.playerId,
            playerType: game.playerType,
            wave: game.wave,
            score: game.score,
            state: game.state,
            age: Date.now() - game.createdAt
          });
        }
        return json({ sessions: list, count: list.length });
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
          version: '1.0.0',
          endpoints: {
            'GET /api/games': 'List available games',
            'GET /api/scores': 'Get leaderboard',
            'POST /api/scores': 'Submit score (name, score, wave, playerType)',
            'POST /api/games/void-rush/start': 'Start new game session',
            'GET /api/games/void-rush/:sessionId/state': 'Get current game state',
            'POST /api/games/void-rush/:sessionId/action': 'Send action, run tick, get new state',
            'POST /api/games/void-rush/:sessionId/end': 'End game and submit score',
            'GET /api/sessions': 'List active game sessions',
            'GET /api/replays': 'List recent game replays (last 20)',
            'GET /api/replays/:replayId': 'Get full replay data with frames'
          },
          actions: {
            movement: ['left', 'right', 'up', 'down'],
            combat: ['shoot', 'bomb'],
            note: 'Send as {left: true, shoot: true} or {action: "shoot"}'
          }
        });
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
        const data = fs.readFileSync(fullPath);
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

// Track spectators per session
const spectators = new Map(); // sessionId -> Set of WebSocket clients

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
  
  // Handle spectator connections
  if (isSpectator) {
    console.log(`Spectator connected: ${sessionId}`);
    
    // Add to spectators set
    if (!spectators.has(sessionId)) {
      spectators.set(sessionId, new Set());
    }
    spectators.get(sessionId).add(ws);
    
    // Send current state immediately
    ws.send(JSON.stringify({
      type: 'state',
      state: game.getState()
    }));
    
    // Stream state updates to spectator
    let running = true;
    const spectateLoop = setInterval(() => {
      if (!running || ws.readyState !== WebSocket.OPEN) {
        clearInterval(spectateLoop);
        return;
      }
      
      if (game.state === 'game_over') {
        ws.send(JSON.stringify({
          type: 'game_over',
          state: game.getState(),
          results: game.getResults()
        }));
        clearInterval(spectateLoop);
        return;
      }
      
      // Just send current state (don't tick - player/AI does that)
      ws.send(JSON.stringify({
        type: 'state',
        state: game.getState()
      }));
    }, 33); // ~30fps state updates
    
    ws.on('close', () => {
      running = false;
      spectators.get(sessionId)?.delete(ws);
      console.log(`Spectator disconnected: ${sessionId}`);
    });
    
    return; // Don't run player logic for spectators
  }
  
  console.log(`WebSocket player connected: ${sessionId}`);
  
  // Game loop for this connection (player mode)
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
    console.log(`WebSocket disconnected: ${sessionId}`);
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
