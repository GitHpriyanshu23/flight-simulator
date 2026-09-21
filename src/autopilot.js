import { GEAR_DROP, RUNWAY, glideAltitude, wrapDeg } from './constants.js';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function createAutopilot() {
  let phase = 'takeoff';
  let phaseTime = 0;
  return {
    reset() {
      phase = 'takeoff';
      phaseTime = 0;
    },
    phase: () => phase,
    input(state, dt) {
      phaseTime += dt;
      const agl = state.position.y - (state.position.y - state.agl);
      const x = state.position.x;
      const z = state.position.z;
      let headingTarget = 0;
      let pitchCmd = 2;
      let throttle = 0.9;
      let brake = false;
      let pitch = 0;
      let roll = 0;
      let yaw = 0;

      if (phase === 'takeoff') {
        headingTarget = clamp(-x * 0.7, -12, 12);
        throttle = 1;
        if (state.onGround && state.speed < 60) pitchCmd = 0;
        else if (state.onGround) pitchCmd = 8.5;
        else pitchCmd = agl < 130 ? 9 : 5;
        if (!state.onGround && agl > 115 && z < -750) {
          phase = 'crosswind';
          phaseTime = 0;
        }
      } else if (phase === 'crosswind') {
        headingTarget = 270;
        const hold = holdAlt(state, 150, 82);
        pitchCmd = hold.pitchCmd;
        throttle = hold.throttle;
        if (x < -680 && Math.abs(wrapDeg(state.headingDeg - 270)) < 28) {
          phase = 'downwind';
          phaseTime = 0;
        } else if (phaseTime > 45 && x < -500) {
          phase = 'downwind';
          phaseTime = 0;
        }
      } else if (phase === 'downwind') {
        headingTarget = 180;
        const targetAlt = z > 400 ? 95 : 140;
        const hold = holdAlt(state, targetAlt, z > 200 ? 72 : 80);
        pitchCmd = hold.pitchCmd;
        throttle = hold.throttle;
        if (z > 1250 && Math.abs(wrapDeg(state.headingDeg - 180)) < 32) {
          phase = 'base';
          phaseTime = 0;
        } else if (phaseTime > 50 && z > 900) {
          phase = 'base';
          phaseTime = 0;
        }
      } else if (phase === 'base') {
        headingTarget = x > -480 ? 0 : 90;
        const hold = holdAlt(state, 90, 62);
        pitchCmd = hold.pitchCmd;
        throttle = hold.throttle;
        if (Math.abs(wrapDeg(state.headingDeg)) < 22 && x > -140 && x < 90) {
          phase = 'final';
          phaseTime = 0;
        } else if (phaseTime > 40 && Math.abs(wrapDeg(state.headingDeg)) < 35) {
          phase = 'final';
          phaseTime = 0;
        }
      } else if (phase === 'final') {
        const dist = z - RUNWAY.aimZ;
        const aligned = Math.abs(x) < 45 && Math.abs(wrapDeg(state.headingDeg)) < 18;
        const gs = Math.max(0, glideAltitude(z));
        const floor = aligned ? gs : Math.max(gs, 70);
        const altErr = state.agl - floor;
        headingTarget = clamp(-x * 0.18, -26, 26);
        let targetVs = clamp(-altErr * 0.45, -4.2, 2.4);
        if (aligned && state.agl < 26 && dist < 900) {
          phase = 'flare';
          phaseTime = 0;
        }
        const vsErr = targetVs - state.vs;
        pitchCmd = clamp(1.5 + vsErr * 3.1, -4.5, 8);
        const speedTarget = state.agl > 55 ? 60 : 50;
        throttle = 0.46;
        if (state.speed < speedTarget - 2) throttle = 0.7;
        if (state.speed > speedTarget + 3) throttle = 0.2;
        if (altErr > 16) throttle = Math.min(throttle, 0.26);
        if (altErr < -10) throttle = Math.max(throttle, 0.68);
      } else if (phase === 'flare') {
        headingTarget = clamp(-x * 0.35, -8, 8);
        throttle = state.agl < 6 ? 0.02 : 0.18;
        pitchCmd = state.agl < 8 ? 7.2 : 4.8;
        if (state.vs < -1.6) pitchCmd += 1.8;
        if (state.agl < 4) pitchCmd = 5.5;
        if (state.onGround) {
          phase = 'rollout';
          phaseTime = 0;
        }
      } else if (phase === 'rollout') {
        headingTarget = clamp(-x * 0.5, -6, 6);
        pitchCmd = 0;
        throttle = 0;
        brake = true;
        if (!state.onGround && state.agl > 6) {
          phase = 'final';
          phaseTime = 0;
        }
      }

      const herr = wrapDeg(headingTarget - state.headingDeg);
      let bankLimit = state.agl < 45 ? 14 : 27;
      if (state.onGround) bankLimit = 0;
      const bankCmd = state.onGround ? 0 : clamp(herr * 0.85, -bankLimit, bankLimit);
      const bankErr = bankCmd - state.bankDeg;
      roll = clamp(-bankErr * 0.085, -1, 1);
      const pitchErr = pitchCmd - state.pitchDeg;
      pitch = clamp(pitchErr * 0.11, -1, 1);
      if (state.onGround && phase === 'takeoff' && state.speed < 60) pitch = Math.min(0, pitch);
      if (state.onGround) {
        yaw = clamp(-herr * 0.08 + x * 0.012, -1, 1);
        if (phase === 'takeoff' || phase === 'rollout') roll = clamp(-herr * 0.06 + x * 0.01, -1, 1);
      } else {
        yaw = 0;
      }
      if (phase === 'rollout') {
        pitch = clamp(-state.pitchDeg * 0.15, -0.4, 0);
        brake = true;
      }

      return {
        pitch,
        roll,
        yaw,
        throttleUp: state.throttle < throttle - 0.03,
        throttleDown: state.throttle > throttle + 0.03,
        brake,
      };
    },
  };
}

function holdAlt(state, targetAgl, speedTarget) {
  const altErr = state.agl - targetAgl;
  const targetVs = clamp(-altErr * 0.4, -4, 4.5);
  const vsErr = targetVs - state.vs;
  const pitchCmd = clamp(2.2 + vsErr * 3.4, -3, 11);
  let throttle = 0.62;
  if (state.speed < speedTarget - 3) throttle = 0.9;
  if (state.speed > speedTarget + 4) throttle = 0.38;
  if (altErr > 20) throttle = Math.min(throttle, 0.42);
  if (altErr < -12) throttle = Math.max(throttle, 0.8);
  return { pitchCmd, throttle };
}

export { GEAR_DROP };
