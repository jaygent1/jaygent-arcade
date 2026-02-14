/**
 * NEON FLAP - Server-Side Game Engine
 * Headless game logic for AI agents
 */

const W = 400, H = 600;
const PIPE_WIDTH = 60;
const PIPE_GAP = 150;
const BIRD_SIZE = 20;

class FlappyGame {
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
    
    // Bird
    this.bird = {
      x: 80,
      y: H / 2,
      vy: 0,
      gravity: 0.4,
      flapStrength: -8
    };
    
    // Pipes
    this.pipes = [];
    this.pipeSpeed = 3;
    this.pipeSpawnTimer = 0;
    this.pipeSpawnInterval = 100; // ticks
    
    // Spawn initial pipes
    for (let i = 0; i < 3; i++) {
      this.spawnPipe(250 + i * 200);
    }
    
    // Input
    this.input = {
      flap: false
    };
    this.lastFlap = false;
  }
  
  spawnPipe(x) {
    const gapY = 100 + Math.random() * (H - 250);
    this.pipes.push({
      x: x,
      gapY: gapY,
      gapH: PIPE_GAP,
      scored: false
    });
  }
  
  setInput(input) {
    this.input = { ...this.input, ...input };
  }
  
  tick() {
    if (this.state !== 'playing') return;
    
    this.ticks++;
    this.lastUpdate = Date.now();
    
    // Flap (only on key press, not hold)
    if (this.input.flap && !this.lastFlap) {
      this.bird.vy = this.bird.flapStrength;
    }
    this.lastFlap = this.input.flap;
    
    // Bird physics
    this.bird.vy += this.bird.gravity;
    this.bird.y += this.bird.vy;
    
    // Ceiling/floor collision
    if (this.bird.y < BIRD_SIZE / 2) {
      this.bird.y = BIRD_SIZE / 2;
      this.bird.vy = 0;
    }
    if (this.bird.y > H - BIRD_SIZE / 2) {
      this.state = 'game_over';
      return;
    }
    
    // Move pipes
    this.pipes.forEach(pipe => {
      pipe.x -= this.pipeSpeed;
    });
    
    // Remove off-screen pipes and spawn new ones
    if (this.pipes[0] && this.pipes[0].x < -PIPE_WIDTH) {
      this.pipes.shift();
      this.spawnPipe(this.pipes[this.pipes.length - 1].x + 200);
    }
    
    // Collision detection
    for (const pipe of this.pipes) {
      // Check if bird is at pipe x position
      if (this.bird.x + BIRD_SIZE / 2 > pipe.x - PIPE_WIDTH / 2 &&
          this.bird.x - BIRD_SIZE / 2 < pipe.x + PIPE_WIDTH / 2) {
        // Check if bird is in the gap
        if (this.bird.y - BIRD_SIZE / 2 < pipe.gapY ||
            this.bird.y + BIRD_SIZE / 2 > pipe.gapY + pipe.gapH) {
          this.state = 'game_over';
          return;
        }
      }
      
      // Score when passing pipe
      if (!pipe.scored && pipe.x + PIPE_WIDTH / 2 < this.bird.x) {
        pipe.scored = true;
        this.score++;
        
        // Speed up slightly
        if (this.pipeSpeed < 6) {
          this.pipeSpeed += 0.05;
        }
      }
    }
  }
  
  getState() {
    return {
      gameId: this.id,
      state: this.state,
      score: this.score,
      ticks: this.ticks,
      bird: {
        x: this.bird.x,
        y: this.bird.y,
        vy: this.bird.vy
      },
      pipes: this.pipes.map(p => ({
        x: p.x,
        gapY: p.gapY,
        gapH: p.gapH,
        scored: p.scored
      })),
      nextPipe: this.pipes.find(p => p.x + PIPE_WIDTH / 2 > this.bird.x),
      pipeSpeed: this.pipeSpeed,
      dimensions: { width: W, height: H, pipeWidth: PIPE_WIDTH, birdSize: BIRD_SIZE }
    };
  }
  
  getResults() {
    return {
      score: this.score,
      ticks: this.ticks,
      duration: Date.now() - this.createdAt,
      playerId: this.playerId,
      playerType: this.playerType
    };
  }
}

module.exports = { FlappyGame };
