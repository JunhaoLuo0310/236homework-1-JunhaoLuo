/* Valentine’s Pac-Man (canvas) — BST236 HW1
   Features:
   - Maze + pellets
   - Ghosts chase player
   - 3 lives, game over, restart
   - Rose power-up: auto-shoot hearts in facing direction for a limited time
   - Hearts eliminate ghosts on hit (ghost respawns after short delay)
*/

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const pelletsEl = document.getElementById("pellets");
const powerEl = document.getElementById("power");
const restartBtn = document.getElementById("restart");

const TILE = 24; // pixels per tile
const COLS = Math.floor(canvas.width / TILE);
const ROWS = Math.floor(canvas.height / TILE);

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function randInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/*
Legend:
# = wall
. = pellet
  = empty
*/
const MAP_STR = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.#  #.#   #.##.#   #.#  #.#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "     #.##### ## #####.#     ",
  "######.##          ##.######",
  "#......... ###### .........#",
  "######.##  ######  ##.######",
  "     #.##          ##.#     ",
  "######.##.########.##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#...##................##...#",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

const MAP = MAP_STR.map((row) => row.padEnd(COLS, " ").slice(0, COLS));
const wallAt = (x, y) => {
  if (y < 0 || y >= MAP.length || x < 0 || x >= MAP[0].length) return true;
  return MAP[y][x] === "#";
};

let pellets = new Set(); // store "x,y" keys
function resetPellets() {
  pellets.clear();
  for (let y = 0; y < MAP.length; y++) {
    for (let x = 0; x < MAP[0].length; x++) {
      if (MAP[y][x] === ".") pellets.add(`${x},${y}`);
    }
  }
}

function keyFor(x, y) {
  return `${x},${y}`;
}

const DIRS = {
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
};

function opposite(dir) {
  if (dir === "left") return "right";
  if (dir === "right") return "left";
  if (dir === "up") return "down";
  return "up";
}

function canMoveTile(x, y) {
  return !wallAt(x, y);
}

// Entities are tile-based with smooth interpolation
function makePlayer() {
  return {
    x: 1,
    y: 1,
    px: 1,
    py: 1,
    dir: "right",
    nextDir: "right",
    speed: 6.5, // tiles per second
    alive: true,
    powerUntil: 0,
    shootEveryMs: 160,
    lastShotAt: 0,
  };
}

function makeGhost(x, y, name) {
  return {
    name,
    x,
    y,
    px: x,
    py: y,
    dir: "left",
    speed: 5.7,
    deadUntil: 0,
    homeX: x,
    homeY: y,
  };
}

let player;
let ghosts;
let score;
let lives;
let gameOver;
let win;

let hearts; // projectiles
let rose; // {x,y,active, nextSpawnAt}

function resetGame() {
  resetPellets();

  player = makePlayer();
  // place player on first empty/pellet
  if (wallAt(player.x, player.y)) {
    player.x = 2;
    player.y = 1;
    player.px = player.x;
    player.py = player.y;
  }

  ghosts = [
    makeGhost(13, 11, "Blush"),
    makeGhost(14, 11, "Cupid"),
    makeGhost(13, 12, "Rose"),
    makeGhost(14, 12, "Charm"),
  ];

  score = 0;
  lives = 3;
  gameOver = false;
  win = false;

  hearts = [];
  rose = {
    active: false,
    x: 0,
    y: 0,
    nextSpawnAt: performance.now() + 2500,
  };

  syncHud();
}

function syncHud() {
  scoreEl.textContent = String(score);
  livesEl.textContent = String(lives);
  pelletsEl.textContent = String(pellets.size);
  powerEl.textContent = player && performance.now() < player.powerUntil ? "ON" : "OFF";
}

function tryTurn(entity, dir) {
  const d = DIRS[dir];
  const nx = entity.x + d.dx;
  const ny = entity.y + d.dy;
  if (canMoveTile(nx, ny)) {
    entity.dir = dir;
    return true;
  }
  return false;
}

function stepTileMovement(entity, dt) {
  // smooth movement from (px,py) towards (x,y) with dir
  const sp = entity.speed * dt; // tiles this frame
  const d = DIRS[entity.dir];

  // Try to move: entity is on grid, move continuously
  entity.px += d.dx * sp;
  entity.py += d.dy * sp;

  // When crossing into next tile boundary, snap and advance tile coords
  while (true) {
    // Determine the tile we are currently in based on px/py
    const tx = Math.round(entity.px);
    const ty = Math.round(entity.py);

    // Snap when close enough
    const close = Math.abs(entity.px - tx) < 0.08 && Math.abs(entity.py - ty) < 0.08;
    if (!close) break;

    entity.px = tx;
    entity.py = ty;
    entity.x = tx;
    entity.y = ty;

    // Determine next tile based on current dir
    const nx = entity.x + d.dx;
    const ny = entity.y + d.dy;

    if (!canMoveTile(nx, ny)) {
      // stop at center
      break;
    }

    // continue loop only if we might snap multiple tiles in one frame (rare)
    if (sp < 1) break;
  }
}

function playerUpdate(now, dt) {
  // allow turning at tile centers
  const atCenter = Math.abs(player.px - player.x) < 0.001 && Math.abs(player.py - player.y) < 0.001;
  if (atCenter) {
    // try nextDir first
    if (player.nextDir && player.nextDir !== player.dir) {
      tryTurn(player, player.nextDir);
    }
    // if current dir blocked, try stop by reversing? (simple)
    const d = DIRS[player.dir];
    if (!canMoveTile(player.x + d.dx, player.y + d.dy)) {
      // try alternative dirs in priority order to feel responsive
      const pref = [player.nextDir, "left", "right", "up", "down"].filter(Boolean);
      for (const dir of pref) {
        if (tryTurn(player, dir)) break;
      }
    }
  }

  stepTileMovement(player, dt);

  // pellet eat
  const k = keyFor(player.x, player.y);
  if (pellets.has(k)) {
    pellets.delete(k);
    score += 10;
    if (pellets.size === 0) {
      win = true;
      gameOver = true;
    }
  }

  // rose pickup
  if (rose.active && player.x === rose.x && player.y === rose.y) {
    rose.active = false;
    player.powerUntil = now + 5200; // ms
    player.lastShotAt = 0;
    score += 50;
  }

  // auto-shoot hearts when powered
  if (now < player.powerUntil) {
    if (now - player.lastShotAt > player.shootEveryMs) {
      spawnHeart(player.x, player.y, player.dir);
      player.lastShotAt = now;
    }
  }

  // respawn rose occasionally
  if (!rose.active && now >= rose.nextSpawnAt && !gameOver) {
    spawnRose(now);
  }
}

function spawnRose(now) {
  // choose random empty tile not wall, not player, not ghost, not too close to walls
  for (let tries = 0; tries < 200; tri
