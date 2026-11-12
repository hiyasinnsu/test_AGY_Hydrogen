import { GAME_WIDTH, GAME_HEIGHT, POC_LINE_Y, GAME_STATES } from './constants.js';

const TAU = Math.PI * 2;
const STAMP_RES = 2;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function createStarfield() {
  // Deterministic LCG so star layout is consistent without per-frame allocations
  let seed = 0x51a7c3d9;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const layers = [
    { count: 44, speed: 18, minSize: 0.9, maxSize: 1.4, color: '#7b97d9', minAlpha: 0.24, maxAlpha: 0.48 },
    { count: 28, speed: 38, minSize: 1.3, maxSize: 1.9, color: '#b4ceff', minAlpha: 0.36, maxAlpha: 0.68 },
    { count: 14, speed: 68, minSize: 1.7, maxSize: 2.3, color: '#e2f5ff', minAlpha: 0.52, maxAlpha: 0.85 },
  ];

  const stars = [];
  for (let l = 0; l < layers.length; l++) {
    const cfg = layers[l];
    for (let i = 0; i < cfg.count; i++) {
      stars.push({
        x: rand() * GAME_WIDTH,
        y: rand() * GAME_HEIGHT,
        size: cfg.minSize + rand() * (cfg.maxSize - cfg.minSize),
        speed: cfg.speed * (0.85 + rand() * 0.3),
        color: cfg.color,
        alpha: cfg.minAlpha + rand() * (cfg.maxAlpha - cfg.minAlpha),
        twinklePhase: rand() * TAU,
      });
    }
  }
  return stars;
}

function createOffscreenCanvas(pixelW, pixelH) {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = pixelW;
    c.height = pixelH;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(pixelW, pixelH);
  }
  return null;
}

function withAlphaHex(color, alpha) {
  if (typeof color === 'string') {
    if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
      let hex = color.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }
    const rgbMatch = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (rgbMatch) {
      return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    }
  }
  return `rgba(122, 240, 255, ${alpha})`;
}

function drawStarPolygon(ctx, cx, cy, points, outerR, innerR) {
  const step = Math.PI / points;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function fillCapsule(ctx, x, y, w, h) {
  const r = Math.min(w, h) * 0.5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();
}

function drawRegularPolygon(ctx, cx, cy, sides, r, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * TAU) / sides;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} logicalWidth
   * @param {number} logicalHeight
   */
  constructor(canvas, logicalWidth = GAME_WIDTH, logicalHeight = GAME_HEIGHT) {
    this.canvas = canvas || null;
    this.ctx = this.canvas ? this.canvas.getContext('2d', { alpha: false }) : null;
    this.width = logicalWidth;
    this.height = logicalHeight;
    this.dpr = 1;

    this._stars = createStarfield();
    this._bulletStamps = new Map();
    this._gemStamps = new Map();
    this._playerBulletStamps = new Map();
    this._bgGradient = null;
  }

  resize() {
    if (!this.canvas) return;
    const rawDpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
    const dpr = clamp(rawDpr, 1, 2.5);
    this.dpr = dpr;

    const targetW = Math.round(this.width * dpr);
    const targetH = Math.round(this.height * dpr);
    if (this.canvas.width !== targetW) {
      this.canvas.width = targetW;
    }
    if (this.canvas.height !== targetH) {
      this.canvas.height = targetH;
    }
    this._bgGradient = null;
  }

  _getBulletStamp(shape, color, radius) {
    const rBucket = Math.max(2.5, Math.round(radius * 2) / 2);
    const safeShape = shape || 'orb';
    const safeColor = color || '#ff3b7f';
    const key = `${safeShape}|${safeColor}|${rBucket}`;

    let cached = this._bulletStamps.get(key);
    if (cached) return cached;

    const logicalSize = Math.ceil(rBucket * 5.2) + 6;
    const half = logicalSize * 0.5;
    const c = createOffscreenCanvas(logicalSize * STAMP_RES, logicalSize * STAMP_RES);
    if (!c) return null;

    const sctx = c.getContext('2d');
    if (!sctx) return null;
    sctx.scale(STAMP_RES, STAMP_RES);
    sctx.translate(half, half);

    const haloColor = safeColor.toLowerCase() === '#ffffff' ? '#7af0ff' : safeColor;

    // Baked soft outer glow (zero runtime shadowBlur cost)
    const glowR = safeShape === 'needle' || safeShape === 'rice' ? rBucket * 2.3 : rBucket * 2.15;
    const grad = sctx.createRadialGradient(0, 0, rBucket * 0.3, 0, 0, glowR);
    grad.addColorStop(0, withAlphaHex(haloColor, 0.5));
    grad.addColorStop(0.55, withAlphaHex(haloColor, 0.16));
    grad.addColorStop(1, withAlphaHex(haloColor, 0));
    sctx.fillStyle = grad;
    sctx.beginPath();
    sctx.arc(0, 0, glowR, 0, TAU);
    sctx.fill();

    if (safeShape === 'orb') {
      sctx.fillStyle = safeColor;
      sctx.beginPath();
      sctx.arc(0, 0, rBucket * 1.14, 0, TAU);
      sctx.fill();

      sctx.fillStyle = '#ffffff';
      sctx.beginPath();
      sctx.arc(0, 0, rBucket * 0.65, 0, TAU);
      sctx.fill();
    } else if (safeShape === 'ring') {
      sctx.strokeStyle = haloColor;
      sctx.lineWidth = Math.max(2.4, rBucket * 0.44);
      sctx.beginPath();
      sctx.arc(0, 0, rBucket * 1.05, 0, TAU);
      sctx.stroke();

      sctx.strokeStyle = '#ffffff';
      sctx.lineWidth = Math.max(1.2, rBucket * 0.2);
      sctx.beginPath();
      sctx.arc(0, 0, rBucket * 1.02, 0, TAU);
      sctx.stroke();
    } else if (safeShape === 'rice') {
      const len = rBucket * 2.05;
      const wid = rBucket * 0.96;

      sctx.fillStyle = safeColor;
      sctx.beginPath();
      sctx.moveTo(len, 0);
      sctx.quadraticCurveTo(0, wid, -len * 0.9, 0);
      sctx.quadraticCurveTo(0, -wid, len, 0);
      sctx.closePath();
      sctx.fill();

      sctx.fillStyle = '#ffffff';
      sctx.beginPath();
      sctx.moveTo(len * 0.68, 0);
      sctx.quadraticCurveTo(0, wid * 0.5, -len * 0.58, 0);
      sctx.quadraticCurveTo(0, -wid * 0.5, len * 0.68, 0);
      sctx.closePath();
      sctx.fill();
    } else if (safeShape === 'needle') {
      const tip = rBucket * 2.35;
      const tail = -rBucket * 1.65;
      const wing = rBucket * 0.88;

      sctx.fillStyle = safeColor;
      sctx.beginPath();
      sctx.moveTo(tip, 0);
      sctx.lineTo(-rBucket * 0.35, wing);
      sctx.lineTo(tail, 0);
      sctx.lineTo(-rBucket * 0.35, -wing);
      sctx.closePath();
      sctx.fill();

      sctx.fillStyle = '#ffffff';
      sctx.beginPath();
      sctx.moveTo(tip * 0.72, 0);
      sctx.lineTo(-rBucket * 0.32, wing * 0.44);
      sctx.lineTo(tail * 0.65, 0);
      sctx.lineTo(-rBucket * 0.32, -wing * 0.44);
      sctx.closePath();
      sctx.fill();
    } else if (safeShape === 'star') {
      sctx.fillStyle = safeColor;
      drawStarPolygon(sctx, 0, 0, 5, rBucket * 1.48, rBucket * 0.64);
      sctx.fill();

      sctx.fillStyle = '#ffffff';
      drawStarPolygon(sctx, 0, 0, 5, rBucket * 0.84, rBucket * 0.36);
      sctx.fill();
    }

    cached = {
      canvas: c,
      size: logicalSize,
      half,
      rotatable: safeShape === 'rice' || safeShape === 'needle' || safeShape === 'star',
    };
    this._bulletStamps.set(key, cached);
    return cached;
  }

  _getGemStamp(kind) {
    const key = kind === 'power' ? 'power' : 'score';
    let cached = this._gemStamps.get(key);
    if (cached) return cached;

    const logicalSize = 22;
    const half = logicalSize * 0.5;
    const c = createOffscreenCanvas(logicalSize * STAMP_RES, logicalSize * STAMP_RES);
    if (!c) return null;

    const sctx = c.getContext('2d');
    if (!sctx) return null;
    sctx.scale(STAMP_RES, STAMP_RES);
    sctx.translate(half, half);

    const isPower = key === 'power';
    const outerColor = isPower ? '#ff6fd8' : '#4deeea';
    const r = isPower ? 6.8 : 5.6;

    const grad = sctx.createRadialGradient(0, 0, 1, 0, 0, r * 1.7);
    grad.addColorStop(0, withAlphaHex(outerColor, 0.42));
    grad.addColorStop(1, withAlphaHex(outerColor, 0));
    sctx.fillStyle = grad;
    sctx.beginPath();
    sctx.arc(0, 0, r * 1.7, 0, TAU);
    sctx.fill();

    sctx.fillStyle = outerColor;
    sctx.beginPath();
    sctx.moveTo(0, -r);
    sctx.lineTo(r * 0.85, 0);
    sctx.lineTo(0, r);
    sctx.lineTo(-r * 0.85, 0);
    sctx.closePath();
    sctx.fill();

    sctx.fillStyle = '#ffffff';
    sctx.beginPath();
    sctx.moveTo(0, -r * 0.52);
    sctx.lineTo(r * 0.42, 0);
    sctx.lineTo(0, r * 0.52);
    sctx.lineTo(-r * 0.42, 0);
    sctx.closePath();
    sctx.fill();

    cached = { canvas: c, size: logicalSize, half };
    this._gemStamps.set(key, cached);
    return cached;
  }

  _getPlayerBulletStamp(kind, color) {
    const safeKind = kind || 'main';
    const safeColor = color || '#5ce1ff';
    const key = `${safeKind}|${safeColor}`;
    let cached = this._playerBulletStamps.get(key);
    if (cached) return cached;

    const logicalSize = 26;
    const half = logicalSize * 0.5;
    const c = createOffscreenCanvas(logicalSize * STAMP_RES, logicalSize * STAMP_RES);
    if (!c) return null;

    const sctx = c.getContext('2d');
    if (!sctx) return null;
    sctx.scale(STAMP_RES, STAMP_RES);
    sctx.translate(half, half);

    // Drawn pointing along +X (rotated by pb.angle)
    sctx.globalAlpha = 0.85;
    if (safeKind === 'homing') {
      sctx.fillStyle = safeColor;
      sctx.beginPath();
      sctx.moveTo(9, 0);
      sctx.lineTo(0, 4.2);
      sctx.lineTo(-7, 0);
      sctx.lineTo(0, -4.2);
      sctx.closePath();
      sctx.fill();

      sctx.fillStyle = '#ffffff';
      sctx.beginPath();
      sctx.moveTo(5.5, 0);
      sctx.lineTo(0, 2);
      sctx.lineTo(-3.5, 0);
      sctx.lineTo(0, -2);
      sctx.closePath();
      sctx.fill();
    } else if (safeKind === 'needle') {
      sctx.fillStyle = safeColor;
      fillCapsule(sctx, -8, -2.2, 17, 4.4);

      sctx.fillStyle = '#ffffff';
      fillCapsule(sctx, -5, -1, 11, 2);
    } else {
      sctx.fillStyle = safeColor;
      fillCapsule(sctx, -9, -3.1, 19, 6.2);

      sctx.fillStyle = '#ffffff';
      fillCapsule(sctx, -6, -1.4, 13, 2.8);
    }

    cached = { canvas: c, size: logicalSize, half };
    this._playerBulletStamps.set(key, cached);
    return cached;
  }

  render(state, nowSec = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;

    const scaleX = this.canvas.width / this.width;
    const scaleY = this.canvas.height / this.height;

    const shake = state && state.screenShake > 0.05 ? state.screenShake : 0;
    const shakeX = shake > 0 ? Math.sin(nowSec * 97.3) * shake * 0.65 : 0;
    const shakeY = shake > 0 ? Math.cos(nowSec * 113.7) * shake * 0.65 : 0;

    ctx.setTransform(scaleX, 0, 0, scaleY, shakeX * scaleX, shakeY * scaleY);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 1. Dark space backdrop & parallax starfield
    const scrollTime = state
      ? state.status === GAME_STATES.TITLE
        ? nowSec * 0.55
        : state.time
      : nowSec * 0.55;
    this._renderBackdrop(ctx, scrollTime, state);

    if (!state || state.status === GAME_STATES.TITLE) {
      // Calm ambient ship preview silhouette on title backdrop
      return;
    }

    // 2. Subtle POC line (Point of Collection)
    this._renderPocLine(ctx, state);

    // 3. Bomb Shockwave
    if (state.bombEffect && state.bombEffect.active) {
      this._renderBombEffect(ctx, state.bombEffect);
    }

    // 4. Gems
    this._renderGems(ctx, state.gems);

    // 5. Player Bullets
    this._renderPlayerBullets(ctx, state.playerBullets, scaleX, scaleY, shakeX, shakeY);

    // 6. Enemies & Boss Sigils
    this._renderEnemies(ctx, state.enemies, state.time || nowSec);

    // 7. Player Ship & Graze Ring (hull before enemy bullets)
    if (state.player) {
      this._renderPlayerShip(ctx, state.player, state.time || nowSec);
    }

    // 8. Enemy Bullets (high contrast core + halo stamps)
    this._renderEnemyBullets(ctx, state.enemyBullets, scaleX, scaleY, shakeX, shakeY);

    // 9. Player Hitbox Dot ON TOP of bullets so exact 3px core is never hidden
    if (state.player && state.status !== GAME_STATES.GAMEOVER) {
      this._renderPlayerHitbox(ctx, state.player);
    }

    // 10. Particles
    this._renderParticles(ctx, state.particles);

    // 11. Floating Texts
    this._renderFloatingTexts(ctx, state.floatingTexts);

    // 12. Warning / Spell Banner
    if (state.banner && state.banner.text && state.banner.maxDuration > 0) {
      this._renderBanner(ctx, state.banner);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  }

  _renderBackdrop(ctx, scrollTime, state) {
    if (!this._bgGradient) {
      const grad = ctx.createLinearGradient(0, 0, 0, this.height);
      grad.addColorStop(0, '#040614');
      grad.addColorStop(0.52, '#080d24');
      grad.addColorStop(1, '#050818');
      this._bgGradient = grad;
    }
    ctx.fillStyle = this._bgGradient;
    ctx.fillRect(-24, -24, this.width + 48, this.height + 48);

    // Very subtle sector grid lines so speed reads cleanly without competing with bullets
    ctx.strokeStyle = state?.bossActive ? 'rgba(255, 46, 122, 0.05)' : 'rgba(92, 150, 255, 0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.width * 0.25, 0);
    ctx.lineTo(this.width * 0.25, this.height);
    ctx.moveTo(this.width * 0.5, 0);
    ctx.lineTo(this.width * 0.5, this.height);
    ctx.moveTo(this.width * 0.75, 0);
    ctx.lineTo(this.width * 0.75, this.height);

    const gridSpacing = 160;
    const gridOffset = (scrollTime * 28) % gridSpacing;
    for (let y = gridOffset; y < this.height; y += gridSpacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();

    // Parallax stars
    const stars = this._stars;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const y = (s.y + scrollTime * s.speed) % this.height;
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  _renderPocLine(ctx, state) {
    const nearPoc = state.player && state.player.y <= POC_LINE_Y + 26;
    ctx.save();
    ctx.strokeStyle = nearPoc ? 'rgba(92, 225, 255, 0.34)' : 'rgba(92, 225, 255, 0.13)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(10, POC_LINE_Y);
    ctx.lineTo(this.width - 10, POC_LINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = nearPoc ? 'rgba(138, 243, 255, 0.65)' : 'rgba(138, 243, 255, 0.26)';
    ctx.font = '600 9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('POC // AUTO COLLECT', this.width - 12, POC_LINE_Y - 5);
    ctx.restore();
  }

  _renderBombEffect(ctx, be) {
    const progress = clamp(be.timer / Math.max(0.01, be.maxDuration), 0, 1);
    const alpha = Math.pow(1 - progress, 1.3);

    ctx.save();
    ctx.globalAlpha = alpha * 0.16;
    ctx.fillStyle = '#5ce1ff';
    ctx.beginPath();
    ctx.arc(be.x, be.y, be.radius, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = '#7af0ff';
    ctx.lineWidth = 5 * (1 - progress * 0.5);
    ctx.beginPath();
    ctx.arc(be.x, be.y, be.radius, 0, TAU);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.95;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(be.x, be.y, Math.max(6, be.radius * 0.86), 0, TAU);
    ctx.stroke();

    // 8 crisp geometric rays
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = '#9df7ff';
    ctx.lineWidth = 1.5;
    const baseRot = progress * 1.4;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = baseRot + (i * TAU) / 8;
      const rIn = be.radius * 0.25;
      const rOut = be.radius * 0.96;
      ctx.moveTo(be.x + Math.cos(a) * rIn, be.y + Math.sin(a) * rIn);
      ctx.lineTo(be.x + Math.cos(a) * rOut, be.y + Math.sin(a) * rOut);
    }
    ctx.stroke();
    ctx.restore();
  }

  _renderGems(ctx, gems) {
    if (!gems || gems.count <= 0) return;
    const items = gems.items;
    const count = gems.count;
    for (let i = 0; i < count; i++) {
      const g = items[i];
      const stamp = this._getGemStamp(g.kind);
      if (stamp) {
        ctx.drawImage(stamp.canvas, g.x - stamp.half, g.y - stamp.half, stamp.size, stamp.size);
      } else {
        ctx.fillStyle = g.kind === 'power' ? '#ff6fd8' : '#4deeea';
        ctx.fillRect(g.x - 4, g.y - 4, 8, 8);
      }
    }
  }

  _renderPlayerBullets(ctx, pool, scaleX, scaleY, shakeX, shakeY) {
    if (!pool || pool.count <= 0) return;
    const items = pool.items;
    const count = pool.count;

    for (let i = 0; i < count; i++) {
      const pb = items[i];
      const stamp = this._getPlayerBulletStamp(pb.kind, pb.color);
      if (stamp) {
        const c = Math.cos(pb.angle);
        const s = Math.sin(pb.angle);
        ctx.setTransform(
          c * scaleX,
          s * scaleY,
          -s * scaleX,
          c * scaleY,
          (pb.x + shakeX) * scaleX,
          (pb.y + shakeY) * scaleY,
        );
        ctx.drawImage(stamp.canvas, -stamp.half, -stamp.half, stamp.size, stamp.size);
      } else {
        ctx.fillStyle = pb.color || '#5ce1ff';
        ctx.fillRect(pb.x - 2, pb.y - 7, 4, 14);
      }
    }
    ctx.setTransform(scaleX, 0, 0, scaleY, shakeX * scaleX, shakeY * scaleY);
  }

  _renderEnemies(ctx, enemies, timeSec) {
    if (!enemies || enemies.length === 0) return;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const isFlash = e.hitFlash > 0;
      const color = isFlash ? '#ffffff' : e.color || '#ff4d8d';
      const r = e.radius || 16;

      // Boss / Midboss sigil + radial HP ring
      if (e.isBoss || e.isMidboss) {
        this._renderBossSigilAndArc(ctx, e, timeSec);
      }

      ctx.save();
      ctx.translate(e.x, e.y);

      switch (e.shape) {
        case 'hex': {
          ctx.rotate(e.angle);
          ctx.fillStyle = withAlphaHex(color, 0.24);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.2;
          drawRegularPolygon(ctx, 0, 0, 6, r, 0);
          ctx.fill();
          ctx.stroke();

          ctx.rotate(-e.angle * 2);
          ctx.fillStyle = isFlash ? '#ffffff' : '#0b1026';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          drawRegularPolygon(ctx, 0, 0, 3, r * 0.56, 0);
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'chevron': {
          ctx.fillStyle = withAlphaHex(color, 0.28);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(0, r * 0.95);
          ctx.lineTo(r * 1.15, -r * 0.35);
          ctx.lineTo(r * 0.55, -r * 0.85);
          ctx.lineTo(0, -r * 0.35);
          ctx.lineTo(-r * 0.55, -r * 0.85);
          ctx.lineTo(-r * 1.15, -r * 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, r * 0.15, r * 0.26, 0, TAU);
          ctx.fill();
          break;
        }
        case 'diamond': {
          ctx.rotate(e.angle * 0.65);
          ctx.fillStyle = withAlphaHex(color, 0.26);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.2;
          drawRegularPolygon(ctx, 0, 0, 4, r, 0);
          ctx.fill();
          ctx.stroke();

          ctx.rotate(Math.PI / 4);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          drawRegularPolygon(ctx, 0, 0, 4, r * 0.52, 0);
          ctx.stroke();
          break;
        }
        case 'seraph': {
          ctx.fillStyle = withAlphaHex(color, 0.24);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(0, r * 1.05);
          ctx.lineTo(r * 0.48, r * 0.2);
          ctx.lineTo(r * 1.28, -r * 0.22);
          ctx.lineTo(r * 0.65, -r * 0.85);
          ctx.lineTo(0, -r * 0.42);
          ctx.lineTo(-r * 0.65, -r * 0.85);
          ctx.lineTo(-r * 1.28, -r * 0.22);
          ctx.lineTo(-r * 0.48, r * 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffd166';
          drawRegularPolygon(ctx, 0, 0, 4, r * 0.36, e.angle);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.16, 0, TAU);
          ctx.fill();
          break;
        }
        case 'eclipse': {
          // Outer crescent wing chassis
          ctx.fillStyle = withAlphaHex(color, 0.24);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(0, r * 1.08);
          ctx.lineTo(r * 0.56, r * 0.36);
          ctx.lineTo(r * 1.32, -r * 0.1);
          ctx.lineTo(r * 0.84, -r * 0.86);
          ctx.lineTo(r * 0.3, -r * 0.48);
          ctx.lineTo(0, -r * 0.96);
          ctx.lineTo(-r * 0.3, -r * 0.48);
          ctx.lineTo(-r * 0.84, -r * 0.86);
          ctx.lineTo(-r * 1.32, -r * 0.1);
          ctx.lineTo(-r * 0.56, r * 0.36);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Central eclipse core
          ctx.fillStyle = '#090b1d';
          ctx.strokeStyle = '#ffd166';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.46, 0, TAU);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isFlash ? '#ffffff' : '#ff2e7a';
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.28, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.13, 0, TAU);
          ctx.fill();
          break;
        }
        case 'dart':
        default: {
          ctx.fillStyle = withAlphaHex(color, 0.26);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, r * 1.05);
          ctx.lineTo(r * 0.95, -r * 0.55);
          ctx.lineTo(0, -r * 0.22);
          ctx.lineTo(-r * 0.95, -r * 0.55);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, r * 0.14, r * 0.22, 0, TAU);
          ctx.fill();
          break;
        }
      }

      ctx.restore();

      // Compact HP micro-bar on damaged regular enemies
      if (!e.isBoss && !e.isMidboss && e.hp < e.maxHp && e.maxHp > 0) {
        const barW = Math.max(22, r * 1.8);
        const bx = e.x - barW * 0.5;
        const by = e.y - r - 9;
        const ratio = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(5, 7, 20, 0.78)';
        ctx.fillRect(bx, by, barW, 3);
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, barW * ratio, 3);
      }
    }
  }

  _renderBossSigilAndArc(ctx, boss, timeSec) {
    const r = boss.radius || 36;
    const sigilColor = boss.isMidboss ? '#ff8a3d' : '#ff2e7a';
    const ratio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);

    ctx.save();
    ctx.translate(boss.x, boss.y);

    // Outer rotating celestial sigil
    ctx.save();
    ctx.rotate(timeSec * 0.45);
    ctx.strokeStyle = withAlphaHex(sigilColor, 0.28);
    ctx.lineWidth = 1.4;
    drawRegularPolygon(ctx, 0, 0, 8, r + 24, 0);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.rotate(-timeSec * 0.6);
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 18, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // Radial HP ring
    const arcR = r + 12;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, arcR, 0, TAU);
    ctx.stroke();

    if (ratio > 0) {
      ctx.strokeStyle = boss.isMidboss ? '#ff8a3d' : '#ff3b7f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, arcR, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
      ctx.stroke();
    }

    ctx.restore();
  }

  _renderPlayerShip(ctx, player, timeSec) {
    const isInvuln = player.invulnTimer > 0;
    const blinkHidden = isInvuln && Math.floor(timeSec * 20) % 2 === 1;
    const bank = clamp((player.vx || 0) / 480, -0.22, 0.22);

    ctx.save();
    ctx.translate(player.x, player.y);

    // Subtle graze radius indicator ring
    ctx.save();
    ctx.rotate(timeSec * (player.slowMode ? 1.5 : 0.65));
    ctx.strokeStyle = player.slowMode
      ? 'rgba(138, 243, 255, 0.48)'
      : 'rgba(92, 225, 255, 0.24)';
    ctx.lineWidth = player.slowMode ? 1.5 : 1.1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, player.grazeRadius || 22, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // Invulnerability shield ring
    if (isInvuln) {
      ctx.strokeStyle = 'rgba(122, 240, 255, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, TAU);
      ctx.stroke();
    }

    // Hit flash ring
    if (player.flashTimer > 0) {
      ctx.strokeStyle = 'rgba(255, 59, 127, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 32 * (1 - player.flashTimer), 0, TAU);
      ctx.stroke();
    }

    ctx.globalAlpha = blinkHidden ? 0.36 : 1;
    ctx.scale(1 - Math.abs(bank) * 0.3, 1);
    ctx.rotate(bank * 0.35);

    // Thruster flame
    const flameLen = 10 + Math.sin(timeSec * 48) * 3;
    ctx.fillStyle = '#38f2ff';
    ctx.beginPath();
    ctx.moveTo(-4.5, 11);
    ctx.lineTo(0, 12 + flameLen);
    ctx.lineTo(4.5, 11);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-2.2, 11);
    ctx.lineTo(0, 10 + flameLen * 0.62);
    ctx.lineTo(2.2, 11);
    ctx.closePath();
    ctx.fill();

    // Wings
    ctx.fillStyle = '#1e5fd9';
    ctx.strokeStyle = '#5ce1ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(17, 11);
    ctx.lineTo(6.5, 8.5);
    ctx.lineTo(0, 12);
    ctx.lineTo(-6.5, 8.5);
    ctx.lineTo(-17, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Forward fuselage
    ctx.fillStyle = '#baf4ff';
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 10.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _renderEnemyBullets(ctx, pool, scaleX, scaleY, shakeX, shakeY) {
    if (!pool || pool.count <= 0) return;
    const items = pool.items;
    const count = pool.count;
    let transformDirty = false;

    for (let i = 0; i < count; i++) {
      const b = items[i];
      const stamp = this._getBulletStamp(b.shape, b.color, b.radius);
      if (!stamp) {
        if (transformDirty) {
          ctx.setTransform(scaleX, 0, 0, scaleY, shakeX * scaleX, shakeY * scaleY);
          transformDirty = false;
        }
        ctx.fillStyle = b.color || '#ff3b7f';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 1.1, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 0.6, 0, TAU);
        ctx.fill();
        continue;
      }

      if (stamp.rotatable) {
        const c = Math.cos(b.angle);
        const s = Math.sin(b.angle);
        ctx.setTransform(
          c * scaleX,
          s * scaleY,
          -s * scaleX,
          c * scaleY,
          (b.x + shakeX) * scaleX,
          (b.y + shakeY) * scaleY,
        );
        ctx.drawImage(stamp.canvas, -stamp.half, -stamp.half, stamp.size, stamp.size);
        transformDirty = true;
      } else {
        if (transformDirty) {
          ctx.setTransform(scaleX, 0, 0, scaleY, shakeX * scaleX, shakeY * scaleY);
          transformDirty = false;
        }
        ctx.drawImage(stamp.canvas, b.x - stamp.half, b.y - stamp.half, stamp.size, stamp.size);
      }
    }

    if (transformDirty) {
      ctx.setTransform(scaleX, 0, 0, scaleY, shakeX * scaleX, shakeY * scaleY);
    }
  }

  _renderPlayerHitbox(ctx, player) {
    const r = player.radius || 3;
    const px = player.x;
    const py = player.y;

    // Outer high-contrast target ring + crisp white 3px collision center
    ctx.strokeStyle = 'rgba(255, 46, 126, 0.88)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(px, py, r + 3.2, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = '#ff2e7e';
    ctx.beginPath();
    ctx.arc(px, py, r + 1.1, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fill();
  }

  _renderParticles(ctx, pool) {
    if (!pool || pool.count <= 0) return;
    const items = pool.items;
    const count = pool.count;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const p = items[i];
      if (p.alpha <= 0.02) continue;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color || '#ffffff';
      const s = p.size || 2.5;
      if (p.shape === 'spark') {
        ctx.fillRect(p.x - s * 0.65, p.y - s * 0.65, s * 1.3, s * 1.3);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _renderFloatingTexts(ctx, pool) {
    if (!pool || pool.count <= 0) return;
    const items = pool.items;
    const count = pool.count;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(4, 6, 18, 0.92)';

    for (let i = 0; i < count; i++) {
      const ft = items[i];
      if (!ft.text || ft.alpha <= 0.02) continue;
      const fontSize = Math.round(13 * (ft.scale || 1));
      ctx.globalAlpha = ft.alpha;
      ctx.font = `700 ${fontSize}px monospace`;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color || '#ffffff';
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.restore();
  }

  _renderBanner(ctx, banner) {
    const progress = clamp(banner.timer / Math.max(0.01, banner.maxDuration), 0, 1);
    let alpha = 1;
    if (progress < 0.14) {
      alpha = progress / 0.14;
    } else if (progress > 0.8) {
      alpha = (1 - progress) / 0.2;
    }
    if (alpha <= 0.01) return;

    const isWarning = banner.text.includes('WARNING');
    const accent = isWarning ? '#ff3b7f' : '#ffd166';
    const centerY = 236;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(6, 9, 24, 0.86)';
    ctx.fillRect(16, centerY - 26, this.width - 32, 52);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, centerY - 26);
    ctx.lineTo(this.width - 16, centerY - 26);
    ctx.moveTo(16, centerY + 26);
    ctx.lineTo(this.width - 16, centerY + 26);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.font = '700 13px monospace';
    ctx.fillText(banner.text, this.width * 0.5, banner.subtitle ? centerY - 8 : centerY);

    if (banner.subtitle) {
      ctx.fillStyle = '#dce7ff';
      ctx.font = '500 11px monospace';
      ctx.fillText(banner.subtitle, this.width * 0.5, centerY + 11);
    }
    ctx.restore();
  }
}
