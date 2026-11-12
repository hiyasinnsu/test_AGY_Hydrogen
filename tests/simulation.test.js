import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
  MAX_LIVES,
  MAX_BOMBS,
  BOMB_CHARGE_MAX,
  GAME_STATES,
  DIFFICULTIES,
} from '../src/constants.js';
import { createPool } from '../src/pool.js';
import { DIFFICULTY_CONFIG, BOSS_PHASES, STAGE_WAVES } from '../src/patterns.js';
import { createGameState, stepGame, triggerBomb } from '../src/simulation.js';
import { InputController } from '../src/input.js';
import { AudioEngine } from '../src/audio.js';

function assertFiniteNumber(value, label) {
  assert.equal(typeof value, 'number', `${label} must be number`);
  assert.ok(Number.isFinite(value), `${label} must be finite (got ${value})`);
}

function assertStateClean(state, stepTag = 'state') {
  assertFiniteNumber(state.time, `${stepTag}.time`);
  assertFiniteNumber(state.score, `${stepTag}.score`);
  assertFiniteNumber(state.highScore, `${stepTag}.highScore`);
  assertFiniteNumber(state.graze, `${stepTag}.graze`);
  assertFiniteNumber(state.combo, `${stepTag}.combo`);
  assertFiniteNumber(state.power, `${stepTag}.power`);
  assertFiniteNumber(state.stageProgress, `${stepTag}.stageProgress`);

  const p = state.player;
  assertFiniteNumber(p.x, `${stepTag}.player.x`);
  assertFiniteNumber(p.y, `${stepTag}.player.y`);
  assertFiniteNumber(p.vx, `${stepTag}.player.vx`);
  assertFiniteNumber(p.vy, `${stepTag}.player.vy`);
  assert.ok(p.x >= PLAYER_BOUND_X && p.x <= GAME_WIDTH - PLAYER_BOUND_X);
  assert.ok(p.y >= PLAYER_BOUND_Y && p.y <= GAME_HEIGHT - PLAYER_BOUND_Y);
  assert.ok(p.lives >= 0 && p.bombs >= 0);

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    assertFiniteNumber(e.x, `${stepTag}.enemy[${i}].x`);
    assertFiniteNumber(e.y, `${stepTag}.enemy[${i}].y`);
    assertFiniteNumber(e.hp, `${stepTag}.enemy[${i}].hp`);
  }
  for (let i = 0; i < state.enemyBullets.count; i++) {
    const b = state.enemyBullets.items[i];
    assertFiniteNumber(b.x, `${stepTag}.eb[${i}].x`);
    assertFiniteNumber(b.y, `${stepTag}.eb[${i}].y`);
    assertFiniteNumber(b.vx, `${stepTag}.eb[${i}].vx`);
    assertFiniteNumber(b.vy, `${stepTag}.eb[${i}].vy`);
    assert.ok(b.radius > 0);
  }
  for (let i = 0; i < state.playerBullets.count; i++) {
    const pb = state.playerBullets.items[i];
    assertFiniteNumber(pb.x, `${stepTag}.pb[${i}].x`);
    assertFiniteNumber(pb.y, `${stepTag}.pb[${i}].y`);
  }
  for (let i = 0; i < state.gems.count; i++) {
    const g = state.gems.items[i];
    assertFiniteNumber(g.x, `${stepTag}.gem[${i}].x`);
    assertFiniteNumber(g.y, `${stepTag}.gem[${i}].y`);
  }
}

describe('constants and pure ES modules', () => {
  it('exports exact shared constants and runs without DOM globals', () => {
    assert.equal(typeof window, 'undefined');
    assert.equal(typeof document, 'undefined');
    assert.equal(GAME_WIDTH, 450);
    assert.equal(GAME_HEIGHT, 800);
    assert.equal(PLAYER_HITBOX_RADIUS, 3);
    assert.equal(PLAYER_GRAZE_RADIUS, 22);
    assert.equal(POC_LINE_Y, 180);
    assert.equal(MAX_LIVES, 5);
    assert.equal(MAX_BOMBS, 5);
    assert.equal(BOMB_CHARGE_MAX, 100);
    assert.deepEqual(GAME_STATES, {
      TITLE: 'TITLE',
      PLAYING: 'PLAYING',
      PAUSED: 'PAUSED',
      GAMEOVER: 'GAMEOVER',
      VICTORY: 'VICTORY',
    });
    assert.deepEqual(DIFFICULTIES, {
      EASY: 'EASY',
      NORMAL: 'NORMAL',
      LUNATIC: 'LUNATIC',
    });
  });
});

describe('createPool', () => {
  it('enforces spawn, swap-remove, capacity limit, and clear invariants', () => {
    const pool = createPool(5, (idx) => ({ slot: idx, id: -1 }));
    assert.equal(pool.capacity, 5);
    assert.equal(pool.count, 0);

    for (let i = 0; i < 5; i++) {
      const item = pool.spawn((o) => {
        o.id = i + 10;
      });
      assert.ok(item !== null);
      assert.equal(item.id, i + 10);
    }
    assert.equal(pool.count, 5);

    // Capacity limit returns null and keeps active items intact
    const overflow = pool.spawn((o) => {
      o.id = 999;
    });
    assert.equal(overflow, null);
    assert.equal(pool.count, 5);

    // Out-of-bounds removeAt is a no-op
    pool.removeAt(-1);
    pool.removeAt(5);
    assert.equal(pool.count, 5);

    // Swap-remove middle element (index 1: id=11) -> swapped with last (id=14)
    pool.removeAt(1);
    assert.equal(pool.count, 4);
    const activeIds = pool.items.slice(0, pool.count).map((x) => x.id).sort((a, b) => a - b);
    assert.deepEqual(activeIds, [10, 12, 13, 14]);

    // Remove first and last
    pool.removeAt(0);
    pool.removeAt(pool.count - 1);
    assert.equal(pool.count, 2);

    // Re-spawn up to capacity again (ensures no lost slots after swap-remove)
    while (pool.count < pool.capacity) {
      assert.ok(pool.spawn((o) => { o.id = 100 + pool.count; }) !== null);
    }
    assert.equal(pool.count, 5);
    assert.equal(new Set(pool.items.slice(0, pool.count)).size, 5);

    pool.clear();
    assert.equal(pool.count, 0);
  });
});

describe('createGameState & movement controls', () => {
  it('initializes state per difficulty and clamps highScore', () => {
    for (const diff of Object.keys(DIFFICULTIES)) {
      const s = createGameState(diff, 12345);
      assert.equal(s.status, GAME_STATES.PLAYING);
      assert.equal(s.difficulty, diff);
      assert.equal(s.highScore, 12345);
      assert.equal(s.player.lives, DIFFICULTY_CONFIG[diff].lives);
      assert.equal(s.player.bombs, DIFFICULTY_CONFIG[diff].bombs);
      assert.equal(s.power, 1.0);
      assertStateClean(s, `init-${diff}`);
    }

    const fallback = createGameState('UNKNOWN', -50);
    assert.equal(fallback.difficulty, DIFFICULTIES.NORMAL);
    assert.equal(fallback.highScore, 0);
  });

  it('applies touch-drag dx/dy, keyboard moveX/moveY, focus slowMode, and bounds clamping', () => {
    const state = createGameState('NORMAL');
    const startX = state.player.x;
    const startY = state.player.y;

    // Touch drag relative delta
    stepGame(state, { dx: 35, dy: -20, firing: false }, 1 / 60);
    assert.equal(state.player.x, startX + 35);
    assert.equal(state.player.y, startY - 20);

    // Keyboard normal speed vs slowMode
    const beforeNormalX = state.player.x;
    stepGame(state, { moveX: 1, slowMode: false, firing: false }, 1 / 60);
    assert.ok(Math.abs((state.player.x - beforeNormalX) - PLAYER_SPEED / 60) < 1e-6);

    const beforeSlowX = state.player.x;
    stepGame(state, { moveX: 1, slowMode: true, firing: false }, 1 / 60);
    assert.ok(Math.abs((state.player.x - beforeSlowX) - PLAYER_FOCUS_SPEED / 60) < 1e-6);

    // Bounds clamping
    for (let i = 0; i < 20; i++) {
      stepGame(state, { dx: -90, dy: -90, firing: false }, 1 / 60);
    }
    assert.equal(state.player.x, PLAYER_BOUND_X);
    assert.equal(state.player.y, PLAYER_BOUND_Y);

    // Paused / zero dt does not advance state
    state.status = GAME_STATES.PAUSED;
    const pausedTick = state.tick;
    stepGame(state, { dx: 50, dy: 50 }, 1 / 60);
    assert.equal(state.tick, pausedTick);
    assert.equal(state.player.x, PLAYER_BOUND_X);
  });
});

describe('danmaku gameplay mechanics', () => {
  it('detects swept bullet collision without tunneling and transitions to GAMEOVER at 0 lives', () => {
    const state = createGameState('NORMAL');
    state.player.lives = 2;
    state.player.invulnTimer = 0;
    state.power = 2.4;
    const events = [];
    const onEvent = (name, payload) => events.push({ name, payload });

    // Place a super-fast bullet just above player so a single 1/60s step crosses straight through
    state.enemyBullets.spawn((b) => {
      b.x = state.player.x;
      b.y = state.player.y - 25;
      b.prevX = b.x;
      b.prevY = b.y;
      b.vx = 0;
      b.vy = 3000; // Moves 50px in 1/60s -> jumps from y-25 to y+25 across the 3px hitbox
      b.ax = 0;
      b.ay = 0;
      b.radius = 5;
      b.color = '#ff3b7f';
      b.shape = 'orb';
      b.spin = 0;
      b.turnRate = 0;
      b.maxSpeed = 4000;
      b.minSpeed = 0;
      b.grazed = false;
    });

    stepGame(state, { firing: false }, 1 / 60, onEvent);
    assert.equal(state.player.lives, 1);
    assert.ok(state.player.invulnTimer > 2.0);
    assert.ok(state.power < 2.4 && state.power >= 1.0);
    assert.equal(state.status, GAME_STATES.PLAYING);
    assert.ok(events.some((e) => e.name === 'playerHit'));

    // Next lethal hit -> GAMEOVER
    state.player.invulnTimer = 0;
    state.enemyBullets.spawn((b) => {
      b.x = state.player.x;
      b.y = state.player.y;
      b.prevX = b.x;
      b.prevY = b.y;
      b.vx = 0;
      b.vy = 100;
      b.ax = 0;
      b.ay = 0;
      b.radius = 5;
      b.maxSpeed = 600;
      b.minSpeed = 0;
      b.grazed = false;
    });
    stepGame(state, { firing: false }, 1 / 60, onEvent);
    assert.equal(state.player.lives, 0);
    assert.equal(state.status, GAME_STATES.GAMEOVER);
    assert.ok(events.some((e) => e.name === 'gameover'));
  });

  it('awards graze, combo, score, and bomb charge up to +1 bomb without double-grazing', () => {
    const state = createGameState('NORMAL');
    state.player.invulnTimer = 0;
    state.player.bombs = 1;
    state.player.bombCharge = 96; // One graze (+4) fills to 100 -> +1 bomb
    const events = [];

    // Bullet passes inside PLAYER_GRAZE_RADIUS (22) but outside hit radius (3 + 5 = 8)
    state.enemyBullets.spawn((b) => {
      b.x = state.player.x + 14;
      b.y = state.player.y - 10;
      b.prevX = b.x;
      b.prevY = b.y;
      b.vx = 0;
      b.vy = 180;
      b.ax = 0;
      b.ay = 0;
      b.radius = 5;
      b.maxSpeed = 600;
      b.minSpeed = 0;
      b.grazed = false;
    });

    stepGame(state, { firing: false }, 1 / 60, (name, p) => events.push({ name, p }));
    stepGame(state, { firing: false }, 1 / 60, (name, p) => events.push({ name, p }));

    assert.equal(state.graze, 1, 'same bullet must not be grazed twice');
    assert.equal(state.combo, 1);
    assert.ok(state.score > 0);
    assert.equal(state.player.bombs, 2);
    assert.equal(state.player.bombCharge, 0);
    assert.ok(events.some((e) => e.name === 'graze'));
    assert.ok(events.some((e) => e.name === 'powerUp' && e.p.kind === 'bomb'));
  });

  it('converts enemy bullets into magnetized gems on bomb and prevents concurrent bombs', () => {
    const state = createGameState('NORMAL');
    const events = [];
    for (let i = 0; i < 12; i++) {
      state.enemyBullets.spawn((b) => {
        b.x = 100 + i * 20;
        b.y = 200;
        b.prevX = b.x;
        b.prevY = b.y;
        b.vx = 0;
        b.vy = 100;
        b.radius = 5;
        b.maxSpeed = 600;
        b.minSpeed = 0;
      });
    }

    const initialBombs = state.player.bombs;
    const fired = triggerBomb(state, (name, p) => events.push({ name, p }));
    assert.equal(fired, true);
    assert.equal(state.player.bombs, initialBombs - 1);
    assert.equal(state.bombEffect.active, true);
    assert.equal(state.enemyBullets.count, 0);
    assert.equal(state.gems.count, 12);
    assert.ok(events.some((e) => e.name === 'bomb' && e.p.bulletsCleared === 12));

    // Second bomb while active must be rejected
    assert.equal(triggerBomb(state), false);
  });

  it('auto-collects gems via POC line when player moves above POC_LINE_Y', () => {
    const state = createGameState('NORMAL');
    state.gems.spawn((g) => {
      g.x = 60;
      g.y = 650;
      g.vx = 0;
      g.vy = 20;
      g.radius = 6.5;
      g.kind = 'power';
      g.value = 150;
      g.magnet = false;
    });
    state.gems.spawn((g) => {
      g.x = 390;
      g.y = 680;
      g.vx = 0;
      g.vy = 20;
      g.radius = 6.5;
      g.kind = 'score';
      g.value = 120;
      g.magnet = false;
    });

    // Move player above POC_LINE_Y
    state.player.y = POC_LINE_Y - 10;
    const events = [];
    for (let i = 0; i < 90; i++) {
      stepGame(state, { firing: false }, 1 / 60, (name) => events.push(name));
    }

    assert.equal(state.gems.count, 0, 'all gems should have flown to player and been collected');
    assert.ok(state.power > 1.0);
    assert.ok(state.score > 0);
    assert.ok(events.includes('gem'));
  });
});

describe('full stage simulation paths (thousands of ticks)', () => {
  it('completes a full NORMAL run through waves, midboss, all 3 boss phases, and VICTORY with zero NaNs', () => {
    const state = createGameState('NORMAL', 0);
    const events = new Set();
    const seenBossPhases = new Set();
    let sawMidboss = false;
    let sawFinalBoss = false;
    let peakBullets = 0;

    const dt = 1 / 60;
    const maxTicks = 60 * 150; // 150 seconds max

    for (let t = 0; t < maxTicks && state.status === GAME_STATES.PLAYING; t++) {
      // Keep player invulnerable for deterministic victory-path endurance verification,
      // while still allowing grazing (grazing does not depend on invulnTimer).
      state.player.invulnTimer = 1.0;

      if (state.activeBoss?.isMidboss) sawMidboss = true;
      if (state.activeBoss?.isBoss) {
        sawFinalBoss = true;
        seenBossPhases.add(state.activeBoss.phaseIndex);
      }

      // Track horizontally toward nearest enemy to clear waves & boss reliably
      let targetX = GAME_WIDTH / 2 + Math.sin(state.time * 1.1) * 90;
      if (state.enemies.length > 0) {
        targetX = state.enemies[0].x;
      }
      const dx = Math.max(-18, Math.min(18, targetX - state.player.x));
      const targetY = GAME_HEIGHT - 135;
      const dy = Math.max(-12, Math.min(12, targetY - state.player.y));

      stepGame(
        state,
        {
          dx,
          dy,
          firing: true,
          slowMode: Boolean(state.activeBoss),
          triggerBomb: state.enemyBullets.count > 220 && state.player.bombs > 0,
        },
        dt,
        (name) => events.add(name),
      );

      peakBullets = Math.max(peakBullets, state.enemyBullets.count);
      if (t % 120 === 0 || state.status !== GAME_STATES.PLAYING) {
        assertStateClean(state, `normal-t${t}`);
      }
    }

    assert.equal(state.status, GAME_STATES.VICTORY, `Expected VICTORY, got ${state.status} at t=${state.time.toFixed(2)}s`);
    assert.equal(state.stageProgress, 1);
    assert.equal(state.waveIndex, STAGE_WAVES.length);
    assert.ok(state.tick > 4500, `Expected >4500 ticks, got ${state.tick}`);
    assert.ok(sawMidboss, 'Expected midboss encounter during run');
    assert.ok(sawFinalBoss, 'Expected final boss encounter during run');
    for (let p = 0; p < BOSS_PHASES.length; p++) {
      assert.ok(seenBossPhases.has(p), `Expected boss phase ${p} to occur`);
    }
    assert.ok(events.has('bossWarning'));
    assert.ok(events.has('spellBreak'));
    assert.ok(events.has('enemyKill'));
    assert.ok(events.has('graze'));
    assert.ok(events.has('victory'));
    assert.ok(peakBullets > 20, `Expected danmaku bullets on screen, peak=${peakBullets}`);
    assert.ok(state.score > 50000);
    assert.equal(state.highScore, state.score);
  });

  it('reaches GAMEOVER cleanly in real stage play when player takes hits without invuln', () => {
    const state = createGameState('LUNATIC', 1000);
    const events = [];
    const dt = 1 / 60;

    for (let t = 0; t < 60 * 60 && state.status === GAME_STATES.PLAYING; t++) {
      // Steer toward nearest enemy bullet to force authentic stage hits
      let dx = 0;
      let dy = 0;
      if (state.enemyBullets.count > 0) {
        const b = state.enemyBullets.items[0];
        dx = Math.max(-12, Math.min(12, b.x - state.player.x));
        dy = Math.max(-12, Math.min(12, b.y - state.player.y));
      }
      stepGame(state, { dx, dy, firing: false }, dt, (name) => events.push(name));
      assertStateClean(state, `gameover-t${t}`);
    }

    assert.equal(state.status, GAME_STATES.GAMEOVER);
    assert.equal(state.player.lives, 0);
    assert.ok(events.includes('playerHit'));
    assert.ok(events.includes('gameover'));
    assert.ok(state.highScore >= 1000);
  });
});

describe('InputController & AudioEngine browser-safe contracts', () => {
  it('tracks primary pointer drag with sensitivity, 2-finger bomb, and keyboard controls', () => {
    const listeners = new Map();
    const winListeners = new Map();
    const mockCanvas = {
      style: {},
      getBoundingClientRect: () => ({ width: 225, height: 400 }),
      addEventListener: (t, fn) => listeners.set(t, fn),
      removeEventListener: (t) => listeners.delete(t),
      setPointerCapture: () => {},
      hasPointerCapture: () => false,
      releasePointerCapture: () => {},
    };
    const origWindow = globalThis.window;
    globalThis.window = {
      addEventListener: (t, fn) => winListeners.set(t, fn),
      removeEventListener: (t) => winListeners.delete(t),
    };

    try {
      let paused = 0;
      let bombed = 0;
      let gestured = 0;
      const input = new InputController(mockCanvas, 450, 800, {
        onPause: () => paused++,
        onBomb: () => bombed++,
        onFirstGesture: () => gestured++,
      });

      input.setSensitivity(1.5);
      assert.equal(input.getSensitivity(), 1.5);
      assert.equal(mockCanvas.style.touchAction, 'none');

      // Primary touch down + move (canvas CSS width 225 -> logical 450 => 2x scale * 1.5 sens = 3x)
      listeners.get('pointerdown')({
        pointerId: 1,
        pointerType: 'touch',
        clientX: 100,
        clientY: 200,
        cancelable: true,
        preventDefault() {},
      });
      listeners.get('pointermove')({
        pointerId: 1,
        pointerType: 'touch',
        clientX: 110,
        clientY: 190,
        cancelable: true,
        preventDefault() {},
      });

      // Secondary finger tap triggers bomb without breaking primary drag
      listeners.get('pointerdown')({
        pointerId: 2,
        pointerType: 'touch',
        clientX: 150,
        clientY: 250,
        cancelable: true,
        preventDefault() {},
      });

      const frame1 = input.consumeFrameInput();
      assert.equal(frame1.dx, 30);
      assert.equal(frame1.dy, -30);
      assert.equal(frame1.triggerBomb, true);
      assert.equal(gestured, 1);
      assert.equal(bombed, 1);

      // Keyboard input
      winListeners.get('keydown')({ code: 'ArrowLeft', preventDefault() {} });
      winListeners.get('keydown')({ code: 'ShiftLeft', preventDefault() {} });
      winListeners.get('keydown')({ code: 'KeyP', repeat: false, preventDefault() {} });
      const frame2 = input.consumeFrameInput();
      assert.equal(frame2.moveX, -1);
      assert.equal(frame2.slowMode, true);
      assert.equal(paused, 1);

      input.destroy();
      assert.equal(listeners.size, 0);
      assert.equal(winListeners.size, 0);
    } finally {
      if (origWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = origWindow;
      }
    }
  });

  it('safely operates AudioEngine when AudioContext is unavailable', () => {
    const audio = new AudioEngine();
    assert.equal(audio.isMuted(), false);
    assert.equal(audio.unlock(), false);
    audio.setMuted(true);
    assert.equal(audio.isMuted(), true);
    audio.setMuted(false);
    assert.doesNotThrow(() => {
      audio.startBgm();
      audio.pauseBgm();
      audio.resumeBgm();
      audio.play('shoot');
      audio.play('graze');
      audio.play('bomb');
      audio.play('victory');
      audio.stopBgm();
    });
  });
});
