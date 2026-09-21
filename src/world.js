import * as THREE from 'three';
import { GROUND, RUNWAY } from './constants.js';
import { BUILDINGS, CITY, LAKE, MOUNTAINS, PARKED, TREES } from './layout.js';
import { buildAircraft } from './aircraft.js';
import { quaternionForAttitude } from './physics.js';

const SUN = new THREE.Vector3(-0.62, 0.74, 0.28).normalize();

function canvasTex(draw, w = 512, h = 512, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}

function noiseFill(g, w, h, base, specks, alpha) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < specks; i += 1) {
    const shade = 30 + Math.random() * 50;
    g.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
}

function textPlane(text, width, height, color, bg) {
  const tex = canvasTex((g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = color;
    g.font = `700 ${Math.floor(h * 0.62)}px Barlow, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  }, 256, 128, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function addBox(parent, w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function createWorld(scene) {
  scene.fog = new THREE.Fog(0xe7d3b4, 2400, 8200);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(14000, 40, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#2a62b0') },
        mid: { value: new THREE.Color('#8ec0ea') },
        horizon: { value: new THREE.Color('#f3d7b4') },
        sunDir: { value: SUN.clone() },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wpos = modelMatrix * vec4(position, 1.0);
          vWorld = position;
          gl_Position = projectionMatrix * viewMatrix * wpos;
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 top;
        uniform vec3 mid;
        uniform vec3 horizon;
        uniform vec3 sunDir;
        void main() {
          vec3 dir = normalize(vWorld);
          float h = dir.y;
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.28, h));
          col = mix(col, top, smoothstep(0.18, 0.75, h));
          col = mix(horizon, col, smoothstep(-0.08, 0.06, h));
          float sun = pow(max(dot(dir, sunDir), 0.0), 90.0);
          float glow = pow(max(dot(dir, sunDir), 0.0), 6.0);
          col += vec3(1.0, 0.86, 0.62) * sun;
          col += vec3(1.0, 0.72, 0.42) * glow * 0.28;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xd5e4ff, 0x6d8f4e, 0.78);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d4, 2.65);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 2200;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0x9ec2ff, 0.38);
  fill.position.set(200, 80, -120);
  scene.add(fill);

  const grassTex = canvasTex((g, w, h) => {
    g.fillStyle = '#347843';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i += 1) {
      const green = 90 + Math.random() * 80;
      g.fillStyle = `rgba(${30 + Math.random() * 30},${green},${40 + Math.random() * 30},0.22)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 1 + Math.random() * 3);
    }
    g.globalAlpha = 0.035;
    for (let y = 0; y < h; y += 18) {
      g.fillStyle = y % 36 === 0 ? '#d7ffd0' : '#042008';
      g.fillRect(0, y, w, 9);
    }
  }, 512, 512, 70, 70);
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(9000, 48),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95, metalness: 0 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  const asphaltTex = canvasTex((g, w, h) => noiseFill(g, w, h, '#3a3e46', 2500, 0.35), 256, 256, 8, 40);
  const runwayLen = RUNWAY.zSouth - RUNWAY.zNorth;
  const runway = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.visualHalf * 2, 0.06, runwayLen),
    new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.88, metalness: 0.04, color: '#b7bcc6' }),
  );
  runway.position.set(0, GROUND - 0.01, (RUNWAY.zSouth + RUNWAY.zNorth) / 2);
  runway.receiveShadow = true;
  scene.add(runway);

  const shoulder = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.visualHalf * 2 + 28, 0.04, runwayLen + 20),
    new THREE.MeshStandardMaterial({ color: '#6d6a52', roughness: 1 }),
  );
  shoulder.position.set(0, GROUND - 0.03, runway.position.z);
  shoulder.receiveShadow = true;
  scene.add(shoulder);

  const paint = new THREE.MeshStandardMaterial({ color: '#f3f0e6', roughness: 0.6 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#f0c84a', roughness: 0.55 });
  const markGroup = new THREE.Group();
  scene.add(markGroup);

  const centerCount = Math.floor(runwayLen / 46);
  const centerGeo = new THREE.BoxGeometry(0.7, 0.02, 22);
  const center = new THREE.InstancedMesh(centerGeo, paint, centerCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < centerCount; i += 1) {
    dummy.position.set(0, GROUND + 0.045, RUNWAY.zSouth - 30 - i * 46);
    dummy.updateMatrix();
    center.setMatrixAt(i, dummy.matrix);
  }
  center.receiveShadow = true;
  markGroup.add(center);

  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, runwayLen - 30), paint);
    edge.position.set(side * (RUNWAY.visualHalf - 1.2), GROUND + 0.045, runway.position.z);
    markGroup.add(edge);
  }

  function piano(z, dir) {
    for (let i = 0; i < 10; i += 1) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.02, 28), paint);
      stripe.position.set(-22 + i * 4.6, GROUND + 0.05, z + dir * 8);
      markGroup.add(stripe);
    }
  }
  piano(RUNWAY.zSouth - 36, -1);
  piano(RUNWAY.zNorth + 36, 1);

  const num36 = textPlane('36', 16, 28, '#f4f1e8', 'rgba(0,0,0,0)');
  num36.position.set(0, GROUND + 0.06, RUNWAY.zSouth - 95);
  num36.rotation.z = Math.PI;
  markGroup.add(num36);
  const num18 = textPlane('18', 16, 28, '#f4f1e8', 'rgba(0,0,0,0)');
  num18.position.set(0, GROUND + 0.06, RUNWAY.zNorth + 110);
  markGroup.add(num18);

  for (const z of [-280, -520]) {
    for (const side of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.02, 46), paint);
      bar.position.set(side * 10, GROUND + 0.05, z);
      markGroup.add(bar);
    }
  }

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(340, 0.08, 980),
    new THREE.MeshStandardMaterial({ color: '#c8c2b4', roughness: 0.92 }),
  );
  apron.position.set(230, GROUND - 0.01, -640);
  apron.receiveShadow = true;
  scene.add(apron);

  const taxi = new THREE.Mesh(
    new THREE.BoxGeometry(150, 0.05, 22),
    new THREE.MeshStandardMaterial({ map: asphaltTex, color: '#c5cad2', roughness: 0.9 }),
  );
  taxi.position.set(100, GROUND, -620);
  taxi.receiveShadow = true;
  scene.add(taxi);
  const taxiLine = new THREE.Mesh(new THREE.BoxGeometry(140, 0.02, 0.35), yellow);
  taxiLine.position.set(100, GROUND + 0.05, -620);
  markGroup.add(taxiLine);
  for (const x of [40, 70]) {
    const hold = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 18), yellow);
    hold.position.set(x, GROUND + 0.05, -620);
    markGroup.add(hold);
  }

  const concrete = stdBuilding();
  for (const b of BUILDINGS) addBuilding(scene, b, concrete);
  for (const c of CITY) {
    const mat = new THREE.MeshStandardMaterial({
      color: c.h > 80 ? '#d5dde6' : '#b7c3cf',
      roughness: 0.55,
      metalness: 0.18,
    });
    const tower = addBox(scene, c.w, c.h, c.d, mat, c.x, c.h / 2, c.z);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(c.w + 0.2, c.h * 0.72, c.d + 0.2),
      new THREE.MeshStandardMaterial({ color: '#8fb4c9', roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.35 }),
    );
    glass.position.set(c.x, c.h * 0.48, c.z);
    scene.add(glass);
    tower.castShadow = true;
  }

  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshStandardMaterial({ color: '#2f86a0', roughness: 0.12, metalness: 0.45 }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(LAKE.rx, LAKE.rz, 1);
  lake.position.set(LAKE.x, 0.02, LAKE.z);
  lake.receiveShadow = true;
  scene.add(lake);

  for (const m of MOUNTAINS) {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(m.r, m.h, 18),
      new THREE.MeshStandardMaterial({ color: '#9aabaf', roughness: 0.95 }),
    );
    mesh.position.set(m.x, m.h * 0.42, m.z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 1, 5);
  const crownGeo = new THREE.ConeGeometry(1, 1, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6a4632', roughness: 0.9 });
  const crownMat = new THREE.MeshStandardMaterial({ color: '#2f7d40', roughness: 0.85 });
  const crownMat2 = new THREE.MeshStandardMaterial({ color: '#3f8f48', roughness: 0.85 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, TREES.length);
  const crowns2 = new THREE.InstancedMesh(crownGeo, crownMat2, TREES.length);
  TREES.forEach((t, i) => {
    dummy.position.set(t.x, t.h * 0.22, t.z);
    dummy.scale.set(1, t.h * 0.45, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, t.h * 0.62, t.z);
    dummy.scale.set(t.r, t.h * 0.55, t.r);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, t.h * 0.78, t.z);
    dummy.scale.set(t.r * 0.75, t.h * 0.4, t.r * 0.75);
    dummy.updateMatrix();
    crowns2.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = false;
  crowns.castShadow = false;
  scene.add(trunks, crowns, crowns2);

  const parked = [];
  for (const p of PARKED) {
    const jet = buildAircraft({ livery: 'parked', shadows: true });
    quaternionForAttitude(jet.root.quaternion, p.heading, 0, 0);
    jet.root.position.set(p.x, 4.18, p.z);
    jet.gearAnim = 0;
    scene.add(jet.root);
    parked.push(jet);
  }

  addVehicles(scene);
  const lights = addAirfieldLights(scene);
  const papi = addPapi(scene);
  const windsock = addWindsock(scene);
  const clouds = addClouds(scene);
  const sign = makeSign();
  sign.position.set(-42, 0, 120);
  scene.add(sign);
  const terminalSign = makeTerminalSign();
  terminalSign.position.set(150, 0, -470);
  scene.add(terminalSign);

  return {
    sky,
    sun,
    papi,
    update(dt, camera, aircraftPos, aircraftState) {
      sky.position.copy(camera.position);
      const agl = aircraftState ? aircraftState.agl : 0;
      const ext = THREE.MathUtils.clamp(260 + agl * 0.85, 260, 1100);
      sun.position.copy(aircraftPos).addScaledVector(SUN, 700);
      sun.target.position.copy(aircraftPos);
      sun.target.updateMatrixWorld();
      sun.shadow.camera.left = -ext;
      sun.shadow.camera.right = ext;
      sun.shadow.camera.top = ext;
      sun.shadow.camera.bottom = -ext;
      sun.shadow.camera.updateProjectionMatrix();

      const t = performance.now() * 0.001;
      lights.approach.forEach((mesh, i) => {
        const pulse = Math.pow(Math.max(0, Math.sin(t * 5.2 - i * 0.45)), 8);
        mesh.material.opacity = 0.35 + pulse * 0.65;
      });
      if (aircraftState) {
        const dz = aircraftState.position.z - papi.z;
        const dy = aircraftState.position.y - 1.4;
        const ang = (Math.atan2(dy, Math.max(30, dz)) * 180) / Math.PI;
        const cuts = [3.5, 3.17, 2.83, 2.5];
        const show = dz > 40 && Math.abs(aircraftState.position.x) < 900;
        papi.lamps.forEach((lamp, i) => {
          const white = show && ang > cuts[i];
          lamp.material.color.set(white ? '#fff6ea' : '#ff3b3b');
          lamp.material.opacity = show ? 1 : 0.35;
        });
        papi.angle = ang;
        papi.visibleApproach = show;
      }
      windsock.fabric.rotation.z = Math.sin(t * 1.7) * 0.12 - 0.4;
      windsock.fabric.rotation.y = Math.sin(t * 0.6) * 0.2 + 0.4;
      clouds.position.x = Math.sin(t * 0.015) * 80;
    },
  };
}

function stdBuilding() {
  return {
    wall: new THREE.MeshStandardMaterial({ color: '#efe8dc', roughness: 0.72, metalness: 0.02 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#9fd0de',
      roughness: 0.08,
      metalness: 0.62,
      transparent: true,
      opacity: 0.72,
    }),
    dark: new THREE.MeshStandardMaterial({ color: '#243038', roughness: 0.5, metalness: 0.3 }),
    roof: new THREE.MeshStandardMaterial({ color: '#d9d2c5', roughness: 0.8 }),
    red: new THREE.MeshStandardMaterial({ color: '#b4232c', roughness: 0.5 }),
  };
}

function addBuilding(scene, b, mats) {
  if (b.kind === 'tower') {
    addBox(scene, b.w, b.h - 8, b.d, mats.wall, b.x, (b.h - 8) / 2, b.z);
    addBox(scene, b.w + 3.5, 7, b.d + 3.5, mats.glass, b.x, b.h - 5, b.z);
    addBox(scene, 0.4, 10, 0.4, mats.dark, b.x, b.h + 3, b.z);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2d2d' }));
    beacon.position.set(b.x, b.h + 8, b.z);
    beacon.name = 'tower-beacon';
    scene.add(beacon);
    return;
  }
  if (b.kind === 'hangar') {
    addBox(scene, b.w, b.h, b.d, new THREE.MeshStandardMaterial({ color: '#c5ccd4', roughness: 0.62, metalness: 0.25 }), b.x, b.h / 2, b.z);
    addBox(scene, b.w * 0.72, b.h * 0.62, 0.4, new THREE.MeshStandardMaterial({ color: '#8d98a3' }), b.x, b.h * 0.38, b.z + b.d / 2);
    return;
  }
  if (b.kind === 'fuel') {
    for (const dx of [-8, 0, 8]) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 4.2, 16, 16),
        new THREE.MeshStandardMaterial({ color: '#f4f7f8', roughness: 0.35, metalness: 0.4 }),
      );
      tank.rotation.z = Math.PI / 2;
      tank.position.set(b.x + dx, 5, b.z);
      tank.castShadow = true;
      scene.add(tank);
    }
    return;
  }
  addBox(scene, b.w, b.h, b.d, mats.wall, b.x, b.h / 2, b.z);
  addBox(scene, b.w * 0.92, b.h * 0.55, b.d + 0.4, mats.glass, b.x, b.h * 0.58, b.z);
  if (b.kind === 'terminal') {
    const name = textPlane('HORIZON FIELD', 52, 8, '#143d66', 'rgba(255,255,255,0)');
    name.rotation.set(0, Math.PI / 2, 0);
    name.position.set(b.x - b.w / 2 - 0.5, b.h * 0.72, b.z);
    scene.add(name);
    for (const dz of [-70, 0, 70]) {
      addBox(scene, 16, 4, 6, mats.dark, b.x - b.w / 2 - 6, 6, b.z + dz);
      addBox(scene, 10, 0.4, 5, mats.roof, b.x - b.w / 2 + 2, 7.5, b.z + dz);
    }
  }
  if (b.kind === 'fire') {
    addBox(scene, 8, 3.2, 0.3, mats.red, b.x, 3, b.z + b.d / 2);
  }
}

function addVehicles(scene) {
  const colors = ['#f2f2f2', '#d24a3a', '#1f4e89', '#f0c84a', '#2f2f2f', '#ded6c8'];
  const body = new THREE.BoxGeometry(4.2, 1.3, 1.8);
  const cabin = new THREE.BoxGeometry(2.1, 0.9, 1.6);
  for (let i = 0; i < 14; i += 1) {
    const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.5, metalness: 0.2 });
    const car = new THREE.Mesh(body, mat);
    const row = Math.floor(i / 7);
    car.position.set(250 + (i % 7) * 8, 1.1, -360 - row * 12);
    car.castShadow = true;
    scene.add(car);
    const top = new THREE.Mesh(cabin, new THREE.MeshStandardMaterial({ color: '#9fd0de', roughness: 0.1, metalness: 0.4 }));
    top.position.set(car.position.x + 0.3, 2.0, car.position.z);
    scene.add(top);
  }
  const truckMat = new THREE.MeshStandardMaterial({ color: '#e8f2ff', roughness: 0.4 });
  const truck = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 2.6), truckMat);
  truck.position.set(150, 1.7, -250);
  truck.castShadow = true;
  scene.add(truck);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.4), new THREE.MeshStandardMaterial({ color: '#f0c84a' }));
  cab.position.set(146.2, 1.6, -250);
  scene.add(cab);
  const follow = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 1.6), new THREE.MeshStandardMaterial({ color: '#ffbf1f' }));
  follow.position.set(70, 1.1, -500);
  follow.castShadow = true;
  scene.add(follow);
  const stairs = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 1.2), new THREE.MeshStandardMaterial({ color: '#d7dde5' }));
  stairs.position.set(168, 1.4, -700);
  scene.add(stairs);
}

function addAirfieldLights(scene) {
  const white = new THREE.MeshBasicMaterial({ color: '#fff8ea' });
  const red = new THREE.MeshBasicMaterial({ color: '#ff3a3a' });
  const green = new THREE.MeshBasicMaterial({ color: '#3dff7a' });
  const amber = new THREE.MeshBasicMaterial({ color: '#ffbf3c' });
  const geo = new THREE.SphereGeometry(0.38, 8, 6);
  const len = RUNWAY.zSouth - RUNWAY.zNorth;
  const n = Math.floor(len / 48);
  function row(x, mat, z0, count, step) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      dummy.position.set(x, 0.55, z0 - i * step);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    scene.add(mesh);
    return mesh;
  }
  row(RUNWAY.visualHalf + 1.5, white, RUNWAY.zSouth - 10, n, 48);
  row(-RUNWAY.visualHalf - 1.5, white, RUNWAY.zSouth - 10, n, 48);
  row(0, amber, RUNWAY.zSouth - 20, Math.floor(n / 2), 60);

  for (const z of [RUNWAY.zSouth - 8, RUNWAY.zNorth + 8]) {
    for (let i = -4; i <= 4; i += 1) {
      const m = new THREE.Mesh(geo, green);
      m.position.set(i * 4.2, 0.5, z);
      scene.add(m);
    }
  }
  for (const z of [RUNWAY.zSouth + 6, RUNWAY.zNorth - 6]) {
    for (let i = -3; i <= 3; i += 1) {
      const m = new THREE.Mesh(geo, red);
      m.position.set(i * 3.5, 0.45, z);
      scene.add(m);
    }
  }

  const approach = [];
  const appMat = new THREE.MeshBasicMaterial({ color: '#fffaf2', transparent: true, opacity: 1 });
  for (let i = 0; i < 28; i += 1) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), appMat.clone());
    m.position.set(0, 0.7, 260 + i * 32);
    scene.add(m);
    approach.push(m);
  }
  for (let i = -3; i <= 3; i += 1) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), white);
    m.position.set(i * 6, 0.8, 760);
    scene.add(m);
  }
  return { approach };
}

function addPapi(scene) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.4, 1.4),
    new THREE.MeshStandardMaterial({ color: '#202428' }),
  );
  base.position.y = 0.3;
  group.add(base);
  const lamps = [];
  for (let i = 0; i < 4; i += 1) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.7, 0.7),
      new THREE.MeshBasicMaterial({ color: '#ff3b3b' }),
    );
    lamp.position.set(-3 + i * 2, 0.9, 0);
    group.add(lamp);
    lamps.push(lamp);
  }
  group.position.set(-36, 0, -240);
  scene.add(group);
  return { lamps, z: -240, angle: 3, visibleApproach: false };
}

function addWindsock(scene) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 8, 8),
    new THREE.MeshStandardMaterial({ color: '#f4f4f4' }),
  );
  pole.position.set(-48, 4, 150);
  pole.castShadow = true;
  scene.add(pole);
  const fabric = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 3.2, 8),
    new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6 }),
  );
  fabric.rotation.z = -0.5;
  fabric.position.set(-46.2, 7.3, 150);
  scene.add(fabric);
  return { fabric };
}

function addClouds(scene) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: '#fffaf6',
    roughness: 1,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const puff = new THREE.InstancedMesh(geo, mat, 90);
  const dummy = new THREE.Object3D();
  const clusters = [
    [400, 520, -800],
    [-900, 640, 200],
    [1200, 700, 900],
    [-1600, 560, -1600],
    [600, 820, -2200],
    [-400, 600, 1800],
    [1800, 740, -400],
  ];
  let i = 0;
  for (const [cx, cy, cz] of clusters) {
    for (let k = 0; k < 12 && i < 90; k += 1, i += 1) {
      dummy.position.set(cx + (Math.random() - 0.5) * 180, cy + (Math.random() - 0.5) * 30, cz + (Math.random() - 0.5) * 90);
      const s = 28 + Math.random() * 36;
      dummy.scale.set(s, s * 0.55, s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      puff.setMatrixAt(i, dummy.matrix);
    }
  }
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  for (; i < 90; i += 1) puff.setMatrixAt(i, dummy.matrix);
  group.add(puff);
  scene.add(group);
  return group;
}

function makeSign() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 0.3), new THREE.MeshStandardMaterial({ color: '#222' }));
  pole.position.y = 1.6;
  group.add(pole);
  const board = textPlane('36 — 18', 7, 2.4, '#f4f1e8', '#20262c');
  board.rotation.x = 0;
  board.position.y = 3.3;
  group.add(board);
  return group;
}

function makeTerminalSign() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 4, 8), new THREE.MeshStandardMaterial({ color: '#243038' }));
  pole.position.y = 2;
  group.add(pole);
  const board = textPlane('TERMINAL A', 12, 2.6, '#143d66', '#f7f1e6');
  board.rotation.x = 0;
  board.position.y = 4.2;
  group.add(board);
  return group;
}

export { SUN };
