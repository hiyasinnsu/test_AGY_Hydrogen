/**
 * Pure ES module defining difficulty scaling, enemy types, stage wave timeline,
 * boss spell-card phases, and geometric danmaku bullet emitters.
 *
 * ZERO DOM/browser globals so Node tests and headless simulations can import directly.
 */

export const DIFFICULTY_CONFIG = Object.freeze({
  EASY: Object.freeze({
    label: 'EASY',
    bulletSpeedMult: 0.78,
    densityMult: 0.68,
    bossHpMult: 0.8,
    lives: 4,
    bombs: 3,
  }),
  NORMAL: Object.freeze({
    label: 'NORMAL',
    bulletSpeedMult: 1.0,
    densityMult: 1.0,
    bossHpMult: 1.0,
    lives: 3,
    bombs: 3,
  }),
  LUNATIC: Object.freeze({
    label: 'LUNATIC',
    bulletSpeedMult: 1.22,
    densityMult: 1.4,
    bossHpMult: 1.3,
    lives: 3,
    bombs: 2,
  }),
});

export const ENEMY_TYPES = Object.freeze({
  drone: Object.freeze({
    id: 'drone',
    name: 'Void Drone',
    hp: 26,
    radius: 14,
    score: 180,
    dropGems: 3,
    color: '#38e8ff',
    shape: 'dart',
    isBoss: false,
  }),
  spinner: Object.freeze({
    id: 'spinner',
    name: 'Gyro Spinner',
    hp: 65,
    radius: 17,
    score: 420,
    dropGems: 5,
    color: '#ffbe0b',
    shape: 'hex',
    isBoss: false,
  }),
  cruiser: Object.freeze({
    id: 'cruiser',
    name: 'Nebula Cruiser',
    hp: 210,
    radius: 23,
    score: 1200,
    dropGems: 14,
    color: '#ff5d8f',
    shape: 'chevron',
    isBoss: false,
  }),
  prism: Object.freeze({
    id: 'prism',
    name: 'Astral Prism',
    hp: 95,
    radius: 18,
    score: 600,
    dropGems: 9,
    color: '#b76cff',
    shape: 'diamond',
    isBoss: false,
  }),
  midboss: Object.freeze({
    id: 'midboss',
    name: 'VALKYRIE // VEX',
    hp: 1050,
    radius: 32,
    score: 15000,
    dropGems: 36,
    color: '#ff8a3d',
    shape: 'seraph',
    isBoss: true,
  }),
  boss: Object.freeze({
    id: 'boss',
    name: 'SOLARIS ECLIPSE',
    hp: 5400,
    radius: 38,
    score: 60000,
    dropGems: 90,
    color: '#ff2e7a',
    shape: 'eclipse',
    isBoss: true,
  }),
});

export const BOSS_PHASES = Object.freeze([
  Object.freeze({
    index: 0,
    name: 'PHASE 01 // CRIMSON LOTUS',
    subtitle: 'Counter-Rotating Blossom & Thorn Fan',
    hpRatioMin: 0.66,
    hpRatioMax: 1.0,
    pattern: 'boss_crimson_lotus',
    interval: 0.18,
  }),
  Object.freeze({
    index: 1,
    name: 'PHASE 02 // PRISM VORTEX',
    subtitle: 'Refracting Star Streams & Ring Anchors',
    hpRatioMin: 0.33,
    hpRatioMax: 0.66,
    pattern: 'boss_prism_vortex',
    interval: 0.2,
  }),
  Object.freeze({
    index: 2,
    name: 'FINAL // STARLIGHT SINGULARITY',
    subtitle: 'Braking Starbursts & Twin Eclipse Curtains',
    hpRatioMin: 0.0,
    hpRatioMax: 0.33,
    pattern: 'boss_starlight_singularity',
    interval: 0.16,
  }),
]);

export const STAGE_WAVES = Object.freeze([
  Object.freeze({
    time: 1.5,
    type: 'wave',
    enemyType: 'drone',
    count: 5,
    formation: 'vee',
    y: 110,
    spacing: 62,
    pattern: 'aimed_single',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 5.0,
    type: 'wave',
    enemyType: 'drone',
    count: 4,
    formation: 'line',
    y: 120,
    spacing: 85,
    pattern: 'aimed_fan',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 9.0,
    type: 'wave',
    enemyType: 'spinner',
    count: 4,
    formation: 'flank',
    y: 140,
    spacing: 120,
    pattern: 'dual_spiral',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 13.5,
    type: 'wave',
    enemyType: 'drone',
    count: 5,
    formation: 'sweep',
    y: 105,
    spacing: 70,
    pattern: 'sine_curtain',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 18.0,
    type: 'wave',
    enemyType: 'prism',
    count: 3,
    formation: 'vee',
    y: 135,
    spacing: 110,
    pattern: 'flower_ring',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 23.0,
    type: 'wave',
    enemyType: 'cruiser',
    count: 2,
    formation: 'flank',
    y: 130,
    spacing: 210,
    pattern: 'star_burst',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 27.5,
    type: 'wave',
    enemyType: 'drone',
    count: 6,
    formation: 'line',
    y: 110,
    spacing: 64,
    pattern: 'aimed_fan',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 31.0,
    type: 'wave',
    enemyType: 'prism',
    count: 2,
    formation: 'flank',
    y: 145,
    spacing: 220,
    pattern: 'alternating_ring',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 34.0,
    type: 'warning',
    enemyType: 'midboss',
    count: 0,
    formation: 'center',
    y: 150,
    spacing: 0,
    pattern: null,
    title: 'WARNING // INTERCEPTOR',
    subtitle: 'VALKYRIE // VEX APPROACHING',
    isMidboss: true,
  }),
  Object.freeze({
    time: 36.0,
    type: 'wave',
    enemyType: 'midboss',
    count: 1,
    formation: 'center',
    y: 150,
    spacing: 0,
    pattern: 'midboss_tempest',
    title: 'MIDBOSS // VALKYRIE VEX',
    subtitle: 'Crimson Crossfire Protocol',
    isMidboss: true,
  }),
  Object.freeze({
    time: 50.0,
    type: 'wave',
    enemyType: 'spinner',
    count: 6,
    formation: 'sweep',
    y: 120,
    spacing: 65,
    pattern: 'dual_spiral',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 54.5,
    type: 'wave',
    enemyType: 'prism',
    count: 3,
    formation: 'vee',
    y: 130,
    spacing: 115,
    pattern: 'flower_ring',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 59.0,
    type: 'wave',
    enemyType: 'cruiser',
    count: 2,
    formation: 'flank',
    y: 135,
    spacing: 200,
    pattern: 'star_burst',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 62.5,
    type: 'wave',
    enemyType: 'drone',
    count: 7,
    formation: 'vee',
    y: 105,
    spacing: 56,
    pattern: 'sine_curtain',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 66.5,
    type: 'wave',
    enemyType: 'prism',
    count: 4,
    formation: 'line',
    y: 140,
    spacing: 95,
    pattern: 'alternating_ring',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 70.0,
    type: 'wave',
    enemyType: 'cruiser',
    count: 3,
    formation: 'vee',
    y: 130,
    spacing: 120,
    pattern: 'aimed_lance',
    title: null,
    subtitle: null,
    isMidboss: false,
  }),
  Object.freeze({
    time: 73.0,
    type: 'warning',
    enemyType: 'boss',
    count: 0,
    formation: 'center',
    y: 150,
    spacing: 0,
    pattern: null,
    title: 'WARNING // STELLAR ECLIPSE',
    subtitle: 'SOLARIS ECLIPSE CLASS ENTITY DETECTED',
    isMidboss: false,
  }),
  Object.freeze({
    time: 75.0,
    type: 'boss',
    enemyType: 'boss',
    count: 1,
    formation: 'center',
    y: 150,
    spacing: 0,
    pattern: 'boss_crimson_lotus',
    title: 'SOLARIS ECLIPSE',
    subtitle: 'CORE // STELLAR SINGULARITY',
    isMidboss: false,
  }),
]);

const TAU = Math.PI * 2;
const VALID_SHAPES = new Set(['orb', 'rice', 'needle', 'ring', 'star']);

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scaleCount(base, densityMult, min = 1, max = 48) {
  const mult = clamp(finiteOr(densityMult, 1), 0.25, 3.0);
  return clamp(Math.round(base * mult), min, max);
}

function scaleOddCount(base, densityMult, min = 1, max = 35) {
  let n = scaleCount(base, densityMult, min, max);
  if (n % 2 === 0) {
    n = n + 1 <= max ? n + 1 : Math.max(min, n - 1);
  }
  return n;
}

function getAimAngle(x, y, targetX, targetY) {
  const dx = targetX - x;
  const dy = targetY - y;
  if (dx === 0 && dy === 0) return Math.PI / 2;
  return Math.atan2(dy, dx);
}

function getPhaseState(ctx) {
  const tick = Number.isFinite(ctx.phaseTick)
    ? Math.trunc(ctx.phaseTick)
    : Math.trunc(finiteOr(ctx.tick, 0));
  const age = finiteOr(ctx.age, tick / 60);
  return { tick, age };
}

function emitBullet(spawnBullet, spec) {
  const x = finiteOr(spec.x, 225);
  const y = finiteOr(spec.y, 140);
  const vx = finiteOr(spec.vx, 0);
  const vy = finiteOr(spec.vy, 160);
  const ax = finiteOr(spec.ax, 0);
  const ay = finiteOr(spec.ay, 0);
  const radius = Math.max(1, finiteOr(spec.radius, 5));
  const color = typeof spec.color === 'string' && spec.color.length > 0 ? spec.color : '#ff3b7f';
  const shape = VALID_SHAPES.has(spec.shape) ? spec.shape : 'orb';
  const spin = finiteOr(spec.spin, 0);
  const turnRate = finiteOr(spec.turnRate, 0);
  const minSpeed = Math.max(0, finiteOr(spec.minSpeed, 0));
  const maxSpeed = Math.max(minSpeed + 10, finiteOr(spec.maxSpeed, 600));

  spawnBullet({
    x,
    y,
    vx,
    vy,
    ax,
    ay,
    radius,
    color,
    shape,
    spin,
    turnRate,
    maxSpeed,
    minSpeed,
  });
}

function emitPolar(spawnBullet, x, y, angle, speed, options = {}) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const accel = finiteOr(options.accel, 0);
  const lateralAccel = finiteOr(options.lateralAccel, 0);
  const ax = ux * accel - uy * lateralAccel;
  const ay = uy * accel + ux * lateralAccel;

  emitBullet(spawnBullet, {
    x: x + ux * finiteOr(options.offset, 0),
    y: y + uy * finiteOr(options.offset, 0),
    vx: ux * speed,
    vy: uy * speed,
    ax,
    ay,
    radius: options.radius,
    color: options.color,
    shape: options.shape,
    spin: options.spin,
    turnRate: options.turnRate,
    maxSpeed: options.maxSpeed,
    minSpeed: options.minSpeed,
  });
}

function emitFan(spawnBullet, x, y, centerAngle, count, stepAngle, speed, options = {}) {
  const half = (count - 1) * 0.5;
  for (let i = 0; i < count; i++) {
    const offset = i - half;
    const angle = centerAngle + offset * stepAngle;
    const itemOpts = typeof options === 'function' ? options(i, offset, angle) : options;
    const itemSpeed = typeof speed === 'function' ? speed(i, offset, angle) : speed;
    emitPolar(spawnBullet, x, y, angle, itemSpeed, itemOpts);
  }
}

function emitRadial(spawnBullet, x, y, baseAngle, count, speed, options = {}) {
  const step = TAU / count;
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + i * step;
    const itemOpts = typeof options === 'function' ? options(i, angle) : options;
    const itemSpeed = typeof speed === 'function' ? speed(i, angle) : speed;
    emitPolar(spawnBullet, x, y, angle, itemSpeed, itemOpts);
  }
}

const PATTERN_HANDLERS = {
  aimed_single({ x, y, targetX, targetY, speedMult, densityMult, spawnBullet }) {
    const aim = getAimAngle(x, y, targetX, targetY);
    const count = scaleCount(2, densityMult, 1, 4);
    if (count === 1) {
      emitPolar(spawnBullet, x, y, aim, 215 * speedMult, {
        radius: 4.5,
        color: '#4deeea',
        shape: 'rice',
      });
      return;
    }
    const px = -Math.sin(aim);
    const py = Math.cos(aim);
    const spread = 9;
    const half = (count - 1) * 0.5;
    for (let i = 0; i < count; i++) {
      const shift = (i - half) * spread;
      emitPolar(spawnBullet, x + px * shift, y + py * shift, aim, 220 * speedMult, {
        radius: 4.5,
        color: '#4deeea',
        shape: 'rice',
      });
    }
  },

  aimed_fan({ x, y, targetX, targetY, speedMult, densityMult, spawnBullet }) {
    const aim = getAimAngle(x, y, targetX, targetY);
    const count = scaleOddCount(5, densityMult, 3, 9);
    emitFan(spawnBullet, x, y, aim, count, 0.16, 195 * speedMult, (i) => ({
      radius: 4.5,
      color: i % 2 === 0 ? '#ff4d8d' : '#ff8fb8',
      shape: 'rice',
    }));
  },

  aimed_lance({ x, y, targetX, targetY, speedMult, densityMult, spawnBullet }) {
    const aim = getAimAngle(x, y, targetX, targetY);
    const spokes = scaleOddCount(3, densityMult, 3, 7);
    const speeds = [195, 240, 285];
    for (let tier = 0; tier < speeds.length; tier++) {
      const tierOffset = tier === 1 ? 0.035 : 0;
      emitFan(spawnBullet, x, y, aim + tierOffset, spokes, 0.22, speeds[tier] * speedMult, {
        radius: tier === 2 ? 4 : 4.5,
        color: tier === 2 ? '#ffd166' : '#ff3b7f',
        shape: 'needle',
      });
    }
  },

  dual_spiral(ctx) {
    const { x, y, speedMult, densityMult, spawnBullet } = ctx;
    const { tick, age } = getPhaseState(ctx);
    const arms = scaleCount(3, densityMult, 2, 6);
    const cwAngle = tick * 0.36 + age * 1.45;
    const ccwAngle = -tick * 0.36 - age * 1.45 + Math.PI / arms;

    emitRadial(spawnBullet, x, y, cwAngle, arms, 148 * speedMult, {
      radius: 5,
      color: '#ffbe0b',
      shape: 'orb',
      offset: 8,
    });
    emitRadial(spawnBullet, x, y, ccwAngle, arms, 132 * speedMult, {
      radius: 4.5,
      color: '#4deeea',
      shape: 'rice',
      offset: 8,
    });
  },

  flower_ring(ctx) {
    const { x, y, speedMult, densityMult, spawnBullet } = ctx;
    const { tick, age } = getPhaseState(ctx);
    const petals = 5;
    const perPetal = scaleCount(3, densityMult, 2, 5);
    const count = petals * perPetal;
    const baseAngle = tick * 0.22 + age * 0.8 + Math.PI / 2;

    emitRadial(
      spawnBullet,
      x,
      y,
      baseAngle,
      count,
      (i, angle) => (135 + 34 * Math.cos(petals * (angle - baseAngle))) * speedMult,
      (i) => ({
        radius: i % 2 === 0 ? 5.5 : 4.5,
        color: i % 2 === 0 ? '#c77dff' : '#ff6bd6',
        shape: i % 2 === 0 ? 'orb' : 'rice',
      })
    );
  },

  alternating_ring(ctx) {
    const { x, y, speedMult, densityMult, spawnBullet } = ctx;
    const { tick, age } = getPhaseState(ctx);
    const count = scaleCount(12, densityMult, 8, 22);
    const phaseShift = (Math.abs(tick) % 2) * (Math.PI / count);
    const baseAngle = Math.PI / 2 + age * 0.6 + phaseShift;

    emitRadial(
      spawnBullet,
      x,
      y,
      baseAngle,
      count,
      (i) => (i % 2 === 0 ? 185 : 132) * speedMult,
      (i) => ({
        radius: i % 2 === 0 ? 4 : 5.5,
        color: i % 2 === 0 ? '#72efdd' : '#ff477e',
        shape: i % 2 === 0 ? 'needle' : 'orb',
      })
    );
  },

  sine_curtain(ctx) {
    const { x, y, speedMult, densityMult, spawnBullet } = ctx;
    const { tick, age } = getPhaseState(ctx);
    const count = scaleCount(7, densityMult, 5, 13);
    const wave = tick * 0.42 + age * 2.1;
    const center = Math.PI / 2 + 0.46 * Math.sin(wave);
    const lateral = Math.cos(wave) * 26 * speedMult;

    emitFan(spawnBullet, x, y, center, count, 0.16, 162 * speedMult, (i) => ({
      radius: 4.5,
      color: i % 2 === 0 ? '#56cfe1' : '#9bf6ff',
      shape: 'rice',
      lateralAccel: lateral,
    }));
  },

  star_burst(ctx) {
    const { x, y, speedMult, densityMult, spawnBullet } = ctx;
    const { tick, age } = getPhaseState(ctx);
    const points = 5;
    const sub = scaleCount(3, densityMult, 2, 5);
    const baseAngle = tick * 0.29 + age * 0.9 - Math.PI / 2;
    const armStep = TAU / points;

    for (let p = 0; p < points; p++) {
      const armAngle = baseAngle + p * armStep;
      const half = (sub - 1) * 0.5;
      for (let s = 0; s < sub; s++) {
        const offsetAngle = (s - half) * 0.085;
        const speed = (240 - Math.abs(s - half) * 18) * speedMult;
        emitPolar(spawnBullet, x, y, armAngle + offsetAngle, speed, {
          accel: -135 * speedMult,
          minSpeed: 92 * speedMult,
          maxSpeed: 360 * speedMult,
          radius: 6,
          color: '#ff9f1c',
          shape: 'star',
          spin: 4.2,
        });
      }
      emitPolar(spawnBullet, x, y, armAngle, 85 * speedMult, {
        accel: 115 * speedMult,
        minSpeed: 70 * speedMult,
        maxSpeed: 235 * speedMult,
        radius: 7,
        color: '#ffbf69',
        shape: 'ring',
      });
    }
  },

  midboss_tempest(ctx) {
    const { x, y, targetX, targetY, speedMult, densityMult, spawnBullet } = ctx;
    const { tick, age } = getPhaseState(ctx);
    const arms = scaleCount(4, densityMult, 3, 7);
    const dir = Math.floor(Math.abs(tick) / 8) % 2 === 0 ? 1 : -1;
    const baseAngle = tick * 0.34 + age * 1.3;

    emitRadial(spawnBullet, x, y, baseAngle, arms, 148 * speedMult, (i) => ({
      radius: i % 2 === 0 ? 6 : 5,
      color: i % 2 === 0 ? '#ffd166' : '#ff8a3d',
      shape: i % 2 === 0 ? 'star' : 'orb',
      spin: i % 2 === 0 ? dir * 4.5 : 0,
      turnRate: dir * 0.24,
      offset: 14,
    }));

    if (Math.abs(tick) % 2 === 0) {
      const aim = getAimAngle(x, y, targetX, targetY);
      const fanCount = scaleOddCount(3, densityMult, 3, 7);
      emitFan(spawnBullet, x, y, aim, fanCount, 0.17, 220 * speedMult, {
        radius: 4,
        color: '#ff3b7f',
        shape: 'needle',
      });
    }
  },

  boss_crimson_lotus(ctx) {
    const { x, y, targetX, targetY, speedMult, densityMult, spawnBullet } = ctx;
    const { tick, age } = getPhaseState(ctx);
    const outerCount = scaleCount(10, densityMult, 6, 16);
    const innerCount = scaleCount(6, densityMult, 4, 10);
    const cwBase = tick * 0.27 + age * 1.1;
    const ccwBase = -tick * 0.31 - age * 1.25;

    emitRadial(
      spawnBullet,
      x,
      y,
      cwBase,
      outerCount,
      (i, angle) => (145 + 32 * Math.cos(5 * (angle - cwBase))) * speedMult,
      {
        radius: 5,
        color: '#ff2e7a',
        shape: 'rice',
        offset: 16,
      }
    );

    emitRadial(spawnBullet, x, y, ccwBase, innerCount, 128 * speedMult, {
      radius: 5.5,
      color: '#ff8fab',
      shape: 'orb',
      offset: 12,
    });

    if (Math.abs(tick) % 3 === 0) {
      const aim = getAimAngle(x, y, targetX, targetY);
      const thorns = scaleOddCount(5, densityMult, 3, 7);
      emitFan(spawnBullet, x, y, aim, thorns, 0.14, 225 * speedMult, {
        radius: 4,
        color: '#ffd166',
        shape: 'needle',
      });
    }
  },

  boss_prism_vortex(ctx) {
    const { x, y, targetX, targetY, speedMult, densityMult, spawnBullet } = ctx;
    const { tick, age } = getPhaseState(ctx);
    const arms = scaleCount(6, densityMult, 4, 10);
    const dir = Math.floor(Math.abs(tick) / 6) % 2 === 0 ? 1 : -1;
    const baseAngle = tick * 0.31 + age * 1.25;

    emitRadial(spawnBullet, x, y, baseAngle, arms, 160 * speedMult, (i) => ({
      radius: i % 2 === 0 ? 6 : 4.5,
      color: i % 2 === 0 ? '#b76cff' : '#4cc9f0',
      shape: i % 2 === 0 ? 'star' : 'rice',
      spin: i % 2 === 0 ? dir * 5 : 0,
      turnRate: dir * 0.28,
      offset: 14,
    }));

    emitRadial(spawnBullet, x, y, baseAngle + Math.PI / arms, arms, 185 * speedMult, {
      radius: 4,
      color: '#72efdd',
      shape: 'rice',
      turnRate: -dir * 0.18,
      offset: 14,
    });

    if (Math.abs(tick) % 4 === 0) {
      const aim = getAimAngle(x, y, targetX, targetY);
      const anchors = scaleCount(6, densityMult, 4, 8);
      emitRadial(spawnBullet, x, y, aim + Math.PI / anchors, anchors, 122 * speedMult, {
        radius: 7.5,
        color: '#f72585',
        shape: 'ring',
      });
    }
  },

  boss_starlight_singularity(ctx) {
    const { x, y, targetX, targetY, speedMult, densityMult, spawnBullet } = ctx;
    const { tick, age } = getPhaseState(ctx);
    const starCount = scaleCount(10, densityMult, 7, 16);
    const starBase = tick * 0.24 + age * 0.95;

    emitRadial(spawnBullet, x, y, starBase, starCount, 232 * speedMult, (i) => ({
      accel: -128 * speedMult,
      minSpeed: 96 * speedMult,
      maxSpeed: 360 * speedMult,
      radius: 6,
      color: i % 2 === 0 ? '#ffd166' : '#72efdd',
      shape: 'star',
      spin: 4.5,
      offset: 12,
    }));

    const curtainArms = scaleCount(3, densityMult, 2, 5);
    const cwCurtain = tick * 0.42 + age * 1.5;
    const ccwCurtain = -tick * 0.42 - age * 1.5;
    emitRadial(spawnBullet, x, y, cwCurtain, curtainArms, 165 * speedMult, {
      radius: 5,
      color: '#ff2e7a',
      shape: 'orb',
      turnRate: 0.21,
      offset: 18,
    });
    emitRadial(spawnBullet, x, y, ccwCurtain, curtainArms, 165 * speedMult, {
      radius: 5,
      color: '#4deeea',
      shape: 'orb',
      turnRate: -0.21,
      offset: 18,
    });

    if (Math.abs(tick) % 3 === 0) {
      const aim = getAimAngle(x, y, targetX, targetY);
      const lanceCount = scaleOddCount(3, densityMult, 3, 5);
      emitFan(spawnBullet, x, y, aim, lanceCount, 0.19, 195 * speedMult, {
        radius: 7.5,
        color: '#ffffff',
        shape: 'ring',
      });
      emitFan(spawnBullet, x, y, aim, lanceCount, 0.19, 245 * speedMult, {
        radius: 4,
        color: '#ff3b7f',
        shape: 'needle',
      });
    }
  },
};

export const PATTERN_NAMES = Object.freeze(Object.keys(PATTERN_HANDLERS));

export function emitPattern(patternName, ctx) {
  if (!ctx || typeof ctx.spawnBullet !== 'function') return;
  const safeCtx = {
    x: finiteOr(ctx.x, 225),
    y: finiteOr(ctx.y, 140),
    targetX: finiteOr(ctx.targetX, 225),
    targetY: finiteOr(ctx.targetY, 680),
    tick: finiteOr(ctx.tick, 0),
    age: finiteOr(ctx.age, 0),
    phaseTick: Number.isFinite(ctx.phaseTick) ? ctx.phaseTick : finiteOr(ctx.tick, 0),
    speedMult: clamp(finiteOr(ctx.speedMult, 1), 0.3, 2.5),
    densityMult: clamp(finiteOr(ctx.densityMult, 1), 0.25, 3.0),
    spawnBullet: ctx.spawnBullet,
  };
  const handler = PATTERN_HANDLERS[patternName] || PATTERN_HANDLERS.aimed_fan;
  handler(safeCtx);
}
