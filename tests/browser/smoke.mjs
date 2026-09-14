// Headless-browser smoke test: serves the project over localhost, loads index.html,
// and asserts no console errors, canvas present at sim resolution, live FPS, etc.
// Usage: node tests/browser/smoke.mjs [--check <name>] ...
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
        if (!filePath.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
        const data = await readFile(filePath);
        res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404); res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const server = await startServer();
const port = server.address().port;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

try {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2500)); // let the loop run a bit

  const canvasInfo = await page.evaluate(() => {
    const c = document.getElementById('sim');
    if (!c) return null;
    return { width: c.width, height: c.height, cssW: c.clientWidth, cssH: c.clientHeight };
  });
  check('canvas #sim exists at 200x150 sim resolution', !!canvasInfo && canvasInfo.width === 200 && canvasInfo.height === 150,
    canvasInfo ? `${canvasInfo.width}x${canvasInfo.height} bitmap, ${canvasInfo.cssW}x${canvasInfo.cssH} css` : 'missing');

  const fpsText = await page.$eval('#fps', (el) => el.textContent);
  const fps = parseInt(fpsText.replace(/\D/g, ''), 10);
  check('FPS counter reports a live value >= 50', Number.isFinite(fps) && fps >= 50, fpsText.trim());

  const toolbarExists = await page.$('#toolbar');
  check('toolbar element present', !!toolbarExists);

  const fpsElVisible = await page.evaluate(() => {
    const el = document.getElementById('fps');
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  check('FPS overlay is visible on the stage', fpsElVisible);

  // Screenshot helpers (per-phase shots when --shot is passed).
  const wantShots = process.argv.includes('--shot');
  function maybeShot(name) {
    if (!wantShots) return;
    page.screenshot({ path: path.join(root, 'assets', 'screenshots', name) });
  }

  // --- UI controls: keyboard shortcuts, brush size, clear/pause/step ---
  const uiBox = await page.$eval('#sim', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });

  // Keyboard element selection: toolbar position 2 -> water (E.WATER === 3).
  await page.keyboard.press('2');
  const sel = await page.evaluate(() => window.__sand.state.element);
  check('keyboard "2" selects water', sel === 3, `element=${sel}`);

  // Paint a blob with the selected element.
  await page.mouse.move(uiBox.x + uiBox.w * 0.5, uiBox.y + uiBox.h * 0.5);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 300));
  await page.mouse.up();
  const blob = await page.evaluate(() => window.__sand.grid.count(3));
  check('painting with the selected element works', blob > 0, `water=${blob}`);

  // Brush size keys: [ clamps at min, ] grows.
  await page.keyboard.press('[');
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  const brush = await page.evaluate(() => window.__sand.state.brushRadius);
  check('brush size keys adjust the brush (1 -> 3)', brush === 3, `radius=${brush}`);

  // Brush slider present and synced with state.
  const sliderSync = await page.evaluate(() => {
    const s = document.getElementById('brush');
    return s ? Number(s.value) : -1;
  });
  check('brush slider present and synced', sliderSync === brush, `slider=${sliderSync}`);

  // Clear button empties the grid.
  await page.click('#btn-clear');
  const afterClear = await page.evaluate(() => {
    const g = window.__sand.grid;
    let c = 0; for (let i = 0; i < g.cells.length; i++) if (g.cells[i] !== 0) c++;
    return c;
  });
  check('clear button empties the grid', afterClear === 0, `remaining=${afterClear}`);

  // Space pauses: frame counter freezes.
  await page.keyboard.press('Space');
  const paused = await page.evaluate(() => window.__sand.state.paused);
  const f0 = await page.evaluate(() => window.__sand.engine.frame);
  const pauseLabel = await page.$eval('#btn-pause', (el) => el.textContent);
  check('space pauses the simulation', paused === true && pauseLabel === 'Resume', `paused=${paused} label=${pauseLabel}`);
  await new Promise((r) => setTimeout(r, 400));
  const f1 = await page.evaluate(() => window.__sand.engine.frame);
  check('frame counter frozen while paused', f1 === f0, `frame ${f0} -> ${f1}`);

  // Step button advances exactly one tick.
  await page.click('#btn-step');
  const f2 = await page.evaluate(() => window.__sand.engine.frame);
  check('step button advances exactly one tick', f2 === f0 + 1, `frame ${f0} -> ${f2}`);

  // Space resumes; the frame counter moves again.
  await page.keyboard.press('Space');
  const resumed = await page.evaluate(() => window.__sand.state.paused);
  await new Promise((r) => setTimeout(r, 400));
  const f3 = await page.evaluate(() => window.__sand.engine.frame);
  check('space resumes the simulation', resumed === false && f3 > f2, `paused=${resumed} frame ${f2} -> ${f3}`);

  if (process.argv.includes('--interaction')) {
    const box = uiBox;
    // Reset element/brush for deterministic interaction phases.
    await page.evaluate(() => { window.__sand.state.element = 1; window.__sand.state.brushRadius = 1; }); // E.SAND === 1
    // Paint a horizontal line of sand at ~20% height across the middle third.
    const y = box.y + box.h * 0.2;
    await page.mouse.move(box.x + box.w * 0.4, y);
    await page.mouse.down();
    for (let i = 1; i <= 25; i++) await page.mouse.move(box.x + box.w * (0.4 + 0.016 * i), y);
    await page.mouse.up();
    const painted = await page.evaluate(() => window.__sand.grid.count(1)); // E.SAND === 1
    check('painting created sand particles', painted > 0, `count=${painted}`);
    // Wait long enough for every grain to reach the floor (row h-1).
    await new Promise((r) => setTimeout(r, 4000));
    const info = await page.evaluate(() => {
      const g = window.__sand.grid;
      let maxRow = -1, count = 0;
      for (let yy = 0; yy < g.h; yy++) {
        for (let xx = 0; xx < g.w; xx++) {
          if (g.cells[yy * g.w + xx] === 1) { count++; if (yy > maxRow) maxRow = yy; }
        }
      }
      return { count, maxRow, h: g.h };
    });
    check('painted sand falls to the floor and stays there', info.count === painted && info.maxRow === info.h - 1,
      `count=${info.count} maxRow=${info.maxRow}`);
    maybeShot('task2-sand.png');

    // Phase 2: water. Clear, paint a row of water near the top, verify it
    // falls, spreads and levels out on the floor.
    await page.evaluate(() => { window.__sand.state.element = 3; window.__sand.grid.clear(); }); // E.WATER === 3
    const y2 = box.y + box.h * 0.15;
    await page.mouse.move(box.x + box.w * 0.4, y2);
    await page.mouse.down();
    for (let i = 1; i <= 25; i++) await page.mouse.move(box.x + box.w * (0.4 + 0.016 * i), y2);
    await page.mouse.up();
    const paintedW = await page.evaluate(() => window.__sand.grid.count(3));
    check('painting created water particles', paintedW > 0, `count=${paintedW}`);
    await new Promise((r) => setTimeout(r, 4000));
    const winfo = await page.evaluate(() => {
      const g = window.__sand.grid;
      let maxRow = -1, count = 0, floorCount = 0;
      for (let yy = 0; yy < g.h; yy++) {
        for (let xx = 0; xx < g.w; xx++) {
          if (g.cells[yy * g.w + xx] === 3) { count++; if (yy > maxRow) maxRow = yy; if (yy === g.h - 1) floorCount++; }
        }
      }
      return { count, maxRow, floorCount, h: g.h };
    });
    check('water falls to the floor and is conserved', winfo.count === paintedW && winfo.maxRow === winfo.h - 1,
      `count=${winfo.count} maxRow=${winfo.maxRow} floor=${winfo.floorCount}`);
    maybeShot('task3-water.png');

    // Phase 3: fire. Clear, paint a wood plank, ignite its left end.
    await page.evaluate(() => { window.__sand.state.element = 4; window.__sand.grid.clear(); }); // E.WOOD === 4
    const y3 = box.y + box.h * 0.5;
    await page.mouse.move(box.x + box.w * 0.35, y3);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + box.w * (0.35 + 0.016 * i), y3);
    await page.mouse.up();
    const plank = await page.evaluate(() => {
      const g = window.__sand.grid;
      let minx = Infinity, row = -1, count = 0;
      for (let yy = 0; yy < g.h; yy++) for (let xx = 0; xx < g.w; xx++) {
        if (g.cells[yy * g.w + xx] === 4) { minx = Math.min(minx, xx); row = yy; count++; }
      }
      return { minx, row, count };
    });
    check('painting created a wood plank', plank.count > 10 && plank.minx > 2, `wood=${plank.count} minx=${plank.minx}`);
    // Stamp fire in the empty cell just left of the plank's left end.
    await page.evaluate(() => { window.__sand.state.element = 5; }); // E.FIRE === 5
    const px = box.x + (plank.minx - 0.5) * (box.w / 200); // center of cell minx-1
    const py = box.y + (plank.row + 0.5) * (box.h / 150);
    await page.mouse.move(px, py);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 300)); // continuous pour stamps the fire cell
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 800));
    const fireInfo = await page.evaluate(() => {
      const g = window.__sand.grid;
      return { wood: g.count(4), fire: g.count(5), smoke: g.count(6) };
    });
    check('fire ignites the wood and emits smoke', fireInfo.fire > 0 && fireInfo.wood < plank.count && fireInfo.smoke > 0,
      `wood=${fireInfo.wood} fire=${fireInfo.fire} smoke=${fireInfo.smoke}`);
    maybeShot('task4-fire.png');
  }

  // Screenshot for the record.
  const shotIdx = process.argv.indexOf('--shot');
  const shotArg = shotIdx !== -1 ? process.argv[shotIdx + 1] : null;
  if (shotArg && shotArg !== '--interaction') {
    await page.screenshot({ path: path.join(root, 'assets', 'screenshots', shotArg) });
    check(`screenshot saved to assets/screenshots/${shotArg}`, true);
  }

  check('zero console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
