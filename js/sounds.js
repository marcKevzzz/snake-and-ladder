// ============================================================
// Sound Manager — Web Audio API Generated Sound Effects
// ============================================================

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;
  }

  /** Lazily create AudioContext (requires user gesture) */
  _ensureContext() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.initialized = true;
      } catch (e) {
        console.warn('Web Audio API not available:', e);
        return false;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return true;
  }

  /** Play a tone with given parameters */
  _playTone(freq, duration, type = 'sine', volume = 0.3, rampDown = true) {
    if (this.muted || !this._ensureContext()) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    if (rampDown) {
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    }
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  /** Play noise burst (for dice rattle) */
  _playNoise(duration, volume = 0.15) {
    if (this.muted || !this._ensureContext()) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.5;
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
    source.stop(this.ctx.currentTime + duration);
  }

  /** Dice rolling rattle sound */
  playDiceRoll() {
    // Multiple quick noise bursts for rattle effect
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this._playNoise(0.06, 0.1), i * 80);
    }
    // Landing thud
    setTimeout(() => {
      this._playTone(120, 0.15, 'sine', 0.25);
    }, 500);
  }

  /** Soft pop for pawn hopping */
  playPawnHop() {
    this._playTone(600, 0.08, 'sine', 0.15);
    setTimeout(() => this._playTone(800, 0.06, 'sine', 0.1), 30);
  }

  /** Descending hiss for snake bite */
  playSnakeHiss() {
    if (this.muted || !this._ensureContext()) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.7);
    // Hiss noise overlay
    this._playNoise(0.5, 0.08);
  }

  /** Ascending tone for ladder climb */
  playLadderClimb() {
    if (this.muted || !this._ensureContext()) return;
    const notes = [400, 500, 600, 700, 800];
    notes.forEach((freq, i) => {
      setTimeout(() => this._playTone(freq, 0.12, 'triangle', 0.15), i * 80);
    });
  }

  /** Victory fanfare chord */
  playWinFanfare() {
    if (this.muted || !this._ensureContext()) return;
    // C major chord arpeggio
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    const durations = [0.2, 0.2, 0.2, 0.4, 0.15, 0.15, 0.6];
    let time = 0;
    notes.forEach((freq, i) => {
      setTimeout(() => this._playTone(freq, durations[i], 'triangle', 0.2), time);
      time += durations[i] * 600;
    });
  }

  /** Button click sound */
  playClick() {
    this._playTone(1000, 0.05, 'sine', 0.1);
  }

  /** Extra turn (rolled a 6) jingle */
  playExtraTurn() {
    this._playTone(880, 0.1, 'triangle', 0.15);
    setTimeout(() => this._playTone(1100, 0.15, 'triangle', 0.15), 100);
  }

  /** Toggle mute state */
  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  /** Set mute state */
  setMute(muted) {
    this.muted = muted;
  }
}
