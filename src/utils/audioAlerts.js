/**
 * Centralized Audio Notification Manager
 * Milestone M3 (Requirement R4)
 * 
 * Features:
 * - Plays sound EXCLUSIVELY for new incoming orders
 * - Deduplicates alerts via an order ID suppression window (30 seconds)
 * - Autoplay unlocking gesture handler & banner
 * - Graceful fallback to Web Audio API synthesized chimes
 */

class AudioAlertManager {
  constructor() {
    this.suppressionWindowMs = 30000; // 30 seconds
    this.seenOrderAlerts = new Map(); // orderId -> timestamp
    this.isUnlocked = false;
    this.soundEnabled = true;
    this.audioCtx = null;
    this.audioElement = null;

    if (typeof window !== 'undefined') {
      this.initUserGestureListener();
    }
  }

  /**
   * Check if sound alert should be played for an order
   * @param {string} orderId 
   * @returns {boolean}
   */
  shouldPlayAlert(orderId) {
    if (!orderId) return true;
    const now = Date.now();
    const lastAlertTime = this.seenOrderAlerts.get(String(orderId));
    if (lastAlertTime && (now - lastAlertTime) < this.suppressionWindowMs) {
      return false; // Suppressed: duplicate within 30s
    }
    this.seenOrderAlerts.set(String(orderId), now);
    // Cleanup old keys (older than 2 minutes)
    if (this.seenOrderAlerts.size > 200) {
      for (const [id, time] of this.seenOrderAlerts.entries()) {
        if (now - time > 120000) {
          this.seenOrderAlerts.delete(id);
        }
      }
    }
    return true;
  }

  /**
   * Initialize user gesture listener to unlock Web Audio context and HTMLAudioElement
   */
  initUserGestureListener() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const unlockHandler = () => {
      this.unlockAudio();
      window.removeEventListener('click', unlockHandler, true);
      window.removeEventListener('keydown', unlockHandler, true);
      window.removeEventListener('touchstart', unlockHandler, true);
    };

    window.addEventListener('click', unlockHandler, true);
    window.addEventListener('keydown', unlockHandler, true);
    window.addEventListener('touchstart', unlockHandler, true);
  }

  /**
   * Unlock AudioContext on user interaction
   */
  unlockAudio() {
    this.isUnlocked = true;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioCtx) {
          this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
      }
    } catch (_) {}

    // Dispatch custom event indicating audio was unlocked
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('AUDIO_UNLOCKED'));
    }
  }

  /**
   * Check whether audio is unlocked
   */
  isAudioUnlocked() {
    return this.isUnlocked;
  }

  /**
   * Set global sound mute / unmute state
   * @param {boolean} enabled 
   */
  setSoundEnabled(enabled) {
    this.soundEnabled = Boolean(enabled);
  }

  /**
   * Play crystal chime for a new incoming order
   * @param {string} orderId - Unique order identifier
   * @param {object} [options]
   * @param {boolean} [options.force] - Bypass suppression window (e.g. testing)
   * @returns {boolean} True if sound triggered, false if suppressed or muted
   */
  playNewOrderAlert(orderId, options = {}) {
    if (!this.soundEnabled) return false;

    if (!options.force && orderId && !this.shouldPlayAlert(orderId)) {
      return false; // Suppressed by deduplication window
    }

    if (typeof window === 'undefined') {
      return true; // Headless/test environment acknowledgment
    }

    // Try HTMLAudioElement first
    try {
      if (!this.audioElement) {
        this.audioElement = new Audio('/notification.mp3');
      }
      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Fallback to Web Audio synthesis if HTML audio is blocked or file not found
          this.playSynthesizedChime();
        });
      }
    } catch (_) {
      this.playSynthesizedChime();
    }

    return true;
  }

  /**
   * Web Audio API synthesized crystal chime
   */
  playSynthesizedChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      const now = this.audioCtx.currentTime;
      // Two-tone bell chime: D5 (587.33 Hz) followed by A5 (880 Hz)
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc1.start(now);
      osc2.start(now + 0.1);
      osc1.stop(now + 0.8);
      osc2.stop(now + 0.8);
    } catch (_) {}
  }

  /**
   * Render an autoplay unlocking banner if audio is not yet unlocked
   * @param {HTMLElement} container 
   */
  renderAutoplayBanner(container) {
    if (this.isUnlocked || typeof document === 'undefined' || !container || typeof container.querySelector !== 'function' || typeof container.prepend !== 'function') return;

    let banner = container.querySelector('#audio-autoplay-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'audio-autoplay-banner';
      banner.className = 'bg-indigo-900 text-white text-xs px-4 py-2 flex items-center justify-between cursor-pointer transition-all shadow-md';
      banner.innerHTML = `
        <div class="flex items-center space-x-2">
          <span>🔔</span>
          <span class="font-medium">Audio notifications are muted by browser. Click here to enable live kitchen chimes.</span>
        </div>
        <button class="bg-indigo-700 hover:bg-indigo-600 px-3 py-1 rounded-md text-[11px] font-bold">
          Enable Sound
        </button>
      `;
      banner.addEventListener('click', () => {
        this.unlockAudio();
        banner.remove();
      });
      container.prepend(banner);
    }
  }

  /**
   * Reset internal state for test suites
   */
  _resetForTesting() {
    this.seenOrderAlerts.clear();
    this.soundEnabled = true;
    this.isUnlocked = false;
  }
}

export const audioAlertManager = new AudioAlertManager();
export default audioAlertManager;
