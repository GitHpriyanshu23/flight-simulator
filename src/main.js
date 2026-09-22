import * as THREE from 'three';
import { REST_Y, RUNWAY } from './constants.js';
import { createFlightState, quaternionForAttitude, stepFlight } from './physics.js';
import { createWorld } from './world.js';
import { buildAircraft, createContrails, updateAircraft } from './aircraft.js';
import { clearKeys, onHelpToggle, onMuteToggle, readInput, setInputOverride } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createAutopilot } from './autopilot.js';
import { inject } from '@vercel/analytics';

// Initialize Vercel Analytics
inject();

const AUTOTEST = new URLSearchParams(location.search).has('autotest');
const UP = new THREE.Vector3(0, 1, 0);

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.id = 'sim-canvas';
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.2, 25000);
scene.add(camera);

const world = createWorld(scene);
const rig = buildAircraft({ livery: 'player', shadows: true });
scene.add(rig.root);
const contrails = createContrails(scene);

let state = createFlightState();
const hud = createHud();
const audio = createAudio();
const autopilot = createAutopilot();
const clock = new THREE.Clock();

let mode = 'menu';
let paused = false;
let lastInput = readInput();
const camPos = new THREE.Vector3(-58, 11, 86);
const camLook = new THREE.Vector3(4, 3.2, 18);
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const camUp = new THREE.Vector3(0, 1, 0);
const flat = new THREE.Vector3();
const smoke = [];

camera.position.copy(camPos);
camera.lookAt(camLook);
placeAircraft(state);

const noseW = new THREE.Vector3();
const tailW = new THREE.Vector3();
rig.noseMark.getWorldPosition(noseW);
rig.tailMark.getWorldPosition(tailW);
const noseForward = noseW.z < tailW.z;

function placeAircraft(next) {
  rig.root.position.copy(next.position);
  rig.root.quaternion.copy(next.quaternion);
}

function resetFlight() {
  state = createFlightState();
  quaternionForAttitude(state.quaternion, 0, 0, 0);
  autopilot.reset();
  paused = false;
  document.getElementById('paused').hidden = true;
  hud.hideReport();
  placeAircraft(state);
  for (const s of smoke) s.visible = false;
}

function startFlight() {
  resetFlight();
  mode = 'flight';
  document.getElementById('menu').hidden = true;
  document.getElementById('hud').classList.remove('hidden');
  document.body.focus?.();
  const btn = document.getElementById('start-flight');
  btn.blur();
  audio.start();
  clock.getDelta();
}

function finish(success) {
  mode = success ? 'complete' : 'crashed';
  if (success && !state.score) state.score = state.score;
  hud.showReport(state, success);
  if (success) audio.callout();
  else audio.crash();
  clearKeys();
}

document.getElementById('start-flight').addEventListener('click', startFlight);
document.getElementById('play-again').addEventListener('click', startFlight);
document.getElementById('restart-flight').addEventListener('click', () => {
  if (mode === 'menu') return;
  startFlight();
});
document.getElementById('paused').addEventListener('click', () => {
  paused = false;
  document.getElementById('paused').hidden = true;
  clock.getDelta();
});
onHelpToggle(() => hud.setHelp(!hud.helpVisible()));
onMuteToggle(() => audio.toggleMute());

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'flight' && !AUTOTEST) {
    paused = true;
    clearKeys();
    document.getElementById('paused').hidden = false;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function cine(time) {
  const a = time * 0.08;
  desiredPos.set(Math.sin(a) * 16 - 62, 10.5 + Math.sin(time * 0.23) * 1.2, 92 + Math.cos(a) * 12);
  desiredLook.set(6, 3.4, 16);
}

function chase() {
  flat.copy(state.flatForward);
  const lag = THREE.MathUtils.clamp(state.accelFwd, -8, 14);
  desiredPos
    .copy(state.position)
    .addScaledVector(flat, -32 - lag * 0.28)
    .addScaledVector(UP, 9.2);
  desiredPos.addScaledVector(state.right, THREE.MathUtils.clamp(-state.bankDeg * 0.04, -2.5, 2.5));
  if (state.onGround && state.speed > 8) {
    desiredPos.y += Math.sin(state.time * 43) * Math.min(0.08, state.speed * 0.00045);
  }
  desiredPos.y = Math.max(desiredPos.y, 1.4);
  desiredLook.copy(state.position).addScaledVector(flat, 24).addScaledVector(UP, 2.4);
}

function burst(position, color, count) {
  for (let i = 0; i < count; i += 1) {
    let puff = smoke.find((s) => !s.visible);
    if (!puff) {
      puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 6, 5),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }),
      );
      scene.add(puff);
      smoke.push(puff);
    }
    puff.visible = true;
    puff.position.copy(position);
    puff.position.x += (Math.random() - 0.5) * 4;
    puff.position.z += (Math.random() - 0.5) * 4;
    puff.userData.life = 1;
    puff.userData.vy = 2 + Math.random() * 3;
    puff.material.color.set(color);
  }
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const t = clock.elapsedTime;
  if (mode === 'menu') {
    cine(t);
    rig.beacon.visible = Math.sin(t * 8) > 0.2;
  } else if (!paused) {
    lastInput = readInput();
    if (AUTOTEST && mode === 'flight') {
      const auto = autopilot.input(state, dt);
      setInputOverride(auto);
      lastInput = auto;
    } else {
      setInputOverride(null);
    }
    if (mode === 'flight') {
      const ev = stepFlight(state, lastInput, dt);
      for (const e of ev) {
        if (e.type === 'crash') {
          burst(state.position, '#ff6a2a', 10);
          finish(false);
        } else if (e.type === 'complete') {
          finish(true);
        } else if (e.type === 'touchdown') {
          audio.touchdown(state.touchdown?.quality === 'HARD');
          hud.toast(e.text);
          burst(state.position.clone().setY(0.4), '#f4f1ea', 6);
        } else if (e.text) {
          hud.toast(e.text);
          if (e.type === 'rotate' || e.type === 'liftoff' || e.type === 'circuit') audio.callout();
        }
      }
      audio.update(state);
    }
    updateAircraft(rig, state, lastInput, dt);
    contrails.update(state, dt);
    chase();
    hud.tickToast(dt);
    hud.update(state, mode, world.papi);
  } else {
    chase();
  }

  for (const puff of smoke) {
    if (!puff.visible) continue;
    puff.userData.life -= dt * 0.45;
    puff.position.y += puff.userData.vy * dt;
    puff.scale.setScalar(1 + (1 - puff.userData.life) * 3);
    puff.material.opacity = Math.max(0, puff.userData.life) * 0.7;
    if (puff.userData.life <= 0) puff.visible = false;
  }

  const k = 1 - Math.exp(-3.1 * Math.max(dt, 0.001));
  if (mode === 'menu') {
    camPos.lerp(desiredPos, Math.min(1, k));
    camLook.lerp(desiredLook, Math.min(1, k));
    camera.up.copy(UP);
  } else {
    camPos.lerp(desiredPos, Math.min(1, mode === 'flight' ? k : 0.04));
    camLook.lerp(desiredLook, Math.min(1, k));
    const lean = state.up.y > 0.45 ? 0.22 : 0;
    camUp.copy(UP).lerp(state.up, lean).normalize();
    camera.up.copy(camUp);
    const fov = 58 + Math.min(7, state.speed * 0.025) + Math.max(0, state.accelFwd) * 0.12;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * 0.08;
      camera.updateProjectionMatrix();
    }
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  world.update(dt, camera, state.position, state);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

if (mode === 'menu') document.getElementById('hud').classList.add('hidden');
frame();

window.__TEST = {
  noseForward,
  start: startFlight,
  getState: () => ({
    mode,
    x: state.position.x,
    y: state.position.y,
    z: state.position.z,
    speed: state.speed,
    agl: state.agl,
    heading: state.headingDeg,
    pitch: state.pitchDeg,
    bank: state.bankDeg,
    throttle: state.throttle,
    onGround: state.onGround,
    circuit: state.circuitComplete,
    crashed: state.crashed?.reason || null,
    completed: !!state.completed,
    quality: state.touchdown?.quality || state.score?.quality || null,
    time: state.time,
    score: state.score?.total || null,
    vs: state.vs,
    phase: AUTOTEST ? autopilot.phase() : null,
    flaps: state.flaps,
    gear: state.gearDown,
    everAirborne: state.everAirborne,
  }),
};
