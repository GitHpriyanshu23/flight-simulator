const HANDLED = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'Space',
  'KeyH',
  'KeyM',
]);

const keys = new Set();
let override = null;
const listeners = { help: [], mute: [] };

function emit(name) {
  for (const fn of listeners[name]) fn();
}

window.addEventListener('keydown', (e) => {
  if (HANDLED.has(e.code) || (e.ctrlKey && ['KeyW', 'KeyR', 'KeyT', 'KeyS'].includes(e.code))) {
    e.preventDefault();
  }
  if (e.repeat) {
    keys.add(e.code);
    return;
  }
  keys.add(e.code);
  if (e.code === 'KeyH') emit('help');
  if (e.code === 'KeyM') emit('mute');
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

window.addEventListener('blur', () => keys.clear());

export function onHelpToggle(fn) {
  listeners.help.push(fn);
}
export function onMuteToggle(fn) {
  listeners.mute.push(fn);
}

export function setInputOverride(next) {
  override = next;
}
export function clearInputOverride() {
  override = null;
}

export function clearKeys() {
  keys.clear();
}

function axis(neg, pos) {
  return (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
}

export function readInput() {
  if (override) {
    return {
      pitch: override.pitch || 0,
      roll: override.roll || 0,
      yaw: override.yaw || 0,
      throttleUp: !!override.throttleUp,
      throttleDown: !!override.throttleDown,
      brake: !!override.brake,
    };
  }
  const throttleUp = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const throttleDown = keys.has('ControlLeft') || keys.has('ControlRight');
  return {
    pitch: axis('KeyS', 'KeyW'),
    roll: axis('KeyD', 'KeyA'),
    yaw: axis('KeyE', 'KeyQ'),
    throttleUp,
    throttleDown,
    brake: keys.has('Space'),
  };
}
