/**
 * STACK ATTACK (Tetris) - Server-Side Game Engine
 * Headless game logic for AI agents
 */

const W = 300, H = 600;
const COLS = 10, ROWS = 20;
const CELL = W / COLS;

const SHAPES = [
  { name: 'I', blocks: [[0,0],[1,0],[2,0],[3,0]], color: 0 },
  { name: 'O', blocks: [[0,0],[1,0],[0,1],[1,1]], color: 1 },
  { name: 'T', blocks: [[1,0],[0,1],[1,1],[2,1]], color: 2 },
  { name: 'L', blocks: [[0,0],[0,1],[1,1],[2,1]], color: 3 },
  { name: 'J', blocks: [[2,0],[0,1],[1,1],[2,1]], color: 4 },
  { name: 'S', blocks: [[1,0],[2,0],[0,1],[1,1]], color: 5 },
  { name: 'Z', blocks: [[0,0],[1,0],[1,1],[2,1]], color: 6 }
];

class TetrisGame {
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
    this.lines = 0;
    this.level = 1;
    this.ticks = 0;
    this.dropTimer = 0;
    this.dropInterval = 45; // Ticks per drop
    
    // Grid (0 = empty, 1-7 = filled with color)
    this.grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
    
    // Current piece
    this.piece = null;
    this.pieceX = 0;
    this.pieceY = 0;
    this.pieceRotation = 0;
    
    // Next piece
    this.nextPiece = this.randomPiece();
    this.spawnPiece();
    
    // Input
    this.input = {
      left: false,
      right: false,
      down: false,
      rotate: false,
      drop: false
    };
    this.lastInput = {};
    this.moveTimer = 0;
  }
  
  randomPiece() {
    return SHAPES[Math.floor(Math.random() * SHAPES.length)];
  }
  
  spawnPiece() {
    this.piece = this.nextPiece;
    this.nextPiece = this.randomPiece();
    this.pieceX = Math.floor((COLS - 4) / 2);
    this.pieceY = 0;
    this.pieceRotation = 0;
    
    // Check if spawn position is blocked (game over)
    if (!this.canMove(0, 0)) {
      this.state = 'game_over';
    }
  }
  
  getRotatedBlocks() {
    const blocks = this.piece.blocks;
    let rotated = blocks;
    
    for (let r = 0; r < this.pieceRotation; r++) {
      rotated = rotated.map(([x, y]) => [y, -x + 3]);
    }
    
    return rotated;
  }
  
  canMove(dx, dy, rotation = this.pieceRotation) {
    const oldRotation = this.pieceRotation;
    this.pieceRotation = rotation;
    const blocks = this.getRotatedBlocks();
    this.pieceRotation = oldRotation;
    
    for (const [bx, by] of blocks) {
      const nx = this.pieceX + bx + dx;
      const ny = this.pieceY + by + dy;
      
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && this.grid[ny][nx]) return false;
    }
    return true;
  }
  
  lockPiece() {
    const blocks = this.getRotatedBlocks();
    for (const [bx, by] of blocks) {
      const x = this.pieceX + bx;
      const y = this.pieceY + by;
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
        this.grid[y][x] = this.piece.color + 1;
      }
    }
    
    // Clear lines
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (this.grid[y].every(cell => cell > 0)) {
        this.grid.splice(y, 1);
        this.grid.unshift(Array(COLS).fill(0));
        cleared++;
        y++; // Check same row again
      }
    }
    
    // Score
    const lineScores = [0, 100, 300, 500, 800];
    this.score += lineScores[cleared] * this.level;
    this.lines += cleared;
    
    // Level up
    if (this.lines >= this.level * 10) {
      this.level++;
      this.dropInterval = Math.max(5, 45 - this.level * 4);
    }
    
    this.spawnPiece();
  }
  
  setInput(input) {
    this.input = { ...this.input, ...input };
  }
  
  tick() {
    if (this.state !== 'playing') return;
    
    this.ticks++;
    this.lastUpdate = Date.now();
    
    // Handle input (with repeat delay)
    this.moveTimer++;
    
    // Left/Right movement
    if (this.input.left && (!this.lastInput.left || this.moveTimer > 10)) {
      if (this.canMove(-1, 0)) {
        this.pieceX--;
        this.moveTimer = this.lastInput.left ? 8 : 0;
      }
    }
    if (this.input.right && (!this.lastInput.right || this.moveTimer > 10)) {
      if (this.canMove(1, 0)) {
        this.pieceX++;
        this.moveTimer = this.lastInput.right ? 8 : 0;
      }
    }
    
    // Rotation (only on press)
    if (this.input.rotate && !this.lastInput.rotate) {
      const newRotation = (this.pieceRotation + 1) % 4;
      if (this.canMove(0, 0, newRotation)) {
        this.pieceRotation = newRotation;
      } else if (this.canMove(-1, 0, newRotation)) {
        this.pieceX--;
        this.pieceRotation = newRotation;
      } else if (this.canMove(1, 0, newRotation)) {
        this.pieceX++;
        this.pieceRotation = newRotation;
      }
    }
    
    // Hard drop
    if (this.input.drop && !this.lastInput.drop) {
      while (this.canMove(0, 1)) {
        this.pieceY++;
        this.score += 2;
      }
      this.lockPiece();
      this.lastInput = { ...this.input };
      return;
    }
    
    // Soft drop (faster)
    if (this.input.down) {
      this.dropTimer += 3;
    }
    
    // Gravity
    this.dropTimer++;
    if (this.dropTimer >= this.dropInterval) {
      this.dropTimer = 0;
      if (this.canMove(0, 1)) {
        this.pieceY++;
        if (this.input.down) this.score += 1;
      } else {
        this.lockPiece();
      }
    }
    
    this.lastInput = { ...this.input };
  }
  
  getState() {
    const blocks = this.getRotatedBlocks();
    const pieceBlocks = blocks.map(([bx, by]) => ({
      x: this.pieceX + bx,
      y: this.pieceY + by
    }));
    
    // Calculate ghost (where piece would land)
    let ghostY = this.pieceY;
    while (this.canMove(0, ghostY - this.pieceY + 1)) {
      ghostY++;
    }
    const ghostBlocks = blocks.map(([bx, by]) => ({
      x: this.pieceX + bx,
      y: ghostY + by
    }));
    
    return {
      gameId: this.id,
      state: this.state,
      score: this.score,
      lines: this.lines,
      level: this.level,
      ticks: this.ticks,
      grid: this.grid,
      piece: {
        name: this.piece.name,
        color: this.piece.color,
        x: this.pieceX,
        y: this.pieceY,
        rotation: this.pieceRotation,
        blocks: pieceBlocks
      },
      ghost: ghostBlocks,
      nextPiece: {
        name: this.nextPiece.name,
        color: this.nextPiece.color
      },
      dimensions: { width: W, height: H, cols: COLS, rows: ROWS, cell: CELL }
    };
  }
  
  getResults() {
    return {
      score: this.score,
      lines: this.lines,
      level: this.level,
      ticks: this.ticks,
      duration: Date.now() - this.createdAt,
      playerId: this.playerId,
      playerType: this.playerType
    };
  }
}

module.exports = { TetrisGame };
