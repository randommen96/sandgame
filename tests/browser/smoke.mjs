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

  // Screenshot for the record.
  const shotArg = process.argv[2] === '--shot' ? process.argv[3] : null;
  if (shotArg) {
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
