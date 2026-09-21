import { M_TO_FT, MS_TO_KT, RUNWAY, glideAltitude, mod360, wrapDeg } from './constants.js';
import { engineLabel, flightStatus, objectiveFor } from './physics.js';

function $(id) {
  return document.getElementById(id);
}

function formatTime(t) {
  const s = Math.max(0, Math.floor(t));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function hdgLabel(d) {
  const m = mod360(d);
  if (m === 0) return 'N';
  if (m === 90) return 'E';
  if (m === 180) return 'S';
  if (m === 270) return 'W';
  return String(Math.round(m)).padStart(3, '0');
}

export function createHud() {
  const marks = $('hdg-marks');
  const markEls = Array.from({ length: 11 }, () => {
    const el = document.createElement('div');
    el.className = 'hdg-mark';
    marks.appendChild(el);
    return el;
  });
  const ladder = $('ai-ladder');
  for (let deg = -30; deg <= 30; deg += 10) {
    if (deg === 0) continue;
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.dataset.deg = String(deg);
    ladder.appendChild(tick);
  }
  const papi = $('papi-dots');
  const dots = Array.from({ length: 4 }, () => {
    const i = document.createElement('i');
    papi.appendChild(i);
    return i;
  });
  const map = $('minimap');
  const ctx = map.getContext('2d');
  const trail = [];
  let toastTimer = 0;
  let helpOn = true;

  function setHelp(on) {
    helpOn = on;
    $('help').classList.toggle('hidden', !on);
  }

  $('help-hide').addEventListener('click', () => setHelp(false));
  $('controls-toggle').addEventListener('click', () => setHelp(!helpOn));

  return {
    setHelp,
    helpVisible: () => helpOn,
    toast(text) {
      const el = $('toast');
      el.textContent = text;
      el.classList.add('show');
      toastTimer = 2.2;
    },
    tickToast(dt) {
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) $('toast').classList.remove('show');
      }
    },
    update(state, mode, worldPapi) {
      $('objective').textContent = objectiveFor(state);
      $('status').textContent = flightStatus(state, mode);
      const ias = Math.round(state.speed * MS_TO_KT);
      const alt = Math.round(state.agl * M_TO_FT);
      const fpm = Math.round(state.vs * M_TO_FT * 60);
      $('ias').textContent = String(ias);
      $('alt').textContent = alt.toLocaleString('en-US');
      $('vs').textContent = `${fpm >= 0 ? '+' : ''}${fpm} FPM`;
      $('vs').className = fpm < -500 ? 'vs bad' : 'vs';
      $('engine').textContent = `${engineLabel(state)}  ${Math.round(state.throttle * 100)}%`;
      $('throttle-fill').style.width = `${Math.round(state.throttle * 100)}%`;
      $('gear-ind').textContent = state.gearDown ? 'GEAR DN' : 'GEAR UP';
      const flap = state.flaps > 0.8 ? 'LDG' : state.flaps > 0.4 ? 'TO' : 'UP';
      $('flap-ind').textContent = `FLAPS ${flap}`;
      $('time-ind').textContent = formatTime(state.time);
      $('hdg-readout').textContent = hdgLabel(state.headingDeg === 0 ? 0 : state.headingDeg);

      const px = 3.1;
      const base = Math.floor((state.headingDeg - 50) / 10) * 10;
      markEls.forEach((el, i) => {
        const d = base + i * 10;
        const delta = wrapDeg(d - state.headingDeg);
        el.textContent = hdgLabel(d);
        el.style.left = `${50 + (delta * px) / 1.6}%`;
        el.classList.toggle('card', mod360(d) % 90 === 0);
        el.style.opacity = Math.abs(delta) > 52 ? '0' : '1';
      });

      const vx = -state.position.x;
      const vz = RUNWAY.aimZ - state.position.z;
      const bearing = (Math.atan2(vx, -vz) * 180) / Math.PI;
      const bugDelta = wrapDeg(bearing - state.headingDeg);
      $('hdg-bug').style.left = `${50 + bugDelta * 0.9}%`;
      $('hdg-bug').style.opacity = state.everAirborne ? '1' : '0';

      const bank = state.bankDeg;
      const pitchPx = -state.pitchDeg * 2.1;
      $('ai-rot').style.transform = `rotate(${-bank}deg)`;
      $('ai-shift').style.transform = `translateY(${pitchPx}px)`;
      ladder.querySelectorAll('.tick').forEach((tick) => {
        const deg = Number(tick.dataset.deg);
        tick.style.top = `${50 - deg * 2.1}px`;
      });

      const showIls =
    !state.onGround &&
    state.circuitComplete &&
    state.position.z > RUNWAY.aimZ - 400 &&
    Math.abs(wrapDeg(state.headingDeg)) < 70;
      $('fd-pitch').style.display = showIls ? 'block' : 'none';
      $('fd-bank').style.display = showIls ? 'block' : 'none';
      const gsAlt = glideAltitude(state.position.z);
      const gsErr = state.agl - gsAlt;
      const loc = Math.max(-1, Math.min(1, state.position.x / 90));
      const gs = Math.max(-1, Math.min(1, gsErr / 40));
      $('loc-needle').style.left = `${50 + loc * 42}%`;
      $('gs-needle').style.top = `${50 + gs * 42}%`;
      if (showIls) {
        $('fd-bank').style.left = `${50 + loc * 28}%`;
        $('fd-pitch').style.top = `${50 + gs * 28}%`;
      }

      const cuts = [3.5, 3.17, 2.83, 2.5];
      const ang = worldPapi ? worldPapi.angle : 3;
      const showP = worldPapi ? worldPapi.visibleApproach : false;
      dots.forEach((dot, i) => {
        const white = showP && ang > cuts[i];
        dot.style.background = white ? '#fff6ea' : '#ff3b3b';
        dot.style.opacity = showP ? '1' : '0.35';
      });

      const warn = $('warnings');
      warn.replaceChildren();
      const list = mode === 'flight' ? warningsOf(state) : [];
      for (const text of list) {
        const s = document.createElement('span');
        s.textContent = text;
        warn.appendChild(s);
      }

      if (state.everAirborne) {
        trail.push({ x: state.position.x, z: state.position.z });
        if (trail.length > 80) trail.shift();
      }
      drawMap(ctx, state, trail);
    },
    showReport(state, success) {
      const end = $('end');
      end.hidden = false;
      $('end-title').textContent = success ? 'Flight completed' : 'Flight failed';
      $('end-kicker').textContent = success ? 'FLIGHT REPORT' : 'INCIDENT';
      $('end-reason').textContent = success ? '' : state.crashed?.reason || '';
      const quality = success ? state.score?.quality || state.touchdown?.quality || '' : '';
      $('end-quality').textContent = quality;
      $('end-quality').style.display = quality ? 'block' : 'none';
      $('end-quality-label').style.display = quality ? 'block' : 'none';
      $('end-time').textContent = formatTime(state.time);
      $('end-score').textContent = success ? (state.score?.total || 0).toLocaleString('en-US') : '0';
      const list = $('end-breakdown');
      list.replaceChildren();
      if (success && state.score) {
        const rows = [
          ['Landing', state.score.landing],
          ['Circuit', state.score.circuit],
          ['Time bonus', state.score.timeBonus],
          ['Smoothness', state.score.smooth],
          ['Lineup', state.score.lineup],
        ];
        for (const [name, value] of rows) {
          const li = document.createElement('li');
          li.innerHTML = `<span>${name}</span><span>${value}</span>`;
          list.appendChild(li);
        }
      }
      $('play-again').textContent = success ? 'PLAY AGAIN' : 'RESTART';
    },
    hideReport() {
      $('end').hidden = true;
    },
  };
}

function warningsOf(state) {
  const w = [];
  if (state.stalling && !state.onGround) w.push('STALL');
  else if (!state.onGround && state.everAirborne && state.speed * MS_TO_KT < 100 && state.flaps < 0.7) w.push('LOW SPEED');
  if (!state.onGround && state.vs < -7) w.push('SINK RATE');
  if (Math.abs(state.bankDeg) > 40) w.push('BANK ANGLE');
  if (state.speed > 150) w.push('OVERSPEED');
  const aligned = Math.abs(wrapDeg(state.headingDeg)) < 28 && Math.abs(state.position.x) < 70;
  if (!state.onGround && state.everAirborne && state.agl < 26 && state.vs < -1 && !aligned) w.push('TOO LOW');
  return w;
}

function drawMap(ctx, state, trail) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const scale = 70 / 900;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#163226';
  ctx.fillRect(0, 0, w, h);
  const toX = (x) => cx + (x - state.position.x) * scale;
  const toY = (z) => cy + (z - state.position.z) * scale;

  if (!state.circuitComplete) {
    ctx.strokeStyle = 'rgba(255,191,60,0.7)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const path = [
      [0, 40],
      [0, -1800],
      [-760, -1800],
      [-760, 1300],
      [0, 1300],
      [0, -300],
    ];
    path.forEach((p, i) => {
      const x = toX(p[0]);
      const y = toY(p[1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = '#4b515c';
  const rwTop = toY(RUNWAY.zNorth);
  const rwBot = toY(RUNWAY.zSouth);
  ctx.fillRect(toX(-26), Math.min(rwTop, rwBot), 52 * scale, Math.abs(rwBot - rwTop));
  ctx.fillStyle = '#c8c2b4';
  const apronTop = toY(-1100);
  const apronBot = toY(-160);
  ctx.fillRect(toX(90), Math.min(apronTop, apronBot), 250 * scale, Math.abs(apronBot - apronTop));

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  trail.forEach((p, i) => {
    const x = toX(p.x);
    const y = toY(p.z);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.translate(cx, cy);
  ctx.rotate((state.headingDeg * Math.PI) / 180);
  ctx.fillStyle = '#ffbf3c';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
