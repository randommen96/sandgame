// Browser smoke test (Track 4): loads the real bundle in headless Chrome over
// local HTTP, verifies the game loop actually steps, and proves SRI tamper
// detection by serving a modified copy of src/main.js.
const { execSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const puppeteer = require("puppeteer");

const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function report(name, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function serve(dir, port) {
  const proc = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: dir, stdio: "ignore",
  });
  return proc;
}

async function loadPage(url) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    await page.goto(url, { waitUntil: "networkidle0", timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1500)); // let the rAF loop run
    const state = await page.evaluate(() => ({
      hasSand: typeof window.__sand !== "undefined",
      frame: window.__sand ? window.__sand.engine.frame : -1,
      canvas: !!document.querySelector("canvas"),
      cssLoaded: getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)",
    }));
    return { page, browser, consoleErrors, pageErrors, state };
  } finally {
    // browser closed by caller
  }
}

(async () => {
  const port = 8765;
  const server = serve(ROOT, port);
  await new Promise((r) => setTimeout(r, 800)); // wait for http.server to come up

  try {
    // --- 1. Normal load: app boots, loop steps, SRI accepts all assets -------
    console.log("== Browser smoke: normal load ==");
    let r = await loadPage(`http://127.0.0.1:${port}/`);
    const { state } = r;
    report("page loads without page errors", r.pageErrors.length === 0, r.pageErrors[0]);
    report("no console errors (SRI accepted all assets)", r.consoleErrors.length === 0, r.consoleErrors.join(" | ").slice(0, 200));
    report("app module executed (window.__sand present)", state.hasSand);
    report("game loop is stepping (engine.frame > 0)", state.frame > 0, `frame=${state.frame}`);
    report("canvas mounted", state.canvas);
    report("stylesheet applied (SRI did not block CSS)", state.cssLoaded);
    await r.browser.close();

    // --- 2. Tampered bundle: SRI must refuse the modified main.js ------------
    console.log("== Browser smoke: SRI tamper detection ==");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sandgame-tamper-"));
    execSync(`cp -r ${ROOT}/index.html ${ROOT}/src ${tmp}/`, { stdio: "ignore" });
    // Append one byte to the JS payload — changes its sha384.
    fs.appendFileSync(path.join(tmp, "src", "main.js"), "\n// tampered\n");

    const port2 = 8766;
    const server2 = serve(tmp, port2);
    await new Promise((r) => setTimeout(r, 800));
    r = await loadPage(`http://127.0.0.1:${port2}/`);
    const integrityBlocked = r.consoleErrors.some((t) => /integrity/i.test(t)) || !r.state.hasSand;
    report("tampered main.js is refused (integrity failure or no app state)", integrityBlocked,
      r.consoleErrors.find((t) => /integrity/i.test(t))?.slice(0, 160));
    await r.browser.close();
    server2.kill();
  } finally {
    server.kill();
  }

  console.log(failures === 0 ? "BROWSER SMOKE: ALL PASS" : `BROWSER SMOKE: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
