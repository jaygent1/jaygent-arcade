/**
 * BREAKER - Server-Side Game Engine
 * Headless game logic for AI agents
 */

const W = 600, H = 700;
const PADDLE_W = 100, PADDLE_H = 15;
const BALL_R = 8;
const BRICK_W = 54, BRICK_H = 20, BRICK_ROWS = 6, BRICK_COLS = 10;

class BreakerGame {
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
    this.lives = 3;
    this.level = 1;
    this.ticks = 0;
    
    // Paddle
    this.paddle = {
      x: W / 2,
      y: H - 40,
      w: PADDLE_W,
      speed: 8
    };
    
    // Ball
    this.ball = {
      x: W / 2,
      y: H - 60,
      vx: 4,
      vy: -4,
      speed: 5,
      attached: true // Ball starts attached to paddle
    };
    
    // Bricks
    this.bricks = [];
    this.setupBricks();
    
    // Powerups
    this.powerups = [];
    this.paddleWide = false;
    this.paddleWideTimer = 0;
    this.multiBalls = [];
    
    // Input
    this.input = {
      left: false,
      right: false,
      launch: false
    };
  }
  
  setupBricks() {
    this.bricks = [];
    const offsetX = (W - BRICK_COLS * (BRICK_W + 4)) / 2;
    const offsetY = 60;
    
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        // Higher rows = more points, some bricks take multiple hits
        const hp = row < 2 ? 2 : 1;
        this.bricks.push({
          x: offsetX + col * (BRICK_W + 4) + BRICK_W / 2,
          y: offsetY + row * (BRICK_H + 4) + BRICK_H / 2,
          w: BRICK_W,
          h: BRICK_H,
          hp: hp,
          maxHp: hp,
          points: (BRICK_ROWS - row) * 10
        });
      }
    }
  }
  
  setInput(input) {
    this.input = { ...this.input, ...input };
  }
  
  tick() {
    if (this.state !== 'playing') return;
    
    this.ticks++;
    this.lastUpdate = Date.now();
    
    // Paddle movement
    if (this.input.left) {
      this.paddle.x -= this.paddle.speed;
    }
    if (this.input.right) {
      this.paddle.x += this.paddle.speed;
    }
    
    // Clamp paddle
    const pw = this.paddleWide ? this.paddle.w * 1.5 : this.paddle.w;
    this.paddle.x = Math.max(pw / 2, Math.min(W - pw / 2, this.paddle.x));
    
    // Powerup timer
    if (this.paddleWideTimer > 0) {
      this.paddleWideTimer--;
      if (this.paddleWideTimer === 0) this.paddleWide = false;
    }
    
    // Ball attached to paddle
    if (this.ball.attached) {
      this.ball.x = this.paddle.x;
      this.ball.y = this.paddle.y - PADDLE_H / 2 - BALL_R;
      
      if (this.input.launch) {
        this.ball.attached = false;
        this.ball.vx = (Math.random() - 0.5) * 4;
        this.ball.vy = -this.ball.speed;
      }
      return;
    }
    
    // Ball movement
    this.updateBall(this.ball);
    
    // Multi-balls
    this.multiBalls = this.multiBalls.filter(b => {
      this.updateBall(b);
      return b.y < H + 50; // Remove if fell off
    });
    
    // Powerup movement
    this.powerups.forEach(p => {
      p.y += 2;
      
      // Collect powerup
      if (Math.abs(p.x - this.paddle.x) < pw / 2 + 15 &&
          Math.abs(p.y - this.paddle.y) < PADDLE_H / 2 + 15) {
        p.collected = true;
        this.applyPowerup(p.type);
      }
    });
    this.powerups = this.powerups.filter(p => !p.collected && p.y < H + 20);
    
    // Check win (no bricks left)
    if (this.bricks.length === 0) {
      this.level++;
      this.setupBricks();
      this.ball.attached = true;
      this.ball.speed += 0.5;
    }
  }
  
  updateBall(ball) {
    ball.x += ball.vx;
    ball.y += ball.vy;
    
    // Wall bounces
    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx *= -1;
    }
    if (ball.x > W - BALL_R) {
      ball.x = W - BALL_R;
      ball.vx *= -1;
    }
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.vy *= -1;
    }
    
    // Bottom - lose ball
    if (ball.y > H && ball === this.ball) {
      if (this.multiBalls.length > 0) {
        // Transfer to a multi-ball
        const newMain = this.multiBalls.pop();
        this.ball.x = newMain.x;
        this.ball.y = newMain.y;
        this.ball.vx = newMain.vx;
        this.ball.vy = newMain.vy;
      } else {
        this.lives--;
        if (this.lives <= 0) {
          this.state = 'game_over';
        } else {
          this.ball.attached = true;
        }
      }
      return;
    }
    
    // Paddle bounce
    const pw = this.paddleWide ? this.paddle.w * 1.5 : this.paddle.w;
    if (ball.vy > 0 &&
        ball.y + BALL_R > this.paddle.y - PADDLE_H / 2 &&
        ball.y - BALL_R < this.paddle.y + PADDLE_H / 2 &&
        ball.x > this.paddle.x - pw / 2 &&
        ball.x < this.paddle.x + pw / 2) {
      ball.vy = -Math.abs(ball.vy);
      // Angle based on where it hit
      const hitPos = (ball.x - this.paddle.x) / (pw / 2);
      ball.vx = hitPos * 5;
      ball.y = this.paddle.y - PADDLE_H / 2 - BALL_R;
    }
    
    // Brick collision
    for (let i = this.bricks.length - 1; i >= 0; i--) {
      const brick = this.bricks[i];
      if (Math.abs(ball.x - brick.x) < brick.w / 2 + BALL_R &&
          Math.abs(ball.y - brick.y) < brick.h / 2 + BALL_R) {
        
        // Bounce direction
        const dx = ball.x - brick.x;
        const dy = ball.y - brick.y;
        if (Math.abs(dx / brick.w) > Math.abs(dy / brick.h)) {
          ball.vx *= -1;
        } else {
          ball.vy *= -1;
        }
        
        brick.hp--;
        if (brick.hp <= 0) {
          this.score += brick.points;
          
          // Maybe spawn powerup
          if (Math.random() < 0.15) {
            this.powerups.push({
              x: brick.x,
              y: brick.y,
              type: Math.random() < 0.5 ? 'wide' : 'multi'
            });
          }
          
          this.bricks.splice(i, 1);
        }
        break; // Only hit one brick per frame
      }
    }
  }
  
  applyPowerup(type) {
    if (type === 'wide') {
      this.paddleWide = true;
      this.paddleWideTimer = 600; // 10 seconds
    } else if (type === 'multi') {
      // Spawn two extra balls
      for (let i = 0; i < 2; i++) {
        this.multiBalls.push({
          x: this.ball.x,
          y: this.ball.y,
          vx: this.ball.vx + (Math.random() - 0.5) * 3,
          vy: this.ball.vy,
          speed: this.ball.speed
        });
      }
    }
  }
  
  getState() {
    return {
      gameId: this.id,
      state: this.state,
      score: this.score,
      lives: this.lives,
      level: this.level,
      ticks: this.ticks,
      paddle: {
        x: this.paddle.x,
        y: this.paddle.y,
        w: this.paddleWide ? this.paddle.w * 1.5 : this.paddle.w
      },
      ball: {
        x: this.ball.x,
        y: this.ball.y,
        vx: this.ball.vx,
        vy: this.ball.vy,
        attached: this.ball.attached
      },
      multiBalls: this.multiBalls.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
      bricks: this.bricks.map(b => ({
        x: b.x,
        y: b.y,
        hp: b.hp,
        maxHp: b.maxHp
      })),
      powerups: this.powerups.map(p => ({ x: p.x, y: p.y, type: p.type })),
      paddleWide: this.paddleWide,
      dimensions: { width: W, height: H }
    };
  }
  
  getResults() {
    return {
      score: this.score,
      level: this.level,
      bricksDestroyed: (BRICK_ROWS * BRICK_COLS * this.level) - this.bricks.length,
      ticks: this.ticks,
      duration: Date.now() - this.createdAt,
      playerId: this.playerId,
      playerType: this.playerType
    };
  }
}

module.exports = { BreakerGame };
