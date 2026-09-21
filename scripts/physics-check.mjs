import { createFlightState, stepFlight } from '../src/physics.js';
import { createAutopilot } from '../src/autopilot.js';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function fail(msg) {
  console.error('FAILED:', msg);
  process.exit(1);
}

const dt = 1 / 60;

function fly(state, input, seconds) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i += 1) stepFlight(state, input, dt);
}

// Control signs. Nose-up input must raise pitch. Left roll must bank left (negative bankDeg).
{
  const s = createFlightState();
  s.onGround = false;
  s.everAirborne = true;
  s.airTime = 5;
  s.position.y = 250;
  s.velocity.set(0, 0, -80);
  const p0 = s.pitchDeg;
  fly(s, { pitch: 1, roll: 0, yaw: 0, throttleUp: true, brake: false }, 0.6);
  if (!(s.pitchDeg > p0 + 4)) fail(`pitch up did not raise the nose (${p0.toFixed(1)} -> ${s.pitchDeg.toFixed(1)})`);
  const b0 = s.bankDeg;
  fly(s, { pitch: 0, roll: 1, yaw: 0, throttleUp: true, brake: false }, 0.45);
  if (!(s.bankDeg < b0 - 8)) fail(`roll left did not bank left (${b0.toFixed(1)} -> ${s.bankDeg.toFixed(1)})`);
  const h0 = s.headingDeg;
  fly(s, { pitch: 0, roll: 0, yaw: 1, throttleUp: false, brake: false }, 0.7);
  const dh = ((s.headingDeg - h0 + 540) % 360) - 180;
  if (!(dh < -2)) fail(`yaw left did not turn left (${h0.toFixed(1)} -> ${s.headingDeg.toFixed(1)})`);
  console.log('control signs ok', {
    pitch: s.pitchDeg.toFixed(1),
    bank: s.bankDeg.toFixed(1),
    heading: s.headingDeg.toFixed(1),
  });
}

// Full circuit with the same autopilot the browser uses.
{
  const s = createFlightState();
  const ap = createAutopilot();
  let crashed = null;
  let completed = false;
  const logEvery = 2;
  let nextLog = 0;
  for (let t = 0; t < 220; t += dt) {
    const input = ap.input(s, dt);
    stepFlight(s, input, dt);
    if (t + 1e-4 >= nextLog) {
      nextLog += logEvery;
      console.log(
        [
          t.toFixed(0).padStart(4, ' '),
          ap.phase().padEnd(10, ' '),
          `x ${s.position.x.toFixed(0)}`,
          `z ${s.position.z.toFixed(0)}`,
          `agl ${s.agl.toFixed(0)}`,
          `spd ${(s.speed * 1.9438).toFixed(0)}kt`,
          `hdg ${s.headingDeg.toFixed(0)}`,
          `pitch ${s.pitchDeg.toFixed(1)}`,
          `bank ${s.bankDeg.toFixed(1)}`,
          `vs ${s.vs.toFixed(1)}`,
          `thr ${(s.throttle * 100).toFixed(0)}`,
          s.onGround ? 'GND' : 'AIR',
          s.circuitComplete ? 'CKT' : '',
          s.touchdown?.quality || '',
        ].join(' '),
      );
    }
    if (s.crashed) {
      crashed = s.crashed.reason;
      break;
    }
    if (s.completed) {
      completed = true;
      break;
    }
  }
  if (crashed) {
    fail(`autopilot crashed: ${crashed} at x=${s.position.x.toFixed(0)} z=${s.position.z.toFixed(0)} agl=${s.agl.toFixed(1)} spd=${s.speed.toFixed(1)} hdg=${s.headingDeg.toFixed(0)} vs=${s.vs.toFixed(2)} phase=${ap.phase()}`);
  }
  if (!completed) {
    fail(`autopilot did not finish. phase=${ap.phase()} circuit=${s.circuitComplete} agl=${s.agl.toFixed(0)} spd=${s.speed.toFixed(1)} x=${s.position.x.toFixed(0)} z=${s.position.z.toFixed(0)} td=${s.touchdown?.quality || 'none'}`);
  }
  console.log('LOOP OK', s.score);
}
