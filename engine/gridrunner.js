/**
 * GRID RUNNER (Tron) - Server-Side Game Engine
 * Headless game logic for AI agents
 */

const W = 600, H = 600;
const CELL = 10;
const COLS = W / CELL;
const ROWS = H / CELL;

class GridRunnerGame {
  constructor(playerId, playerType = 'AGENT') {
    this.id = Math.random().toString(36).substr(2, 9);
    this.playerId = playerId;
    this.playerType = playerType;
    this.createdAt = Date.now();
    this.lastUpdate = Date.now();
    this.tickRate = 60;
    this.msPerTick = 1000 / this.tickRate;
    this.reset();
  }
  
  reset() {
    this.state = 'playing';
    this.score = 0;
    this.ticks = 0;
    this.moveCounter = 0;
    this.moveInterval = 3; // Ticks per move
    
    // Grid for collision (0 = empty, 1 = player trail, 2 = AI trail)
    this.grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
    
    // Player (left side, moving right)
    this.player = {
      x: 10,
      y: Math.floor(ROWS / 2),
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      trail: [],
      alive: true,
      boosting: false
    };
    
    // AI opponent (right side, moving left)
    this.ai = {
      x: COLS - 10,
      y: Math.floor(ROWS / 2),
      dir: { x: -1, y: 0 },
      trail: [],
      alive: true
    };
    
    // Initial positions on grid
    this.grid[this.player.y][this.player.x] = 1;
    this.grid[this.ai.y][this.ai.x] = 2;
    
    // Input
    this.input = {
      left: false,
      right: false,
      up: false,
      down: false,
      boost: false
    };
  }
  
  setInput(input) {
    // Change direction (can't reverse)
    if (input.left && this.player.dir.x !== 1) {
      this.player.nextDir = { x: -1, y: 0 };
    } else if (input.right && this.player.dir.x !== -1) {
      this.player.nextDir = { x: 1, y: 0 };
    } else if (input.up && this.player.dir.y !== 1) {
      this.player.nextDir = { x: 0, y: -1 };
    } else if (input.down && this.player.dir.y !== -1) {
      this.player.nextDir = { x: 0, y: 1 };
    }
    
    this.player.boosting = input.boost;
    this.input = input;
  }
  
  tick() {
    if (this.state !== 'playing') return;
    
    this.ticks++;
    this.lastUpdate = Date.now();
    
    // Move at intervals
    this.moveCounter++;
    const interval = this.player.boosting ? 1 : this.moveInterval;
    if (this.moveCounter < interval) return;
    this.moveCounter = 0;
    
    // Apply directions
    this.player.dir = { ...this.player.nextDir };
    
    // Move player
    if (this.player.alive) {
      const newX = this.player.x + this.player.dir.x;
      const newY = this.player.y + this.player.dir.y;
      
      // Check collision
      if (newX < 0 || newX >= COLS || newY < 0 || newY >= ROWS || this.grid[newY][newX] !== 0) {
        this.player.alive = false;
      } else {
        this.player.trail.push({ x: this.player.x, y: this.player.y });
        this.player.x = newX;
        this.player.y = newY;
        this.grid[newY][newX] = 1;
        this.score++;
      }
    }
    
    // AI movement
    if (this.ai.alive) {
      // Simple AI: avoid walls and trails
      const possibleDirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
      ].filter(d => {
        // Can't reverse
        if (d.x === -this.ai.dir.x && d.y === -this.ai.dir.y) return false;
        
        const nx = this.ai.x + d.x;
        const ny = this.ai.y + d.y;
        
        // Check if safe
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return false;
        if (this.grid[ny][nx] !== 0) return false;
        
        return true;
      });
      
      if (possibleDirs.length === 0) {
        this.ai.alive = false;
      } else {
        // Choose direction with most space ahead
        let bestDir = possibleDirs[0];
        let bestSpace = 0;
        
        for (const dir of possibleDirs) {
          let space = 0;
          let checkX = this.ai.x + dir.x;
          let checkY = this.ai.y + dir.y;
          
          while (checkX >= 0 && checkX < COLS && checkY >= 0 && checkY < ROWS && 
                 this.grid[checkY][checkX] === 0 && space < 20) {
            space++;
            checkX += dir.x;
            checkY += dir.y;
          }
          
          // Add some randomness
          space += Math.random() * 3;
          
          if (space > bestSpace) {
            bestSpace = space;
            bestDir = dir;
          }
        }
        
        this.ai.dir = bestDir;
        
        const newX = this.ai.x + this.ai.dir.x;
        const newY = this.ai.y + this.ai.dir.y;
        
        this.ai.trail.push({ x: this.ai.x, y: this.ai.y });
        this.ai.x = newX;
        this.ai.y = newY;
        this.grid[newY][newX] = 2;
      }
    }
    
    // Check win/lose
    if (!this.player.alive && !this.ai.alive) {
      // Draw
      this.state = 'game_over';
    } else if (!this.player.alive) {
      // Player loses
      this.state = 'game_over';
    } else if (!this.ai.alive) {
      // Player wins
      this.score += 500;
      this.state = 'game_over';
    }
  }
  
  getState() {
    return {
      gameId: this.id,
      state: this.state,
      score: this.score,
      ticks: this.ticks,
      player: {
        x: this.player.x,
        y: this.player.y,
        dir: this.player.dir,
        alive: this.player.alive,
        trail: this.player.trail.slice(-50) // Last 50 trail positions
      },
      ai: {
        x: this.ai.x,
        y: this.ai.y,
        dir: this.ai.dir,
        alive: this.ai.alive,
        trail: this.ai.trail.slice(-50)
      },
      grid: this.grid, // Full grid for collision planning
      dimensions: { width: W, height: H, cols: COLS, rows: ROWS, cell: CELL }
    };
  }
  
  getResults() {
    return {
      score: this.score,
      won: this.player.alive && !this.ai.alive,
      survived: this.player.alive,
      trailLength: this.player.trail.length,
      ticks: this.ticks,
      duration: Date.now() - this.createdAt,
      playerId: this.playerId,
      playerType: this.playerType
    };
  }
}

module.exports = { GridRunnerGame };
