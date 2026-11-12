import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GAME_STATES,
  DIFFICULTIES,
  MAX_LIVES,
  MAX_BOMBS,
  BOMB_CHARGE_MAX,
} from './constants.js';
import { createGameState, stepGame, triggerBomb } from './simulation.js';
import { InputController } from './input.js';
import { AudioEngine } from './audio.js';
import { Renderer } from './renderer.js';

const STORAGE_SCORES_KEY = 'astro_danmaku_scores_v1';
const STORAGE_PREFS_KEY = 'astro_danmaku_prefs_v1';

const VALID_SENSITIVITIES = [1, 1.25, 1.5];

function loadJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveJsonStorage(key, value) {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

function formatScore(value) {
  const safe = Math.max(0, Math.floor(Number(value) || 0));
  return safe.toLocaleString('en-US');
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function boot() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  // DOM references
  const progressTrack = document.getElementById('stage-progress-track');
  const progressFill = document.getElementById('stage-progress-fill');

  const hudTop = document.getElementById('hud-top');
  const hudScoreEl = document.getElementById('hud-score');
  const hudComboEl = document.getElementById('hud-combo');
  const hudLivesEl = document.getElementById('hud-pips-lives');
  const hudBombsEl = document.getElementById('hud-pips-bombs');
  const hudPowerEl = document.getElementById('hud-power');
  const hudMuteBtn = document.getElementById('btn-hud-mute');
  const hudPauseBtn = document.getElementById('btn-hud-pause');

  const bossHud = document.getElementById('boss-hud');
  const bossNameEl = document.getElementById('boss-name');
  const bossPhaseTagEl = document.getElementById('boss-phase-tag');
  const bossHpFillEl = document.getElementById('boss-hp-fill');
  const bossTick1El = document.getElementById('boss-tick-1');
  const bossTick2El = document.getElementById('boss-tick-2');
  const bossSpellNameEl = document.getElementById('boss-spell-name');

  const bombBtn = document.getElementById('btn-bomb');
  const bombCountEl = document.getElementById('bomb-btn-count');
  const bombChargeFillEl = document.getElementById('bomb-charge-fill');

  const overlayTitle = document.getElementById('overlay-title');
  const titleHighscoreEl = document.getElementById('title-highscore');
  const difficultyPills = document.getElementById('difficulty-pills');
  const sensitivityPills = document.getElementById('sensitivity-pills');
  const titleMuteBtn = document.getElementById('btn-title-mute');
  const titleMuteLabel = document.getElementById('title-mute-label');
  const startBtn = document.getElementById('btn-start');

  const overlayPause = document.getElementById('overlay-pause');
  const pauseScoreEl = document.getElementById('pause-score');
  const pauseGrazeEl = document.getElementById('pause-graze');
  const pauseComboEl = document.getElementById('pause-combo');
  const pauseDiffEl = document.getElementById('pause-diff');
  const resumeBtn = document.getElementById('btn-resume');
  const pauseRetryBtn = document.getElementById('btn-pause-retry');
  const pauseTitleBtn = document.getElementById('btn-pause-title');

  const overlayResult = document.getElementById('overlay-result');
  const resultKickerEl = document.getElementById('result-kicker');
  const resultTitleEl = document.getElementById('result-title');
  const resultRecordEl = document.getElementById('result-new-record');
  const resultScoreEl = document.getElementById('result-score');
  const resultGrazeEl = document.getElementById('result-graze');
  const resultComboEl = document.getElementById('result-combo');
  const resultDiffEl = document.getElementById('result-diff');
  const resultRetryBtn = document.getElementById('btn-result-retry');
  const resultTitleBtn = document.getElementById('btn-result-title');

  // Pre-allocate HUD pip DOM nodes (zero innerHTML churn per frame)
  const lifePips = [];
  for (let i = 0; i < MAX_LIVES; i++) {
    const pip = document.createElement('span');
    pip.className = 'pip-mark life';
    hudLivesEl?.appendChild(pip);
    lifePips.push(pip);
  }
  const bombPips = [];
  for (let i = 0; i < MAX_BOMBS; i++) {
    const pip = document.createElement('span');
    pip.className = 'pip-mark bomb';
    hudBombsEl?.appendChild(pip);
    bombPips.push(pip);
  }

  // Persisted high scores & preferences
  const storedScores = loadJsonStorage(STORAGE_SCORES_KEY, {});
  const highScores = {
    EASY: Math.max(0, Math.floor(Number(storedScores.EASY) || 0)),
    NORMAL: Math.max(0, Math.floor(Number(storedScores.NORMAL) || 0)),
    LUNATIC: Math.max(0, Math.floor(Number(storedScores.LUNATIC) || 0)),
  };

  const storedPrefs = loadJsonStorage(STORAGE_PREFS_KEY, {});
  const prefs = {
    difficulty: DIFFICULTIES[storedPrefs.difficulty] ? storedPrefs.difficulty : DIFFICULTIES.NORMAL,
    sensitivity: VALID_SENSITIVITIES.includes(Number(storedPrefs.sensitivity))
      ? Number(storedPrefs.sensitivity)
      : 1,
    muted: Boolean(storedPrefs.muted),
  };

  const getHighScore = (diff) => highScores[diff] || 0;
  const saveHighScore = (diff, score) => {
    const clean = Math.max(0, Math.floor(Number(score) || 0));
    if (clean > (highScores[diff] || 0)) {
      highScores[diff] = clean;
      saveJsonStorage(STORAGE_SCORES_KEY, highScores);
    }
  };
  const savePrefs = () => saveJsonStorage(STORAGE_PREFS_KEY, prefs);

  // Core engines
  const renderer = new Renderer(canvas, GAME_WIDTH, GAME_HEIGHT);
  renderer.resize();

  const audio = new AudioEngine();
  audio.setMuted(prefs.muted);

  let state = createGameState(prefs.difficulty, getHighScore(prefs.difficulty));
  state.status = GAME_STATES.TITLE;
  let initialLivesForRun = state.player.lives;
  let runStartHighScore = state.highScore;

  // HUD diff cache to avoid redundant DOM writes
  const hudCache = {
    status: null,
    score: -1,
    combo: -1,
    lives: -1,
    bombs: -1,
    bombCharge: -1,
    bombBusy: null,
    power: '',
    progress: -1,
    bossVisible: null,
    bossHpPct: -1,
    bossPhase: '',
    bossSpell: '',
    bossMid: null,
    bossName: '',
  };

  function resetHudCache() {
    hudCache.status = null;
    hudCache.score = -1;
    hudCache.combo = -1;
    hudCache.lives = -1;
    hudCache.bombs = -1;
    hudCache.bombCharge = -1;
    hudCache.bombBusy = null;
    hudCache.power = '';
    hudCache.progress = -1;
    hudCache.bossVisible = null;
    hudCache.bossHpPct = -1;
    hudCache.bossPhase = '';
    hudCache.bossSpell = '';
    hudCache.bossMid = null;
    hudCache.bossName = '';
  }

  function syncMuteUI() {
    const muted = audio.isMuted();
    for (const btn of [hudMuteBtn, titleMuteBtn]) {
      if (!btn) continue;
      btn.setAttribute('aria-pressed', String(muted));
      btn.classList.toggle('muted', muted);
      btn.classList.toggle('is-muted', muted);
      btn.querySelector('.icon-sound-on')?.classList.toggle('hidden', muted);
      btn.querySelector('.icon-sound-off')?.classList.toggle('hidden', !muted);
    }
    if (titleMuteLabel) {
      titleMuteLabel.textContent = muted ? 'OFF' : 'ON';
    }
  }

  function syncTitleSelectionUI() {
    if (titleHighscoreEl) {
      titleHighscoreEl.textContent = formatScore(getHighScore(prefs.difficulty));
    }
    if (difficultyPills) {
      const buttons = difficultyPills.querySelectorAll('[data-difficulty]');
      for (const btn of buttons) {
        const active = btn.dataset.difficulty === prefs.difficulty;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-checked', String(active));
      }
    }
    if (sensitivityPills) {
      const buttons = sensitivityPills.querySelectorAll('[data-sens]');
      for (const btn of buttons) {
        const active = Number(btn.dataset.sens) === prefs.sensitivity;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-checked', String(active));
      }
    }
  }

  function syncHud(force = false) {
    const status = state.status;
    const showInGameHud = status === GAME_STATES.PLAYING || status === GAME_STATES.PAUSED;

    if (force || hudCache.status !== status) {
      hudCache.status = status;
      hudTop?.classList.toggle('hidden', !showInGameHud);
      progressTrack?.classList.toggle('hidden', !showInGameHud);
      bombBtn?.classList.toggle('hidden', status !== GAME_STATES.PLAYING);

      overlayTitle?.classList.toggle('hidden', status !== GAME_STATES.TITLE);
      overlayPause?.classList.toggle('hidden', status !== GAME_STATES.PAUSED);

      const isEnd = status === GAME_STATES.GAMEOVER || status === GAME_STATES.VICTORY;
      overlayResult?.classList.toggle('hidden', !isEnd);

      if (status === GAME_STATES.TITLE) {
        syncTitleSelectionUI();
      } else if (status === GAME_STATES.PAUSED) {
        if (pauseScoreEl) pauseScoreEl.textContent = formatScore(state.score);
        if (pauseGrazeEl) pauseGrazeEl.textContent = formatScore(state.graze);
        if (pauseComboEl) pauseComboEl.textContent = formatScore(state.maxCombo);
        if (pauseDiffEl) pauseDiffEl.textContent = state.difficulty;
      } else if (isEnd && overlayResult) {
        const isVictory = status === GAME_STATES.VICTORY;
        overlayResult.classList.toggle('is-victory', isVictory);
        overlayResult.classList.toggle('is-gameover', !isVictory);
        if (resultKickerEl) {
          resultKickerEl.textContent = isVictory ? 'ECLIPSE NEUTRALIZED' : 'SORTIE TERMINATED';
        }
        if (resultTitleEl) {
          resultTitleEl.textContent = isVictory ? 'STAGE CLEAR' : 'GAME OVER';
        }
        const isNewRecord = state.score > 0 && state.score > runStartHighScore;
        resultRecordEl?.classList.toggle('hidden', !isNewRecord);
        if (resultScoreEl) resultScoreEl.textContent = formatScore(state.score);
        if (resultGrazeEl) resultGrazeEl.textContent = formatScore(state.graze);
        if (resultComboEl) resultComboEl.textContent = formatScore(state.maxCombo);
        if (resultDiffEl) resultDiffEl.textContent = state.difficulty;
      }
    }

    if (!showInGameHud) {
      if (hudCache.bossVisible !== false) {
        hudCache.bossVisible = false;
        bossHud?.classList.add('hidden');
      }
      return;
    }

    if (hudCache.score !== state.score) {
      hudCache.score = state.score;
      if (hudScoreEl) hudScoreEl.textContent = formatScore(state.score);
    }

    if (hudCache.combo !== state.combo) {
      hudCache.combo = state.combo;
      if (hudComboEl) {
        if (state.combo >= 2) {
          hudComboEl.textContent = `${state.combo}x`;
          hudComboEl.classList.remove('hidden');
        } else {
          hudComboEl.classList.add('hidden');
        }
      }
    }

    const { player } = state;
    if (hudCache.lives !== player.lives) {
      hudCache.lives = player.lives;
      const shownLives = Math.max(initialLivesForRun, player.lives);
      for (let i = 0; i < lifePips.length; i++) {
        lifePips[i].classList.toggle('hidden', i >= shownLives);
        lifePips[i].classList.toggle('filled', i < player.lives);
      }
    }

    const bombBusy = Boolean(state.bombEffect?.active);
    if (hudCache.bombs !== player.bombs || hudCache.bombBusy !== bombBusy) {
      hudCache.bombs = player.bombs;
      hudCache.bombBusy = bombBusy;
      for (let i = 0; i < bombPips.length; i++) {
        bombPips[i].classList.toggle('filled', i < player.bombs);
      }
      if (bombCountEl) {
        bombCountEl.textContent = String(player.bombs);
      }
      if (bombBtn) {
        bombBtn.classList.toggle('is-empty', player.bombs <= 0);
        bombBtn.classList.toggle('is-busy', bombBusy && player.bombs > 0);
      }
    }

    const chargePct = Math.round(clamp((player.bombCharge / BOMB_CHARGE_MAX) * 100, 0, 100));
    if (hudCache.bombCharge !== chargePct) {
      hudCache.bombCharge = chargePct;
      if (bombChargeFillEl) {
        bombChargeFillEl.style.width = `${chargePct}%`;
      }
    }

    const powerStr = state.power.toFixed(2);
    if (hudCache.power !== powerStr) {
      hudCache.power = powerStr;
      if (hudPowerEl) hudPowerEl.textContent = powerStr;
    }

    const progressPct = Math.round(clamp(state.stageProgress * 100, 0, 100));
    if (hudCache.progress !== progressPct) {
      hudCache.progress = progressPct;
      if (progressFill) progressFill.style.width = `${progressPct}%`;
    }

    // Boss HUD
    const boss = state.bossActive ? state.activeBoss : null;
    const bossVisible = Boolean(boss && boss.hp > 0);
    if (hudCache.bossVisible !== bossVisible) {
      hudCache.bossVisible = bossVisible;
      bossHud?.classList.toggle('hidden', !bossVisible);
    }

    if (bossVisible && boss) {
      const isMid = Boolean(boss.isMidboss);
      if (hudCache.bossMid !== isMid) {
        hudCache.bossMid = isMid;
        bossHud?.classList.toggle('is-midboss', isMid);
        bossTick1El?.classList.toggle('hidden', isMid);
        bossTick2El?.classList.toggle('hidden', isMid);
      }
      const bName = boss.name || 'BOSS';
      if (hudCache.bossName !== bName) {
        hudCache.bossName = bName;
        if (bossNameEl) bossNameEl.textContent = bName;
      }
      const phaseTag = isMid
        ? 'MIDBOSS'
        : boss.phaseIndex >= 2
          ? 'FINAL'
          : `PHASE 0${(boss.phaseIndex || 0) + 1}`;
      if (hudCache.bossPhase !== phaseTag) {
        hudCache.bossPhase = phaseTag;
        if (bossPhaseTagEl) bossPhaseTagEl.textContent = phaseTag;
      }
      const spellText = boss.phaseName || (isMid ? 'CRIMSON CROSSFIRE' : '');
      if (hudCache.bossSpell !== spellText) {
        hudCache.bossSpell = spellText;
        if (bossSpellNameEl) bossSpellNameEl.textContent = spellText;
      }
      const hpPct = +(clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1) * 100).toFixed(2);
      if (hudCache.bossHpPct !== hpPct) {
        hudCache.bossHpPct = hpPct;
        if (bossHpFillEl) bossHpFillEl.style.width = `${hpPct}%`;
      }
    }
  }

  function handleSimEvent(name) {
    audio.play(name);
    if (name === 'victory' || name === 'gameover') {
      saveHighScore(state.difficulty, state.highScore);
      audio.stopBgm();
      input.reset();
      syncHud(true);
    }
  }

  function startRun() {
    audio.unlock();
    input.reset();
    runStartHighScore = getHighScore(prefs.difficulty);
    state = createGameState(prefs.difficulty, runStartHighScore);
    initialLivesForRun = state.player.lives;
    audio.startBgm();
    resetHudCache();
    syncHud(true);
    lastTime = performance.now();
  }

  function pauseGame() {
    if (state.status !== GAME_STATES.PLAYING) return;
    state.status = GAME_STATES.PAUSED;
    input.reset();
    audio.pauseBgm();
    syncHud(true);
  }

  function resumeGame() {
    if (state.status !== GAME_STATES.PAUSED) return;
    audio.unlock();
    state.status = GAME_STATES.PLAYING;
    input.reset();
    audio.resumeBgm();
    lastTime = performance.now();
    syncHud(true);
  }

  function togglePause() {
    if (state.status === GAME_STATES.PLAYING) {
      pauseGame();
    } else if (state.status === GAME_STATES.PAUSED) {
      resumeGame();
    }
  }

  function goToTitle() {
    audio.stopBgm();
    input.reset();
    state = createGameState(prefs.difficulty, getHighScore(prefs.difficulty));
    state.status = GAME_STATES.TITLE;
    initialLivesForRun = state.player.lives;
    resetHudCache();
    syncHud(true);
  }

  function toggleMute() {
    audio.unlock();
    prefs.muted = !audio.isMuted();
    audio.setMuted(prefs.muted);
    savePrefs();
    syncMuteUI();
  }

  const input = new InputController(canvas, GAME_WIDTH, GAME_HEIGHT, {
    onPause: togglePause,
    onBomb: () => {
      audio.unlock();
    },
    onFirstGesture: () => {
      audio.unlock();
    },
  });
  input.setSensitivity(prefs.sensitivity);

  // Title difficulty & sensitivity pills
  difficultyPills?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-difficulty]');
    if (!btn) return;
    audio.unlock();
    const diff = btn.dataset.difficulty;
    if (!DIFFICULTIES[diff]) return;
    prefs.difficulty = diff;
    savePrefs();
    if (state.status === GAME_STATES.TITLE) {
      state.difficulty = diff;
      state.highScore = getHighScore(diff);
    }
    syncTitleSelectionUI();
  });

  sensitivityPills?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-sens]');
    if (!btn) return;
    audio.unlock();
    const sens = Number(btn.dataset.sens);
    if (!VALID_SENSITIVITIES.includes(sens)) return;
    prefs.sensitivity = sens;
    input.setSensitivity(sens);
    savePrefs();
    syncTitleSelectionUI();
  });

  titleMuteBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    toggleMute();
  });

  startBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    startRun();
  });

  // In-game HUD buttons (prevent touch propagation to canvas)
  hudMuteBtn?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  hudMuteBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.currentTarget.blur();
    toggleMute();
  });

  hudPauseBtn?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  hudPauseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.currentTarget.blur();
    togglePause();
  });

  // Dedicated thumb-accessible BOMB button: pointerdown fires immediately without breaking canvas drag
  const clearBombPressed = () => bombBtn?.classList.remove('is-pressed');
  let lastBombPointerDownAt = -Infinity;
  const fireUiBomb = () => {
    audio.unlock();
    if (state.status === GAME_STATES.PLAYING) {
      if (triggerBomb(state, handleSimEvent)) {
        syncHud();
      }
    }
  };
  bombBtn?.addEventListener(
    'pointerdown',
    (e) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      lastBombPointerDownAt = performance.now();
      bombBtn.classList.add('is-pressed');
      fireUiBomb();
    },
    { passive: false },
  );
  bombBtn?.addEventListener('pointerup', clearBombPressed);
  bombBtn?.addEventListener('pointercancel', clearBombPressed);
  bombBtn?.addEventListener('pointerleave', clearBombPressed);
  bombBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.blur();
    if (performance.now() - lastBombPointerDownAt > 250) {
      fireUiBomb();
    }
  });

  // Pause & Result overlay buttons
  resumeBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    resumeGame();
  });
  pauseRetryBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    startRun();
  });
  pauseTitleBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    goToTitle();
  });

  resultRetryBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    startRun();
  });
  resultTitleBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    goToTitle();
  });

  // Mobile lifecycle safeguards: auto-pause when switching apps or losing focus
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseGame();
    }
  });
  window.addEventListener('blur', () => {
    pauseGame();
  });
  window.addEventListener('pagehide', () => {
    pauseGame();
  });

  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('orientationchange', () => renderer.resize());
  document.addEventListener(
    'gesturestart',
    (e) => {
      if (e.cancelable) e.preventDefault();
    },
    { passive: false },
  );

  // Initial UI sync
  syncMuteUI();
  syncTitleSelectionUI();
  syncHud(true);

  // Main 60fps loop
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;

    if (state.status === GAME_STATES.PLAYING && dt > 0) {
      const frameInput = input.consumeFrameInput();
      stepGame(state, frameInput, dt, handleSimEvent);
      syncHud();
    }

    renderer.render(state, now / 1000);
    window.requestAnimationFrame(frame);
  }

  window.requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
