/**
 * ASTEROID FIELD - Server-Side Game Engine
 * Headless game logic for AI agents
 */

const W = 800, H = 600;

class AsteroidsGame {
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
    
    // Ship
    this.ship = {
      x: W / 2,
      y: H / 2,
      angle: -Math.PI / 2, // Pointing up
      vx: 0,
      vy: 0,
      rotSpeed: 0.08,
      thrust: 0.15,
      friction: 0.99,
      invincible: 120 // Frames of invincibility
    };
    
    // Bullets
    this.bullets = [];
    this.shootCooldown = 0;
    
    // Asteroids
    this.asteroids = [];
    this.spawnAsteroids(4 + this.level);
    
    // Input
    this.input = {
      left: false,
      right: false,
      thrust: false,
      shoot: false
    };
  }
  
  spawnAsteroids(count) {
    for (let i = 0; i < count; i++) {
      // Spawn away from ship
      let x, y;
      do {
        x = Math.random() * W;
        y = Math.random() * H;
      } while (Math.hypot(x - this.ship.x, y - this.ship.y) < 150);
      
      this.asteroids.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        size: 3, // 3=large, 2=medium, 1=small
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.05
      });
    }
  }
  
  asteroidRadius(size) {
    return [15, 25, 40][size - 1];
  }
  
  setInput(input) {
    this.input = { ...this.input, ...input };
  }
  
  tick() {
    if (this.state !== 'playing') return;
    
    this.ticks++;
    this.lastUpdate = Date.now();
    
    // Invincibility countdown
    if (this.ship.invincible > 0) this.ship.invincible--;
    
    // Ship rotation
    if (this.input.left) this.ship.angle -= this.ship.rotSpeed;
    if (this.input.right) this.ship.angle += this.ship.rotSpeed;
    
    // Ship thrust
    if (this.input.thrust) {
      this.ship.vx += Math.cos(this.ship.angle) * this.ship.thrust;
      this.ship.vy += Math.sin(this.ship.angle) * this.ship.thrust;
    }
    
    // Ship friction and movement
    this.ship.vx *= this.ship.friction;
    this.ship.vy *= this.ship.friction;
    this.ship.x += this.ship.vx;
    this.ship.y += this.ship.vy;
    
    // Wrap ship
    this.ship.x = (this.ship.x + W) % W;
    this.ship.y = (this.ship.y + H) % H;
    
    // Shooting
    if (this.shootCooldown > 0) this.shootCooldown--;
    if (this.input.shoot && this.shootCooldown === 0) {
      this.bullets.push({
        x: this.ship.x + Math.cos(this.ship.angle) * 20,
        y: this.ship.y + Math.sin(this.ship.angle) * 20,
        vx: Math.cos(this.ship.angle) * 8 + this.ship.vx * 0.5,
        vy: Math.sin(this.ship.angle) * 8 + this.ship.vy * 0.5,
        life: 60
      });
      this.shootCooldown = 10;
    }
    
    // Update bullets
    this.bullets.forEach(b => {
      b.x += b.vx;
      b.y += b.vy;
      b.x = (b.x + W) % W;
      b.y = (b.y + H) % H;
      b.life--;
    });
    this.bullets = this.bullets.filter(b => b.life > 0);
    
    // Update asteroids
    this.asteroids.forEach(a => {
      a.x += a.vx;
      a.y += a.vy;
      a.x = (a.x + W) % W;
      a.y = (a.y + H) % H;
      a.angle += a.spin;
    });
    
    // Bullet-asteroid collision
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const bullet = this.bullets[bi];
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const asteroid = this.asteroids[ai];
        const radius = this.asteroidRadius(asteroid.size);
        
        if (Math.hypot(bullet.x - asteroid.x, bullet.y - asteroid.y) < radius) {
          // Hit!
          this.bullets.splice(bi, 1);
          this.score += [100, 50, 20][asteroid.size - 1];
          
          // Split asteroid
          if (asteroid.size > 1) {
            for (let i = 0; i < 2; i++) {
              this.asteroids.push({
                x: asteroid.x,
                y: asteroid.y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                size: asteroid.size - 1,
                angle: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 0.08
              });
            }
          }
          
          this.asteroids.splice(ai, 1);
          break;
        }
      }
    }
    
    // Ship-asteroid collision
    if (this.ship.invincible === 0) {
      for (const asteroid of this.asteroids) {
        const radius = this.asteroidRadius(asteroid.size);
        if (Math.hypot(this.ship.x - asteroid.x, this.ship.y - asteroid.y) < radius + 15) {
          // Hit!
          this.lives--;
          if (this.lives <= 0) {
            this.state = 'game_over';
          } else {
            // Respawn ship
            this.ship.x = W / 2;
            this.ship.y = H / 2;
            this.ship.vx = 0;
            this.ship.vy = 0;
            this.ship.invincible = 180;
          }
          break;
        }
      }
    }
    
    // Level complete
    if (this.asteroids.length === 0) {
      this.level++;
      this.spawnAsteroids(4 + this.level);
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
      ship: {
        x: this.ship.x,
        y: this.ship.y,
        angle: this.ship.angle,
        vx: this.ship.vx,
        vy: this.ship.vy,
        invincible: this.ship.invincible > 0
      },
      bullets: this.bullets.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
      asteroids: this.asteroids.map(a => ({
        x: a.x,
        y: a.y,
        vx: a.vx,
        vy: a.vy,
        size: a.size,
        radius: this.asteroidRadius(a.size)
      })),
      dimensions: { width: W, height: H }
    };
  }
  
  getResults() {
    return {
      score: this.score,
      level: this.level,
      ticks: this.ticks,
      duration: Date.now() - this.createdAt,
      playerId: this.playerId,
      playerType: this.playerType
    };
  }
}

module.exports = { AsteroidsGame };
