/**
 * CYBER PONG - Server-Side Game Engine
 * Headless game logic for AI agents
 */

const W = 800, H = 500;
const PADDLE_H = 80, PADDLE_W = 12;
const BALL_SIZE = 10;

class PongGame {
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
    this.ticks = 0;
    
    // Scores
    this.playerScore = 0;
    this.aiScore = 0;
    this.maxScore = 11; // First to 11 wins
    
    // Paddles
    this.player = { y: H / 2, speed: 6 };
    this.ai = { y: H / 2, speed: 4.5 };
    
    // Ball
    this.ball = {
      x: W / 2,
      y: H / 2,
      vx: 5 * (Math.random() > 0.5 ? 1 : -1),
      vy: (Math.random() - 0.5) * 6,
      speed: 5
    };
    
    // Input
    this.input = {
      up: false,
      down: false
    };
    
    // Rally counter
    this.rally = 0;
    this.maxRally = 0;
  }
  
  resetBall(direction) {
    this.ball.x = W / 2;
    this.ball.y = H / 2;
    this.ball.speed = 5;
    this.ball.vx = this.ball.speed * direction;
    this.ball.vy = (Math.random() - 0.5) * 6;
    this.rally = 0;
  }
  
  setInput(input) {
    this.input = { ...this.input, ...input };
  }
  
  tick() {
    if (this.state !== 'playing') return;
    
    this.ticks++;
    this.lastUpdate = Date.now();
    
    // Player paddle movement
    if (this.input.up) {
      this.player.y -= this.player.speed;
    }
    if (this.input.down) {
      this.player.y += this.player.speed;
    }
    
    // Clamp player paddle
    this.player.y = Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, this.player.y));
    
    // AI paddle (tracks ball with some delay/imperfection)
    const aiTarget = this.ball.y + (Math.random() - 0.5) * 30;
    const aiDiff = aiTarget - this.ai.y;
    if (Math.abs(aiDiff) > 5) {
      this.ai.y += Math.sign(aiDiff) * Math.min(this.ai.speed, Math.abs(aiDiff) * 0.1);
    }
    this.ai.y = Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, this.ai.y));
    
    // Ball movement
    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;
    
    // Top/bottom bounce
    if (this.ball.y < BALL_SIZE / 2) {
      this.ball.y = BALL_SIZE / 2;
      this.ball.vy *= -1;
    }
    if (this.ball.y > H - BALL_SIZE / 2) {
      this.ball.y = H - BALL_SIZE / 2;
      this.ball.vy *= -1;
    }
    
    // Player paddle collision (left side)
    const playerPaddleX = 30;
    if (this.ball.x - BALL_SIZE / 2 < playerPaddleX + PADDLE_W / 2 &&
        this.ball.x + BALL_SIZE / 2 > playerPaddleX - PADDLE_W / 2 &&
        this.ball.y > this.player.y - PADDLE_H / 2 &&
        this.ball.y < this.player.y + PADDLE_H / 2 &&
        this.ball.vx < 0) {
      this.ball.vx = Math.abs(this.ball.vx) * 1.05; // Speed up
      this.ball.vy += (this.ball.y - this.player.y) * 0.15; // Angle based on hit position
      this.ball.x = playerPaddleX + PADDLE_W / 2 + BALL_SIZE / 2;
      this.rally++;
      if (this.rally > this.maxRally) this.maxRally = this.rally;
    }
    
    // AI paddle collision (right side)
    const aiPaddleX = W - 30;
    if (this.ball.x + BALL_SIZE / 2 > aiPaddleX - PADDLE_W / 2 &&
        this.ball.x - BALL_SIZE / 2 < aiPaddleX + PADDLE_W / 2 &&
        this.ball.y > this.ai.y - PADDLE_H / 2 &&
        this.ball.y < this.ai.y + PADDLE_H / 2 &&
        this.ball.vx > 0) {
      this.ball.vx = -Math.abs(this.ball.vx) * 1.05;
      this.ball.vy += (this.ball.y - this.ai.y) * 0.15;
      this.ball.x = aiPaddleX - PADDLE_W / 2 - BALL_SIZE / 2;
      this.rally++;
      if (this.rally > this.maxRally) this.maxRally = this.rally;
    }
    
    // Cap ball speed
    const maxSpeed = 15;
    if (Math.abs(this.ball.vx) > maxSpeed) this.ball.vx = Math.sign(this.ball.vx) * maxSpeed;
    if (Math.abs(this.ball.vy) > maxSpeed) this.ball.vy = Math.sign(this.ball.vy) * maxSpeed;
    
    // Scoring
    if (this.ball.x < 0) {
      this.aiScore++;
      if (this.aiScore >= this.maxScore) {
        this.state = 'game_over';
      } else {
        this.resetBall(1); // Ball goes to player
      }
    }
    
    if (this.ball.x > W) {
      this.playerScore++;
      if (this.playerScore >= this.maxScore) {
        this.state = 'game_over';
      } else {
        this.resetBall(-1); // Ball goes to AI
      }
    }
  }
  
  getState() {
    return {
      gameId: this.id,
      state: this.state,
      ticks: this.ticks,
      playerScore: this.playerScore,
      aiScore: this.aiScore,
      maxScore: this.maxScore,
      player: {
        y: this.player.y,
        x: 30
      },
      ai: {
        y: this.ai.y,
        x: W - 30
      },
      ball: {
        x: this.ball.x,
        y: this.ball.y,
        vx: this.ball.vx,
        vy: this.ball.vy
      },
      rally: this.rally,
      maxRally: this.maxRally,
      dimensions: { width: W, height: H, paddleH: PADDLE_H, paddleW: PADDLE_W }
    };
  }
  
  getResults() {
    return {
      playerScore: this.playerScore,
      aiScore: this.aiScore,
      won: this.playerScore > this.aiScore,
      maxRally: this.maxRally,
      ticks: this.ticks,
      duration: Date.now() - this.createdAt,
      playerId: this.playerId,
      playerType: this.playerType
    };
  }
}

module.exports = { PongGame };
