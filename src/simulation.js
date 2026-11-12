import {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_HITBOX_RADIUS,
  PLAYER_GRAZE_RADIUS,
  POC_LINE_Y,
  PLAYER_SPEED,
  PLAYER_FOCUS_SPEED,
  PLAYER_BOUND_X,
  PLAYER_BOUND_Y,
  MAX_BOMBS,
  BOMB_CHARGE_MAX,
  GAME_STATES,
  DIFFICULTIES,
} from './constants.js';
import { createPool } from './pool.js';
import {
  DIFFICULTY_CONFIG,
  ENEMY_TYPES,
  STAGE_WAVES,
  BOSS_PHASES,
  emitPattern,
} from './patterns.js';

const PLAYER_BULLET_CAP = 256;
const ENEMY_BULLET_CAP = 1800;
const GEM_CAP = 1200;
const PARTICLE_CAP = 800;
const FLOATING_TEXT_CAP = 64;

const MAX_DT = 0.05;
const PLAYER_FIRE_INTERVAL = 0.075;
const COMBO_TIMEOUT = 2.6;
const BOMB_DURATION = 1.65;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function nextRand(state) {
  let s = state._rngState | 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state._rngState = s;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function distSqOriginToSegment(ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 1e-8) {
    return ax * ax + ay * ay;
  }
  let t = -(ax * abx + ay * aby) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return cx * cx + cy * cy;
}

function normalizeDifficulty(difficulty) {
  if (difficulty && DIFFICULTIES[difficulty]) {
    return DIFFICULTIES[difficulty];
  }
  return DIFFICULTIES.NORMAL;
}

function getDifficultyConfig(difficulty) {
  return (
    DIFFICULTY_CONFIG?.[difficulty] ||
    DIFFICULTY_CONFIG?.[DIFFICULTIES.NORMAL] || {
      label: 'NORMAL',
      bulletSpeedMult: 1.0,
      densityMult: 1.0,
      bossHpMult: 1.0,
      lives: 3,
      bombs: 3,
    }
  );
}

function createPlayerBulletPool() {
  return createPool(PLAYER_BULLET_CAP, () => ({
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    radius: 5,
    damage: 1,
    color: '#5ce1ff',
    kind: 'main',
    angle: -Math.PI / 2,
    age: 0,
  }));
}

function createEnemyBulletPool() {
  return createPool(ENEMY_BULLET_CAP, () => ({
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    radius: 5,
    color: '#ff3b7f',
    shape: 'orb',
    spin: 0,
    angle: 0,
    turnRate: 0,
    maxSpeed: 600,
    minSpeed: 0,
    age: 0,
    grazed: false,
  }));
}

function createGemPool() {
  return createPool(GEM_CAP, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 7,
    kind: 'score',
    value: 100,
    magnet: false,
    age: 0,
  }));
}

function createParticlePool() {
  return createPool(PARTICLE_CAP, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 3,
    color: '#ffffff',
    alpha: 1,
    life: 0,
    maxLife: 0.4,
    drag: 0.94,
    shape: 'circle',
  }));
}

function createFloatingTextPool() {
  return createPool(FLOATING_TEXT_CAP, () => ({
    x: 0,
    y: 0,
    vy: -42,
    text: '',
    color: '#ffffff',
    alpha: 1,
    life: 0,
    maxLife: 0.8,
    scale: 1,
  }));
}

function spawnParticle(state, x, y, vx, vy, size, color, maxLife = 0.4, shape = 'circle', drag = 0.93) {
  state.particles.spawn((p) => {
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.size = size;
    p.color = color;
    p.alpha = 1;
    p.life = 0;
    p.maxLife = maxLife;
    p.drag = drag;
    p.shape = shape;
  });
}

function spawnBurst(state, x, y, count, color, speedMin = 60, speedMax = 210, size = 3, maxLife = 0.42) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (nextRand(state) - 0.5) * 0.4;
    const speed = speedMin + nextRand(state) * (speedMax - speedMin);
    spawnParticle(
      state,
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      size * (0.75 + nextRand(state) * 0.6),
      color,
      maxLife * (0.75 + nextRand(state) * 0.5),
      'spark',
      0.92,
    );
  }
}

function spawnFloatingText(state, x, y, text, color = '#ffffff', maxLife = 0.85, scale = 1) {
  state.floatingTexts.spawn((ft) => {
    ft.x = clamp(x, 42, GAME_WIDTH - 42);
    ft.y = clamp(y, 40, GAME_HEIGHT - 40);
    ft.vy = -44;
    ft.text = text;
    ft.color = color;
    ft.alpha = 1;
    ft.life = 0;
    ft.maxLife = maxLife;
    ft.scale = scale;
  });
}

function spawnGem(state, x, y, kind = 'score', value = 100, magnet = false, vx = 0, vy = -85) {
  state.gems.spawn((g) => {
    g.x = x;
    g.y = y;
    g.vx = vx;
    g.vy = vy;
    g.radius = kind === 'power' ? 8 : 6.5;
    g.kind = kind;
    g.value = value;
    g.magnet = magnet;
    g.age = 0;
  });
}

function magnetizeAllGems(state) {
  const { gems } = state;
  for (let i = 0; i < gems.count; i++) {
    gems.items[i].magnet = true;
  }
}

function convertBulletsToGems(state, centerX = state.player.x, centerY = state.player.y, maxRadius = Infinity) {
  const { enemyBullets } = state;
  const maxRSq = maxRadius === Infinity ? Infinity : maxRadius * maxRadius;
  let converted = 0;

  for (let i = enemyBullets.count - 1; i >= 0; i--) {
    const b = enemyBullets.items[i];
    if (maxRSq !== Infinity) {
      const dx = b.x - centerX;
      const dy = b.y - centerY;
      if (dx * dx + dy * dy > maxRSq) {
        continue;
      }
    }
    const bx = b.x;
    const by = b.y;
    const bColor = b.color;
    enemyBullets.removeAt(i);
    converted++;

    spawnGem(
      state,
      bx,
      by,
      'score',
      150,
      true,
      (nextRand(state) - 0.5) * 40,
      -55 - nextRand(state) * 45,
    );
    if (converted % 2 === 1) {
      spawnParticle(
        state,
        bx,
        by,
        (nextRand(state) - 0.5) * 90,
        (nextRand(state) - 0.5) * 90,
        3.2,
        bColor || '#8be9ff',
        0.32,
        'circle',
        0.9,
      );
    }
  }
  return converted;
}

function clearNearbyBullets(state, cx, cy, radius) {
  const { enemyBullets } = state;
  const rSq = radius * radius;
  for (let i = enemyBullets.count - 1; i >= 0; i--) {
    const b = enemyBullets.items[i];
    const dx = b.x - cx;
    const dy = b.y - cy;
    if (dx * dx + dy * dy <= rSq) {
      spawnParticle(state, b.x, b.y, dx * 1.4, dy * 1.4, 3, b.color, 0.28, 'spark', 0.9);
      enemyBullets.removeAt(i);
    }
  }
}

function setBanner(state, text, subtitle = '', maxDuration = 2.6) {
  state.banner.text = text || '';
  state.banner.subtitle = subtitle || '';
  state.banner.timer = 0;
  state.banner.maxDuration = maxDuration;
}

const PATTERN_INTERVALS = {
  aimed_single: 0.95,
  aimed_fan: 1.15,
  aimed_lance: 1.1,
  dual_spiral: 0.42,
  flower_ring: 1.15,
  alternating_ring: 0.95,
  sine_curtain: 0.55,
  star_burst: 1.35,
  midboss_tempest: 0.22,
};

function resolveIntervalSeconds(interval, fallback = 0.12) {
  if (!Number.isFinite(interval) || interval <= 0) {
    return fallback;
  }
  // Support either seconds (e.g. 0.08..0.9) or frame ticks at 60fps (e.g. 4..60)
  return interval >= 1 ? interval / 60 : interval;
}

export function createGameState(difficulty = DIFFICULTIES.NORMAL, highScore = 0) {
  const diff = normalizeDifficulty(difficulty);
  const diffCfg = getDifficultyConfig(diff);
  const safeHigh = Math.max(0, Math.floor(Number(highScore) || 0));

  return {
    status: GAME_STATES.PLAYING,
    difficulty: diff,
    time: 0,
    tick: 0,
    score: 0,
    highScore: safeHigh,
    graze: 0,
    combo: 0,
    maxCombo: 0,
    comboTimer: 0,
    power: 1.0,
    stageProgress: 0,
    waveIndex: 0,
    bossActive: false,
    activeBoss: null,
    player: {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 120,
      vx: 0,
      vy: 0,
      radius: PLAYER_HITBOX_RADIUS,
      grazeRadius: PLAYER_GRAZE_RADIUS,
      lives: diffCfg.lives ?? 3,
      bombs: diffCfg.bombs ?? 3,
      bombCharge: 0,
      invulnTimer: 1.2,
      fireCooldown: 0,
      slowMode: false,
      flashTimer: 0,
    },
    enemies: [],
    playerBullets: createPlayerBulletPool(),
    enemyBullets: createEnemyBulletPool(),
    gems: createGemPool(),
    particles: createParticlePool(),
    floatingTexts: createFloatingTextPool(),
    bombEffect: {
      active: false,
      timer: 0,
      maxDuration: BOMB_DURATION,
      x: 0,
      y: 0,
      radius: 0,
    },
    banner: {
      text: '',
      subtitle: '',
      timer: 0,
      maxDuration: 0,
    },
    screenShake: 0,
    _nextEnemyId: 1,
    _rngState: 0x13579bdf,
    _diffCfg: diffCfg,
  };
}

export function triggerBomb(state, onEvent) {
  if (!state || state.status !== GAME_STATES.PLAYING) {
    return false;
  }
  const { player, bombEffect } = state;
  if (player.bombs <= 0 || bombEffect.active) {
    return false;
  }

  player.bombs--;
  player.invulnTimer = Math.max(player.invulnTimer, 2.5);

  bombEffect.active = true;
  bombEffect.timer = 0;
  bombEffect.maxDuration = BOMB_DURATION;
  bombEffect.x = player.x;
  bombEffect.y = player.y;
  bombEffect.radius = 40;

  state.screenShake = Math.max(state.screenShake, 14);

  const converted = convertBulletsToGems(state, player.x, player.y, Infinity);
  magnetizeAllGems(state);

  // Shockwave burst particles
  spawnBurst(state, player.x, player.y, 28, '#7af0ff', 140, 420, 4.5, 0.65);
  spawnFloatingText(state, player.x, player.y - 36, 'NOVA BOMB!', '#7af0ff', 0.95, 1.15);

  // Deal direct AoE damage to enemies currently on field
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    const dmg = enemy.isBoss || enemy.isMidboss ? 65 : 130;
    damageEnemy(state, enemy, i, dmg, onEvent);
  }

  if (converted > 0) {
    state.score += converted * 25;
    state.highScore = Math.max(state.highScore, state.score);
  }

  onEvent?.('bomb', {
    x: player.x,
    y: player.y,
    bombsLeft: player.bombs,
    bulletsCleared: converted,
  });

  return true;
}

function firePlayerWeapon(state, onEvent) {
  const { player, playerBullets, power } = state;
  const spreadScale = player.slowMode ? 0.35 : 1.0;
  const px = player.x;
  const py = player.y - 12;

  const spawnShot = (ox, oy, vx, vy, damage, color, kind) => {
    playerBullets.spawn((b) => {
      b.x = px + ox;
      b.y = py + oy;
      b.prevX = b.x;
      b.prevY = b.y;
      b.vx = vx;
      b.vy = vy;
      b.radius = kind === 'main' ? 5.5 : 4.5;
      b.damage = damage;
      b.color = color;
      b.kind = kind;
      b.angle = Math.atan2(vy, vx);
      b.age = 0;
    });
  };

  if (power < 2.0) {
    spawnShot(-7, 0, 0, -960, 4.4, '#5ce1ff', 'main');
    spawnShot(7, 0, 0, -960, 4.4, '#5ce1ff', 'main');
  } else if (power < 3.0) {
    spawnShot(-7, 0, 0, -980, 4.2, '#5ce1ff', 'main');
    spawnShot(7, 0, 0, -980, 4.2, '#5ce1ff', 'main');
    spawnShot(-15, 6, -110 * spreadScale, -920, 3.1, '#a98bff', 'needle');
    spawnShot(15, 6, 110 * spreadScale, -920, 3.1, '#a98bff', 'needle');
  } else if (power < 4.0) {
    spawnShot(0, -4, 0, -1020, 4.5, '#8af3ff', 'main');
    spawnShot(-10, 2, -25 * spreadScale, -980, 3.8, '#5ce1ff', 'main');
    spawnShot(10, 2, 25 * spreadScale, -980, 3.8, '#5ce1ff', 'main');
    spawnShot(-18, 8, -165 * spreadScale, -900, 3.0, '#c299ff', 'needle');
    spawnShot(18, 8, 165 * spreadScale, -900, 3.0, '#c299ff', 'needle');
  } else {
    // Max Power (4.0)
    spawnShot(0, -5, 0, -1040, 4.8, '#8af3ff', 'main');
    spawnShot(-10, 1, -22 * spreadScale, -1000, 4.0, '#5ce1ff', 'main');
    spawnShot(10, 1, 22 * spreadScale, -1000, 4.0, '#5ce1ff', 'main');
    spawnShot(-18, 7, -145 * spreadScale, -930, 3.2, '#c299ff', 'needle');
    spawnShot(18, 7, 145 * spreadScale, -930, 3.2, '#c299ff', 'needle');
    spawnShot(-24, 12, -260 * spreadScale, -860, 2.7, '#ff77c8', 'homing');
    spawnShot(24, 12, 260 * spreadScale, -860, 2.7, '#ff77c8', 'homing');
  }

  onEvent?.('shoot', { x: px, y: py, power });
}

function createEnemyInstance(state, wave, enemyTypeKey, startX, startY, targetX, targetY, slotIndex, count) {
  const typeDef = ENEMY_TYPES?.[enemyTypeKey] || ENEMY_TYPES?.drone || {
    id: enemyTypeKey || 'drone',
    name: 'Drone',
    hp: 18,
    radius: 16,
    score: 300,
    dropGems: 4,
    color: '#ff4d8d',
    shape: 'drone',
    isBoss: false,
  };

  const diffCfg = state._diffCfg;
  const isFinalBoss = Boolean(!wave.isMidboss && (wave.type === 'boss' || typeDef.isBoss));
  const isMidboss = Boolean(wave.isMidboss || enemyTypeKey === 'midboss');

  const hpScale = isFinalBoss || isMidboss ? diffCfg.bossHpMult : 0.9 + 0.15 * diffCfg.densityMult;
  const maxHp = Math.max(1, Math.round((typeDef.hp || 20) * hpScale));

  let pattern = wave.pattern || 'aimed_fan';
  const defaultInterval = PATTERN_INTERVALS[pattern] ?? (isMidboss ? 0.22 : 0.85);
  let fireInterval = resolveIntervalSeconds(wave.interval, defaultInterval);
  let phaseName = '';
  let phaseSubtitle = '';

  if (isFinalBoss && Array.isArray(BOSS_PHASES) && BOSS_PHASES.length > 0) {
    const firstPhase = BOSS_PHASES[0];
    pattern = firstPhase.pattern || pattern;
    fireInterval = resolveIntervalSeconds(firstPhase.interval, 0.18);
    phaseName = firstPhase.name || '';
    phaseSubtitle = firstPhase.subtitle || '';
  }

  const enemy = {
    id: state._nextEnemyId++,
    type: typeDef.id || enemyTypeKey,
    name: typeDef.name || 'Enemy',
    x: startX,
    y: startY,
    vx: 0,
    vy: 0,
    startX,
    startY,
    targetX,
    targetY,
    slotIndex,
    count,
    formation: wave.formation || 'line',
    radius: typeDef.radius || 16,
    hp: maxHp,
    maxHp,
    score: typeDef.score || 300,
    dropGems: typeDef.dropGems || 4,
    color: typeDef.color || '#ff4d8d',
    shape: typeDef.shape || 'drone',
    isBoss: isFinalBoss,
    isMidboss,
    pattern,
    fireInterval,
    fireTimer: isFinalBoss || isMidboss ? 0.85 : 0.45 + slotIndex * 0.12,
    age: 0,
    tick: 0,
    phaseTick: 0,
    phaseIndex: 0,
    phaseName,
    phaseSubtitle,
    hitFlash: 0,
    angle: 0,
    stayDuration: isFinalBoss ? Infinity : isMidboss ? 13.5 : 10.5,
  };

  return enemy;
}

function spawnWave(state, wave, onEvent) {
  if (wave.type === 'warning') {
    setBanner(
      state,
      wave.title || 'WARNING // INCOMING THREAT',
      wave.subtitle || 'STELLAR ANOMALY DETECTED',
      2.6,
    );
    state.screenShake = Math.max(state.screenShake, 5);
    onEvent?.('bossWarning', { title: state.banner.text, subtitle: state.banner.subtitle });
    return;
  }

  if (wave.type === 'boss' || wave.isMidboss || wave.enemyType === 'midboss') {
    const enemyTypeKey = wave.enemyType || (wave.isMidboss ? 'midboss' : 'boss');
    const targetY = wave.y ?? 145;
    const boss = createEnemyInstance(
      state,
      wave,
      enemyTypeKey,
      GAME_WIDTH / 2,
      -64,
      GAME_WIDTH / 2,
      targetY,
      0,
      1,
    );
    state.enemies.push(boss);
    state.bossActive = true;
    state.activeBoss = boss;

    if (boss.isBoss && boss.phaseName) {
      setBanner(state, boss.phaseName, boss.phaseSubtitle, 2.8);
    } else if (wave.title) {
      setBanner(state, wave.title, wave.subtitle || '', 2.4);
    }
    return;
  }

  // Standard wave formations
  const count = Math.max(1, wave.count || 1);
  const formation = wave.formation || 'line';
  const baseY = clamp(wave.y ?? 145, 70, 320);
  const spacing = wave.spacing ?? 58;
  const enemyTypeKey = wave.enemyType || 'drone';
  const mid = (count - 1) / 2;

  for (let i = 0; i < count; i++) {
    let startX = GAME_WIDTH / 2;
    let startY = -36 - i * 18;
    let targetX = GAME_WIDTH / 2;
    let targetY = baseY;

    if (formation === 'line') {
      targetX = clamp(GAME_WIDTH / 2 + (i - mid) * spacing, 36, GAME_WIDTH - 36);
      startX = targetX;
      startY = -34 - Math.abs(i - mid) * 16;
    } else if (formation === 'vee') {
      targetX = clamp(GAME_WIDTH / 2 + (i - mid) * spacing, 36, GAME_WIDTH - 36);
      targetY = clamp(baseY + 26 - Math.abs(i - mid) * 26, 70, 340);
      startX = targetX;
      startY = -34 - Math.abs(i - mid) * 22;
    } else if (formation === 'flank') {
      const isLeft = i % 2 === 0;
      const rank = Math.floor(i / 2);
      targetX = isLeft
        ? clamp(54 + rank * 38, 36, GAME_WIDTH / 2 - 28)
        : clamp(GAME_WIDTH - 54 - rank * 38, GAME_WIDTH / 2 + 28, GAME_WIDTH - 36);
      targetY = clamp(baseY + rank * 34, 70, 340);
      startX = isLeft ? -28 : GAME_WIDTH + 28;
      startY = targetY - 70;
    } else if (formation === 'sweep') {
      const fromLeft = i % 2 === 0;
      startX = fromLeft ? -30 - Math.floor(i / 2) * 32 : GAME_WIDTH + 30 + Math.floor(i / 2) * 32;
      startY = clamp(baseY + (i % 3) * 28, 70, 280);
      targetX = fromLeft ? GAME_WIDTH - 64 : 64;
      targetY = clamp(startY + 45, 80, 320);
    } else if (formation === 'center') {
      targetX = clamp(GAME_WIDTH / 2 + (i - mid) * Math.min(spacing, 48), 44, GAME_WIDTH - 44);
      targetY = baseY + (i % 2) * 22;
      startX = targetX;
      startY = -44 - i * 18;
    } else {
      targetX = clamp(GAME_WIDTH / 2 + (i - mid) * spacing, 36, GAME_WIDTH - 36);
      startX = targetX;
    }

    const enemy = createEnemyInstance(state, wave, enemyTypeKey, startX, startY, targetX, targetY, i, count);
    state.enemies.push(enemy);
  }
}

function advanceBossPhaseIfNeeded(state, boss, onEvent) {
  if (!boss.isBoss || !Array.isArray(BOSS_PHASES) || BOSS_PHASES.length === 0) {
    return;
  }
  const hpRatio = Math.max(0, boss.hp / Math.max(1, boss.maxHp));
  let targetPhaseIdx = boss.phaseIndex;

  for (let p = BOSS_PHASES.length - 1; p >= 0; p--) {
    const phase = BOSS_PHASES[p];
    if (hpRatio <= phase.hpRatioMax && (hpRatio > phase.hpRatioMin || p === BOSS_PHASES.length - 1)) {
      targetPhaseIdx = p;
      break;
    }
  }

  if (targetPhaseIdx > boss.phaseIndex) {
    boss.phaseIndex = targetPhaseIdx;
    const phase = BOSS_PHASES[targetPhaseIdx];
    boss.pattern = phase.pattern || boss.pattern;
    boss.fireInterval = resolveIntervalSeconds(phase.interval, 0.14);
    boss.phaseTick = 0;
    boss.fireTimer = 0.35;
    boss.phaseName = phase.name || '';
    boss.phaseSubtitle = phase.subtitle || '';

    const cleared = convertBulletsToGems(state, boss.x, boss.y, Infinity);
    magnetizeAllGems(state);

    const bonus = 4000 + targetPhaseIdx * 2000 + cleared * 20;
    state.score += bonus;
    state.highScore = Math.max(state.highScore, state.score);
    state.screenShake = Math.max(state.screenShake, 10);

    setBanner(state, boss.phaseName, boss.phaseSubtitle, 2.7);
    spawnBurst(state, boss.x, boss.y, 26, '#ffd166', 110, 340, 4, 0.55);
    spawnFloatingText(state, boss.x, boss.y - 34, 'SPELL BREAK!', '#ffd166', 1.1, 1.15);

    onEvent?.('spellBreak', {
      phaseIndex: targetPhaseIdx,
      phaseName: boss.phaseName,
      bonus,
      bulletsCleared: cleared,
    });
  }
}

function killEnemy(state, enemy, index, onEvent) {
  state.enemies.splice(index, 1);

  const comboBonus = 1 + Math.min(2.0, state.combo * 0.02);
  const pts = Math.round((enemy.score || 300) * comboBonus);
  state.score += pts;
  state.highScore = Math.max(state.highScore, state.score);

  state.combo++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.comboTimer = COMBO_TIMEOUT;

  const dropCount = Math.max(1, enemy.dropGems || 4);
  const magnetOnKill = Boolean(enemy.isBoss || enemy.isMidboss || state.player.y <= POC_LINE_Y);

  for (let d = 0; d < dropCount; d++) {
    const isPower = d % 4 === 0 && state.power < 4.0;
    const angle = nextRand(state) * Math.PI * 2;
    const speed = 25 + nextRand(state) * 75;
    spawnGem(
      state,
      enemy.x + (nextRand(state) - 0.5) * 20,
      enemy.y + (nextRand(state) - 0.5) * 20,
      isPower ? 'power' : 'score',
      isPower ? 150 : 120,
      magnetOnKill,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed - 65,
    );
  }

  spawnBurst(
    state,
    enemy.x,
    enemy.y,
    enemy.isBoss ? 44 : enemy.isMidboss ? 28 : 14,
    enemy.color || '#ff5e99',
    80,
    enemy.isBoss ? 420 : 250,
    enemy.isBoss ? 4.5 : 3.2,
    enemy.isBoss ? 0.85 : 0.45,
  );

  onEvent?.('enemyKill', {
    id: enemy.id,
    type: enemy.type,
    x: enemy.x,
    y: enemy.y,
    score: pts,
    isBoss: enemy.isBoss,
    isMidboss: enemy.isMidboss,
  });

  if (enemy.isMidboss) {
    convertBulletsToGems(state, enemy.x, enemy.y, Infinity);
    magnetizeAllGems(state);
    if (state.activeBoss === enemy) {
      state.activeBoss = null;
      state.bossActive = false;
    }
    state.screenShake = Math.max(state.screenShake, 10);
    spawnFloatingText(state, enemy.x, enemy.y - 26, 'MIDBOSS CLEAR!', '#7af0ff', 1.1, 1.15);
    onEvent?.('spellBreak', {
      phaseIndex: -1,
      phaseName: 'MIDBOSS CLEAR',
      bonus: pts,
      bulletsCleared: 0,
    });
  } else if (enemy.isBoss) {
    const cleared = convertBulletsToGems(state, enemy.x, enemy.y, Infinity);
    magnetizeAllGems(state);
    state.activeBoss = null;
    state.bossActive = false;
    state.stageProgress = 1;
    state.screenShake = Math.max(state.screenShake, 16);
    state.score += 15000 + cleared * 30;
    state.highScore = Math.max(state.highScore, state.score);
    spawnFloatingText(state, GAME_WIDTH / 2, enemy.y, 'STAGE CLEAR!', '#ffe066', 1.5, 1.25);

    onEvent?.('spellBreak', {
      phaseIndex: BOSS_PHASES.length,
      phaseName: 'FINAL CLEAR',
      bonus: 15000,
      bulletsCleared: cleared,
    });
    state.status = GAME_STATES.VICTORY;
    onEvent?.('victory', {
      score: state.score,
      highScore: state.highScore,
      graze: state.graze,
      maxCombo: state.maxCombo,
      difficulty: state.difficulty,
    });
  }
}

function damageEnemy(state, enemy, index, dmg, onEvent) {
  if (!enemy || enemy.hp <= 0) {
    return false;
  }
  enemy.hp -= dmg;
  enemy.hitFlash = 0.08;

  if (enemy.hp <= 0) {
    killEnemy(state, enemy, index, onEvent);
    return true;
  }

  advanceBossPhaseIfNeeded(state, enemy, onEvent);
  onEvent?.('enemyHit', { id: enemy.id, hp: enemy.hp, maxHp: enemy.maxHp });
  return false;
}

function handlePlayerHit(state, onEvent) {
  const { player } = state;
  if (player.invulnTimer > 0 || state.status !== GAME_STATES.PLAYING) {
    return;
  }

  player.lives--;
  player.invulnTimer = 2.6;
  player.flashTimer = 0.35;
  state.combo = 0;
  state.comboTimer = 0;
  state.screenShake = Math.max(state.screenShake, 14);

  // Drop a few power gems that can be recovered if player survives
  if (player.lives > 0) {
    state.power = Math.max(1.0, +(state.power - 0.4).toFixed(2));
    for (let i = 0; i < 3; i++) {
      spawnGem(
        state,
        player.x + (i - 1) * 18,
        player.y - 22,
        'power',
        100,
        false,
        (i - 1) * 48,
        -165,
      );
    }
  }

  clearNearbyBullets(state, player.x, player.y, 210);
  spawnBurst(state, player.x, player.y, 26, '#ff5277', 90, 320, 4, 0.55);
  spawnFloatingText(state, player.x, player.y - 28, 'SHIELD HIT!', '#ff5e7e', 0.9, 1.05);

  onEvent?.('playerHit', {
    x: player.x,
    y: player.y,
    livesLeft: Math.max(0, player.lives),
  });

  if (player.lives <= 0) {
    player.lives = 0;
    state.status = GAME_STATES.GAMEOVER;
    state.highScore = Math.max(state.highScore, state.score);
    onEvent?.('gameover', {
      score: state.score,
      highScore: state.highScore,
      graze: state.graze,
      maxCombo: state.maxCombo,
      difficulty: state.difficulty,
    });
  }
}

export function stepGame(state, input = {}, rawDt = 1 / 60, onEvent) {
  if (!state) {
    return state;
  }

  const dt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(rawDt, MAX_DT) : 0;
  if (dt === 0 || state.status !== GAME_STATES.PLAYING) {
    return state;
  }

  state.tick++;
  state.time += dt;

  // Decay transient UI/camera timers
  if (state.screenShake > 0) {
    state.screenShake = Math.max(0, state.screenShake - dt * 36);
  }
  if (state.banner.maxDuration > 0 && state.banner.text) {
    state.banner.timer += dt;
    if (state.banner.timer >= state.banner.maxDuration) {
      state.banner.text = '';
      state.banner.subtitle = '';
      state.banner.timer = 0;
      state.banner.maxDuration = 0;
    }
  }
  if (state.combo > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.combo = 0;
      state.comboTimer = 0;
    }
  }

  // 1. Update player movement & timers
  const { player } = state;
  const prevPx = player.x;
  const prevPy = player.y;

  if (player.invulnTimer > 0) {
    player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  }
  if (player.flashTimer > 0) {
    player.flashTimer = Math.max(0, player.flashTimer - dt);
  }

  player.slowMode = Boolean(input?.slowMode);
  const moveSpeed = player.slowMode ? PLAYER_FOCUS_SPEED : PLAYER_SPEED;
  const moveX = Number.isFinite(input?.moveX) ? clamp(input.moveX, -1, 1) : 0;
  const moveY = Number.isFinite(input?.moveY) ? clamp(input.moveY, -1, 1) : 0;
  const rawDx = Number.isFinite(input?.dx) ? clamp(input.dx, -90, 90) : 0;
  const rawDy = Number.isFinite(input?.dy) ? clamp(input.dy, -90, 90) : 0;

  const stepDx = rawDx + moveX * moveSpeed * dt;
  const stepDy = rawDy + moveY * moveSpeed * dt;

  player.x = clamp(player.x + stepDx, PLAYER_BOUND_X, GAME_WIDTH - PLAYER_BOUND_X);
  player.y = clamp(player.y + stepDy, PLAYER_BOUND_Y, GAME_HEIGHT - PLAYER_BOUND_Y);
  player.vx = (player.x - prevPx) / dt;
  player.vy = (player.y - prevPy) / dt;

  // Trigger bomb if requested in frame input
  if (input?.triggerBomb) {
    triggerBomb(state, onEvent);
  }

  // Player auto-fire
  player.fireCooldown -= dt;
  if (input?.firing !== false && player.fireCooldown <= 0) {
    player.fireCooldown = PLAYER_FIRE_INTERVAL;
    firePlayerWeapon(state, onEvent);
  }

  // 2. Update active bomb effect
  if (state.bombEffect.active) {
    const be = state.bombEffect;
    be.timer += dt;
    const progress = clamp(be.timer / Math.max(0.01, be.maxDuration), 0, 1);
    be.radius = 40 + progress * 920;

    // Continuously cancel newly spawned enemy bullets inside bomb wave
    convertBulletsToGems(state, be.x, be.y, be.radius);
    magnetizeAllGems(state);

    // Continuous AoE chip damage during bomb wave
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const enemy = state.enemies[i];
      const dmg = (enemy.isBoss || enemy.isMidboss ? 28 : 65) * dt;
      damageEnemy(state, enemy, i, dmg, onEvent);
    }

    if (be.timer >= be.maxDuration || state.status !== GAME_STATES.PLAYING) {
      be.active = false;
      be.timer = 0;
      be.radius = 0;
    }
  }

  // 3. Advance stage waves
  if (Array.isArray(STAGE_WAVES) && STAGE_WAVES.length > 0) {
    while (state.waveIndex < STAGE_WAVES.length) {
      const wave = STAGE_WAVES[state.waveIndex];
      if (state.time < wave.time) {
        break;
      }
      state.waveIndex++;
      spawnWave(state, wave, onEvent);
    }

    if (!state.activeBoss?.isBoss && state.status === GAME_STATES.PLAYING) {
      const lastTime = STAGE_WAVES[STAGE_WAVES.length - 1].time || 75;
      state.stageProgress = clamp((state.time / Math.max(1, lastTime)) * 0.95, 0, 0.95);
    }
  }

  // 4. Update player bullets & swept collision against enemies
  const { playerBullets, enemies } = state;
  for (let i = playerBullets.count - 1; i >= 0; i--) {
    const pb = playerBullets.items[i];
    pb.prevX = pb.x;
    pb.prevY = pb.y;
    pb.age += dt;

    // Gentle homing assist for outer side-bolts at high power
    if (pb.kind === 'homing' && enemies.length > 0) {
      let nearest = null;
      let bestDistSq = 260 * 260;
      for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
        const e = enemies[eIdx];
        const dx = e.x - pb.x;
        const dy = e.y - pb.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          nearest = e;
        }
      }
      if (nearest) {
        const desired = Math.atan2(nearest.y - pb.y, nearest.x - pb.x);
        const speed = Math.hypot(pb.vx, pb.vy);
        let diff = desired - Math.atan2(pb.vy, pb.vx);
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const nextAngle = Math.atan2(pb.vy, pb.vx) + clamp(diff, -3.2 * dt, 3.2 * dt);
        pb.vx = Math.cos(nextAngle) * speed;
        pb.vy = Math.sin(nextAngle) * speed;
      }
    }

    pb.x += pb.vx * dt;
    pb.y += pb.vy * dt;
    pb.angle = Math.atan2(pb.vy, pb.vx);

    if (pb.y < -30 || pb.y > GAME_HEIGHT + 30 || pb.x < -30 || pb.x > GAME_WIDTH + 30) {
      playerBullets.removeAt(i);
      continue;
    }

    let hitEnemy = false;
    for (let eIdx = enemies.length - 1; eIdx >= 0; eIdx--) {
      const enemy = enemies[eIdx];
      const hitR = enemy.radius + pb.radius;
      const dSq = distSqOriginToSegment(
        pb.prevX - enemy.x,
        pb.prevY - enemy.y,
        pb.x - enemy.x,
        pb.y - enemy.y,
      );
      if (dSq <= hitR * hitR) {
        hitEnemy = true;
        spawnParticle(state, pb.x, pb.y, (nextRand(state) - 0.5) * 90, 60 + nextRand(state) * 60, 2.5, pb.color, 0.16, 'spark', 0.9);
        damageEnemy(state, enemy, eIdx, pb.damage, onEvent);
        break;
      }
    }

    if (hitEnemy) {
      playerBullets.removeAt(i);
    }
  }

  if (state.status !== GAME_STATES.PLAYING) {
    return state;
  }

  // 5. Update enemies & emit bullet patterns
  const diffCfg = state._diffCfg;
  const spawnEnemyBullet = (spec) => {
    if (!spec) return;
    state.enemyBullets.spawn((b) => {
      const bx = Number.isFinite(spec.x) ? spec.x : GAME_WIDTH / 2;
      const by = Number.isFinite(spec.y) ? spec.y : 0;
      const bvx = Number.isFinite(spec.vx) ? spec.vx : 0;
      const bvy = Number.isFinite(spec.vy) ? spec.vy : 140;
      b.x = bx;
      b.y = by;
      b.prevX = bx;
      b.prevY = by;
      b.vx = bvx;
      b.vy = bvy;
      b.ax = Number.isFinite(spec.ax) ? spec.ax : 0;
      b.ay = Number.isFinite(spec.ay) ? spec.ay : 0;
      b.radius = Number.isFinite(spec.radius) && spec.radius > 0 ? spec.radius : 5;
      b.color = spec.color || '#ff3b7f';
      b.shape = spec.shape || 'orb';
      b.spin = Number.isFinite(spec.spin) ? spec.spin : 0;
      b.turnRate = Number.isFinite(spec.turnRate) ? spec.turnRate : 0;
      b.maxSpeed = Number.isFinite(spec.maxSpeed) && spec.maxSpeed > 0 ? spec.maxSpeed : 600;
      b.minSpeed = Number.isFinite(spec.minSpeed) && spec.minSpeed >= 0 ? spec.minSpeed : 0;
      b.angle = Math.atan2(bvy, bvx);
      b.age = 0;
      b.grazed = false;
    });
  };

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.age += dt;
    enemy.tick++;
    if (enemy.hitFlash > 0) {
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    }
    enemy.angle += dt * (enemy.isBoss ? 0.9 : 2.1);

    const prevEx = enemy.x;
    const prevEy = enemy.y;

    // Movement behaviors
    if (enemy.isBoss || enemy.isMidboss) {
      const swayAmp = enemy.isBoss ? 92 : 68;
      const desiredX = GAME_WIDTH / 2 + Math.sin(enemy.age * 0.72) * swayAmp;
      const desiredY = enemy.targetY + Math.sin(enemy.age * 1.44) * 14;
      const lerp = 1 - Math.exp(-3.5 * dt);
      enemy.x += (desiredX - enemy.x) * lerp;
      enemy.y += (desiredY - enemy.y) * lerp;

      if (enemy.isMidboss && enemy.age > enemy.stayDuration) {
        enemy.y -= 170 * dt;
        if (enemy.y < -80) {
          if (state.activeBoss === enemy) {
            state.activeBoss = null;
            state.bossActive = false;
          }
          enemies.splice(i, 1);
          continue;
        }
      }
    } else if (enemy.formation === 'sweep') {
      const dir = enemy.targetX >= enemy.startX ? 1 : -1;
      enemy.x += dir * 135 * dt;
      enemy.y += Math.sin(enemy.age * 3.2) * 42 * dt + 14 * dt;
      if ((dir > 0 && enemy.x > GAME_WIDTH + 60) || (dir < 0 && enemy.x < -60)) {
        enemies.splice(i, 1);
        continue;
      }
    } else if (enemy.age < enemy.stayDuration) {
      const sway = Math.sin(enemy.age * 1.8 + enemy.slotIndex * 0.7) * 14;
      const lerp = 1 - Math.exp(-4.0 * dt);
      enemy.x += (enemy.targetX + sway - enemy.x) * lerp;
      enemy.y += (enemy.targetY - enemy.y) * lerp;
    } else {
      enemy.y += 155 * dt;
      if (enemy.y > GAME_HEIGHT + 70) {
        enemies.splice(i, 1);
        continue;
      }
    }

    enemy.vx = (enemy.x - prevEx) / dt;
    enemy.vy = (enemy.y - prevEy) / dt;

    // Fire pattern once on screen
    if (enemy.y > 16 && enemy.y < GAME_HEIGHT - 120) {
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0) {
        enemy.fireTimer += enemy.fireInterval;
        if (enemy.fireTimer < 0) enemy.fireTimer = enemy.fireInterval;
        enemy.phaseTick++;

        if (typeof emitPattern === 'function') {
          emitPattern(enemy.pattern, {
            x: enemy.x,
            y: enemy.y,
            targetX: player.x,
            targetY: player.y,
            tick: enemy.tick,
            age: enemy.age,
            phaseTick: enemy.phaseTick,
            speedMult: diffCfg.bulletSpeedMult,
            densityMult: diffCfg.densityMult,
            spawnBullet: spawnEnemyBullet,
          });
        }
      }
    }

    // Body collision vs player
    if (player.invulnTimer <= 0) {
      const bodyR = player.radius + enemy.radius * 0.65;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      if (dx * dx + dy * dy <= bodyR * bodyR) {
        handlePlayerHit(state, onEvent);
      }
    }
  }

  if (state.status !== GAME_STATES.PLAYING) {
    return state;
  }

  // 6. Update enemy bullets + swept hitbox/graze collision
  const { enemyBullets } = state;
  for (let i = enemyBullets.count - 1; i >= 0; i--) {
    const b = enemyBullets.items[i];
    b.prevX = b.x;
    b.prevY = b.y;
    b.age += dt;

    if (b.turnRate !== 0) {
      const c = Math.cos(b.turnRate * dt);
      const s = Math.sin(b.turnRate * dt);
      const nvx = b.vx * c - b.vy * s;
      const nvy = b.vx * s + b.vy * c;
      b.vx = nvx;
      b.vy = nvy;
    }

    b.vx += b.ax * dt;
    b.vy += b.ay * dt;

    if (b.ax !== 0 || b.ay !== 0 || b.minSpeed > 0 || b.maxSpeed < 1e6) {
      const spd = Math.hypot(b.vx, b.vy);
      if (spd > 1e-6) {
        if (spd > b.maxSpeed) {
          const k = b.maxSpeed / spd;
          b.vx *= k;
          b.vy *= k;
        } else if (b.minSpeed > 0 && spd < b.minSpeed) {
          const k = b.minSpeed / spd;
          b.vx *= k;
          b.vy *= k;
        }
      }
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.spin !== 0) {
      b.angle += b.spin * dt;
    } else if (b.vx !== 0 || b.vy !== 0) {
      b.angle = Math.atan2(b.vy, b.vx);
    }

    if (
      b.x < -48 ||
      b.x > GAME_WIDTH + 48 ||
      b.y < -64 ||
      b.y > GAME_HEIGHT + 48 ||
      !Number.isFinite(b.x) ||
      !Number.isFinite(b.y)
    ) {
      enemyBullets.removeAt(i);
      continue;
    }

    // Swept relative segment check (exact continuous collision)
    const r0x = b.prevX - prevPx;
    const r0y = b.prevY - prevPy;
    const r1x = b.x - player.x;
    const r1y = b.y - player.y;
    const distSq = distSqOriginToSegment(r0x, r0y, r1x, r1y);

    const hitR = player.radius + b.radius;
    if (player.invulnTimer <= 0 && distSq <= hitR * hitR) {
      enemyBullets.removeAt(i);
      handlePlayerHit(state, onEvent);
      if (state.status !== GAME_STATES.PLAYING) {
        return state;
      }
      continue;
    }

    // Graze check
    const grazeR = player.grazeRadius + b.radius;
    if (!b.grazed && distSq <= grazeR * grazeR) {
      b.grazed = true;
      state.graze++;
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.comboTimer = COMBO_TIMEOUT;

      const grazePts = 50 + Math.min(250, state.combo * 5);
      state.score += grazePts;
      state.highScore = Math.max(state.highScore, state.score);

      player.bombCharge += 4;
      if (player.bombCharge >= BOMB_CHARGE_MAX) {
        player.bombCharge -= BOMB_CHARGE_MAX;
        if (player.bombs < MAX_BOMBS) {
          player.bombs++;
          spawnFloatingText(state, player.x, player.y - 32, '+1 BOMB!', '#7af0ff', 1.0, 1.1);
          onEvent?.('powerUp', { kind: 'bomb', bombs: player.bombs });
        } else {
          state.score += 2500;
          state.highScore = Math.max(state.highScore, state.score);
          spawnFloatingText(state, player.x, player.y - 32, 'MAX BOMB +2500', '#ffe066', 0.9, 1.0);
        }
      }

      // Graze sparks
      for (let s = 0; s < 2; s++) {
        spawnParticle(
          state,
          (player.x + b.x) * 0.5,
          (player.y + b.y) * 0.5,
          (nextRand(state) - 0.5) * 180,
          (nextRand(state) - 0.5) * 180,
          2.6,
          '#9df7ff',
          0.24,
          'spark',
          0.9,
        );
      }

      onEvent?.('graze', {
        x: b.x,
        y: b.y,
        graze: state.graze,
        bombCharge: player.bombCharge,
      });
    }
  }

  // 7. Update gems & POC auto-collection
  const { gems } = state;
  const pocActive = player.y <= POC_LINE_Y;
  const proxMagnetR = player.slowMode ? 120 : 88;
  const proxMagnetRSq = proxMagnetR * proxMagnetR;
  const collectR = player.grazeRadius + 10;
  const collectRSq = collectR * collectR;

  for (let i = gems.count - 1; i >= 0; i--) {
    const g = gems.items[i];
    g.age += dt;

    const dx = player.x - g.x;
    const dy = player.y - g.y;
    const dSq = dx * dx + dy * dy;

    if (pocActive || dSq <= proxMagnetRSq) {
      g.magnet = true;
    }

    if (g.magnet) {
      const dist = Math.sqrt(dSq);
      if (dist > 1e-4) {
        const magnetSpeed = 690;
        g.vx = (dx / dist) * magnetSpeed;
        g.vy = (dy / dist) * magnetSpeed;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    } else {
      g.vx *= Math.pow(0.25, dt);
      g.vy = Math.min(210, g.vy + 250 * dt);
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }

    const ndx = player.x - g.x;
    const ndy = player.y - g.y;
    if (ndx * ndx + ndy * ndy <= collectRSq) {
      if (g.kind === 'power') {
        const prevTier = Math.floor(state.power);
        state.power = Math.min(4.0, +(state.power + 0.05).toFixed(4));
        const newTier = Math.floor(state.power);
        const pts = 180 + Math.min(300, state.combo * 4);
        state.score += pts;
        if (newTier > prevTier) {
          spawnFloatingText(state, player.x, player.y - 34, 'POWER UP!', '#ff9ff3', 1.0, 1.15);
          onEvent?.('powerUp', { kind: 'power', power: state.power });
        }
      } else {
        const heightMult = 1 + clamp((GAME_HEIGHT - player.y) / GAME_HEIGHT, 0, 1) * 0.6;
        const comboMult = 1 + Math.min(2.0, state.combo * 0.02);
        const pts = Math.round((g.value || 100) * heightMult * comboMult);
        state.score += pts;
      }
      state.highScore = Math.max(state.highScore, state.score);
      onEvent?.('gem', { kind: g.kind, score: state.score, power: state.power });
      gems.removeAt(i);
      continue;
    }

    if (g.y > GAME_HEIGHT + 40 || g.x < -60 || g.x > GAME_WIDTH + 60) {
      gems.removeAt(i);
    }
  }

  // 8. Update particles
  const { particles } = state;
  for (let i = particles.count - 1; i >= 0; i--) {
    const p = particles.items[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      particles.removeAt(i);
      continue;
    }
    const dragFactor = Math.pow(p.drag || 0.92, dt * 60);
    p.vx *= dragFactor;
    p.vy *= dragFactor;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.alpha = clamp(1 - p.life / p.maxLife, 0, 1);
  }

  // 9. Update floating texts
  const { floatingTexts } = state;
  for (let i = floatingTexts.count - 1; i >= 0; i--) {
    const ft = floatingTexts.items[i];
    ft.life += dt;
    if (ft.life >= ft.maxLife) {
      floatingTexts.removeAt(i);
      continue;
    }
    ft.y += ft.vy * dt;
    ft.alpha = clamp(1 - ft.life / ft.maxLife, 0, 1);
  }

  return state;
}
