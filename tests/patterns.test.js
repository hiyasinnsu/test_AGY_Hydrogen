import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DIFFICULTY_CONFIG,
  ENEMY_TYPES,
  BOSS_PHASES,
  STAGE_WAVES,
  PATTERN_NAMES,
  emitPattern,
} from '../src/patterns.js';

const VALID_SHAPES = new Set(['orb', 'rice', 'needle', 'ring', 'star']);
const VALID_FORMATIONS = new Set(['line', 'vee', 'flank', 'sweep', 'center']);

function assertFiniteNumber(value, label) {
  assert.equal(typeof value, 'number', `${label} must be a number`);
  assert.ok(Number.isFinite(value), `${label} must be finite, got ${value}`);
}

describe('DIFFICULTY_CONFIG', () => {
  it('defines EASY, NORMAL, and LUNATIC with valid monotonic scaling', () => {
    for (const key of ['EASY', 'NORMAL', 'LUNATIC']) {
      const cfg = DIFFICULTY_CONFIG[key];
      assert.ok(cfg, `Missing difficulty ${key}`);
      assert.equal(cfg.label, key);
      assertFiniteNumber(cfg.bulletSpeedMult, `${key}.bulletSpeedMult`);
      assertFiniteNumber(cfg.densityMult, `${key}.densityMult`);
      assertFiniteNumber(cfg.bossHpMult, `${key}.bossHpMult`);
      assert.ok(cfg.bulletSpeedMult > 0);
      assert.ok(cfg.densityMult > 0);
      assert.ok(cfg.bossHpMult > 0);
      assert.ok(Number.isInteger(cfg.lives) && cfg.lives > 0);
      assert.ok(Number.isInteger(cfg.bombs) && cfg.bombs >= 0);
    }

    assert.ok(DIFFICULTY_CONFIG.EASY.bulletSpeedMult < DIFFICULTY_CONFIG.NORMAL.bulletSpeedMult);
    assert.ok(DIFFICULTY_CONFIG.NORMAL.bulletSpeedMult < DIFFICULTY_CONFIG.LUNATIC.bulletSpeedMult);
    assert.ok(DIFFICULTY_CONFIG.EASY.densityMult < DIFFICULTY_CONFIG.NORMAL.densityMult);
    assert.ok(DIFFICULTY_CONFIG.NORMAL.densityMult < DIFFICULTY_CONFIG.LUNATIC.densityMult);
    assert.ok(DIFFICULTY_CONFIG.EASY.bossHpMult < DIFFICULTY_CONFIG.NORMAL.bossHpMult);
    assert.ok(DIFFICULTY_CONFIG.NORMAL.bossHpMult < DIFFICULTY_CONFIG.LUNATIC.bossHpMult);
  });
});

describe('ENEMY_TYPES', () => {
  it('defines all expected enemy archetypes with valid stats', () => {
    const requiredKeys = ['drone', 'spinner', 'cruiser', 'prism', 'midboss', 'boss'];
    for (const key of requiredKeys) {
      const def = ENEMY_TYPES[key];
      assert.ok(def, `Missing enemy type ${key}`);
      assert.equal(def.id, key);
      assert.equal(typeof def.name, 'string');
      assert.ok(def.name.length > 0);
      assertFiniteNumber(def.hp, `${key}.hp`);
      assertFiniteNumber(def.radius, `${key}.radius`);
      assertFiniteNumber(def.score, `${key}.score`);
      assertFiniteNumber(def.dropGems, `${key}.dropGems`);
      assert.ok(def.hp > 0);
      assert.ok(def.radius > 0);
      assert.ok(def.score > 0);
      assert.ok(def.dropGems > 0);
      assert.equal(typeof def.color, 'string');
      assert.match(def.color, /^#[0-9a-fA-F]{6}$/);
      assert.equal(typeof def.shape, 'string');
      assert.ok(def.shape.length > 0);
      assert.equal(typeof def.isBoss, 'boolean');
    }

    assert.equal(ENEMY_TYPES.midboss.isBoss, true);
    assert.equal(ENEMY_TYPES.boss.isBoss, true);
    assert.equal(ENEMY_TYPES.drone.isBoss, false);
  });
});

describe('BOSS_PHASES', () => {
  it('covers contiguous HP ratios from 1.0 down to 0.0 with valid patterns', () => {
    assert.ok(Array.isArray(BOSS_PHASES) && BOSS_PHASES.length === 3);
    assert.equal(BOSS_PHASES[0].hpRatioMax, 1.0);
    assert.equal(BOSS_PHASES[BOSS_PHASES.length - 1].hpRatioMin, 0.0);

    for (let i = 0; i < BOSS_PHASES.length; i++) {
      const phase = BOSS_PHASES[i];
      assert.equal(phase.index, i);
      assert.equal(typeof phase.name, 'string');
      assert.ok(phase.name.length > 0);
      assert.equal(typeof phase.subtitle, 'string');
      assert.ok(phase.subtitle.length > 0);
      assertFiniteNumber(phase.hpRatioMin, `phase[${i}].hpRatioMin`);
      assertFiniteNumber(phase.hpRatioMax, `phase[${i}].hpRatioMax`);
      assert.ok(phase.hpRatioMin < phase.hpRatioMax);
      assert.ok(PATTERN_NAMES.includes(phase.pattern), `Unknown boss pattern: ${phase.pattern}`);
      assertFiniteNumber(phase.interval, `phase[${i}].interval`);
      assert.ok(phase.interval > 0);

      if (i > 0) {
        assert.equal(phase.hpRatioMax, BOSS_PHASES[i - 1].hpRatioMin);
      }
    }
  });
});

describe('STAGE_WAVES', () => {
  it('is ordered ascending in time and references valid enemies, formations, and patterns', () => {
    assert.ok(Array.isArray(STAGE_WAVES) && STAGE_WAVES.length >= 10);

    let prevTime = 0;
    let hasMidbossWarning = false;
    let hasMidbossWave = false;
    let hasFinalBossWarning = false;
    let hasFinalBoss = false;

    for (let i = 0; i < STAGE_WAVES.length; i++) {
      const wave = STAGE_WAVES[i];
      assertFiniteNumber(wave.time, `wave[${i}].time`);
      assert.ok(wave.time > prevTime, `wave[${i}] time ${wave.time} must be > ${prevTime}`);
      prevTime = wave.time;

      assert.ok(['wave', 'warning', 'boss'].includes(wave.type), `Invalid wave type ${wave.type}`);
      assert.ok(ENEMY_TYPES[wave.enemyType], `Unknown enemyType ${wave.enemyType}`);
      assert.ok(VALID_FORMATIONS.has(wave.formation), `Invalid formation ${wave.formation}`);
      assertFiniteNumber(wave.y, `wave[${i}].y`);
      assertFiniteNumber(wave.spacing, `wave[${i}].spacing`);

      if (wave.type === 'warning') {
        assert.equal(typeof wave.title, 'string');
        assert.ok(wave.title.length > 0);
        if (wave.isMidboss) hasMidbossWarning = true;
        if (wave.enemyType === 'boss') hasFinalBossWarning = true;
      } else {
        assert.ok(Number.isInteger(wave.count) && wave.count >= 1);
        assert.ok(PATTERN_NAMES.includes(wave.pattern), `Unknown wave pattern: ${wave.pattern}`);
        if (wave.isMidboss) hasMidbossWave = true;
        if (wave.type === 'boss') hasFinalBoss = true;
      }
    }

    assert.ok(hasMidbossWarning, 'STAGE_WAVES should include midboss warning');
    assert.ok(hasMidbossWave, 'STAGE_WAVES should include midboss spawn');
    assert.ok(hasFinalBossWarning, 'STAGE_WAVES should include final boss warning');
    assert.ok(hasFinalBoss, 'STAGE_WAVES should include final boss spawn');
  });
});

describe('emitPattern', () => {
  it('emits finite, valid bullets for every pattern across difficulties and ticks', () => {
    assert.ok(PATTERN_NAMES.length >= 12);

    for (const patternName of PATTERN_NAMES) {
      for (const [diffKey, diffCfg] of Object.entries(DIFFICULTY_CONFIG)) {
        for (let tick = 0; tick <= 12; tick++) {
          const spawned = [];
          emitPattern(patternName, {
            x: 225,
            y: 140,
            targetX: 210,
            targetY: 680,
            tick,
            age: tick * 0.18,
            phaseTick: tick,
            speedMult: diffCfg.bulletSpeedMult,
            densityMult: diffCfg.densityMult,
            spawnBullet: (spec) => spawned.push(spec),
          });

          assert.ok(
            spawned.length > 0,
            `${patternName} (${diffKey}, tick=${tick}) must emit at least 1 bullet`,
          );

          for (let i = 0; i < spawned.length; i++) {
            const b = spawned[i];
            const tag = `${patternName}[${diffKey}][tick=${tick}][#${i}]`;
            assertFiniteNumber(b.x, `${tag}.x`);
            assertFiniteNumber(b.y, `${tag}.y`);
            assertFiniteNumber(b.vx, `${tag}.vx`);
            assertFiniteNumber(b.vy, `${tag}.vy`);
            assertFiniteNumber(b.ax, `${tag}.ax`);
            assertFiniteNumber(b.ay, `${tag}.ay`);
            assertFiniteNumber(b.radius, `${tag}.radius`);
            assertFiniteNumber(b.spin, `${tag}.spin`);
            assertFiniteNumber(b.turnRate, `${tag}.turnRate`);
            assertFiniteNumber(b.minSpeed, `${tag}.minSpeed`);
            assertFiniteNumber(b.maxSpeed, `${tag}.maxSpeed`);

            assert.ok(b.radius > 0, `${tag}.radius must be > 0`);
            assert.ok(b.minSpeed >= 0, `${tag}.minSpeed must be >= 0`);
            assert.ok(b.maxSpeed >= b.minSpeed, `${tag}.maxSpeed must be >= minSpeed`);
            assert.ok(Math.hypot(b.vx, b.vy) > 0, `${tag} velocity must be non-zero`);
            assert.equal(typeof b.color, 'string');
            assert.ok(b.color.length > 0);
            assert.ok(VALID_SHAPES.has(b.shape), `${tag}.shape "${b.shape}" is invalid`);
          }
        }
      }
    }
  });

  it('handles degenerate inputs and unknown patterns gracefully without NaN', () => {
    const spawned = [];
    emitPattern('nonexistent_pattern', {
      x: NaN,
      y: NaN,
      targetX: NaN,
      targetY: NaN,
      tick: NaN,
      age: Infinity,
      phaseTick: NaN,
      speedMult: NaN,
      densityMult: NaN,
      spawnBullet: (spec) => spawned.push(spec),
    });

    assert.ok(spawned.length > 0);
    for (const b of spawned) {
      assertFiniteNumber(b.x, 'fallback.x');
      assertFiniteNumber(b.y, 'fallback.y');
      assertFiniteNumber(b.vx, 'fallback.vx');
      assertFiniteNumber(b.vy, 'fallback.vy');
      assert.ok(b.radius > 0);
    }

    // Identical source and target position should not produce NaN aim angle
    const samePos = [];
    emitPattern('aimed_single', {
      x: 225,
      y: 225,
      targetX: 225,
      targetY: 225,
      tick: 0,
      age: 0,
      phaseTick: 0,
      speedMult: 1,
      densityMult: 1,
      spawnBullet: (spec) => samePos.push(spec),
    });
    assert.ok(samePos.length > 0);
    for (const b of samePos) {
      assertFiniteNumber(b.vx, 'samePos.vx');
      assertFiniteNumber(b.vy, 'samePos.vy');
    }

    // Missing ctx or spawnBullet does not throw
    assert.doesNotThrow(() => emitPattern('aimed_fan', null));
    assert.doesNotThrow(() => emitPattern('aimed_fan', {}));
  });
});
