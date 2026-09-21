import * as THREE from 'three';
import { ENGINE_POINTS, GEAR_DROP } from './constants.js';

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.08,
    ...extra,
  });
}

function shadeVertices(geo, fn) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = fn(x, y, z, i);
    pos.setXYZ(i, n.x, n.y, n.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeWing(side) {
  const geo = new THREE.BoxGeometry(15.6, 0.28, 6.4, 1, 1, 1);
  geo.translate(7.8, 0, -0.4);
  shadeVertices(geo, (x, y, z) => {
    const t = THREE.MathUtils.clamp(x / 15.6, 0, 1);
    return {
      x: x + 1.15,
      y: y + t * 0.95 + (y > 0 ? 0.02 : -0.02),
      z: z - t * 3.4 - (z < 0 ? t * 1.3 : t * 0.15),
    };
  });
  if (side < 0) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) pos.setX(i, -pos.getX(i));
    geo.computeVertexNormals();
  }
  return geo;
}

function labelTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = color;
  g.font = '700 78px Barlow, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function tailLogo() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 320);
  g.fillStyle = '#f0b429';
  g.beginPath();
  g.moveTo(128, 36);
  g.lineTo(214, 250);
  g.lineTo(128, 196);
  g.lineTo(42, 250);
  g.closePath();
  g.fill();
  g.fillStyle = '#fff6df';
  g.beginPath();
  g.moveTo(128, 78);
  g.lineTo(176, 210);
  g.lineTo(128, 176);
  g.lineTo(80, 210);
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildAircraft(options = {}) {
  const livery = options.livery || 'player';
  const player = livery === 'player';
  const bodyColor = player ? '#f5f7fb' : '#f7f4ee';
  const stripe = player ? '#143d66' : '#0e6e6a';
  const accent = player ? '#e2a11a' : '#d4652f';
  const tailColor = player ? '#143d66' : '#0e6e6a';
  const root = new THREE.Group();
  root.name = 'aircraft';

  const white = std(bodyColor, { roughness: 0.38, metalness: 0.12 });
  const bellyMat = std('#d5dbe3', { roughness: 0.55, metalness: 0.06 });
  const navy = std(stripe, { roughness: 0.45, metalness: 0.2 });
  const gold = std(accent, { roughness: 0.4, metalness: 0.35 });
  const tailMat = std(tailColor, { roughness: 0.4, metalness: 0.18 });
  const wingMat = std('#e7edf2', { roughness: 0.46, metalness: 0.1, side: THREE.DoubleSide });
  const dark = std('#1b2128', { roughness: 0.55, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({
    color: '#102430',
    roughness: 0.08,
    metalness: 0.72,
    transparent: true,
    opacity: 0.88,
  });
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: '#2a211c',
    emissive: new THREE.Color('#ff6a1a'),
    emissiveIntensity: 0.25,
    roughness: 0.6,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: '#163044',
    emissive: new THREE.Color('#1c4a66'),
    emissiveIntensity: 0.35,
    roughness: 0.12,
    metalness: 0.5,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.92, 1.92, 26.5, 28), white);
  body.rotation.x = Math.PI / 2;
  body.position.z = 2.1;
  root.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(1.65, 20, 14), bellyMat);
  belly.scale.set(1.05, 0.62, 2.5);
  belly.position.set(0, -1.05, 1.2);
  root.add(belly);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.92, 28, 20), white);
  nose.scale.set(1, 0.98, 1.45);
  nose.position.z = -11.1;
  root.add(nose);

  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 0.16, 4.6, 24), white);
  cone.rotation.x = Math.PI / 2;
  cone.position.z = -14.7;
  root.add(cone);

  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 1.92, 7.2, 24), white);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 16.6;
  root.add(tailCone);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.35, 22, 14), glass);
  cockpit.scale.set(1.05, 0.72, 1.85);
  cockpit.position.set(0, 1.12, -9.3);
  root.add(cockpit);

  const wingR = new THREE.Mesh(makeWing(1), wingMat);
  const wingL = new THREE.Mesh(makeWing(-1), wingMat);
  wingR.position.y = -0.25;
  wingL.position.y = -0.25;
  root.add(wingR, wingL);

  const wingletGeo = new THREE.BoxGeometry(0.12, 1.35, 1.5);
  const wingletR = new THREE.Mesh(wingletGeo, gold);
  wingletR.position.set(17.05, 0.85, -4.6);
  wingletR.rotation.z = -0.18;
  const wingletL = wingletR.clone();
  wingletL.position.x = -17.05;
  wingletL.rotation.z = 0.18;
  root.add(wingletR, wingletL);

  function stab(side) {
    const g = new THREE.BoxGeometry(5.2, 0.14, 2.1);
    g.translate(2.7, 0, 0.2);
    shadeVertices(g, (x, y, z) => ({ x, y: y + x * 0.03, z: z - x * 0.28 }));
    if (side < 0) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i += 1) pos.setX(i, -pos.getX(i));
      g.computeVertexNormals();
    }
    const m = new THREE.Mesh(g, wingMat);
    m.position.set(0, 0.55, 16.3);
    return m;
  }
  root.add(stab(1), stab(-1));

  const finGeo = new THREE.BoxGeometry(0.22, 5.4, 4.4);
  shadeVertices(finGeo, (x, y, z) => ({
    x,
    y: y + 2.5,
    z: z + 0.4 - (y + 2.2) * 0.22,
  }));
  const fin = new THREE.Mesh(finGeo, tailMat);
  fin.position.set(0, 1.2, 15.6);
  root.add(fin);

  const logoMat = new THREE.MeshBasicMaterial({ map: tailLogo(), transparent: true, depthWrite: false });
  const logoR = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.8), logoMat);
  logoR.position.set(0.14, 4.3, 16.3);
  const logoL = logoR.clone();
  logoL.position.x = -0.14;
  logoL.rotation.y = Math.PI;
  root.add(logoR, logoL);

  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 22.5), navy);
    band.position.set(side * 1.9, 0.72, 0.6);
    root.add(band);
    const goldLine = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 22.5), gold);
    goldLine.position.set(side * 1.94, 0.46, 0.6);
    root.add(goldLine);
    const title = new THREE.Mesh(
      new THREE.PlaneGeometry(6.2, 1.15),
      new THREE.MeshBasicMaterial({ map: labelTexture(player ? 'SKYLARK' : 'HORIZON', stripe), transparent: true, depthWrite: false }),
    );
    title.position.set(side * 1.98, 0.15, -2.2);
    if (side < 0) title.rotation.y = Math.PI;
    root.add(title);
  }

  for (let i = 0; i < 16; i += 1) {
    const z = -6.4 + i * 1.05;
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.32), windowMat);
      w.position.set(side * 1.9, 0.62, z);
      root.add(w);
    }
  }

  const doors = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.7), navy);
  doors.position.set(1.96, 0.15, -4.6);
  root.add(doors);

  const engines = [];
  for (const p of ENGINE_POINTS) {
    const nacelle = new THREE.Group();
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.72, 4.3, 20), white);
    cowl.rotation.x = Math.PI / 2;
    nacelle.add(cowl);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 10, 20), white);
    lip.position.z = -2.05;
    nacelle.add(lip);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), dark);
    fan.position.z = -1.85;
    nacelle.add(fan);
    const exhaust = new THREE.Mesh(new THREE.CircleGeometry(0.48, 18), exhaustMat);
    exhaust.position.z = 2.12;
    exhaust.rotation.y = Math.PI;
    nacelle.add(exhaust);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.15, 2.1), white);
    pylon.position.set(0, 0.85, -0.2);
    nacelle.add(pylon);
    nacelle.position.set(p.x, p.y, 0.2);
    root.add(nacelle);
    engines.push(nacelle);
  }

  const gearMats = std('#c5cad1', { roughness: 0.35, metalness: 0.55 });
  const tire = new THREE.MeshStandardMaterial({ color: '#1a1c1f', roughness: 0.85 });
  const gears = [];
  const wheels = [];
  function addGear(x, z, kind) {
    const pivot = new THREE.Group();
    pivot.position.set(x, -1.55, z);
    const len = GEAR_DROP - 1.55 - 0.38;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, len, 8), gearMats);
    strut.position.y = -len / 2;
    pivot.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, kind === 'nose' ? 0.22 : 0.34, 12), tire);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.y = -len;
    pivot.add(wheel);
    if (kind !== 'nose') {
      const wheel2 = wheel.clone();
      wheel2.position.x = x > 0 ? 0.28 : -0.28;
      wheel.position.x = x > 0 ? -0.28 : 0.28;
      pivot.add(wheel2);
      wheels.push(wheel2);
    }
    root.add(pivot);
    wheels.push(wheel);
    const retractX = kind === 'nose' ? -1.35 : 0;
    const retractZ = kind === 'nose' ? 0 : x > 0 ? -1.25 : 1.25;
    gears.push({ pivot, retractX, retractZ });
  }
  addGear(0, -11.2, 'nose');
  addGear(-2.85, 1.35, 'main');
  addGear(2.85, 1.35, 'main');

  const flapPivotR = new THREE.Group();
  flapPivotR.position.set(6.2, -0.2, 1.55);
  const flapR = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.06, 1.05), navy);
  flapR.position.set(0, 0, 0.45);
  flapPivotR.add(flapR);
  const flapPivotL = new THREE.Group();
  flapPivotL.position.set(-6.2, -0.2, 1.55);
  const flapL = flapR.clone();
  flapPivotL.add(flapL);
  root.add(flapPivotR, flapPivotL);

  const elevator = new THREE.Group();
  elevator.position.set(0, 0.55, 17.15);
  const elevMesh = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.06, 0.7), navy);
  elevMesh.position.z = 0.3;
  elevator.add(elevMesh);
  root.add(elevator);

  const rudder = new THREE.Group();
  rudder.position.set(0, 3.4, 17.5);
  const rudderMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.85), gold);
  rudderMesh.position.z = 0.35;
  rudder.add(rudderMesh);
  root.add(rudder);

  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), beaconMat);
  beacon.position.set(0, 2.05, 1);
  root.add(beacon);
  const bellyBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), beaconMat.clone());
  bellyBeacon.position.set(0, -1.7, 0);
  root.add(bellyBeacon);

  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff3030' }));
  navL.position.set(-16.7, 0.7, -4.5);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: '#35e06a' }));
  navR.position.set(16.7, 0.7, -4.5);
  const navT = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: '#f4f7ff' }));
  navT.position.set(0, 2.2, 19.2);
  root.add(navL, navR, navT);

  const strobeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const strobeL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), strobeMat);
  strobeL.position.set(-16.9, 0.95, -4.7);
  const strobeR = strobeL.clone();
  strobeR.position.x = 16.9;
  root.add(strobeL, strobeR);

  const lamp = new THREE.SpotLight(0xfff3d6, 0, 220, 0.42, 0.45, 1.1);
  lamp.position.set(0, -0.4, -13);
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(0, -6, -70);
  root.add(lamp, lampTarget);
  lamp.target = lampTarget;

  const noseMark = new THREE.Object3D();
  noseMark.name = 'nose';
  noseMark.position.set(0, 0.3, -17);
  const tailMark = new THREE.Object3D();
  tailMark.name = 'tail';
  tailMark.position.set(0, 2.2, 19.4);
  root.add(noseMark, tailMark);

  root.traverse((obj) => {
    if (obj.isMesh && options.shadows !== false) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  beacon.castShadow = false;
  bellyBeacon.castShadow = false;
  navL.castShadow = false;
  navR.castShadow = false;
  navT.castShadow = false;
  strobeL.castShadow = false;
  strobeR.castShadow = false;
  logoR.castShadow = false;
  logoL.castShadow = false;

  return {
    root,
    noseMark,
    tailMark,
    gears,
    wheels,
    flapPivots: [flapPivotR, flapPivotL],
    elevator,
    rudder,
    beacon,
    bellyBeacon,
    strobeL,
    strobeR,
    exhaustMat,
    lamp,
    gearAnim: 0,
  };
}

export function createContrails(scene) {
  const geo = new THREE.SphereGeometry(0.55, 6, 5);
  const mat = new THREE.MeshBasicMaterial({ color: '#f4f7fb', transparent: true, opacity: 0.35, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, 70);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  const pts = Array.from({ length: 70 }, () => ({ x: 0, y: -999, z: 0, life: 0 }));
  let cursor = 0;
  return {
    mesh,
    update(state, dt) {
      const emit = !state.onGround && state.throttle > 0.45 && state.speed > 45 && state.agl > 25;
      if (emit) {
        for (const p of ENGINE_POINTS) {
          const slot = pts[cursor % pts.length];
          cursor += 1;
          const v = new THREE.Vector3(p.x, p.y, p.z + 2.2).applyQuaternion(state.quaternion).add(state.position);
          slot.x = v.x;
          slot.y = v.y;
          slot.z = v.z;
          slot.life = 1;
        }
      }
      for (let i = 0; i < pts.length; i += 1) {
        const s = pts[i];
        s.life = Math.max(0, s.life - dt * 0.35);
        const scale = s.life * (0.4 + (1 - s.life) * 2.4);
        dummy.position.set(s.x, s.y, s.z);
        dummy.scale.setScalar(s.life > 0 ? scale : 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mat.opacity = 0.28;
    },
  };
}

export function updateAircraft(rig, state, input, dt) {
  rig.root.position.copy(state.position);
  rig.root.quaternion.copy(state.quaternion);
  const target = state.gearDown ? 0 : 1;
  rig.gearAnim += (target - rig.gearAnim) * Math.min(1, dt * 2.2);
  for (const g of rig.gears) {
    g.pivot.rotation.x = g.retractX * rig.gearAnim;
    g.pivot.rotation.z = g.retractZ * rig.gearAnim;
  }
  const flapAngle = -0.55 * state.flaps;
  for (const f of rig.flapPivots) f.rotation.x = flapAngle;
  rig.elevator.rotation.x = -(input?.pitch || 0) * 0.35;
  rig.rudder.rotation.y = (input?.yaw || 0) * 0.35;
  if (state.onGround) {
    const spin = state.forwardSpeed * dt / 0.38;
    for (const w of rig.wheels) w.rotation.x += spin;
  }
  const flash = Math.sin(state.time * 10) > 0.35;
  rig.beacon.visible = flash;
  rig.bellyBeacon.visible = Math.sin(state.time * 10 + 1) > 0.55;
  const strobe = Math.sin(state.time * 18) > 0.82;
  rig.strobeL.visible = strobe;
  rig.strobeR.visible = strobe;
  rig.exhaustMat.emissiveIntensity = 0.15 + state.throttle * 2.4;
  rig.lamp.intensity = state.gearDown && (state.agl < 220 || state.onGround) ? 6 : 0;
}


