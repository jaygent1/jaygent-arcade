/**
 * SPACE INVADERS - Server-Side Game Engine
 * Headless game logic for AI agents
 */

const W = 600, H = 700;
const INVADER_COLS = 11;
const INVADER_ROWS = 5;

class InvadersGame {
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
    this.wave = 1;
    this.ticks = 0;
    
    // Player
    this.player = {
      x: W / 2,
      y: H - 50,
      speed: 5,
      invincible: 0
    };
    
    // Invaders
    this.invaders = [];
    this.invaderDir = 1;
    this.invaderSpeed = 1;
    this.invaderDropAmount = 20;
    this.invaderMoveTimer = 0;
    this.invaderMoveInterval = 30;
    this.setupInvaders();
    
    // Bullets
    this.playerBullets = [];
    this.invaderBullets = [];
    this.shootCooldown = 0;
    
    // Shields
    this.shields = [];
    this.setupShields();
    
    // UFO
    this.ufo = null;
    this.ufoTimer = 0;
    
    // Input
    this.input = {
      left: false,
      right: false,
      shoot: false
    };
  }
  
  setupInvaders() {
    this.invaders = [];
    const startX = (W - (INVADER_COLS * 45)) / 2;
    const startY = 80;
    
    for (let row = 0; row < INVADER_ROWS; row++) {
      for (let col = 0; col < INVADER_COLS; col++) {
        // Different types per row
        const type = row < 1 ? 'top' : (row < 3 ? 'mid' : 'bottom');
        const points = { top: 30, mid: 20, bottom: 10 }[type];
        
        this.invaders.push({
          x: startX + col * 45 + 20,
          y: startY + row * 40,
          type: type,
          points: points,
          alive: true
        });
      }
    }
  }
  
  setupShields() {
    this.shields = [];
    const shieldPositions = [100, 225, 350, 475];
    
    for (const sx of shieldPositions) {
      // Each shield is a grid of blocks
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          // Skip corners for shield shape
          if (row === 3 && (col === 0 || col === 4)) continue;
          if (row === 3 && col === 2) continue; // Bottom middle gap
          
          this.shields.push({
            x: sx + col * 10,
            y: H - 150 + row * 10,
            hp: 3
          });
        }
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
    
    // Player invincibility
    if (this.player.invincible > 0) this.player.invincible--;
    
    // Player movement
    if (this.input.left) this.player.x -= this.player.speed;
    if (this.input.right) this.player.x += this.player.speed;
    this.player.x = Math.max(25, Math.min(W - 25, this.player.x));
    
    // Player shooting
    if (this.shootCooldown > 0) this.shootCooldown--;
    if (this.input.shoot && this.shootCooldown === 0 && this.playerBullets.length < 3) {
      this.playerBullets.push({
        x: this.player.x,
        y: this.player.y - 15
      });
      this.shootCooldown = 15;
    }
    
    // Move player bullets
    this.playerBullets.forEach(b => b.y -= 8);
    this.playerBullets = this.playerBullets.filter(b => b.y > 0);
    
    // Move invaders
    this.invaderMoveTimer++;
    if (this.invaderMoveTimer >= this.invaderMoveInterval) {
      this.invaderMoveTimer = 0;
      
      let hitEdge = false;
      const aliveInvaders = this.invaders.filter(i => i.alive);
      
      aliveInvaders.forEach(inv => {
        inv.x += this.invaderDir * this.invaderSpeed * 15;
        if (inv.x < 30 || inv.x > W - 30) hitEdge = true;
      });
      
      if (hitEdge) {
        this.invaderDir *= -1;
        aliveInvaders.forEach(inv => {
          inv.y += this.invaderDropAmount;
          // Check if reached bottom
          if (inv.y > H - 100) {
            this.state = 'game_over';
          }
        });
        // Speed up
        this.invaderMoveInterval = Math.max(5, this.invaderMoveInterval - 1);
      }
    }
    
    // Invader shooting
    const aliveInvaders = this.invaders.filter(i => i.alive);
    if (Math.random() < 0.02 && aliveInvaders.length > 0) {
      const shooter = aliveInvaders[Math.floor(Math.random() * aliveInvaders.length)];
      this.invaderBullets.push({
        x: shooter.x,
        y: shooter.y + 15
      });
    }
    
    // Move invader bullets
    this.invaderBullets.forEach(b => b.y += 4);
    this.invaderBullets = this.invaderBullets.filter(b => b.y < H);
    
    // UFO
    this.ufoTimer++;
    if (!this.ufo && this.ufoTimer > 600 && Math.random() < 0.01) {
      this.ufo = {
        x: -30,
        y: 40,
        dir: 1
      };
      this.ufoTimer = 0;
    }
    if (this.ufo) {
      this.ufo.x += this.ufo.dir * 3;
      if (this.ufo.x > W + 30) this.ufo = null;
    }
    
    // Collision: player bullet hits invader
    for (let bi = this.playerBullets.length - 1; bi >= 0; bi--) {
      const bullet = this.playerBullets[bi];
      
      // Check UFO
      if (this.ufo && Math.abs(bullet.x - this.ufo.x) < 20 && Math.abs(bullet.y - this.ufo.y) < 15) {
        this.score += 100 + Math.floor(Math.random() * 200);
        this.ufo = null;
        this.playerBullets.splice(bi, 1);
        continue;
      }
      
      // Check invaders
      for (const inv of this.invaders) {
        if (inv.alive && Math.abs(bullet.x - inv.x) < 18 && Math.abs(bullet.y - inv.y) < 15) {
          inv.alive = false;
          this.score += inv.points;
          this.playerBullets.splice(bi, 1);
          break;
        }
      }
    }
    
    // Collision: invader bullet hits player
    if (this.player.invincible === 0) {
      for (let bi = this.invaderBullets.length - 1; bi >= 0; bi--) {
        const bullet = this.invaderBullets[bi];
        if (Math.abs(bullet.x - this.player.x) < 20 && Math.abs(bullet.y - this.player.y) < 15) {
          this.lives--;
          this.player.invincible = 120;
          this.invaderBullets.splice(bi, 1);
          if (this.lives <= 0) {
            this.state = 'game_over';
          }
          break;
        }
      }
    }
    
    // Collision: bullets hit shields
    const allBullets = [
      ...this.playerBullets.map(b => ({ ...b, type: 'player' })),
      ...this.invaderBullets.map(b => ({ ...b, type: 'invader' }))
    ];
    
    for (const bullet of allBullets) {
      for (let si = this.shields.length - 1; si >= 0; si--) {
        const shield = this.shields[si];
        if (Math.abs(bullet.x - shield.x) < 6 && Math.abs(bullet.y - shield.y) < 6) {
          shield.hp--;
          if (shield.hp <= 0) this.shields.splice(si, 1);
          
          // Remove bullet
          if (bullet.type === 'player') {
            const idx = this.playerBullets.findIndex(b => b.x === bullet.x && b.y === bullet.y);
            if (idx >= 0) this.playerBullets.splice(idx, 1);
          } else {
            const idx = this.invaderBullets.findIndex(b => b.x === bullet.x && b.y === bullet.y);
            if (idx >= 0) this.invaderBullets.splice(idx, 1);
          }
          break;
        }
      }
    }
    
    // Wave complete
    if (aliveInvaders.length === 0) {
      this.wave++;
      this.invaderMoveInterval = Math.max(10, 30 - this.wave * 2);
      this.invaderSpeed = 1 + this.wave * 0.2;
      this.setupInvaders();
      this.setupShields();
    }
  }
  
  getState() {
    return {
      gameId: this.id,
      state: this.state,
      score: this.score,
      lives: this.lives,
      wave: this.wave,
      ticks: this.ticks,
      player: {
        x: this.player.x,
        y: this.player.y,
        invincible: this.player.invincible > 0
      },
      invaders: this.invaders.filter(i => i.alive).map(i => ({
        x: i.x,
        y: i.y,
        type: i.type
      })),
      playerBullets: this.playerBullets,
      invaderBullets: this.invaderBullets,
      shields: this.shields.map(s => ({ x: s.x, y: s.y, hp: s.hp })),
      ufo: this.ufo ? { x: this.ufo.x, y: this.ufo.y } : null,
      dimensions: { width: W, height: H }
    };
  }
  
  getResults() {
    return {
      score: this.score,
      wave: this.wave,
      ticks: this.ticks,
      duration: Date.now() - this.createdAt,
      playerId: this.playerId,
      playerType: this.playerType
    };
  }
}

module.exports = { InvadersGame };
