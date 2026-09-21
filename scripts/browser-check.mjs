import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.env.SIM_URL || 'http://127.0.0.1:5173/?autotest=1';
const out = '/tmp/flight-sim-shots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`PAGEERROR: ${err.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#sim-canvas');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-menu.png` });

const title = await page.locator('h1').innerText();
if (title !== 'FLIGHT SIMULATOR') throw new Error(`title was ${title}`);
const nose = await page.evaluate(() => window.__TEST.noseForward);
if (!nose) throw new Error('aircraft nose is not toward -Z');

await page.getByRole('button', { name: 'START FLIGHT' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/02-started.png` });

async function state() {
  return page.evaluate(() => window.__TEST.getState());
}

async function waitUntil(pred, label, timeout = 200000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    last = await state();
    if (pred(last)) return last;
    if (last.crashed) throw new Error(`${label} crashed: ${last.crashed} ${JSON.stringify(last)}`);
    await page.waitForTimeout(400);
  }
  throw new Error(`${label} timed out ${JSON.stringify(last)}`);
}

const rolling = await waitUntil((s) => s.speed > 35, 'takeoff roll', 30000);
console.log('rolling', rolling);
await page.screenshot({ path: `${out}/03-roll.png` });

const airborne = await waitUntil((s) => !s.onGround && s.agl > 30, 'airborne', 40000);
console.log('airborne', airborne);
await page.screenshot({ path: `${out}/04-airborne.png` });

const circuit = await waitUntil((s) => s.circuit, 'circuit', 120000);
console.log('circuit', circuit);
await page.screenshot({ path: `${out}/05-circuit.png` });

const done = await waitUntil((s) => s.completed || s.mode === 'complete', 'landing', 180000);
console.log('done', done);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/06-result.png` });

const report = await page.locator('#end-title').innerText();
const quality = await page.locator('#end-quality').innerText();
const score = await page.locator('#end-score').innerText();
if (report !== 'Flight completed') throw new Error(`report title ${report}`);
if (!quality) throw new Error('missing landing quality');
if (!score || score === '0') throw new Error(`bad score ${score}`);
console.log('RESULT', { report, quality, score });

// Keyboard path, separate from the autopilot.
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('#start-flight');
await page.getByRole('button', { name: 'START FLIGHT' }).click();
await page.waitForTimeout(300);
await page.keyboard.down('Shift');
await page.waitForTimeout(2500);
await page.keyboard.up('Shift');
const powered = await state();
console.log('keyboard throttle', powered);
if (!(powered.throttle > 0.4 && powered.speed > 8)) {
  throw new Error(`keyboard throttle failed ${JSON.stringify(powered)}`);
}
await page.keyboard.down('KeyW');
await page.waitForTimeout(700);
await page.keyboard.up('KeyW');
const pitched = await state();
console.log('keyboard pitch', { pitch: pitched.pitch, speed: pitched.speed });
await page.screenshot({ path: `${out}/07-manual.png` });

const errors = logs.filter((l) => l.startsWith('PAGEERROR') || l.startsWith('error:'));
if (errors.length) {
  console.log(errors.slice(0, 20).join('\n'));
  throw new Error('page errors');
}
console.log('BROWSER OK');
await browser.close();
