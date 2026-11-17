// NOVA DRIFT — main. One job: the game itself. The loop, the state
// machine (title → playing → paused → over), input, waves, collisions,
// and every pixel drawn on the canvas. Entities, sound and the page
// chrome live in their own files; this file wires them together.

import AudioSys from './audio.js';
import {
  mulberry32, rand, clamp, dist2, TAU,
  ENEMY_TYPES, Player, Enemy, Bullet, Particle, PowerUp, FloatText,
  POWERUP_DEFS, POWERUP_KEYS, explodeInto,
} from './entities.js';
import { UI, shotParams } from './ui.js';

const W = 960, H = 600;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------- helpers ----------
const BEST_KEY = 'nova-drift-best';
function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* private mode */ }
}

// ---------- state ----------
let state = 'title'; // title | playing | paused | over
let rng = Math.random;
let autoPilot = false; // screenshot states only: the ship flies itself
let score = 0, best = loadBest(), wave = 1, kills = 0;
let combo = 0, comboTimer = 0, bestCombo = 0;
let shake = 0, hitStop = 0, flash = 0, elapsed = 0;
let spawnQueue = [], spawnTimer = 0, waveState = 'INCOMING', breather = 0;
let bombs = 0;
let powers = { spread: 0, rapid: 0, shield: 0 };
let mouse = { x: W / 2, y: H / 2 - 120, down: false };
let keys = {};
let time = 0, lastTs = 0;

const player = new Player(W / 2, H / 2);
const enemies = [], bullets = [], ebullets = [], particles = [], powerups = [], texts = [];
const stars = [];
for (let layer = 0; layer < 3; layer++) {
  for (let i = 0; i < 42; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, layer, size: 0.6 + layer * 0.7, tw: Math.random() * TAU });
  }
}

// Pre-rendered nebula backdrop (drawn once, blitted each frame).
const nebula = document.createElement('canvas');
nebula.width = W; nebula.height = H;
{
  const n = nebula.getContext('2d');
  const blobs = [
    [180, 130, 260, 'rgba(124,92,255,0.16)'],
    [760, 90, 220, 'rgba(53,240,255,0.10)'],
    [820, 480, 280, 'rgba(255,61,129,0.10)'],
    [120, 470, 200, 'rgba(53,240,255,0.08)'],
    [480, 300, 320, 'rgba(20,40,120,0.12)'],
  ];
  for (const [x, y, r, c] of blobs) {
    const g = n.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
    n.fillStyle = g; n.fillRect(0, 0, W, H);
  }
}

// ---------- input ----------
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}
canvas.addEventListener('mousemove', (e) => { const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y; });
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) { tryDash(); return; }
  mouse.down = true;
  AudioSys.unlock();
});
window.addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Enter' && state === 'title') startGame();
  if ((e.key === 'r' || e.key === 'R') && state === 'over') startGame();
  if ((e.key === 'p' || e.key === 'P') && (state === 'playing' || state === 'paused')) togglePause();
  if ((e.key === 'e' || e.key === 'E') && state === 'playing') useNova();
  if (e.key === 'Shift' && state === 'playing') tryDash();
  if ((e.key === 'm' || e.key === 'M')) toggleMute();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause(true);
});
UI.bind({
  onStart: () => { AudioSys.unlock(); startGame(); },
  onRestart: () => startGame(),
  onResume: () => togglePause(),
  onMute: () => toggleMute(),
});

function toggleMute() {
  const muted = AudioSys.toggleMute();
  UI.setMute(muted);
}

// ---------- flow ----------
function startGame() {
  enemies.length = 0; bullets.length = 0; ebullets.length = 0;
  particles.length = 0; powerups.length = 0; texts.length = 0;
  player.reset(W / 2, H / 2);
  score = 0; wave = 1; kills = 0; combo = 0; comboTimer = 0; bestCombo = 0;
  bombs = 0; powers = { spread: 0, rapid: 0, shield: 0 };
  shake = 0; hitStop = 0; flash = 0;
  state = 'playing';
  UI.showHud();
  AudioSys.startDrone();
  startWave(1);
}

function startWave(n) {
  wave = n; waveState = 'INCOMING';
  spawnQueue = buildWave(n);
  spawnTimer = 0.4;
  UI.toast('WAVE ' + n, 1400);
  AudioSys.waveHorn();
}

function buildWave(n) {
  const q = [];
  const count = 5 + 2 * n;
  for (let i = 0; i < count; i++) {
    let type = 'drifter';
    const roll = rng();
    if (n >= 4 && roll < 0.16) type = 'splitter';
    else if (n >= 3 && roll < 0.38) type = 'weaver';
    else if (n >= 2 && roll < 0.62) type = 'darter';
    q.push(type);
  }
  if (n % 3 === 0) q.push('elite');
  return q;
}

function spawnEnemy(type) {
  // Spawn just outside a random edge, never on top of the player.
  const edge = Math.floor(rng() * 4);
  let x, y;
  if (edge === 0) { x = rand(rng, 0, W); y = -30; }
  else if (edge === 1) { x = W + 30; y = rand(rng, 0, H); }
  else if (edge === 2) { x = rand(rng, 0, W); y = H + 30; }
  else { x = -30; y = rand(rng, 0, H); }
  const e = new Enemy(type, x, y, rng);
  if (wave >= 5) e.hp = Math.round(e.hp * (1 + 0.08 * (wave - 4)));
  enemies.push(e);
}

function gameOver() {
  state = 'over';
  AudioSys.stopDrone();
  AudioSys.gameOver();
  const isRecord = score > best;
  if (isRecord) { best = score; saveBest(best); }
  UI.showGameOver({ score, wave, kills, bestCombo }, isRecord);
}

function togglePause(force) {
  if (state === 'playing') { state = 'paused'; UI.showPause(true); AudioSys.stopDrone(); }
  else if (state === 'paused' && force !== true) { state = 'playing'; UI.showPause(false); AudioSys.startDrone(); }
}

// ---------- actions ----------
function tryDash() {
  if (state !== 'playing' || player.dashCd > 0) return;
  const mx = (keys['a'] || keys['arrowleft'] ? -1 : 0) + (keys['d'] || keys['arrowright'] ? 1 : 0);
  const my = (keys['w'] || keys['arrowup'] ? -1 : 0) + (keys['s'] || keys['arrowdown'] ? 1 : 0);
  let dx = mx, dy = my;
  if (!dx && !dy) { dx = Math.cos(player.angle); dy = Math.sin(player.angle); }
  const len = Math.hypot(dx, dy) || 1;
  player.vx = (dx / len) * 900;
  player.vy = (dy / len) * 900;
  player.dashTime = 0.16;
  player.dashCd = 2.2;
  player.invuln = Math.max(player.invuln, 0.22);
  AudioSys.dash();
  for (let i = 0; i < 10; i++) {
    particles.push(new Particle(player.x, player.y, -player.vx * rand(rng, 0.1, 0.4), -player.vy * rand(rng, 0.1, 0.4), 0.35, 3, '#35f0ff'));
  }
}

function useNova() {
  if (state !== 'playing' || bombs <= 0) return;
  bombs--;
  flash = 0.5; shake = 14;
  AudioSys.nova();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    particles.push(new Particle(player.x, player.y, Math.cos(a) * rand(rng, 200, 520), Math.sin(a) * rand(rng, 200, 520), rand(rng, 0.4, 0.9), rand(rng, 2, 5), i % 3 ? '#ff3d81' : '#ffc857'));
  }
  for (const e of [...enemies]) damageEnemy(e, 3, true);
  ebullets.length = 0;
  texts.push(new FloatText(player.x, player.y - 40, 'NOVA!', '#ff3d81', 22));
}

function fireBullet() {
  const spread = powers.spread > 0 ? [-0.16, 0, 0.16] : [0];
  for (const off of spread) {
    const a = player.angle + off;
    bullets.push(new Bullet(
      player.x + Math.cos(a) * 20, player.y + Math.sin(a) * 20,
      Math.cos(a) * 640 + player.vx * 0.3, Math.sin(a) * 640 + player.vy * 0.3,
      true,
    ));
  }
  particles.push(new Particle(
    player.x + Math.cos(player.angle) * 22, player.y + Math.sin(player.angle) * 22,
    Math.cos(player.angle) * 120, Math.sin(player.angle) * 120, 0.12, 3.5, '#aef6ff',
  ));
  AudioSys.shoot();
}

function damageEnemy(e, dmg, silent = false) {
  e.hp -= dmg;
  e.flash = 0.08;
  if (e.hp <= 0) killEnemy(e, silent);
}

function killEnemy(e, silent = false) {
  const idx = enemies.indexOf(e);
  if (idx === -1) return;
  enemies.splice(idx, 1);
  kills++;
  combo++;
  comboTimer = 3.5;
  bestCombo = Math.max(bestCombo, combo);
  const mult = Math.min(combo, 8);
  const pts = e.score * mult;
  score += pts;
  texts.push(new FloatText(e.x, e.y, '+' + pts, mult > 1 ? '#ffc857' : '#dfe9ff', mult > 1 ? 17 : 14));
  explodeInto(particles, e.x, e.y, e.color, e.type === 'elite' ? 42 : 18, rng, e.type === 'elite' ? 340 : 240);
  AudioSys.explode(e.type === 'elite');
  if (e.type === 'elite') { hitStop = 0.06; shake = Math.max(shake, 9); }
  if (e.type === 'splitter') {
    for (let i = 0; i < 2; i++) {
      const m = new Enemy('mini', e.x + rand(rng, -14, 14), e.y + rand(rng, -14, 14), rng);
      m.angle = rand(rng, 0, TAU);
      enemies.push(m);
    }
  }
  const dropChance = e.type === 'elite' ? 1 : 0.12;
  if (rng() < dropChance) {
    const kind = e.type === 'elite' && player.hull < player.maxHull && rng() < 0.35
      ? 'heart' : POWERUP_KEYS[Math.floor(rng() * 4)];
    powerups.push(new PowerUp(kind, e.x, e.y));
  }
  if (!silent && enemies.length === 0 && spawnQueue.length === 0 && state === 'playing') {
    waveState = 'CLEARED';
    const bonus = 100 + 25 * wave;
    score += bonus;
    texts.push(new FloatText(W / 2, H / 2 - 60, 'WAVE CLEAR  +' + bonus, '#7df9d4', 22));
    AudioSys.waveClear();
    breather = 2.4;
  }
}

function hurtPlayer() {
  if (player.invuln > 0 || state !== 'playing') return;
  if (powers.shield > 0) {
    powers.shield = 0;
    player.invuln = 1.0;
    texts.push(new FloatText(player.x, player.y - 30, 'SHIELD DOWN', '#7df9d4', 16));
    AudioSys.playerHit();
    shake = Math.max(shake, 7);
    return;
  }
  player.hull--;
  combo = 0; comboTimer = 0;
  player.invuln = 1.4;
  flash = 0.35; shake = Math.max(shake, 11); hitStop = 0.05;
  explodeInto(particles, player.x, player.y, '#ff3d81', 22, rng, 300);
  AudioSys.playerHit();
  if (player.hull <= 0) gameOver();
}

function applyPowerUp(kind) {
  const def = POWERUP_DEFS[kind];
  if (kind === 'heart') {
    player.hull = Math.min(player.maxHull, player.hull + 1);
  } else if (kind === 'bomb') {
    bombs = Math.min(3, bombs + 1);
    texts.push(new FloatText(player.x, player.y - 30, 'NOVA BOMB +1  [E]', '#ff3d81', 16));
  } else {
    powers[kind] = def.secs;
  }
  if (kind !== 'bomb') texts.push(new FloatText(player.x, player.y - 30, def.label, def.color, 16));
  AudioSys.powerup();
}

// ---------- update ----------
function update(dt) {
  time += dt;
  elapsed += dt;
  if (hitStop > 0) { hitStop -= dt; return; }
  shake = Math.max(0, shake - dt * 26);
  flash = Math.max(0, flash - dt * 1.6);

  // Timers.
  for (const k of ['spread', 'rapid', 'shield']) powers[k] = Math.max(0, powers[k] - dt);
  if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }
  player.invuln = Math.max(0, player.invuln - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.fireCd -= dt;

  // --- player movement ---
  let ax = (keys['a'] || keys['arrowleft'] ? -1 : 0) + (keys['d'] || keys['arrowright'] ? 1 : 0);
  let ay = (keys['w'] || keys['arrowup'] ? -1 : 0) + (keys['s'] || keys['arrowdown'] ? 1 : 0);
  if (autoPilot) {
    // Orbit the arena centre and aim at the nearest enemy: the ship
    // plays itself, so a capture is a living slice of gameplay.
    const oa = time * 0.45;
    const tx = W / 2 + Math.cos(oa) * 175, ty = H / 2 + Math.sin(oa) * 125;
    ax = clamp((tx - player.x) / 60, -1, 1);
    ay = clamp((ty - player.y) / 60, -1, 1);
    let bestD = Infinity, bx = mouse.x, by = mouse.y;
    for (const e of enemies) {
      const d = dist2(player.x, player.y, e.x, e.y);
      if (d < bestD) { bestD = d; bx = e.x; by = e.y; }
    }
    mouse.x = bx; mouse.y = by;
    if (player.dashCd <= 0 && bestD < 90 * 90) tryDash();
  }
  if (player.dashTime > 0) {
    player.dashTime -= dt;
  } else {
    const ACC = 2400, MAXV = 330;
    player.vx += ax * ACC * dt;
    player.vy += ay * ACC * dt;
    const sp = Math.hypot(player.vx, player.vy);
    if (sp > MAXV) { player.vx = (player.vx / sp) * MAXV; player.vy = (player.vy / sp) * MAXV; }
    player.vx *= Math.pow(0.12, dt);
    player.vy *= Math.pow(0.12, dt);
  }
  player.x = clamp(player.x + player.vx * dt, 18, W - 18);
  player.y = clamp(player.y + player.vy * dt, 18, H - 18);
  player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  player.trail.push({ x: player.x, y: player.y, life: 0.25 });
  if (player.trail.length > 14) player.trail.shift();
  for (const t of player.trail) t.life -= dt;
  if (Math.hypot(player.vx, player.vy) > 60 && rng() < 0.6) {
    particles.push(new Particle(
      player.x - Math.cos(player.angle) * 16 + rand(rng, -4, 4),
      player.y - Math.sin(player.angle) * 16 + rand(rng, -4, 4),
      -player.vx * 0.15 + rand(rng, -20, 20), -player.vy * 0.15 + rand(rng, -20, 20),
      0.3, 2.5, rng() < 0.5 ? '#35f0ff' : '#7c5cff',
    ));
  }

  // --- firing ---
  if ((mouse.down || keys[' ']) && player.fireCd <= 0) {
    fireBullet();
    player.fireCd = powers.rapid > 0 ? 0.06 : 0.12;
  }

  // --- spawning ---
  if (spawnQueue.length > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && enemies.length < 26) {
      spawnEnemy(spawnQueue.shift());
      spawnTimer = 0.55;
    }
  } else if (enemies.length === 0 && waveState === 'CLEARED') {
    breather -= dt;
    if (breather <= 0) startWave(wave + 1);
  }

  // --- enemies ---
  for (const e of enemies) {
    e.flash = Math.max(0, e.flash - dt);
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    if (e.type === 'darter') {
      e.lungeCd -= dt;
      if (e.lungeCd <= 0 && d < 260 && e.lunging <= 0) { e.lunging = 0.4; e.lungeCd = rand(rng, 1.6, 2.6); }
      if (e.lunging > 0) { e.lunging -= dt; e.x += nx * e.speed * 2.6 * dt; e.y += ny * e.speed * 2.6 * dt; }
      else { e.x += nx * e.speed * 0.5 * dt; e.y += ny * e.speed * 0.5 * dt; }
    } else if (e.type === 'weaver') {
      e.phase += dt * 2.2;
      const px = -ny, py = nx;
      e.x += (nx * e.speed + px * Math.sin(e.phase) * 90) * dt;
      e.y += (ny * e.speed + py * Math.sin(e.phase) * 90) * dt;
      e.shootCd -= dt;
      if (e.shootCd <= 0 && d < 480) {
        e.shootCd = 2.3;
        ebullets.push(new Bullet(e.x, e.y, nx * 155, ny * 155, false, 6, 1));
        AudioSys.enemyShoot();
      }
    } else if (e.type === 'elite') {
      e.x += nx * e.speed * dt; e.y += ny * e.speed * dt;
      e.shootCd -= dt;
      if (e.shootCd <= 0 && d < 520) {
        e.shootCd = 1.9;
        for (const off of [-0.3, 0, 0.3]) {
          const a = Math.atan2(dy, dx) + off;
          ebullets.push(new Bullet(e.x, e.y, Math.cos(a) * 170, Math.sin(a) * 170, false, 6, 1));
        }
        AudioSys.enemyShoot();
      }
    } else {
      e.x += nx * e.speed * dt; e.y += ny * e.speed * dt;
    }
    e.angle += e.spin * dt;
    // Contact with the player hurts.
    if (d < e.r + player.r - 2) {
      hurtPlayer();
      e.x -= nx * 26; e.y -= ny * 26;
    }
  }

  // --- bullets ---
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) { bullets.splice(i, 1); continue; }
    for (const e of [...enemies]) {
      if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) * (b.r + e.r)) {
        damageEnemy(e, b.dmg);
        explodeInto(particles, b.x, b.y, '#aef6ff', 4, rng, 120);
        bullets.splice(i, 1);
        break;
      }
    }
  }
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) { ebullets.splice(i, 1); continue; }
    if (dist2(b.x, b.y, player.x, player.y) < (b.r + player.r - 2) * (b.r + player.r - 2)) {
      hurtPlayer();
      ebullets.splice(i, 1);
    }
  }

  // --- power-ups ---
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.life -= dt; p.phase += dt * 3;
    if (p.life <= 0) { powerups.splice(i, 1); continue; }
    const d = Math.hypot(player.x - p.x, player.y - p.y);
    if (d < 110) {
      p.x += ((player.x - p.x) / (d || 1)) * 260 * dt;
      p.y += ((player.y - p.y) / (d || 1)) * 260 * dt;
    }
    if (d < player.r + p.r + 6) {
      applyPowerUp(p.kind);
      explodeInto(particles, p.x, p.y, POWERUP_DEFS[p.kind].color, 14, rng, 160);
      powerups.splice(i, 1);
    }
  }

  // --- particles & texts ---
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
  }
  if (particles.length > 420) particles.splice(0, particles.length - 420);
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt; t.y -= 34 * dt;
    if (t.life <= 0) texts.splice(i, 1);
  }
}

// ---------- render ----------
function drawShip(x, y, angle, scale, color, glow, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = glow; ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(18, 0); ctx.lineTo(-12, -11); ctx.lineTo(-6, 0); ctx.lineTo(-12, 11);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(4, 0, 3.2, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  const flash = e.flash > 0;
  ctx.shadowColor = e.glow; ctx.shadowBlur = 14;
  ctx.fillStyle = flash ? '#ffffff' : e.color;
  ctx.strokeStyle = flash ? '#ffffff' : e.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (e.type === 'drifter') {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; i ? ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r) : ctx.moveTo(e.r, 0); }
    ctx.closePath(); ctx.fill();
  } else if (e.type === 'darter' || e.type === 'mini') {
    ctx.moveTo(e.r + 4, 0); ctx.lineTo(-e.r, -e.r * 0.8); ctx.lineTo(-e.r * 0.4, 0); ctx.lineTo(-e.r, e.r * 0.8);
    ctx.closePath(); ctx.fill();
  } else if (e.type === 'weaver') {
    ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
  } else if (e.type === 'splitter') {
    ctx.rect(-e.r * 0.85, -e.r * 0.85, e.r * 1.7, e.r * 1.7); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.strokeRect(-e.r * 0.45, -e.r * 0.45, e.r * 0.9, e.r * 0.9);
  } else if (e.type === 'elite') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const rr = i % 2 ? e.r * 0.72 : e.r;
      i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(rr, 0);
    }
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.45, 0, TAU); ctx.stroke();
  }
  ctx.restore();
  // Elite / tough HP bar.
  if (e.maxHp >= 4 && e.hp < e.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - 18, e.y - e.r - 12, 36, 4);
    ctx.fillStyle = '#ff5c8a';
    ctx.fillRect(e.x - 18, e.y - e.r - 12, 36 * (e.hp / e.maxHp), 4);
  }
}

function render() {
  ctx.save();
  if (shake > 0.2) ctx.translate(rand(rng, -shake, shake) * 0.5, rand(rng, -shake, shake) * 0.5);
  ctx.fillStyle = '#050514';
  ctx.fillRect(-20, -20, W + 40, H + 40);
  ctx.drawImage(nebula, 0, 0);

  // Starfield with a whisper of parallax from the player's velocity.
  const px = -player.vx * 0.012, py = -player.vy * 0.012;
  for (const s of stars) {
    const tw = 0.55 + 0.45 * Math.sin(time * 2 + s.tw);
    ctx.globalAlpha = tw * (0.35 + s.layer * 0.25);
    ctx.fillStyle = s.layer === 2 ? '#cfe6ff' : '#8fa8d8';
    const sx = (((s.x + px * (s.layer + 1)) % W) + W) % W;
    const sy = (((s.y + py * (s.layer + 1)) % H) + H) % H;
    ctx.fillRect(sx, sy, s.size, s.size);
  }
  ctx.globalAlpha = 1;

  // Power-ups.
  for (const p of powerups) {
    const def = POWERUP_DEFS[p.kind];
    const bob = Math.sin(p.phase) * 3;
    const blink = p.life < 3 ? (Math.sin(time * 12) > 0 ? 1 : 0.25) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.translate(p.x, p.y + bob);
    ctx.shadowColor = def.color; ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(8,12,34,0.9)';
    ctx.strokeStyle = def.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = def.color;
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const glyph = { spread: '✦', rapid: '»', shield: '◈', bomb: '✹', heart: '♥' }[p.kind];
    ctx.fillText(glyph, 0, 1);
    ctx.restore();
  }

  // Enemy bullets (additive glow).
  ctx.globalCompositeOperation = 'lighter';
  for (const b of ebullets) {
    ctx.shadowColor = '#b388ff'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#d9b3ff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Enemies.
  for (const e of enemies) drawEnemy(e);

  // Player trail + ship (blink while invulnerable).
  if (state !== 'over') {
    for (const t of player.trail) {
      if (t.life <= 0) continue;
      ctx.globalAlpha = (t.life / 0.25) * 0.35;
      drawShip(t.x, t.y, player.angle, 0.7, '#35f0ff', '#35f0ff');
    }
    ctx.globalAlpha = 1;
    const blink = player.invuln > 0 && Math.sin(time * 30) > 0;
    if (!blink) {
      drawShip(player.x, player.y, player.angle, 1, '#eafcff', '#35f0ff');
      // Engine flame.
      const fl = 10 + Math.random() * 8;
      ctx.save();
      ctx.translate(player.x, player.y); ctx.rotate(player.angle);
      ctx.fillStyle = 'rgba(255,180,80,0.9)';
      ctx.beginPath();
      ctx.moveTo(-12, -5); ctx.lineTo(-12 - fl, 0); ctx.lineTo(-12, 5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      if (powers.shield > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(125,249,212,0.8)'; ctx.lineWidth = 2;
        ctx.shadowColor = '#7df9d4'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(player.x, player.y, 26 + Math.sin(time * 5) * 2, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Player bullets.
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bullets) {
    ctx.strokeStyle = '#aef6ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.shadowColor = '#35f0ff'; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;

  // Floating score text.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of texts) {
    ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
    ctx.font = `800 ${t.size}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = t.color;
    ctx.shadowColor = t.color; ctx.shadowBlur = 8;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  // Damage flash.
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,40,90,${(flash * 0.45).toFixed(3)})`;
    ctx.fillRect(-20, -20, W + 40, H + 40);
  }
  ctx.restore();

  // Wave banner drawn on canvas when a wave is incoming.
  if (state === 'playing' && waveState === 'INCOMING' && spawnQueue.length > 0 && elapsed < 99999) {
    // (toast in the DOM carries the banner; nothing needed here)
  }
}

// ---------- loop ----------
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (state === 'playing') {
    update(dt);
    UI.updateHud({
      score, best, wave, waveState,
      hull: player.hull, maxHull: player.maxHull,
      combo, powers, bombs,
      dashCd: player.dashCd, dashCdMax: 2.2,
    });
  }
  render();
}

// ---------- screenshot states ----------
// ?shot=start | play | end (&seed=N): deterministic renders of the real
// game for the dossier screenshots — the kit's own starter ships the
// same pattern (shots.json). Normal play never uses these.
function setupShot() {
  const sp = shotParams();
  if (!sp) return false;
  rng = mulberry32(sp.seed);
  if (sp.shot === 'play') {
    state = 'playing';
    UI.showHud();
    score = 2450; wave = 3; kills = 31; combo = 5; bestCombo = 6;
    powers.spread = 7; bombs = 1;
    player.x = W / 2; player.y = H / 2 + 60;
    player.angle = -0.6;
    mouse.x = W / 2 + 180; mouse.y = H / 2 - 140;
    // The ship keeps firing on its own in this state, so the capture is
    // a living slice of gameplay — kills, particles and score popups —
    // not a posed diorama.
    mouse.down = true;
    autoPilot = true;
    const spots = [
      ['drifter', 180, 140], ['darter', 760, 120], ['weaver', 640, 420],
      ['splitter', 220, 430], ['drifter', 840, 300], ['elite', 480, 110],
      ['darter', 120, 300], ['weaver', 880, 470], ['mini', 560, 200],
      ['drifter', 330, 90],
    ];
    for (const [type, x, y] of spots) enemies.push(new Enemy(type, x, y, rng));
    for (let i = 0; i < 5; i++) {
      const a = -0.6 + rand(rng, -0.2, 0.2);
      bullets.push(new Bullet(player.x + Math.cos(a) * (40 + i * 46), player.y + Math.sin(a) * (40 + i * 46), Math.cos(a) * 640, Math.sin(a) * 640, true));
    }
    ebullets.push(new Bullet(640, 420, -90, 90, false, 6, 1));
    ebullets.push(new Bullet(480, 110, 40, 120, false, 6, 1));
    explodeInto(particles, 760, 120, '#ffb347', 16, rng, 240);
    explodeInto(particles, 330, 90, '#ff5c8a', 12, rng, 200);
    powerups.push(new PowerUp('rapid', 700, 480));
    texts.push(new FloatText(640, 380, '+240', '#ffc857', 17));
    texts.push(new FloatText(760, 96, '+80', '#dfe9ff', 14));
    waveState = 'INCOMING';
  } else if (sp.shot === 'end') {
    state = 'over';
    score = 5280; wave = 6; kills = 87; bestCombo = 6;
    if (score > best) { best = score; }
    UI.showHud(); // hides the title screen so only the results show
    UI.showGameOver({ score, wave, kills, bestCombo }, true);
    UI.updateHud({
      score, best, wave, waveState: 'CLEARED',
      hull: 0, maxHull: 3, combo: 0, powers, bombs: 0,
      dashCd: 0, dashCdMax: 2.2,
    });
  }
  return true;
}

// ---------- boot ----------
UI.showTitle(best);
UI.setMute(false);
const isShot = setupShot();
requestAnimationFrame(frame);
