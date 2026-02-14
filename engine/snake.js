/**
 * NEON SNAKE - Server-Side Game Engine
 * Headless game logic for AI agents
 */

const W = 600, H = 600;
const GRID = 20;
const COLS = W / GRID;
const ROWS = H / GRID;

class SnakeGame {
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
    this.speed = 8; // Ticks per move (lower = faster)
    
    // Snake starts in center
    this.snake = [
      { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) },
      { x: Math.floor(COLS / 2) - 1, y: Math.floor(ROWS / 2) },
      { x: Math.floor(COLS / 2) - 2, y: Math.floor(ROWS / 2) }
    ];
    
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    
    // Spawn food
    this.food = this.spawnFood();
    this.powerup = null;
    this.powerupTimer = 0;
    
    // Ghost mode (pass through walls)
    this.ghost = false;
    this.ghostTimer = 0;
    
    // Input
    this.input = {
      left: false,
      right: false,
      up: false,
      down: false
    };
  }
  
  spawnFood() {
    let pos;
    do {
      pos = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS)
      };
    } while (this.snake.some(s => s.x === pos.x && s.y === pos.y));
    return pos;
  }
  
  spawnPowerup() {
    if (Math.random() > 0.3) return null;
    let pos;
    do {
      pos = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS),
        type: Math.random() > 0.5 ? 'speed' : 'ghost'
      };
    } while (this.snake.some(s => s.x === pos.x && s.y === pos.y));
    return pos;
  }
  
  setInput(input) {
    // Process direction changes (prevent 180° turns)
    if (input.left && this.direction.x !== 1) {
      this.nextDirection = { x: -1, y: 0 };
    } else if (input.right && this.direction.x !== -1) {
      this.nextDirection = { x: 1, y: 0 };
    } else if (input.up && this.direction.y !== 1) {
      this.nextDirection = { x: 0, y: -1 };
    } else if (input.down && this.direction.y !== -1) {
      this.nextDirection = { x: 0, y: 1 };
    }
    this.input = input;
  }
  
  tick() {
    if (this.state !== 'playing') return;
    
    this.ticks++;
    this.lastUpdate = Date.now();
    
    // Powerup timers
    if (this.ghostTimer > 0) {
      this.ghostTimer--;
      if (this.ghostTimer === 0) this.ghost = false;
    }
    
    if (this.powerup) {
      this.powerupTimer++;
      if (this.powerupTimer > 300) { // 5 seconds
        this.powerup = null;
        this.powerupTimer = 0;
      }
    }
    
    // Move snake at intervals
    this.moveCounter++;
    if (this.moveCounter < this.speed) return;
    this.moveCounter = 0;
    
    // Apply direction
    this.direction = { ...this.nextDirection };
    
    // Calculate new head position
    const head = this.snake[0];
    let newHead = {
      x: head.x + this.direction.x,
      y: head.y + this.direction.y
    };
    
    // Wall collision / wrap
    if (this.ghost) {
      // Wrap around
      newHead.x = (newHead.x + COLS) % COLS;
      newHead.y = (newHead.y + ROWS) % ROWS;
    } else {
      // Die on wall
      if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
        this.state = 'game_over';
        return;
      }
    }
    
    // Self collision (skip tail since it will move)
    for (let i = 0; i < this.snake.length - 1; i++) {
      if (this.snake[i].x === newHead.x && this.snake[i].y === newHead.y) {
        this.state = 'game_over';
        return;
      }
    }
    
    // Add new head
    this.snake.unshift(newHead);
    
    // Check food
    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      this.score += 10;
      this.food = this.spawnFood();
      
      // Speed up slightly
      if (this.speed > 3) this.speed -= 0.1;
      
      // Maybe spawn powerup
      if (!this.powerup && Math.random() < 0.2) {
        this.powerup = this.spawnPowerup();
      }
    } else {
      // Remove tail (didn't eat)
      this.snake.pop();
    }
    
    // Check powerup
    if (this.powerup && newHead.x === this.powerup.x && newHead.y === this.powerup.y) {
      if (this.powerup.type === 'ghost') {
        this.ghost = true;
        this.ghostTimer = 300; // 5 seconds
      } else if (this.powerup.type === 'speed') {
        this.score += 50;
      }
      this.powerup = null;
      this.powerupTimer = 0;
    }
  }
  
  getState() {
    return {
      gameId: this.id,
      state: this.state,
      score: this.score,
      ticks: this.ticks,
      snake: this.snake.map(s => ({ x: s.x, y: s.y })),
      head: this.snake[0],
      direction: this.direction,
      food: this.food,
      powerup: this.powerup,
      ghost: this.ghost,
      ghostTimer: this.ghostTimer,
      length: this.snake.length,
      speed: this.speed,
      dimensions: { width: W, height: H, cols: COLS, rows: ROWS, grid: GRID }
    };
  }
  
  getResults() {
    return {
      score: this.score,
      length: this.snake.length,
      ticks: this.ticks,
      duration: Date.now() - this.createdAt,
      playerId: this.playerId,
      playerType: this.playerType
    };
  }
}

module.exports = { SnakeGame };
