/**
 * VOID RUSH Game Server
 * Serves static files + public leaderboard API
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const SCORES_FILE = path.join(__dirname, 'scores.json');
const MAX_SCORES = 100;

// Initialize scores file
if (!fs.existsSync(SCORES_FILE)) {
  fs.writeFileSync(SCORES_FILE, '[]');
}

function loadScores() {
  try {
    return JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveScores(scores) {
  fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2));
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // API endpoints
  if (url.pathname === '/api/scores') {
    if (req.method === 'GET') {
      // Get leaderboard
      const scores = loadScores();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(scores));
      return;
    }
    
    if (req.method === 'POST') {
      // Submit score
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const { name, score, wave } = data;
          
          // Validate
          if (!name || typeof score !== 'number' || typeof wave !== 'number') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid data' }));
            return;
          }
          
          // Sanitize name
          const cleanName = String(name).slice(0, 3).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ');
          
          // Load, add, sort, trim, save
          const scores = loadScores();
          scores.push({
            name: cleanName,
            score: Math.floor(score),
            wave: Math.floor(wave),
            date: Date.now()
          });
          scores.sort((a, b) => b.score - a.score);
          const trimmed = scores.slice(0, MAX_SCORES);
          saveScores(trimmed);
          
          // Find rank
          const rank = trimmed.findIndex(s => s.date === scores[scores.length - 1]?.date) + 1;
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, rank }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }
  }
  
  // Static file serving
  let filePath = url.pathname;
  if (filePath === '/') filePath = '/void-rush.html';
  
  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath);
  
  // Security: prevent directory traversal
  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
      return;
    }
    
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║                    VOID RUSH                         ║
║           Game Server Running 🚀                     ║
╠══════════════════════════════════════════════════════╣
║  Play:        http://localhost:${PORT}                  ║
║  Leaderboard: http://localhost:${PORT}/api/scores       ║
╚══════════════════════════════════════════════════════╝
  `);
});
