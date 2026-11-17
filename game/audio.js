// NOVA DRIFT — sound. Every effect is synthesized live with WebAudio:
// no audio files, no network, nothing to load. Created lazily on the
// first user gesture (browser autoplay policy) and silenced with M.

const AudioSys = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  let drone = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.42;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone({ type = 'sine', from = 440, to = null, dur = 0.12, vol = 0.5, delay = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.25, vol = 0.5, freq = 1200, delay = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(freq, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(master);
    src.start(t0);
  }

  function startDrone() {
    if (!ensure() || drone || muted) return;
    const g = ctx.createGain();
    g.gain.value = 0.045;
    g.connect(master);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o1.frequency.value = 55;
    o2.type = 'sawtooth'; o2.frequency.value = 55.7;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 220;
    o1.connect(filt); o2.connect(filt);
    filt.connect(g);
    o1.start(); o2.start();
    drone = { o1, o2, g };
  }

  function stopDrone() {
    if (!drone) return;
    try { drone.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4); } catch (e) { /* already gone */ }
    const d = drone; drone = null;
    setTimeout(() => { try { d.o1.stop(); d.o2.stop(); } catch (e) { /* already stopped */ } }, 500);
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.42;
      if (muted) stopDrone();
      return muted;
    },
    isMuted() { return muted; },
    shoot() { tone({ type: 'square', from: 880 + Math.random() * 120, to: 220, dur: 0.09, vol: 0.16 }); },
    enemyShoot() { tone({ type: 'sawtooth', from: 320, to: 140, dur: 0.16, vol: 0.12 }); },
    explode(big = false) {
      noise({ dur: big ? 0.5 : 0.28, vol: big ? 0.6 : 0.35, freq: big ? 900 : 1600 });
      tone({ type: 'sine', from: big ? 160 : 220, to: 40, dur: big ? 0.45 : 0.25, vol: 0.5 });
    },
    playerHit() {
      tone({ type: 'sawtooth', from: 300, to: 55, dur: 0.4, vol: 0.55 });
      noise({ dur: 0.3, vol: 0.4, freq: 700 });
    },
    powerup() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.14, vol: 0.3, delay: i * 0.07 }));
    },
    dash() { noise({ dur: 0.18, vol: 0.22, freq: 3200 }); },
    nova() {
      noise({ dur: 0.7, vol: 0.6, freq: 2400 });
      tone({ type: 'sine', from: 90, to: 30, dur: 0.7, vol: 0.6 });
      [392, 523, 659].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.2, vol: 0.25, delay: 0.1 + i * 0.06 }));
    },
    waveHorn() {
      tone({ type: 'triangle', from: 220, dur: 0.22, vol: 0.35 });
      tone({ type: 'triangle', from: 330, dur: 0.3, vol: 0.35, delay: 0.16 });
    },
    waveClear() {
      [659, 784, 988].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.16, vol: 0.3, delay: i * 0.08 }));
    },
    gameOver() {
      [392, 311, 262, 196].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.34, vol: 0.35, delay: i * 0.22 }));
    },
    startDrone,
    stopDrone,
  };
})();

export default AudioSys;
