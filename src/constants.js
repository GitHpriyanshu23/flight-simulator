/** Shared frame: y-up, aircraft nose is local -Z, heading 0 is north (world -Z), heading increases clockwise. */

export const GROUND = 0.03;
export const GEAR_DROP = 4.15;
export const REST_Y = GROUND + GEAR_DROP;

export const RUNWAY = {
  halfWidth: 22,
  visualHalf: 26,
  zSouth: 210,
  zNorth: -2200,
  aimZ: -340,
  glideDeg: 3,
  spawnX: 0,
  spawnZ: 40,
};

export const VR_MS = 62;
export const MS_TO_KT = 1.943844;
export const M_TO_FT = 3.28084;

export const GEAR_POINTS = [
  { x: 0, y: -GEAR_DROP, z: -11.4, name: 'nose' },
  { x: -2.85, y: -GEAR_DROP, z: 1.35, name: 'mainL' },
  { x: 2.85, y: -GEAR_DROP, z: 1.35, name: 'mainR' },
];

export const BELLY_POINTS = [
  { x: 0, y: -1.85, z: -4 },
  { x: 0, y: -1.85, z: 6 },
  { x: -1.4, y: -1.7, z: 1 },
  { x: 1.4, y: -1.7, z: 1 },
];

export const TAIL_POINT = { x: 0, y: -0.85, z: 18.4 };

export const ENGINE_POINTS = [
  { x: -5.7, y: -1.45, z: 2.55 },
  { x: 5.7, y: -1.45, z: 2.55 },
];

export function aglOf(y) {
  return y - REST_Y;
}

export function glideAltitude(z) {
  const dist = z - RUNWAY.aimZ;
  if (dist <= 0) return 0;
  return dist * Math.tan((RUNWAY.glideDeg * Math.PI) / 180);
}

export function onRunway(x, z) {
  return Math.abs(x) <= RUNWAY.halfWidth && z <= RUNWAY.zSouth - 20 && z >= RUNWAY.zNorth + 30;
}

export function wrapDeg(e) {
  let a = e % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

export function mod360(d) {
  return ((d % 360) + 360) % 360;
}
