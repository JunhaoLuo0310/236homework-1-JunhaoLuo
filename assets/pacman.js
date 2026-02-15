/* assets/pacman.js
   Valentine’s Pac-Man 💘 — robust across Chrome/Safari
   Core features:
   - Maze + pellets
   - 3 lives + game over + win
   - Ghosts chase Pac-Man
   - Rose 🌹 power-up spawns periodically
   - While powered, Pac-Man auto-shoots hearts 💕 in facing direction
   - Hearts eliminate ghosts (ghost respawns after short delay)
*/

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const pelletsEl = document.getElementById("pellets");
const powerEl = document.getElementById("power");
const restartBtn = document.getElementById("restart");

// Make keyboard input reliable
canvas.tabIndex = 0;
canvas.style.outline = "none";
window.addEventListener("load", () => canvas.focus());
canvas.addEventListener("click", () => canvas.focus());

const TILE = 24; // pixels
const COLS = Math.floor(canvas.width / TILE);
const ROWS = Math.floor(canvas.height / TILE);

const DIRS = {
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function randInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function keyFor(x, y) {
  return `${x},${y}`;
}

/*
Legend:
# = wall
. = pellet
(space) = empty
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

// Fit map to canvas grid
const MAP = MAP_STR.map((row) => row.padEnd(COLS, " ").slice(0, COLS));

function wallAt(x, y) {
  if (y < 0 || y >= MAP.length || x < 0 || x >= MAP[0].length) return true;
  return MAP[y][x] === "#";
}

function canMoveTile(x, y) {
  return !wallAt(x, y);
}

function nextTile(x, y, dir) {
  const d = DIRS[dir];
  return { nx: x + d.dx, ny: y + d.dy };
}

function canMoveFrom(x, y, dir) {
  const { nx, ny } = nextTile(x, y, dir);
  return canMoveTile(nx, ny);
}

// Compute smooth draw position from (x,y,prog,dir)
function calcPxPy(entity) {
  const d = DIRS[entity.dir];
  return { px: entity.x + d.dx * entity.prog, py: entity.y + d.dy * entity.prog };
}

// Deterministic tile-based movement without float “center drift”
function stepTileMovement(entity, dt, decideDirAtCenter) {
  if (entity.prog === 0) {
    if (decideDirAtCenter) decideDirAtCenter(entity);
    if (!canMoveFrom(entity.x, entity.y, entity.dir)) return;
  }

  entity.prog += entity.speed * dt;

  // Step across tile boundaries safely
  while (entity.prog >= 1) {
    const { nx, ny } = nextTile(entity.x, entity.y, entity.dir);
    if (!canMoveTile(nx, ny)) {
      entity.prog = 0;
      return;
    }
    entity.x = nx;
    entity.y = ny;
    entity.prog -= 1;

    // If we landed exactly at a center, allow direction change
    if (entity.prog === 0 && decideDirAtCenter) {
      decideDirAtCenter(entity);
      if (!canMoveFrom(entity.x, entity.y, entity.dir)) return;
    }
  }
}

// ---------- Game state ----------
let pellets = new Set();
let player;
let ghosts;
let hearts;
let rose;
let score;
let lives;
let gameOver;
let win;

// ---------- Entities ----------
function makePlayer() {
  return {
    x: 1,
    y: 1,
    prog: 0,
    dir: "right",
    nextDir: "right",
    speed: 4.8, // tiles/sec (adjust)
    powerUntil: 0,
    shootEveryMs: 180,
    lastShotAt: 0,
  };
}

function makeGhost(x, y, name) {
  return {
    name,
    x,
    y,
    prog: 0,
    dir: "left",
    speed: 4.2, // tiles/sec (adjust)
    deadUntil: 0,
    homeX: x,
    homeY: y,
  };
}

function resetPellets() {
  pellets.clear();
  for (let y = 0; y < MAP.length; y++) {
    for (let x = 0; x < MAP[0].length; x++) {
      if (MAP[y][x] === ".") pellets.add(keyFor(x, y));
    }
  }
}

function resetGame() {
  resetPellets();

  player = makePlayer();
  if (wallAt(player.x, player.y)) {
    player.x = 2;
    player.y = 1;
  }

  ghosts = [
    makeGhost(13, 11, "Blush"),
    makeGhost(14, 11, "Cupid"),
    makeGhost(13, 12, "Rose"),
    makeGhost(14, 12, "Charm"),
  ];

  hearts = [];
  rose = {
    active: false,
    x: 0,
    y: 0,
    nextSpawnAt: performance.now() + 2500,
  };

  score = 0;
  lives = 3;
  gameOver = false;
  win = false;

  syncHud();
}

function syncHud() {
  scoreEl.textContent = String(score);
  livesEl.textContent = String(lives);
  pelletsEl.textContent = String(pellets.size);
  powerEl.textContent = performance.now() < player.powerUntil ? "ON" : "OFF";
}

// ---------- Input ----------
document.addEventListener(
  "keydown",
  (e) => {
    if (!player) return;

    const k = e.key;

    if (k === "ArrowLeft" || k === "a" || k === "A") player.nextDir = "left";
    if (k === "ArrowRight" || k === "d" || k === "D") player.nextDir = "right";
    if (k === "ArrowUp" || k === "w" || k === "W") player.nextDir = "up";
    if (k === "ArrowDown" || k === "s" || k === "S") player.nextDir = "down";

    if (k === "r" || k === "R") resetGame();

    if (k.startsWith("Arrow")) e.preventDefault();
  },
  { capture: true }
);

restartBtn.addEventListener("click", () => resetGame());

// ---------- Ghost AI ----------
function opposite(dir) {
  if (dir === "left") return "right";
  if (dir === "right") return "left";
  if (dir === "up") return "down";
  return "up";
}

function ghostChooseDir(g) {
  const options = ["left", "right", "up", "down"].filter((dir) => canMoveFrom(g.x, g.y, dir));
  if (options.length === 0) return g.dir;

  const avoid = opposite(g.dir);
  let best = null;
  let bestDist = Infinity;

  for (const dir of options) {
    if (options.length > 1 && dir === avoid) continue;
    const { nx, ny } = nextTile(g.x, g.y, dir);
    const dist = Math.abs(nx - player.x) + Math.abs(ny - player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = dir;
    }
  }

  return best || options[randInt(0, options.length - 1)];
}

// ---------- Rose + Hearts ----------
function spawnRose(now) {
  for (let tries = 0; tries < 250; tries++) {
    const x = randInt(1, MAP[0].length - 2);
    const y = randInt(1, MAP.length - 2);
    if (wallAt(x, y)) continue;
    if (x === player.x && y === player.y) continue;
    if (ghosts.some((g) => now >= g.deadUntil && g.x === x && g.y === y)) continue;
    rose.active = true;
    rose.x = x;
    rose.y = y;
    break;
  }
  rose.nextSpawnAt = now + randInt(6500, 12000);
}

function spawnHeart(x, y, dir) {
  const d = DIRS[dir];
  hearts.push({
    x: x + 0.5,
    y: y + 0.5,
    vx: d.dx * 14.0, // tiles/sec
    vy: d.dy * 14.0,
    ttl: 1.25, // sec
    alive: true,
  });
}

function updateHearts(dt, now) {
  for (const h of hearts) {
    if (!h.alive) continue;

    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.ttl -= dt;

    const tx = Math.floor(h.x);
    const ty = Math.floor(h.y);

    if (h.ttl <= 0 || wallAt(tx, ty)) {
      h.alive = false;
      continue;
    }

    for (const g of ghosts) {
      if (now < g.deadUntil) continue;
      const gp = calcPxPy(g);
      const gx = gp.px + 0.5;
      const gy = gp.py + 0.5;
      if (Math.abs(h.x - gx) < 0.45 && Math.abs(h.y - gy) < 0.45) {
        h.alive = false;
        g.deadUntil = now + 2200;
        g.x = g.homeX;
        g.y = g.homeY;
        g.prog = 0;
        score += 200;
        break;
      }
    }
  }

  hearts = hearts.filter((h) => h.alive);
}

// ---------- Collisions ----------
function loseLife() {
  lives -= 1;
  if (lives <= 0) {
    gameOver = true;
    win = false;
    return;
  }

  // reset positions (keep pellets + score)
  player.x = 1;
  player.y = 1;
  player.prog = 0;
  player.dir = "right";
  player.nextDir = "right";
  player.powerUntil = 0;
  hearts = [];

  const now = performance.now();
  for (const g of ghosts) {
    g.x = g.homeX;
    g.y = g.homeY;
    g.prog = 0;
    g.deadUntil = now + 800;
  }
}

// ---------- Updates ----------
function playerUpdate(now, dt) {
  stepTileMovement(player, dt, (p) => {
    if (p.nextDir && canMoveFrom(p.x, p.y, p.nextDir)) {
      p.dir = p.nextDir;
      return;
    }
    if (!canMoveFrom(p.x, p.y, p.dir)) {
      for (const dir of ["left", "right", "up", "down"]) {
        if (canMoveFrom(p.x, p.y, dir)) {
          p.dir = dir;
          break;
        }
      }
    }
  });

  // Eat pellet when player is at center
  if (player.prog === 0) {
    const k = keyFor(player.x, player.y);
    if (pellets.has(k)) {
      pellets.delete(k);
      score += 10;
      if (pellets.size === 0) {
        win = true;
        gameOver = true;
      }
    }
  }

  // Rose pickup (only at centers)
  if (rose.active && player.prog === 0 && player.x === rose.x && player.y === rose.y) {
    rose.active = false;
    player.powerUntil = now + 5200;
    player.lastShotAt = 0;
    score += 50;
  }

  // Auto-shoot hearts while powered
  if (now < player.powerUntil) {
    if (now - player.lastShotAt > player.shootEveryMs) {
      spawnHeart(player.x, player.y, player.dir);
      player.lastShotAt = now;
    }
  }

  // Spawn rose sometimes
  if (!rose.active && now >= rose.nextSpawnAt && !gameOver) {
    spawnRose(now);
  }
}

function ghostsUpdate(now, dt) {
  for (const g of ghosts) {
    if (now < g.deadUntil) continue;

    stepTileMovement(g, dt, (gg) => {
      gg.dir = ghostChooseDir(gg);
    });
  }

  // Collision check using smooth positions (works mid-tile)
  if (gameOver) return;

  const pp = calcPxPy(player);
  for (const g of ghosts) {
    if (now < g.deadUntil) continue;
    const gp = calcPxPy(g);

    const dx = (pp.px - gp.px);
    const dy = (pp.py - gp.py);
    if (Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35) {
      loseLife();
      break;
    }
  }
}

// ---------- Drawing ----------
function drawHeart(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(255, 120, 170, 0.95)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-s, -s, -s * 1.4, s * 0.6, 0, s * 1.4);
  ctx.bezierCurveTo(s * 1.4, s * 0.6, s, -s, 0, 0);
  ctx.fill();
  ctx.restore();
}

function drawGhost(x, y, name) {
  const r = 10;
  ctx.fillStyle = "rgba(255, 110, 160, 0.9)";
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.lineTo(x + r, y + r);
  ctx.lineTo(x + r * 0.5, y + r * 0.65);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.5, y + r * 0.65);
  ctx.lineTo(x - r, y + r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(x - 4, y - 2, 3, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 2, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.beginPath();
  ctx.arc(x - 4, y - 2, 1.3, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 2, 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "10px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.fillStyle = "rgba(233,236,241,0.7)";
  ctx.textAlign = "center";
  ctx.fillText(name, x, y + 22);
  ctx.textAlign = "start";
}

function drawPacman(x, y, powered, dir) {
  const r = 10;
  const t = performance.now() / 120;
  const mouth = 0.35 + 0.15 * Math.abs(Math.sin(t));

  ctx.fillStyle = powered ? "rgba(255, 230, 120, 0.98)" : "rgba(255, 210, 80, 0.98)";
  ctx.beginPath();

  let start = 0;
  let end = Math.PI * 2;

  if (dir === "right") {
    start = mouth;
    end = Math.PI * 2 - mouth;
  } else if (dir === "left") {
    start = Math.PI + mouth;
    end = Math.PI - mouth;
  } else if (dir === "up") {
    start = -Math.PI / 2 + mouth;
    end = -Math.PI / 2 - mouth;
  } else if (dir === "down") {
    start = Math.PI / 2 + mouth;
    end = Math.PI / 2 - mouth;
  }

  ctx.moveTo(x, y);
  ctx.arc(x, y, r, start, end, false);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.beginPath();
  ctx.arc(x + (dir === "left" ? -2 : 2), y - 4, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // maze
  for (let y = 0; y < MAP.length; y++) {
    for (let x = 0; x < MAP[0].length; x++) {
      const px = x * TILE;
      const py = y * TILE;

      if (MAP[y][x] === "#") {
        ctx.fillStyle = "rgba(122, 162, 255, 0.25)";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = "rgba(122, 162, 255, 0.35)";
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.fillRect(px, py, TILE, TILE);
      }
    }
  }

  // pellets
  ctx.fillStyle = "rgba(233, 236, 241, 0.85)";
  for (const k of pellets) {
    const [x, y] = k.split(",").map(Number);
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // rose
  if (rose.active) {
    const cx = rose.x * TILE + TILE / 2;
    const cy = rose.y * TILE + TILE / 2;

    ctx.fillStyle = "rgba(255, 120, 170, 0.95)";
    ctx.beginPath();
    ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 190, 220, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();

    ctx.strokeStyle = "rgba(110, 220, 150, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 7);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();
  }

  // hearts
  for (const h of hearts) {
    drawHeart(h.x * TILE, h.y * TILE, 6);
  }

  // ghosts
  const now = performance.now();
  for (const g of ghosts) {
    if (now < g.deadUntil) continue;
    const gp = calcPxPy(g);
    const gx = gp.px * TILE + TILE / 2;
    const gy = gp.py * TILE + TILE / 2;
    drawGhost(gx, gy, g.name);
  }

  // player
  const pp = calcPxPy(player);
  const pcx = pp.px * TILE + TILE / 2;
  const pcy = pp.py * TILE + TILE / 2;
  drawPacman(pcx, pcy, now < player.powerUntil, player.dir);

  // overlay
  if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(233,236,241,0.95)";
    ctx.font = "bold 34px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.textAlign = "center";
    ctx.fillText(win ? "YOU WIN 💘" : "GAME OVER", canvas.width / 2, canvas.height / 2 - 10);

    ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillStyle = "rgba(233,236,241,0.85)";
    ctx.fillText("Press R or click Restart", canvas.width / 2, canvas.height / 2 + 24);
    ctx.textAlign = "start";
  }
}

// ---------- Main loop ----------
let last = performance.now();
function loop(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;

  if (!gameOver) {
    playerUpdate(now, dt);
    ghostsUpdate(now, dt);
    updateHearts(dt, now);
  }

  syncHud();
  draw();
  requestAnimationFrame(loop);
}

resetGame();
requestAnimationFrame(loop);

