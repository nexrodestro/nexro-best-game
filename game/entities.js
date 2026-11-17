// NOVA DRIFT — entities. One job: the things that fly, shoot, burst and
// drop in the arena, and how they move and die. No DOM, no audio here —
// the main loop owns state, this file owns shapes and behaviour.

// Deterministic RNG so screenshot states (and replays) are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TAU = Math.PI * 2;
export function rand(rng, a, b) { return a + rng() * (b - a); }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function dist2(ax, ay, bx, by) { const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy; }

export const ENEMY_TYPES = {
  drifter:  { r: 16, hp: 2,  speed: 62,  score: 50,  color: '#ff5c8a', glow: '#ff3d81' },
  darter:   { r: 11, hp: 1,  speed: 155, score: 80,  color: '#ffb347', glow: '#ff9f1c' },
  weaver:   { r: 14, hp: 3,  speed: 82,  score: 120, color: '#b388ff', glow: '#7c5cff' },
  splitter: { r: 20, hp: 4,  speed: 56,  score: 150, color: '#5cf2b8', glow: '#2ee6a8' },
  mini:     { r: 9,  hp: 1,  speed: 132, score: 40,  color: '#7df9d4', glow: '#2ee6a8' },
  elite:    { r: 30, hp: 14, speed: 46,  score: 500, color: '#ff4d6d', glow: '#ff2e63' },
};

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 14;
    this.angle = -Math.PI / 2;
    this.hull = 3; this.maxHull = 3;
    this.invuln = 0;
    this.dashCd = 0; this.dashTime = 0;
    this.fireCd = 0;
    this.trail = [];
  }
  reset(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hull = this.maxHull; this.invuln = 0;
    this.dashCd = 0; this.dashTime = 0; this.fireCd = 0;
    this.trail.length = 0;
  }
}

export class Enemy {
  constructor(type, x, y, rng) {
    const t = ENEMY_TYPES[type];
    this.type = type;
    this.x = x; this.y = y;
    this.r = t.r; this.hp = t.hp; this.maxHp = t.hp;
    this.speed = t.speed * rand(rng, 0.9, 1.15);
    this.score = t.score;
    this.color = t.color; this.glow = t.glow;
    this.angle = Math.atan2(300 - y, 480 - x);
    this.spin = rand(rng, -2.4, 2.4);
    this.phase = rand(rng, 0, TAU);
    this.shootCd = rand(rng, 1.2, 2.4);
    this.lungeCd = rand(rng, 1.5, 3);
    this.lunging = 0;
    this.flash = 0;
    this.wobble = rand(rng, 0.5, 1.4);
  }
}

export class Bullet {
  constructor(x, y, vx, vy, friendly, r = 4, dmg = 1) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = r; this.dmg = dmg; this.friendly = friendly;
    this.life = 2.2;
  }
}

export class Particle {
  constructor(x, y, vx, vy, life, size, color, drag = 0.92) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.size = size; this.color = color; this.drag = drag;
  }
}

export class PowerUp {
  constructor(kind, x, y) {
    this.kind = kind; this.x = x; this.y = y;
    this.r = 13; this.vx = 0; this.vy = 0;
    this.life = 11; this.phase = Math.random() * TAU;
    this.magnet = false;
  }
}

export class FloatText {
  constructor(x, y, text, color = '#fff', size = 15) {
    this.x = x; this.y = y; this.text = text;
    this.color = color; this.size = size;
    this.life = 0.9; this.maxLife = 0.9;
  }
}

export const POWERUP_DEFS = {
  spread: { label: 'SPREAD SHOT', color: '#35f0ff', secs: 12 },
  rapid:  { label: 'RAPID FIRE',  color: '#ffc857', secs: 10 },
  shield: { label: 'SHIELD',      color: '#7df9d4', secs: 15 },
  bomb:   { label: 'NOVA BOMB',   color: '#ff3d81', secs: 0 },
  heart:  { label: '+1 HULL',     color: '#ff5c8a', secs: 0 },
};

export const POWERUP_KEYS = ['spread', 'rapid', 'shield', 'bomb', 'heart'];

// Burst of sparks + smoke for an explosion. Pushes into the given array.
export function explodeInto(particles, x, y, color, count, rng, speed = 260) {
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU;
    const sp = rand(rng, speed * 0.15, speed);
    particles.push(new Particle(
      x, y,
      Math.cos(a) * sp, Math.sin(a) * sp,
      rand(rng, 0.35, 0.9),
      rand(rng, 1.5, 4.2),
      rng() < 0.75 ? color : '#ffffff',
    ));
  }
}
