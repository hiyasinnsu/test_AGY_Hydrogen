export class InputController {
  /**
   * @param {HTMLCanvasElement|null} canvas
   * @param {number} logicalWidth
   * @param {number} logicalHeight
   * @param {object} [callbacks]
   * @param {() => void} [callbacks.onPause]
   * @param {() => void} [callbacks.onBomb]
   * @param {() => void} [callbacks.onFirstGesture]
   */
  constructor(canvas, logicalWidth = 450, logicalHeight = 800, callbacks = {}) {
    this._canvas = canvas || null;
    this._logicalWidth = logicalWidth;
    this._logicalHeight = logicalHeight;
    this._onPause = typeof callbacks?.onPause === 'function' ? callbacks.onPause : null;
    this._onBomb = typeof callbacks?.onBomb === 'function' ? callbacks.onBomb : null;
    this._onFirstGesture =
      typeof callbacks?.onFirstGesture === 'function' ? callbacks.onFirstGesture : null;

    this._sensitivity = 1.0;
    this._firstGestureFired = false;

    // Touch / pointer relative drag state
    this._primaryPointerId = null;
    this._secondaryPointers = new Set();
    this._lastClientX = 0;
    this._lastClientY = 0;
    this._pendingDx = 0;
    this._pendingDy = 0;
    this._bombRequested = false;

    // Keyboard state
    this._held = {
      left: false,
      right: false,
      up: false,
      down: false,
      shift: false,
    };

    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onPointerCancel = this._handlePointerUp.bind(this);
    this._onLostCapture = this._handlePointerUp.bind(this);
    this._onContextMenu = (e) => e.preventDefault();
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onBlur = () => this.reset();

    if (this._canvas) {
      if (this._canvas.style) {
        this._canvas.style.touchAction = 'none';
      }
      this._canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
      this._canvas.addEventListener('pointermove', this._onPointerMove, { passive: false });
      this._canvas.addEventListener('pointerup', this._onPointerUp);
      this._canvas.addEventListener('pointercancel', this._onPointerCancel);
      this._canvas.addEventListener('lostpointercapture', this._onLostCapture);
      this._canvas.addEventListener('contextmenu', this._onContextMenu);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      window.addEventListener('blur', this._onBlur);
    }
  }

  setSensitivity(mult) {
    const parsed = Number(mult);
    if (Number.isFinite(parsed) && parsed > 0) {
      this._sensitivity = Math.max(0.25, Math.min(3.0, parsed));
    }
  }

  getSensitivity() {
    return this._sensitivity;
  }

  _fireFirstGesture() {
    if (!this._firstGestureFired) {
      this._firstGestureFired = true;
      this._onFirstGesture?.();
    }
  }

  _requestBomb() {
    this._bombRequested = true;
    this._onBomb?.();
  }

  _handlePointerDown(e) {
    this._fireFirstGesture();
    if (e.cancelable) {
      e.preventDefault();
    }

    if (this._primaryPointerId === null) {
      if (e.pointerType === 'mouse' && e.button !== 0) {
        return;
      }
      this._primaryPointerId = e.pointerId;
      this._lastClientX = e.clientX;
      this._lastClientY = e.clientY;
      try {
        this._canvas?.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported or unavailable
      }
      return;
    }

    if (e.pointerId !== this._primaryPointerId) {
      if (!this._secondaryPointers.has(e.pointerId)) {
        this._secondaryPointers.add(e.pointerId);
        // Second-finger tap on touch/pen triggers bomb without interrupting primary drag
        if (e.pointerType !== 'mouse') {
          this._requestBomb();
        }
      }
    }
  }

  _handlePointerMove(e) {
    if (e.pointerId !== this._primaryPointerId) {
      return;
    }
    if (e.cancelable) {
      e.preventDefault();
    }

    const rect = this._canvas?.getBoundingClientRect?.();
    const scaleX = rect && rect.width > 0 ? this._logicalWidth / rect.width : 1;
    const scaleY = rect && rect.height > 0 ? this._logicalHeight / rect.height : 1;

    const dx = (e.clientX - this._lastClientX) * scaleX * this._sensitivity;
    const dy = (e.clientY - this._lastClientY) * scaleY * this._sensitivity;

    if (Number.isFinite(dx)) this._pendingDx += dx;
    if (Number.isFinite(dy)) this._pendingDy += dy;

    this._lastClientX = e.clientX;
    this._lastClientY = e.clientY;
  }

  _handlePointerUp(e) {
    if (e.pointerId === this._primaryPointerId) {
      this._primaryPointerId = null;
      try {
        if (this._canvas?.hasPointerCapture?.(e.pointerId)) {
          this._canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
    } else {
      this._secondaryPointers.delete(e.pointerId);
    }
  }

  _handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    const targetTag = e.target?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
      return;
    }

    this._fireFirstGesture();

    const code = e.code || e.key;
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA':
      case 'a':
      case 'A':
        this._held.left = true;
        if (code === 'ArrowLeft') e.preventDefault();
        break;
      case 'ArrowRight':
      case 'KeyD':
      case 'd':
      case 'D':
        this._held.right = true;
        if (code === 'ArrowRight') e.preventDefault();
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'w':
      case 'W':
        this._held.up = true;
        if (code === 'ArrowUp') e.preventDefault();
        break;
      case 'ArrowDown':
      case 'KeyS':
      case 's':
      case 'S':
        this._held.down = true;
        if (code === 'ArrowDown') e.preventDefault();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'Shift':
        this._held.shift = true;
        break;
      case 'KeyZ':
      case 'z':
      case 'Z':
      case 'Space':
      case ' ':
        if (code === 'Space' || code === ' ') e.preventDefault();
        if (!e.repeat) {
          this._requestBomb();
        }
        break;
      case 'KeyP':
      case 'p':
      case 'P':
      case 'Escape':
        if (!e.repeat) {
          this._onPause?.();
        }
        break;
      default:
        break;
    }
  }

  _handleKeyUp(e) {
    const code = e.code || e.key;
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA':
      case 'a':
      case 'A':
        this._held.left = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
      case 'd':
      case 'D':
        this._held.right = false;
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'w':
      case 'W':
        this._held.up = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
      case 's':
      case 'S':
        this._held.down = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'Shift':
        this._held.shift = false;
        break;
      default:
        break;
    }
  }

  consumeFrameInput() {
    let moveX = (this._held.right ? 1 : 0) - (this._held.left ? 1 : 0);
    let moveY = (this._held.down ? 1 : 0) - (this._held.up ? 1 : 0);
    if (moveX !== 0 && moveY !== 0) {
      moveX *= Math.SQRT1_2;
      moveY *= Math.SQRT1_2;
    }

    const dx = this._pendingDx;
    const dy = this._pendingDy;
    this._pendingDx = 0;
    this._pendingDy = 0;

    const triggerBomb = this._bombRequested;
    this._bombRequested = false;

    return {
      dx,
      dy,
      moveX,
      moveY,
      firing: true,
      triggerBomb,
      slowMode: this._held.shift,
    };
  }

  reset() {
    this._primaryPointerId = null;
    this._secondaryPointers.clear();
    this._pendingDx = 0;
    this._pendingDy = 0;
    this._bombRequested = false;
    this._held.left = false;
    this._held.right = false;
    this._held.up = false;
    this._held.down = false;
    this._held.shift = false;
  }

  destroy() {
    this.reset();
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onPointerDown);
      this._canvas.removeEventListener('pointermove', this._onPointerMove);
      this._canvas.removeEventListener('pointerup', this._onPointerUp);
      this._canvas.removeEventListener('pointercancel', this._onPointerCancel);
      this._canvas.removeEventListener('lostpointercapture', this._onLostCapture);
      this._canvas.removeEventListener('contextmenu', this._onContextMenu);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('blur', this._onBlur);
    }
  }
}
