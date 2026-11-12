const EVENT_COOLDOWNS_MS = {
  shoot: 68,
  graze: 45,
  enemyHit: 48,
  gem: 48,
  enemyKill: 45,
  powerUp: 140,
  bomb: 320,
  playerHit: 260,
  bossWarning: 600,
  spellBreak: 320,
  victory: 600,
  gameover: 600,
};

// F# minor cyber-celestial progression (frequencies in Hz)
const BASS_PATTERN = [
  92.5, 0, 92.5, 110.0, 92.5, 0, 138.59, 0,
  73.42, 0, 73.42, 92.5, 82.41, 0, 110.0, 0,
  82.41, 0, 82.41, 98.0, 82.41, 0, 123.47, 0,
  69.3, 0, 92.5, 110.0, 138.59, 0, 110.0, 92.5,
];

const ARP_PATTERN = [
  369.99, 440.0, 554.37, 739.99, 554.37, 440.0, 659.25, 554.37,
  293.66, 369.99, 440.0, 587.33, 440.0, 369.99, 493.88, 440.0,
  329.63, 415.3, 493.88, 659.25, 493.88, 415.3, 587.33, 493.88,
  277.18, 369.99, 440.0, 554.37, 659.25, 554.37, 440.0, 369.99,
];

export class AudioEngine {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._sfxGain = null;
    this._bgmGain = null;
    this._noiseBuffer = null;
    this._muted = false;
    this._masterVolume = 0.72;

    this._lastPlayedAt = Object.create(null);
    this._grazeComboPitch = 0;

    // Procedural BGM scheduler state
    this._bgmPlaying = false;
    this._bgmPaused = false;
    this._bgmTimerId = null;
    this._nextNoteTime = 0;
    this._stepIndex = 0;
    this._stepDuration = 60 / 138 / 4; // 138 BPM, 16th-note grid
  }

  _nowMs() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  _ensureContext() {
    if (this._ctx) {
      return this._ctx;
    }
    const AudioCtx =
      typeof globalThis !== 'undefined'
        ? globalThis.AudioContext || globalThis.webkitAudioContext
        : null;
    if (!AudioCtx) {
      return null;
    }

    try {
      const ctx = new AudioCtx();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;

      const masterGain = ctx.createGain();
      masterGain.gain.value = this._muted ? 0 : this._masterVolume;

      const sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.85;

      const bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.32;

      sfxGain.connect(compressor);
      bgmGain.connect(compressor);
      compressor.connect(masterGain);
      masterGain.connect(ctx.destination);

      // Pre-allocate 1s white noise buffer
      const sampleRate = ctx.sampleRate || 44100;
      const noiseBuffer = ctx.createBuffer(1, sampleRate, sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this._ctx = ctx;
      this._masterGain = masterGain;
      this._sfxGain = sfxGain;
      this._bgmGain = bgmGain;
      this._noiseBuffer = noiseBuffer;
      return ctx;
    } catch {
      return null;
    }
  }

  unlock() {
    const ctx = this._ensureContext();
    if (!ctx) {
      return false;
    }

    try {
      if (ctx.state === 'suspended') {
        const res = ctx.resume?.();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
      // Silent 1-sample kick for iOS Safari audio unlock
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // Ignore browser unlock restrictions
    }

    if (this._bgmPlaying && !this._bgmPaused && !this._bgmTimerId) {
      this._startScheduler();
    }
    return true;
  }

  setMuted(muted) {
    this._muted = Boolean(muted);
    if (this._masterGain && this._ctx) {
      try {
        const now = this._ctx.currentTime;
        this._masterGain.gain.setTargetAtTime(
          this._muted ? 0 : this._masterVolume,
          now,
          0.015,
        );
      } catch {
        // Ignore
      }
    }
    if (this._muted) {
      this._stopScheduler();
    } else if (this._bgmPlaying && !this._bgmPaused) {
      this._startScheduler();
    }
  }

  isMuted() {
    return this._muted;
  }

  startBgm() {
    this._bgmPlaying = true;
    this._bgmPaused = false;
    this._stepIndex = 0;
    const ctx = this._ensureContext();
    if (ctx && !this._muted) {
      this._nextNoteTime = ctx.currentTime + 0.05;
      this._startScheduler();
    }
  }

  stopBgm() {
    this._bgmPlaying = false;
    this._bgmPaused = false;
    this._stepIndex = 0;
    this._stopScheduler();
  }

  pauseBgm() {
    this._bgmPaused = true;
    this._stopScheduler();
  }

  resumeBgm() {
    if (!this._bgmPlaying) {
      return;
    }
    this._bgmPaused = false;
    const ctx = this._ensureContext();
    if (ctx && !this._muted) {
      this._nextNoteTime = ctx.currentTime + 0.04;
      this._startScheduler();
    }
  }

  _startScheduler() {
    if (this._bgmTimerId !== null || typeof setInterval === 'undefined') {
      return;
    }
    const ctx = this._ctx;
    if (!ctx) {
      return;
    }
    if (this._nextNoteTime < ctx.currentTime) {
      this._nextNoteTime = ctx.currentTime + 0.04;
    }
    this._bgmTimerId = setInterval(() => this._scheduleNotes(), 25);
  }

  _stopScheduler() {
    if (this._bgmTimerId !== null && typeof clearInterval !== 'undefined') {
      clearInterval(this._bgmTimerId);
      this._bgmTimerId = null;
    }
  }

  _scheduleNotes() {
    const ctx = this._ctx;
    if (!ctx || this._muted || !this._bgmPlaying || this._bgmPaused || ctx.state !== 'running') {
      return;
    }
    const lookahead = 0.11;
    // Clamp catch-up if tab resumed from long pause
    if (this._nextNoteTime < ctx.currentTime - 0.15) {
      this._nextNoteTime = ctx.currentTime + 0.03;
    }

    while (this._nextNoteTime < ctx.currentTime + lookahead) {
      this._triggerBgmStep(this._stepIndex, this._nextNoteTime);
      this._nextNoteTime += this._stepDuration;
      this._stepIndex = (this._stepIndex + 1) % BASS_PATTERN.length;
    }
  }

  _triggerBgmStep(step, t) {
    const ctx = this._ctx;
    if (!ctx || !this._bgmGain) return;

    const bassFreq = BASS_PATTERN[step];
    if (bassFreq > 0) {
      this._playTone(
        'sawtooth',
        bassFreq,
        bassFreq * 0.995,
        0.11,
        0.18,
        t,
        this._bgmGain,
        680,
      );
    }

    const arpFreq = ARP_PATTERN[step];
    if (arpFreq > 0 && step % 2 === 0) {
      this._playTone('triangle', arpFreq, arpFreq, 0.09, 0.09, t, this._bgmGain);
    }

    // Four-on-the-floor light kick
    if (step % 4 === 0) {
      this._playTone('sine', 115, 38, 0.11, 0.22, t, this._bgmGain);
    }

    // Crisp offbeat hi-hat
    if (step % 4 === 2 && this._noiseBuffer) {
      this._playNoise(0.035, 0.055, 6500, 'highpass', t, this._bgmGain);
    }
  }

  play(eventName) {
    if (this._muted) {
      return;
    }
    const ctx = this._ctx;
    if (!ctx || ctx.state !== 'running' || !this._sfxGain) {
      return;
    }

    const nowMs = this._nowMs();
    const cooldown = EVENT_COOLDOWNS_MS[eventName] ?? 40;
    const prev = this._lastPlayedAt[eventName] ?? -Infinity;
    if (nowMs - prev < cooldown) {
      return;
    }
    this._lastPlayedAt[eventName] = nowMs;

    const t = ctx.currentTime;
    try {
      switch (eventName) {
        case 'shoot':
          this._playTone('triangle', 920, 440, 0.045, 0.045, t, this._sfxGain);
          break;
        case 'graze': {
          const pitch = 1350 + (this._grazeComboPitch % 6) * 95;
          this._grazeComboPitch++;
          this._playTone('sine', pitch, pitch * 1.25, 0.038, 0.075, t, this._sfxGain);
          break;
        }
        case 'enemyHit':
          this._playTone('square', 240, 140, 0.035, 0.035, t, this._sfxGain, 900);
          break;
        case 'gem':
          this._playTone('sine', 1180, 1760, 0.065, 0.07, t, this._sfxGain);
          break;
        case 'enemyKill':
          this._playTone('sawtooth', 320, 75, 0.14, 0.14, t, this._sfxGain, 1200);
          if (this._noiseBuffer) {
            this._playNoise(0.11, 0.11, 900, 'bandpass', t, this._sfxGain);
          }
          break;
        case 'powerUp':
          this._playTone('triangle', 523.25, 523.25, 0.09, 0.13, t, this._sfxGain);
          this._playTone('triangle', 659.25, 659.25, 0.09, 0.13, t + 0.055, this._sfxGain);
          this._playTone('triangle', 783.99, 1046.5, 0.16, 0.15, t + 0.11, this._sfxGain);
          break;
        case 'bomb':
          this._playTone('sine', 160, 32, 0.65, 0.34, t, this._sfxGain);
          this._playTone('sawtooth', 440, 110, 0.45, 0.18, t + 0.02, this._sfxGain, 1600);
          if (this._noiseBuffer) {
            this._playNoise(0.55, 0.28, 1800, 'lowpass', t, this._sfxGain);
          }
          break;
        case 'playerHit':
          this._playTone('sawtooth', 340, 55, 0.38, 0.28, t, this._sfxGain, 1400);
          if (this._noiseBuffer) {
            this._playNoise(0.28, 0.24, 1400, 'bandpass', t, this._sfxGain);
          }
          break;
        case 'bossWarning':
          for (let i = 0; i < 2; i++) {
            const offset = i * 0.26;
            this._playTone('sawtooth', 460, 880, 0.18, 0.16, t + offset, this._sfxGain, 1800);
          }
          break;
        case 'spellBreak':
          this._playTone('sine', 220, 48, 0.42, 0.26, t, this._sfxGain);
          this._playTone('triangle', 659.25, 987.77, 0.22, 0.16, t + 0.05, this._sfxGain);
          this._playTone('triangle', 1318.5, 1760, 0.26, 0.14, t + 0.12, this._sfxGain);
          break;
        case 'victory': {
          const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
          for (let i = 0; i < notes.length; i++) {
            this._playTone('triangle', notes[i], notes[i], 0.22, 0.14, t + i * 0.08, this._sfxGain);
          }
          break;
        }
        case 'gameover': {
          const notes = [392.0, 349.23, 311.13, 261.63];
          for (let i = 0; i < notes.length; i++) {
            this._playTone('sawtooth', notes[i], notes[i] * 0.96, 0.28, 0.13, t + i * 0.13, this._sfxGain, 900);
          }
          break;
        }
        default:
          break;
      }
    } catch {
      // Ignore Web Audio errors safely
    }
  }

  _playTone(type, freqStart, freqEnd, duration, peakGain, startTime, dest, lowpassHz = 0) {
    const ctx = this._ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqStart), startTime);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);
    }

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    if (lowpassHz > 0) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(lowpassHz, startTime);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.015);
  }

  _playNoise(duration, peakGain, freq, filterType, startTime, dest) {
    const ctx = this._ctx;
    if (!ctx || !this._noiseBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(startTime);
    src.stop(startTime + duration + 0.015);
  }
}
