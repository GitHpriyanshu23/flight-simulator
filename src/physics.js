import * as THREE from 'three';
import {
  BELLY_POINTS,
  GEAR_DROP,
  GEAR_POINTS,
  GROUND,
  REST_Y,
  RUNWAY,
  VR_MS,
  aglOf,
  onRunway,
  wrapDeg,
} from './constants.js';
import { staticColliders, treeList } from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _lift = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _flatF = new THREE.Vector3();
const _flatV = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qr = new THREE.Quaternion();

const AERO = {
  kLift: 0.0036,
  clAlpha: 3.6,
  stallAoa: 0.3,
  incidence: 0.045,
  kDrag: 0.0092,
  cd0: 0.03,
  induced: 0.09,
  thrustMax: 5.7,
  turnBoost: 2.25,
  sideDamp: 2.6,
};

const events = [];
const gearVecs = GEAR_POINTS.map((p) => new THREE.Vector3(p.x, p.y, p.z));
const bellyVecs = BELLY_POINTS.map((p) => new THREE.Vector3(p.x, p.y, p.z));
const COLLIDERS = staticColliders();
const TREES = treeList();

export function quaternionForAttitude(q, headingDeg, pitchDeg, bankRightDeg) {
  const yaw = -THREE.MathUtils.degToRad(headingDeg);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  const roll = -THREE.MathUtils.degToRad(bankRightDeg);
  _qy.setFromAxisAngle(UP, yaw);
  _qp.setFromAxisAngle(AXIS_X, pitch);
  _qr.setFromAxisAngle(AXIS_Z, roll);
  q.identity();
  q.multiply(_qy).multiply(_qp).multiply(_qr);
  return q;
}

export function createFlightState() {
  const state = {
    position: new THREE.Vector3(RUNWAY.spawnX, REST_Y, RUNWAY.spawnZ),
    velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    forward: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
    flatForward: new THREE.Vector3(0, 0, -1),
    throttle: 0,
    pitchSm: 0,
    rollSm: 0,
    yawSm: 0,
    flaps: 0.55,
    gearDown: true,
    onGround: true,
    everAirborne: false,
    airTime: 0,
    time: 0,
    speed: 0,
    forwardSpeed: 0,
    vs: 0,
    aoa: 0,
    agl: 0,
    headingDeg: 0,
    pitchDeg: 0,
    bankDeg: 0,
    pitch: 0,
    bank: 0,
    accelFwd: 0,
    lift: 0,
    stalling: false,
    circuitComplete: false,
    minX: RUNWAY.spawnX,
    maxX: RUNWAY.spawnX,
    minZ: RUNWAY.spawnZ,
    maxZ: RUNWAY.spawnZ,
    maxAlt: 0,
    touchdown: null,
    crashed: null,
    completed: false,
    stallEvents: 0,
    score: null,
    called: {
      eighty: false,
      rotate: false,
      liftoff: false,
      gearUp: false,
      gearDown: false,
      circuit: false,
      offPavement: false,
    },
  };
  derive(state);
  return state;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function derive(state) {
  _forward.set(0, 0, -1).applyQuaternion(state.quaternion);
  _up.set(0, 1, 0).applyQuaternion(state.quaternion);
  _right.set(1, 0, 0).applyQuaternion(state.quaternion);
  state.forward.copy(_forward);
  state.up.copy(_up);
  state.right.copy(_right);
  state.flatForward.set(_forward.x, 0, _forward.z);
  if (state.flatForward.lengthSq() > 1e-6) state.flatForward.normalize();
  else state.flatForward.set(0, 0, -1);
  state.speed = state.velocity.length();
  state.forwardSpeed = state.velocity.dot(state.flatForward);
  state.vs = state.velocity.y;
  state.agl = aglOf(state.position.y);
  state.headingDeg = (Math.atan2(_forward.x, -_forward.z) * 180) / Math.PI;
  if (state.headingDeg < 0) state.headingDeg += 360;
  state.pitchDeg = Math.asin(clamp(_forward.y, -1, 1)) * (180 / Math.PI);
  state.bankDeg = -Math.atan2(_right.y, _up.y) * (180 / Math.PI);
  state.pitch = state.pitchDeg * (Math.PI / 180);
  state.bank = state.bankDeg * (Math.PI / 180);
  const vFwd = state.velocity.dot(_forward);
  const vUp = state.velocity.dot(_up);
  state.aoa = state.speed > 2 ? Math.atan2(-vUp, Math.max(0.5, vFwd)) : 0;
}

function crash(state, reason) {
  if (state.crashed || state.completed) return;
  state.crashed = { reason };
  events.push({ type: 'crash', text: reason });
}

function lowestPointY(state, points) {
  let lowest = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    _tmp.copy(points[i]).applyQuaternion(state.quaternion).add(state.position);
    if (_tmp.y < lowest) lowest = _tmp.y;
  }
  return lowest;
}

function headingErrorToRunway(headingDeg) {
  const a = Math.abs(wrapDeg(headingDeg));
  const b = Math.abs(wrapDeg(headingDeg - 180));
  return Math.min(a, b);
}

function landingQuality(sink) {
  if (sink < 1.05) return 'BUTTER';
  if (sink < 2.15) return 'SMOOTH';
  if (sink < 3.7) return 'FIRM';
  return 'HARD';
}

export function computeScore(state) {
  const q = state.touchdown?.quality || 'HARD';
  const table = { BUTTER: 1200, SMOOTH: 950, FIRM: 700, HARD: 420 };
  const landing = table[q] || 400;
  const timeBonus = Math.max(0, Math.round(760 - state.time * 2.1));
  const circuit = state.circuitComplete ? 500 : 0;
  const smooth = state.stallEvents > 1 ? 0 : 180;
  const offset = state.touchdown ? state.touchdown.offset : 20;
  const align = state.touchdown ? state.touchdown.headingError : 20;
  const lineup = Math.max(0, Math.round(220 - offset * 7 - align * 4));
  const total = landing + timeBonus + circuit + smooth + lineup;
  return { landing, timeBonus, circuit, smooth, lineup, total, quality: q, time: state.time };
}

function updateCircuit(state) {
  if (!state.onGround && state.agl > 28) {
    state.minX = Math.min(state.minX, state.position.x);
    state.maxX = Math.max(state.maxX, state.position.x);
    state.minZ = Math.min(state.minZ, state.position.z);
    state.maxZ = Math.max(state.maxZ, state.position.z);
  }
  state.maxAlt = Math.max(state.maxAlt, state.agl);
  const spanned = state.maxX - state.minX > 460 && state.maxZ - state.minZ > 680;
  const sided = state.minX < -360 || state.maxX > 420;
  const done = state.maxAlt > 80 && spanned && sided;
  if (done && !state.circuitComplete) {
    state.circuitComplete = true;
    if (!state.called.circuit) {
      state.called.circuit = true;
      events.push({ type: 'circuit', text: 'Circuit complete — land on runway 36' });
    }
  }
}

function updateConfig(state, dt) {
  let target = 0;
  if (!state.everAirborne) target = 0.55;
  else if (state.circuitComplete && (state.onGround || state.agl < 190 || state.vs < -0.7)) target = 1;
  else if (state.agl < 55) target = 0.55;
  else target = 0;
  state.flaps += (target - state.flaps) * Math.min(1, dt * 0.7);

  const wasGear = state.gearDown;
  if (state.onGround || state.agl < 160 || state.vs < -0.4) state.gearDown = true;
  else if (state.agl > 70 && state.vs > 0.8 && state.throttle > 0.5) state.gearDown = false;
  if (wasGear && !state.gearDown && !state.called.gearUp) {
    state.called.gearUp = true;
    state.called.gearDown = false;
    events.push({ type: 'gear-up', text: 'Gear up' });
  } else if (!wasGear && state.gearDown && !state.called.gearDown && state.everAirborne) {
    state.called.gearDown = true;
    state.called.gearUp = false;
    events.push({ type: 'gear-down', text: 'Gear down' });
  }
}

function evaluateTouchdown(state, sink) {
  if (state.crashed) return;
  const bank = Math.abs(state.bankDeg);
  const aligned = headingErrorToRunway(state.headingDeg);
  const lateral = Math.abs(state.velocity.x);
  if (!state.gearDown) {
    crash(state, 'Gear-up landing');
    return;
  }
  if (!onRunway(state.position.x, state.position.z)) {
    crash(state, 'Landed off the runway');
    return;
  }
  if (bank > 16) {
    crash(state, 'Wing strike');
    return;
  }
  if (state.pitchDeg < -11) {
    crash(state, 'Nose-gear collapse');
    return;
  }
  if (state.pitchDeg > 16) {
    crash(state, 'Tail strike');
    return;
  }
  if (aligned > 24) {
    crash(state, 'Misaligned touchdown');
    return;
  }
  if (lateral > 10) {
    crash(state, 'Side load on touchdown');
    return;
  }
  if (sink > 6.4) {
    crash(state, 'Too hard — aircraft destroyed');
    return;
  }
  const quality = landingQuality(sink);
  state.touchdown = {
    ok: true,
    quality,
    sink,
    offset: Math.abs(state.position.x),
    headingError: aligned,
    time: state.time,
  };
  const words = {
    BUTTER: 'Butter landing',
    SMOOTH: 'Smooth touchdown',
    FIRM: 'Firm touchdown',
    HARD: 'Hard landing — still in one piece',
  };
  events.push({ type: 'touchdown', text: words[quality] });
}

function hitSolids(state) {
  const r = 7.2;
  const p = state.position;
  if (state.speed < 4 && state.onGround) return null;
  for (let i = 0; i < COLLIDERS.length; i += 1) {
    const c = COLLIDERS[i];
    if (c.type === 'box') {
      const cx = clamp(p.x, c.minX, c.maxX);
      const cy = clamp(p.y, c.minY, c.maxY);
      const cz = clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dz = p.z - cz;
      if (dx * dx + dy * dy + dz * dz < r * r) return c.name;
    } else if (c.type === 'cone') {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.radius && p.y < c.height * (1 - d / c.radius) + 6) return 'Rising terrain';
    }
  }
  if (state.agl < 22) {
    for (let i = 0; i < TREES.length; i += 1) {
      const t = TREES[i];
      const dx = p.x - t.x;
      const dz = p.z - t.z;
      if (dx * dx + dz * dz < (t.r + 3.2) * (t.r + 3.2) && p.y < t.h + 2) return 'a tree';
    }
  }
  return null;
}

export function stepFlight(state, input, dt) {
  events.length = 0;
  if (state.crashed || state.completed) return events;
  dt = Math.max(0, Math.min(dt, 0.05));
  if (dt === 0) return events;
  state.time += dt;

  const blend = Math.min(1, dt * 9);
  state.pitchSm += ((input.pitch || 0) - state.pitchSm) * blend;
  state.rollSm += ((input.roll || 0) - state.rollSm) * blend;
  state.yawSm += ((input.yaw || 0) - state.yawSm) * blend;
  if (input.throttleUp) state.throttle = Math.min(1, state.throttle + dt * 0.32);
  if (input.throttleDown) state.throttle = Math.max(0, state.throttle - dt * 0.4);

  derive(state);
  updateConfig(state, dt);

  const wasGround = state.onGround;
  const brake = !!input.brake;
  const flaps = state.flaps;

  let pitchRate = 0;
  let rollRate = 0;
  let yawRate = 0;
  if (wasGround) {
    const steer = clamp(1.2 - state.speed / 90, 0.16, 1.2);
    yawRate = (state.yawSm + state.rollSm * 0.9) * steer;
    rollRate = clamp(state.bank * 4.2, -1.2, 1.2);
    if (state.speed >= VR_MS - 5) {
      pitchRate = state.pitchSm * 0.32;
      if (state.pitch > 0.2) pitchRate = Math.min(pitchRate, -(state.pitch - 0.2) * 5);
      if (state.pitch < -0.02) pitchRate = Math.max(pitchRate, 0.45);
    } else {
      pitchRate = -state.pitch * 3.4 + Math.min(0, state.pitchSm) * 0.12;
    }
  } else {
    const eff = clamp(state.speed / 42, 0.42, 1.12);
    pitchRate = state.pitchSm * 0.7 * eff;
    rollRate = state.rollSm * 1.2 * eff;
    yawRate = state.yawSm * 0.48 * eff;
    if (state.aoa + 0.045 + state.flaps * 0.055 > AERO.stallAoa + 0.04) {
      pitchRate = Math.min(pitchRate, -0.35);
    }
    if (state.aoa < -0.18) pitchRate = Math.max(pitchRate, 0.2);
    if (state.speed > 18) {
      _flatF.copy(state.flatForward);
      _flatV.set(state.velocity.x, 0, state.velocity.z);
      if (_flatV.lengthSq() > 36) {
        _flatV.normalize();
        const dot = clamp(_flatF.dot(_flatV), -1, 1);
        const cross = _flatF.x * _flatV.z - _flatF.z * _flatV.x;
        const err = Math.atan2(cross, dot);
        yawRate += clamp(-err * 1.7, -0.9, 0.9);
      }
      // Bank should yaw the nose at a brisk coordinated-turn rate so circuits stay near the field.
      const coord = Math.tan(clamp(state.bank, -0.65, 0.65)) * 9.81 / Math.max(state.speed, 30);
      yawRate += clamp(-coord * 2.4, -0.85, 0.85);
    }
  }

  _dq.set(pitchRate * dt * 0.5, yawRate * dt * 0.5, rollRate * dt * 0.5, 1).normalize();
  state.quaternion.multiply(_dq).normalize();
  if (wasGround) {
    derive(state);
    const fast = state.speed >= VR_MS - 4;
    const pitchHold = fast ? clamp(state.pitchDeg, -1.5, 11) : state.pitchDeg * (1 - Math.min(1, dt * 1.8));
    quaternionForAttitude(state.quaternion, state.headingDeg, pitchHold, 0);
  }
  derive(state);

  const aoaEff = state.aoa + AERO.incidence + flaps * 0.055;
  let cl;
  if (Math.abs(aoaEff) < AERO.stallAoa) cl = AERO.clAlpha * aoaEff;
  else {
    const over = Math.abs(aoaEff) - AERO.stallAoa;
    const sign = Math.sign(aoaEff) || 1;
    cl = sign * 1.15 * Math.max(0.05, 1 - over / 0.5);
  }
  cl += flaps * 0.2;
  cl = clamp(cl, -0.55, 1.55);
  state.stalling = !wasGround && state.speed > 12 && (aoaEff > AERO.stallAoa || (state.speed < 36 && state.aoa > 0.08));
  if (state.stalling) state.stallEvents += dt;

  const cd =
    AERO.cd0 +
    (state.gearDown ? 0.02 : 0) +
    flaps * 0.045 +
    (brake && !wasGround ? 0.08 : 0) +
    AERO.induced * cl * cl;
  const groundEffect = wasGround || state.agl < 16 ? 1 + 0.16 * clamp(1 - Math.max(0, state.agl) / 16, 0, 1) : 1;
  const liftSigned = state.speed * state.speed * AERO.kLift * cl * groundEffect;
  state.lift = liftSigned;

  let thrust = state.throttle < 0.05 ? 0 : state.throttle * AERO.thrustMax;
  if (brake && wasGround) thrust *= 0.22;

  _accel.set(0, -9.81, 0);
  _accel.addScaledVector(state.forward, thrust);
  // Lift is perpendicular to velocity, toward the wing's up side — not along the fuselage.
  if (state.speed > 3) {
    const inv = 1 / state.speed;
    const vx = state.velocity.x * inv;
    const vy = state.velocity.y * inv;
    const vz = state.velocity.z * inv;
    const dot = state.up.x * vx + state.up.y * vy + state.up.z * vz;
    let lx = state.up.x - vx * dot;
    let ly = state.up.y - vy * dot;
    let lz = state.up.z - vz * dot;
    const llen = Math.hypot(lx, ly, lz);
    if (llen > 0.08) {
      lx /= llen;
      ly /= llen;
      lz /= llen;
    } else {
      lx = state.up.x;
      ly = state.up.y;
      lz = state.up.z;
    }
    _lift.set(lx * liftSigned, ly * liftSigned, lz * liftSigned);
  } else {
    _lift.copy(state.up).multiplyScalar(Math.max(0, liftSigned));
  }
  if (!wasGround && state.up.y > 0.25 && liftSigned > 0) {
    _lift.y += liftSigned * (1 - state.up.y) * 0.72;
    _lift.x *= AERO.turnBoost;
    _lift.z *= AERO.turnBoost;
  }
  _accel.add(_lift);
  if (state.speed > 0.4) {
    const drag = AERO.kDrag * cd * state.speed * state.speed;
    _accel.addScaledVector(state.velocity, -drag / state.speed);
    if (state.speed > 145) _accel.addScaledVector(state.velocity, -0.03 * (state.speed - 145));
  }
  if (!wasGround && state.speed > 10) {
    const vSide = state.velocity.dot(state.right);
    _accel.addScaledVector(state.right, -vSide * AERO.sideDamp);
  }
  if (wasGround) {
    _flatF.copy(state.flatForward);
    const fwd = state.velocity.dot(_flatF);
    const resist = brake ? 13.5 : state.throttle < 0.12 ? 1.15 : 0.42;
    if (Math.abs(fwd) > 0.15) _accel.addScaledVector(_flatF, -Math.sign(fwd) * resist);
    const side = state.velocity.dot(state.right);
    _accel.addScaledVector(state.right, -side * 5);
  }

  state.accelFwd = _accel.dot(state.forward);
  state.velocity.addScaledVector(_accel, dt);
  if (wasGround) {
    const side = state.velocity.dot(state.right);
    state.velocity.addScaledVector(state.right, -side * Math.min(1, dt * 10));
    if (brake && Math.abs(state.forwardSpeed) < 1.2) {
      state.velocity.x *= 0.4;
      state.velocity.z *= 0.4;
    }
  }
  state.position.addScaledVector(state.velocity, dt);

  const points = state.gearDown ? gearVecs : bellyVecs;
  let lowest = lowestPointY(state, points) - GROUND;
  const liftVertical = _lift.y + Math.max(0, thrust * state.forward.y);
  const canUnstick = state.speed > VR_MS - 6 && state.pitchDeg > 2.4 && liftVertical > 10.6 && state.gearDown;

  if (lowest <= 0.08) {
    const sink = Math.max(0, -state.velocity.y);
    if (lowest < 0) state.position.y -= lowest;
    if (canUnstick && wasGround) {
      if (state.velocity.y < 0) state.velocity.y = 0;
      state.onGround = false;
      if (!state.called.liftoff) {
        state.called.liftoff = true;
        events.push({ type: 'liftoff', text: 'Positive rate' });
      }
    } else if (!wasGround && canUnstick && state.velocity.y >= -0.05 && state.airTime < 1.2) {
      state.onGround = false;
    } else {
      if (state.velocity.y < 0) state.velocity.y = 0;
      state.onGround = true;
      if (!wasGround && state.airTime > 1.2) evaluateTouchdown(state, sink);
    }
  } else if (wasGround && !canUnstick) {
    state.position.y -= clamp(lowest, -0.3, 0.8);
    state.velocity.y = Math.min(0, state.velocity.y);
    state.onGround = true;
  } else {
    state.onGround = false;
    if (wasGround && !state.called.liftoff) {
      state.called.liftoff = true;
      events.push({ type: 'liftoff', text: 'Positive rate' });
    }
  }

  derive(state);

  if (!state.onGround && state.agl > 1.2) {
    state.everAirborne = true;
    state.airTime += dt;
  }
  updateCircuit(state);

  if (!state.called.eighty && wasGround && state.speed >= 41.2) {
    state.called.eighty = true;
    events.push({ type: 'eighty', text: '80 knots' });
  }
  if (!state.called.rotate && wasGround && state.speed >= VR_MS && !state.everAirborne) {
    state.called.rotate = true;
    events.push({ type: 'rotate', text: 'Rotate' });
  }

  if (state.onGround && !state.everAirborne && state.position.z < RUNWAY.zNorth + 40 && state.speed > 18) {
    crash(state, 'Ran off the end of the runway');
  }
  if (
    state.onGround &&
    !state.everAirborne &&
    Math.abs(state.position.x) > RUNWAY.halfWidth + 14 &&
    state.speed > 32
  ) {
    crash(state, 'Runway excursion');
  }
  if (state.onGround && !onRunway(state.position.x, state.position.z) && state.speed > 8 && !state.called.offPavement) {
    state.called.offPavement = true;
    if (!state.crashed) events.push({ type: 'pavement', text: 'Off the pavement' });
  }
  if (state.onGround && onRunway(state.position.x, state.position.z)) state.called.offPavement = false;

  if (!state.crashed && state.agl < -12) crash(state, 'Terrain impact');

  const solid = hitSolids(state);
  if (solid && !state.crashed) {
    if (solid === 'a tree') crash(state, 'Hit a tree');
    else if (solid === 'Rising terrain') crash(state, 'Hit rising terrain');
    else crash(state, `Hit the ${solid.toLowerCase()}`);
  }

  if (!state.onGround && state.touchdown && state.agl > 4) state.touchdown = null;

  if (
    !state.crashed &&
    state.touchdown?.ok &&
    state.circuitComplete &&
    state.onGround &&
    onRunway(state.position.x, state.position.z) &&
    state.speed < 2.05 &&
    state.agl > -0.5 &&
    Math.abs(state.bankDeg) < 12 &&
    state.everAirborne
  ) {
    state.completed = true;
    state.score = computeScore(state);
    events.push({ type: 'complete', text: 'Flight completed' });
  } else if (
    state.touchdown?.ok &&
    !state.circuitComplete &&
    state.onGround &&
    state.speed < 2.2 &&
    state.everAirborne &&
    !state.called.needCircuit
  ) {
    state.called.needCircuit = true;
    events.push({ type: 'need-circuit', text: 'Nice stop — take off again and fly the circuit' });
  }

  if (state.stalling && !state.onGround && state.agl > 8 && !state.called.stallBlink) {
    state.called.stallBlink = true;
    events.push({ type: 'stall', text: 'Stall' });
  }
  if (!state.stalling) state.called.stallBlink = false;

  return events;
}

export function flightStatus(state, mode) {
  if (mode === 'crashed' || state.crashed) return 'CRASHED';
  if (mode === 'complete' || state.completed) return 'COMPLETE';
  if (!state.everAirborne) return state.speed < 10 ? 'ON GROUND' : 'TAKEOFF ROLL';
  if (state.onGround) return state.speed < 2.4 ? 'FULL STOP' : 'LANDING ROLL';
  if (
    state.circuitComplete &&
    state.position.z > RUNWAY.aimZ &&
    Math.abs(wrapDeg(state.headingDeg)) < 38 &&
    state.vs < 2
  ) {
    return 'FINAL';
  }
  if (!state.circuitComplete && state.airTime > 6) return 'CIRCUIT';
  return 'AIRBORNE';
}

export function objectiveFor(state) {
  if (state.crashed) return 'Flight failed. Restart to try the circuit again.';
  if (state.completed) return 'Flight completed.';
  if (!state.everAirborne) {
    if (state.speed < VR_MS) return 'Throttle up with Shift. Rotate (W) at 120 knots.';
    return 'Rotate — ease the nose up with W and climb away.';
  }
  if (!state.circuitComplete) return 'Climb past 300 ft and fly a left circuit around the field.';
  if (!state.onGround) return 'Line up runway 36 northbound. Two red, two white on the PAPI.';
  if (state.speed > 2.4) return 'On the runway. Hold Space and brake to a full stop.';
  return 'Hold the brakes until the aircraft stops.';
}

export function engineLabel(state) {
  if (state.throttle < 0.06) return 'IDLE';
  if (state.throttle < 0.35) return 'SPOOL';
  if (state.throttle < 0.82) return 'THRUST';
  return 'FULL POWER';
}

export function activeWarnings(state) {
  const w = [];
  if (state.crashed || state.completed) return w;
  if (state.stalling && !state.onGround) w.push('STALL');
  else if (!state.onGround && state.everAirborne && state.speed < 46 && state.flaps < 0.7) w.push('LOW SPEED');
  if (!state.onGround && state.vs < -7) w.push('SINK RATE');
  if (Math.abs(state.bankDeg) > 40) w.push('BANK ANGLE');
  if (state.speed > 150) w.push('OVERSPEED');
  const aligned = Math.abs(wrapDeg(state.headingDeg)) < 30 && Math.abs(state.position.x) < 80;
  if (!state.onGround && state.everAirborne && state.agl < 28 && state.vs < -1 && !aligned) w.push('TOO LOW');
  if (state.onGround && !state.everAirborne && state.speed > 25) {
    const remain = state.position.z - RUNWAY.zNorth;
    if (remain < 700 && remain > 0) w.push('RUNWAY REMAINING');
  }
  return w;
}
