export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let engineFilter = null;
  let wind = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);

    engine = ctx.createOscillator();
    engine.type = 'sawtooth';
    engine.frequency.value = 55;
    const engine2 = ctx.createOscillator();
    engine2.type = 'triangle';
    engine2.frequency.value = 110;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 240;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.18;
    engine.connect(engineFilter);
    engine2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engine.start();
    engine2.start();
    engine.extra = engine2;
    engine.gain = engineGain;

    const length = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let n = 0;
    for (let i = 0; i < length; i += 1) {
      n = (n + 0.02) % 1;
      data[i] = Math.random() * 2 - 1;
    }
    wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    wind.start();
    wind.gain = windGain;
    started = true;
  }

  function blip(freq, dur, type, gainValue) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gainValue, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  return {
    start() {
      ensure();
      if (ctx?.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.22;
      return muted;
    },
    get muted() {
      return muted;
    },
    update(state) {
      if (!started || !ctx || muted) return;
      const t = state.throttle;
      const spd = state.speed;
      const base = 48 + t * 90 + Math.min(40, spd * 0.18);
      engine.frequency.setTargetAtTime(base, ctx.currentTime, 0.08);
      engine.extra.frequency.setTargetAtTime(base * 2.02, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(180 + t * 900, ctx.currentTime, 0.1);
      engine.gain.gain.setTargetAtTime(0.04 + t * 0.22 + Math.min(0.08, spd / 2000), ctx.currentTime, 0.08);
      const air = state.onGround ? Math.min(0.05, spd / 900) : Math.min(0.16, spd / 700);
      wind.gain.gain.setTargetAtTime(air, ctx.currentTime, 0.1);
      windFilter.frequency.setTargetAtTime(380 + spd * 3, ctx.currentTime, 0.1);
    },
    touchdown(hard) {
      blip(hard ? 70 : 110, 0.28, 'sine', hard ? 0.5 : 0.28);
    },
    crash() {
      blip(50, 0.7, 'sawtooth', 0.4);
    },
    callout() {
      blip(660, 0.07, 'square', 0.04);
    },
  };
}
