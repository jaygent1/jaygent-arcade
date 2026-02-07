/**
 * VOID RUSH - Server-Side Game Engine
 * Headless game logic for AI agents
 */

const W = 550, H = 650;

// Enemy type definitions
const ENEMY_TYPES = {
  scout: { hp: 1, speed: 1.2, size: 24, shoots: false, score: 10 },
  fighter: { hp: 1, speed: 0.8, size: 26, shoots: true, score: 15 },
  bomber: { hp: 2, speed: 0.6, size: 30, shoots: true, score: 25, burst: true },
  elite: { hp: 3, speed: 1, size: 28, shoots: true, score: 40, accurate: true },
  tank: { hp: 5, speed: 0.4, size: 36, shoots: true, score: 60 },
  swarm: { hp: 1, speed: 1.8, size: 18, shoots: false, score: 8 },
  sniper: { hp: 2, speed: 0.5, size: 22, shoots: true, score: 35, accurate: true, snipe: true }
};

const WEAPONS = {
  SINGLE: { spread: 1, damage: 1, cooldown: 140 },
  DOUBLE: { spread: 2, damage: 1, cooldown: 120 },
  TRIPLE: { spread: 3, damage: 1, cooldown: 100 },
  RAPID: { spread: 1, damage: 1, cooldown: 60 },
  POWER: { spread: 1, damage: 3, cooldown: 220 },
  SPREAD: { spread: 5, damage: 1, cooldown: 140 }
};

class VoidRushGame {
  constructor(playerId, playerType = 'AGENT') {
    this.id = Math.random().toString(36).substr(2, 9);
    this.playerId = playerId;
    this.playerType = playerType; // 'AGENT' or 'HUMAN'
    this.createdAt = Date.now();
    this.lastUpdate = Date.now();
    this.tickRate = 60; // Updates per second
    this.msPerTick = 1000 / this.tickRate;
    
    this.reset();
  }
  
  reset() {
    this.state = 'playing'; // 'playing', 'game_over', 'paused'
    this.score = 0;
    this.lives = 3;
    this.wave = 0;
    this.bombs = 2;
    this.ticks = 0;
    
    // Player
    this.player = {
      x: W / 2,
      y: H - 80,
      w: 36,
      h: 44,
      speed: 5.5,
      invincible: 120
    };
    
    // Weapon
    this.weapon = 'SINGLE';
    this.weaponTimer = 0;
    this.shootCooldown = 0;
    
    // Game objects
    this.bullets = [];
    this.enemies = [];
    this.enemyBullets = [];
    this.powerups = [];
    
    // Boss
    this.boss = null;
    this.bossDefeated = false;
    
    // Wave management
    this.waveTransition = false;
    this.waveTimer = 0;
    this.waveEnemiesSpawned = false;
    
    // Input state (agent sets these)
    this.input = {
      left: false,
      right: false,
      up: false,
      down: false,
      shoot: false,
      bomb: false
    };
    
    // Start first wave
    this.nextWave();
  }
  
  // Main game tick
  tick() {
    if (this.state !== 'playing') return;
    
    this.ticks++;
    this.lastUpdate = Date.now();
    
    // Wave transition
    if (this.waveTransition) {
      this.waveTimer--;
      if (this.waveTimer <= 0) {
        this.waveTransition = false;
        if (this.wave % 5 === 0) {
          this.spawnBoss();
        } else {
          this.spawnWave();
        }
        this.waveEnemiesSpawned = true;
      }
      return;
    }
    
    // Timers
    if (this.weaponTimer > 0) this.weaponTimer--;
    if (this.weaponTimer <= 0 && this.weapon !== 'SINGLE') this.weapon = 'SINGLE';
    if (this.player.invincible > 0) this.player.invincible--;
    if (this.shootCooldown > 0) this.shootCooldown--;
    
    // Process input
    this.processInput();
    
    // Update game objects
    this.updateBullets();
    this.updateEnemies();
    this.updateBoss();
    this.updateEnemyBullets();
    this.updatePowerups();
    
    // Check collisions
    this.checkCollisions();
    
    // Check wave clear
    if (this.enemies.length === 0 && !this.boss && this.waveEnemiesSpawned && !this.waveTransition) {
      this.nextWave();
    }
  }
  
  processInput() {
    const { input, player } = this;
    
    // Movement
    let dx = 0, dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    
    // Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }
    
    player.x += dx * player.speed;
    player.y += dy * player.speed;
    
    // Bounds
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
    player.y = Math.max(60, Math.min(H - player.h / 2, player.y));
    
    // Shooting
    if (input.shoot && this.shootCooldown <= 0) {
      this.shoot();
    }
    
    // Bomb
    if (input.bomb && this.bombs > 0) {
      this.useBomb();
      input.bomb = false; // One-shot
    }
  }
  
  shoot() {
    const weapon = WEAPONS[this.weapon];
    const { x, y, h } = this.player;
    const bulletY = y - h / 2;
    
    if (weapon.spread === 1) {
      this.bullets.push({ x, y: bulletY, dx: 0, dy: -14, damage: weapon.damage });
    } else if (weapon.spread === 2) {
      this.bullets.push({ x: x - 10, y: bulletY, dx: 0, dy: -14, damage: weapon.damage });
      this.bullets.push({ x: x + 10, y: bulletY, dx: 0, dy: -14, damage: weapon.damage });
    } else if (weapon.spread === 3) {
      this.bullets.push({ x, y: bulletY, dx: 0, dy: -14, damage: weapon.damage });
      this.bullets.push({ x: x - 12, y: bulletY + 8, dx: -2, dy: -13, damage: weapon.damage });
      this.bullets.push({ x: x + 12, y: bulletY + 8, dx: 2, dy: -13, damage: weapon.damage });
    } else if (weapon.spread === 5) {
      for (let i = -2; i <= 2; i++) {
        this.bullets.push({ x, y: bulletY, dx: i * 2.5, dy: -12, damage: weapon.damage });
      }
    }
    
    this.shootCooldown = weapon.cooldown;
  }
  
  useBomb() {
    this.bombs--;
    
    // Damage all enemies
    for (const e of this.enemies) {
      e.hp -= 5;
    }
    if (this.boss) {
      this.boss.hp -= Math.ceil(this.boss.maxHp * 0.08);
    }
    
    // Clear enemy bullets
    this.enemyBullets = [];
  }
  
  updateBullets() {
    this.bullets = this.bullets.filter(b => {
      b.x += b.dx;
      b.y += b.dy;
      return b.y > -10 && b.x > -10 && b.x < W + 10;
    });
  }
  
  updateEnemies() {
    const bulletSpeed = 4 + this.wave * 0.15;
    
    for (const e of this.enemies) {
      if (!e.entered) {
        e.y += 2;
        if (e.y >= e.targetY) e.entered = true;
        continue;
      }
      
      e.phase += 0.025 * e.speed;
      
      // Movement
      switch (e.move) {
        case 'zigzag':
          e.x += Math.sin(e.phase * 2) * 2.5;
          e.y += e.speed * 0.2;
          break;
        case 'drift':
          e.x += Math.sin(e.phase) * 1.2;
          e.y += e.speed * 0.25;
          break;
        case 'slow':
          e.y += e.speed * 0.15;
          break;
        case 'swarm':
          e.x += Math.sin(e.phase * 3) * 3;
          e.y += e.speed * 0.4;
          break;
        case 'static':
          e.x += Math.sin(e.phase * 0.5) * 0.5;
          break;
      }
      
      // Shooting
      if (e.shoots && e.entered) {
        e.shootTimer--;
        if (e.shootTimer <= 0) {
          const angle = Math.atan2(this.player.y - e.y, this.player.x - e.x);
          
          if (e.accurate || e.snipe) {
            const speed = e.snipe ? bulletSpeed * 1.5 : bulletSpeed;
            this.enemyBullets.push({
              x: e.x, y: e.y + e.h / 2,
              dx: Math.cos(angle) * speed,
              dy: Math.sin(angle) * speed
            });
          } else {
            this.enemyBullets.push({
              x: e.x, y: e.y + e.h / 2,
              dx: (Math.random() - 0.5) * 2,
              dy: bulletSpeed
            });
          }
          
          e.shootTimer = 80 + Math.random() * 80;
        }
      }
      
      // Bounds
      e.x = Math.max(e.w / 2 + 10, Math.min(W - e.w / 2 - 10, e.x));
      if (e.y > H + 50) e.hp = 0;
    }
    
    this.enemies = this.enemies.filter(e => e.hp > 0);
  }
  
  updateBoss() {
    if (!this.boss || this.bossDefeated) return;
    
    if (!this.boss.entered && this.boss.y < 90) {
      this.boss.y += 1.5;
      if (this.boss.y >= 90) this.boss.entered = true;
      return;
    }
    
    if (!this.boss.entered) return;
    
    this.boss.phase += 0.012;
    this.boss.x = W / 2 + Math.sin(this.boss.phase) * 180;
    
    // Rage mode
    if (!this.boss.rage && this.boss.hp < this.boss.maxHp * 0.3) {
      this.boss.rage = true;
    }
    
    // Shooting
    this.boss.shootTimer--;
    if (this.boss.shootTimer <= 0) {
      this.boss.pattern = (this.boss.pattern + 1) % (this.boss.rage ? 4 : 3);
      const bulletSpeed = (4 + this.wave * 0.15) * (this.boss.rage ? 1.3 : 1);
      
      switch (this.boss.pattern) {
        case 0: // Spread
          for (let i = -4; i <= 4; i++) {
            const angle = Math.PI / 2 + i * 0.18;
            this.enemyBullets.push({
              x: this.boss.x, y: this.boss.y + this.boss.h / 2,
              dx: Math.cos(angle) * bulletSpeed,
              dy: Math.sin(angle) * bulletSpeed
            });
          }
          this.boss.shootTimer = this.boss.rage ? 35 : 50;
          break;
          
        case 1: // Aimed
          const angle = Math.atan2(this.player.y - this.boss.y, this.player.x - this.boss.x);
          this.enemyBullets.push({
            x: this.boss.x, y: this.boss.y + this.boss.h / 2,
            dx: Math.cos(angle) * bulletSpeed * 1.2,
            dy: Math.sin(angle) * bulletSpeed * 1.2
          });
          this.boss.shootTimer = 20;
          break;
          
        case 2: // Circle
          const count = 12 + this.boss.level * 2;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            this.enemyBullets.push({
              x: this.boss.x, y: this.boss.y,
              dx: Math.cos(a) * bulletSpeed * 0.8,
              dy: Math.sin(a) * bulletSpeed * 0.8
            });
          }
          this.boss.shootTimer = this.boss.rage ? 40 : 60;
          break;
          
        case 3: // Rage spiral
          for (let i = 0; i < 8; i++) {
            const a = this.ticks * 0.1 + i * Math.PI / 4;
            this.enemyBullets.push({
              x: this.boss.x, y: this.boss.y,
              dx: Math.cos(a) * bulletSpeed,
              dy: Math.sin(a) * bulletSpeed
            });
          }
          this.boss.shootTimer = 15;
          break;
      }
    }
  }
  
  updateEnemyBullets() {
    this.enemyBullets = this.enemyBullets.filter(b => {
      b.x += b.dx;
      b.y += b.dy;
      return b.y < H + 10 && b.y > -10 && b.x > -20 && b.x < W + 20;
    });
  }
  
  updatePowerups() {
    this.powerups = this.powerups.filter(p => {
      p.y += 1.8;
      
      // Collection
      const dx = p.x - this.player.x;
      const dy = p.y - this.player.y;
      if (Math.abs(dx) < this.player.w / 2 + 15 && Math.abs(dy) < this.player.h / 2 + 15) {
        this.collectPowerup(p.type);
        return false;
      }
      
      return p.y < H + 30;
    });
  }
  
  collectPowerup(type) {
    switch (type) {
      case 'double': this.weapon = 'DOUBLE'; this.weaponTimer = 500; break;
      case 'triple': this.weapon = 'TRIPLE'; this.weaponTimer = 500; break;
      case 'rapid': this.weapon = 'RAPID'; this.weaponTimer = 400; break;
      case 'power': this.weapon = 'POWER'; this.weaponTimer = 400; break;
      case 'spread': this.weapon = 'SPREAD'; this.weaponTimer = 400; break;
      case 'shield': this.player.invincible = 360; break;
      case 'life': this.lives = Math.min(this.lives + 1, 5); break;
      case 'bomb': this.bombs = Math.min(this.bombs + 1, 5); break;
    }
  }
  
  checkCollisions() {
    // Player bullets vs enemies
    for (const b of this.bullets) {
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (Math.abs(b.x - e.x) < e.w / 2 + 5 && Math.abs(b.y - e.y) < e.h / 2 + 5) {
          b.y = -1000;
          e.hp -= b.damage;
          
          if (e.hp <= 0) {
            this.score += e.score * this.wave;
            this.maybeSpawnPowerup(e.x, e.y);
          }
          break;
        }
      }
      
      // Bullets vs boss
      if (this.boss && !this.bossDefeated && this.boss.entered) {
        if (Math.abs(b.x - this.boss.x) < this.boss.w / 2 + 5 && 
            Math.abs(b.y - this.boss.y) < this.boss.h / 2 + 5) {
          b.y = -1000;
          this.boss.hp -= b.damage;
          
          if (this.boss.hp <= 0) {
            this.bossDefeated = true;
            this.score += (500 + this.boss.level * 300) * this.wave;
            
            // Drop powerups
            for (let i = 0; i < 4; i++) {
              this.spawnPowerup(this.boss.x + (Math.random() - 0.5) * 80, this.boss.y);
            }
            
            this.boss = null;
          }
        }
      }
    }
    
    this.bullets = this.bullets.filter(b => b.y > -500);
    this.enemies = this.enemies.filter(e => e.hp > 0);
    
    // Enemy bullets vs player
    if (this.player.invincible <= 0) {
      for (const b of this.enemyBullets) {
        if (Math.abs(b.x - this.player.x) < this.player.w / 2 - 5 + 4 &&
            Math.abs(b.y - this.player.y) < this.player.h / 2 - 5 + 4) {
          b.y = 10000;
          this.playerHit();
          break;
        }
      }
      
      // Enemies vs player
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (Math.abs(e.x - this.player.x) < (e.w + this.player.w) / 2 - 10 &&
            Math.abs(e.y - this.player.y) < (e.h + this.player.h) / 2 - 10) {
          e.hp = 0;
          this.score += Math.floor(e.score / 2);
          this.playerHit();
          break;
        }
      }
    }
  }
  
  playerHit() {
    this.lives--;
    this.player.invincible = 150;
    
    if (this.lives <= 0) {
      this.state = 'game_over';
    }
  }
  
  nextWave() {
    this.wave++;
    this.waveTransition = true;
    this.waveTimer = 90; // 1.5 seconds at 60fps
    this.waveEnemiesSpawned = false;
  }
  
  spawnWave() {
    const types = ['scout', 'fighter'];
    if (this.wave >= 2) types.push('bomber');
    if (this.wave >= 3) types.push('swarm');
    if (this.wave >= 4) types.push('elite');
    if (this.wave >= 6) types.push('tank');
    if (this.wave >= 8) types.push('sniper');
    
    const count = Math.min(8 + this.wave * 2, 30);
    const cols = Math.min(8, Math.ceil(Math.sqrt(count * 1.5)));
    const rows = Math.ceil(count / cols);
    const spacingX = 60, spacingY = 50;
    const startX = (W - (cols - 1) * spacingX) / 2;
    
    const hpScale = 1 + Math.floor(this.wave / 10) * 0.5;
    
    for (let r = 0; r < rows && this.enemies.length < count; r++) {
      for (let c = 0; c < cols && this.enemies.length < count; c++) {
        const typeName = r === 0 && this.wave > 3 ? 'tank' : types[Math.floor(Math.random() * types.length)];
        const type = ENEMY_TYPES[typeName];
        
        this.enemies.push({
          x: startX + c * spacingX,
          y: -60 - r * spacingY,
          w: type.size,
          h: type.size,
          type: typeName,
          hp: Math.ceil(type.hp * hpScale),
          maxHp: Math.ceil(type.hp * hpScale),
          speed: type.speed * (1 + this.wave * 0.02),
          score: Math.ceil(type.score * (1 + this.wave * 0.1)),
          shoots: type.shoots,
          accurate: type.accurate,
          snipe: type.snipe,
          burst: type.burst,
          move: type.shoots ? 'drift' : 'zigzag',
          shootTimer: 100 + Math.random() * 150,
          phase: Math.random() * Math.PI * 2,
          entered: false,
          targetY: 50 + Math.random() * 150
        });
      }
    }
  }
  
  spawnBoss() {
    const level = Math.floor(this.wave / 5);
    const hp = 80 + level * 60;
    
    this.boss = {
      x: W / 2,
      y: -120,
      w: 110 + level * 15,
      h: 70 + level * 8,
      hp,
      maxHp: hp,
      level,
      phase: 0,
      shootTimer: 60,
      pattern: 0,
      entered: false,
      rage: false
    };
    this.bossDefeated = false;
  }
  
  maybeSpawnPowerup(x, y) {
    if (Math.random() > 0.18) return;
    this.spawnPowerup(x, y);
  }
  
  spawnPowerup(x, y) {
    const types = ['double', 'triple', 'rapid', 'power', 'spread', 'shield', 'life', 'bomb'];
    const weights = [1, 1, 1, 1, 1, 0.8, 0.3, 0.5];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let type = types[0];
    for (let i = 0; i < types.length; i++) {
      r -= weights[i];
      if (r <= 0) { type = types[i]; break; }
    }
    this.powerups.push({ x, y, type });
  }
  
  // Set input from agent
  setInput(input) {
    this.input = {
      left: !!input.left,
      right: !!input.right,
      up: !!input.up,
      down: !!input.down,
      shoot: !!input.shoot,
      bomb: !!input.bomb
    };
  }
  
  // Get current state for agent
  getState() {
    return {
      gameId: this.id,
      state: this.state,
      ticks: this.ticks,
      score: this.score,
      lives: this.lives,
      wave: this.wave,
      bombs: this.bombs,
      weapon: this.weapon,
      weaponTimer: this.weaponTimer,
      waveTransition: this.waveTransition,
      
      player: {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        invincible: this.player.invincible > 0
      },
      
      enemies: this.enemies.map(e => ({
        x: Math.round(e.x),
        y: Math.round(e.y),
        type: e.type,
        hp: e.hp,
        maxHp: e.maxHp
      })),
      
      boss: this.boss ? {
        x: Math.round(this.boss.x),
        y: Math.round(this.boss.y),
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        level: this.boss.level,
        rage: this.boss.rage
      } : null,
      
      bullets: this.bullets.map(b => ({
        x: Math.round(b.x),
        y: Math.round(b.y)
      })),
      
      enemyBullets: this.enemyBullets.map(b => ({
        x: Math.round(b.x),
        y: Math.round(b.y)
      })),
      
      powerups: this.powerups.map(p => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
        type: p.type
      })),
      
      dimensions: { width: W, height: H }
    };
  }
  
  // Get final results
  getResults() {
    return {
      gameId: this.id,
      playerId: this.playerId,
      playerType: this.playerType,
      score: this.score,
      wave: this.wave,
      ticks: this.ticks,
      duration: Date.now() - this.createdAt
    };
  }
}

module.exports = { VoidRushGame, W, H };
