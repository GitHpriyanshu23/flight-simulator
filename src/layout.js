import { RUNWAY } from './constants.js';

/** Axis-aligned building specs. x/z are centers, w is east-west, d is north-south, h is height. */
export const BUILDINGS = [
  { name: 'Terminal', x: 248, z: -690, w: 210, d: 46, h: 18, kind: 'terminal' },
  { name: 'Tower', x: 196, z: -250, w: 14, d: 14, h: 52, kind: 'tower' },
  { name: 'Hangar', x: 300, z: -210, w: 62, d: 48, h: 16, kind: 'hangar' },
  { name: 'Cargo hall', x: 210, z: -430, w: 54, d: 32, h: 11, kind: 'cargo' },
  { name: 'Fire station', x: 168, z: -120, w: 28, d: 18, h: 8, kind: 'fire' },
  { name: 'Fuel farm', x: 330, z: -500, w: 26, d: 36, h: 7, kind: 'fuel' },
];

export const PARKED = [
  { x: 186, z: -820, heading: 90 },
  { x: 186, z: -575, heading: 90 },
];

export const LAKE = { x: -1100, z: -280, rx: 280, rz: 190 };

export const MOUNTAINS = [
  { x: -3600, z: -4200, r: 980, h: 620 },
  { x: -1800, z: -5200, r: 1200, h: 780 },
  { x: 900, z: -5400, r: 1100, h: 700 },
  { x: 3200, z: -4000, r: 900, h: 540 },
  { x: 4600, z: -1600, r: 1000, h: 640 },
  { x: 4200, z: 900, r: 860, h: 480 },
  { x: 2400, z: 2800, r: 1100, h: 560 },
  { x: -400, z: 3600, r: 1300, h: 720 },
  { x: -2800, z: 3000, r: 1000, h: 600 },
  { x: -4800, z: 400, r: 900, h: 520 },
  { x: -4600, z: -1800, r: 800, h: 460 },
  { x: 1400, z: -2800, r: 520, h: 280 },
];

const CITY = [
  { x: 1680, z: -860, w: 34, d: 34, h: 70 },
  { x: 1740, z: -800, w: 28, d: 28, h: 110 },
  { x: 1800, z: -900, w: 40, d: 30, h: 48 },
  { x: 1620, z: -720, w: 26, d: 26, h: 86 },
  { x: 1880, z: -740, w: 32, d: 32, h: 64 },
  { x: 1700, z: -640, w: 22, d: 36, h: 40 },
  { x: 1960, z: -820, w: 30, d: 24, h: 92 },
  { x: 1580, z: -940, w: 36, d: 28, h: 36 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blocked(x, z) {
  if (Math.abs(x) < 90 && z < RUNWAY.zSouth + 80 && z > RUNWAY.zNorth - 80) return true;
  if (Math.abs(x) < 120 && z > RUNWAY.zSouth - 40 && z < 1700) return true;
  if (x > 70 && x < 420 && z > -1100 && z < -60) return true;
  const dx = (x - LAKE.x) / LAKE.rx;
  const dz = (z - LAKE.z) / LAKE.rz;
  if (dx * dx + dz * dz < 1.15) return true;
  return false;
}

export function generateTrees(count = 240, seed = 11) {
  const rand = mulberry32(seed);
  const trees = [];
  let guard = 0;
  while (trees.length < count && guard < 8000) {
    guard += 1;
    const x = (rand() * 2 - 1) * 2400;
    const z = (rand() * 2 - 1) * 2600 - 200;
    if (blocked(x, z)) continue;
    const h = 7 + rand() * 9;
    const r = 2.1 + rand() * 1.8;
    const kind = rand();
    trees.push({ x, z, h, r, kind });
  }
  return trees;
}

export const TREES = generateTrees();

export function staticColliders() {
  const boxes = [];
  for (const b of BUILDINGS) {
    boxes.push({
      type: 'box',
      name: b.name,
      minX: b.x - b.w / 2,
      maxX: b.x + b.w / 2,
      minY: 0,
      maxY: b.h,
      minZ: b.z - b.d / 2,
      maxZ: b.z + b.d / 2,
    });
  }
  for (const c of CITY) {
    boxes.push({
      type: 'box',
      name: 'City tower',
      minX: c.x - c.w / 2,
      maxX: c.x + c.w / 2,
      minY: 0,
      maxY: c.h,
      minZ: c.z - c.d / 2,
      maxZ: c.z + c.d / 2,
    });
  }
  for (const p of PARKED) {
    const halfLong = 20;
    const halfWide = 18;
    const alongX = Math.abs(((p.heading % 180) + 180) % 180) > 45;
    boxes.push({
      type: 'box',
      name: 'Parked aircraft',
      minX: p.x - (alongX ? halfLong : halfWide),
      maxX: p.x + (alongX ? halfLong : halfWide),
      minY: 0,
      maxY: 12,
      minZ: p.z - (alongX ? halfWide : halfLong),
      maxZ: p.z + (alongX ? halfWide : halfLong),
    });
  }
  for (const m of MOUNTAINS) {
    boxes.push({ type: 'cone', name: 'terrain', x: m.x, z: m.z, radius: m.r * 0.72, height: m.h * 0.92 });
  }
  return boxes;
}

export function treeList() {
  return TREES;
}

export { CITY };
