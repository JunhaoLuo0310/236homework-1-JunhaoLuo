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
    speed: 4.8, // tiles per second
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
    speed: 4.2,
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
  const sp = entity.speed * dt; // tiles per frame
  const d = DIRS[entity.dir];

  // If we're exactly at the center of a tile and the next tile is blocked, don't move.
  const atCenter =
    Math.abs(entity.px - entity.x) < 1e-6 && Math.abs(entity.py - entity.y) < 1e-6;

  if (atCenter) {
    const nx = entity.x + d.dx;
    const ny = entity.y + d.dy;
    if (!canMoveTile(nx, ny)) return;
  }

  // Move smoothly
  entity.px += d.dx * sp;
  entity.py += d.dy * sp;

  // When we cross into the next tile, snap to its center (this avoids Math.round issues)
  if (d.dx > 0 && entity.px >= entity.x + 1) {
    entity.x += 1;
    entity.px = entity.x;
  } else if (d.dx < 0 && entity.px <= entity.x - 1) {
    entity.x -= 1;
    entity.px = entity.x;
  }

  if (d.dy > 0 && entity.py >= entity.y + 1) {
    entity.y += 1;
    entity.py = entity.y;
  } else if (d.dy < 0 && entity.py <= entity.y - 1) {
    entity.y -= 1;
    entity.py = entity.y;
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
  for (let tries = 0; tries < 200; tries++) {
    const x = randInt(1, MAP[0].length - 2);
    const y = randInt(1, MAP.length - 2);
    if (wallAt(x, y)) continue;
    if (x === player.x && y === player.y) continue;
    if (ghosts.some((g) => g.x === x && g.y === y && now >= g.deadUntil)) continue;
    // prefer spots with pellets or open
    rose.active = true;
    rose.x = x;
    rose.y = y;
    break;
  }
  rose.nextSpawnAt = now + randInt(6000, 12000);
}

function spawnHeart(x, y, dir) {
  const d = DIRS[dir];
  hearts.push({
    x: x + 0.5,
    y: y + 0.5,
    vx: d.dx * 14.0, // tiles/s
    vy: d.dy * 14.0,
    alive: true,
    ttl: 1.3, // seconds
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

    // wall collision
    if (wallAt(tx, ty) || h.ttl <= 0) {
      h.alive = false;
      continue;
    }

    // ghost hit
    for (const g of ghosts) {
      if (now < g.deadUntil) continue;
      const gx = g.x + 0.5;
      const gy = g.y + 0.5;
      if (Math.abs(h.x - gx) < 0.45 && Math.abs(h.y - gy) < 0.45) {
        h.alive = false;
        g.deadUntil = now + 2200;
        score += 200;
        break;
      }
    }
  }

  // cleanup
  hearts = hearts.filter((h) => h.alive);
}

function ghostChooseDir(g) {
  // Greedy chase toward player: pick a direction that reduces Manhattan distance, avoid reversing if possible.
  const options = ["left", "right", "up", "down"].filter((dir) => {
    const d = DIRS[dir];
    return canMoveTile(g.x + d.dx, g.y + d.dy);
  });

  if (options.length === 0) return g.dir;

  const avoid = opposite(g.dir);
  let best = null;
  let bestDist = Infinity;

  for (const dir of options) {
    if (options.length > 1 && dir === avoid) continue;
    const d = DIRS[dir];
    const nx = g.x + d.dx;
    const ny = g.y + d.dy;
    const dist = Math.abs(nx - player.x) + Math.abs(ny - player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = dir;
    }
  }

  return best || options[randInt(0, options.length - 1)];
}

function ghostsUpdate(now, dt) {
  for (const g of ghosts) {
    if (now < g.deadUntil) {
      // keep ghost "at home" while dead
      g.x = g.homeX;
      g.y = g.homeY;
      g.px = g.homeX;
      g.py = g.homeY;
      continue;
    }

    const atCenter = Math.abs(g.px - g.x) < 0.001 && Math.abs(g.py - g.y) < 0.001;
    if (atCenter) {
      g.dir = ghostChooseDir(g);
    }
    stepTileMovement(g, dt);

    // collision with player (tile-based)
    if (!gameOver && g.x === player.x && g.y === player.y) {
      // if player is powered, still die by touch? requirement says hearts eliminate ghosts, not pacman invincible.
      // So touching ghost costs a life even if powered.
      loseLife();
      break;
    }
  }
}

function loseLife() {
  lives -= 1;
  if (lives <= 0) {
    gameOver = true;
    win = false;
  } else {
    // reset positions but keep pellets/score
    player.x = 1;
    player.y = 1;
    player.px = player.x;
    player.py = player.y;
    player.dir = "right";
    player.nextDir = "right";
    player.powerUntil = 0;
    hearts = [];
    for (const g of ghosts) {
      g.x = g.homeX;
      g.y = g.homeY;
      g.px = g.homeX;
      g.py = g.homeY;
      g.deadUntil = performance.now() + 800;
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // background grid / walls
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
        // subtle floor
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
    // simple rose icon: circle + petals
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

    // stem
    ctx.strokeStyle = "rgba(110, 220, 150, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 7);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();
  }

  // hearts projectiles
  for (const h of hearts) {
    const cx = h.x * TILE;
    const cy = h.y * TILE;
    drawHeart(cx, cy, 6);
  }

  // ghosts
  const now = performance.now();
  for (const g of ghosts) {
    if (now < g.deadUntil) continue;
    const cx = g.px * TILE + TILE / 2;
    const cy = g.py * TILE + TILE / 2;
    drawGhost(cx, cy, g.name);
  }

  // player
  const pcx = player.px * TILE + TILE / 2;
  const pcy = player.py * TILE + TILE / 2;
  drawPacman(pcx, pcy, now < player.powerUntil, player.dir);

  // overlay text
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

  // eye
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.beginPath();
  ctx.arc(x + (dir === "left" ? -2 : 2), y - 4, 1.8, 0, Math.PI * 2);
  ctx.fill();
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

  // eyes
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

  // tiny label (optional, cute)
  ctx.font = "10px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.fillStyle = "rgba(233,236,241,0.7)";
  ctx.textAlign = "center";
  ctx.fillText(name, x, y + 22);
  ctx.textAlign = "start";
}

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

// input handling
const keys = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);

  if (k === "arrowleft" || k === "a") player.nextDir = "left";
  if (k === "arrowright" || k === "d") player.nextDir = "right";
  if (k === "arrowup" || k === "w") player.nextDir = "up";
  if (k === "arrowdown" || k === "s") player.nextDir = "down";

  if (k === "r") resetGame();

  // prevent scroll on arrows
  if (k.startsWith("arrow")) e.preventDefault();
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

restartBtn.addEventListener("click", () => resetGame());

// main loop
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
