# Nginx Hardening & Security Progress Tracker

Scope: deploy the static Falling Sand web app on a **public Nginx server** without
exposing sensitive files, leaking version info, or allowing resource exhaustion.

**Verification tooling**
- Automated validator: `python3 tools/validate_security.py` (exit 0 = all checks pass)
- Unit tests: `npm test` (node --test)
- Browser smoke: `node tests/browser/smoke.mjs` (headless Chrome, 60 FPS, zero console errors)

**Threat scope (static web app on Nginx, public internet)**
1. DoS via resource exhaustion (request floods, huge bodies/headers, slowloris-style idle connections)
2. Missing HTTP security headers (no CSP → XSS amplification, no anti-clickjacking, no HSTS)
3. MIME confusion / content-type sniffing attacks
4. Path traversal & directory listing
5. Sensitive dot-file exposure (`.git/`, `.env`, backups, `node_modules/`)
6. Unconstrained HTTP methods (POST/PUT/OPTIONS probes against a static origin)

---

## Phase 1 — Workspace initialization & security baseline
- [ ] Git remote verified (`origin` configured and reachable)
- [ ] `SECURITY_PROGRESS.md` created (this file)
- [ ] Local validation script created (`tools/validate_security.py`)
- [ ] Baseline committed & pushed

## Track 1 — Nginx production configuration & secure headers template
- [x] `deploy/nginx.conf` supplied (standalone production config for the static site)
- [x] Server token masking: `server_tokens off;`
- [x] CSP restricting script/style sources to `'self'`
- [x] `X-Frame-Options: SAMEORIGIN`
- [x] `X-Content-Type-Options: nosniff`
- [x] `Referrer-Policy: strict-origin-when-cross-origin`
- [x] HSTS (`Strict-Transport-Security`)
- [x] Verified locally (config syntax + directive checks) and committed/pushed

## Track 2 — Resource constraints & DoS mitigation configs
- [x] Request rate limiting: `limit_req_zone` + `limit_req` (+ per-IP connection cap)
- [x] Payload boundaries: `client_max_body_size`, `client_body_buffer_size`
- [x] Header buffer allocations: `client_header_buffer_size`, `large_client_header_buffers`, timeouts (slowloris mitigation)
- [x] HTTP method restriction to GET/HEAD only (`if ($request_method !~ ^(GET|HEAD)$) { return 405; }`)
- [x] Verified locally and committed/pushed

## Track 3 — Filesystem protection & exposure minimization
- [ ] Sensitive dot-file blocking: `location ~ /\.(?!well-known).*` (covers `.git/`, `.env`, backups)
- [ ] Directory listing defense: `autoindex off;` in all contexts
- [ ] Default-deny allowlist: only `/`, `/src/`, `/assets/` servable; `node_modules/`, `tests/`, manifests, dev files → 404
- [ ] No sensitive files tracked in git (`node_modules/`, `.env`, keys, backups)
- [ ] File permission constraints verified (no world-writable / setuid bits; served files world-readable)
- [ ] Verified locally and committed/pushed

## Track 4 — Client-side simulation safeguards & asset integrity
- [ ] Game loop audit: `requestAnimationFrame` + fixed timestep, per-frame step cap, dt clamp (no spiral of death)
- [ ] Pacing logic extracted to DOM-free `src/pacing.js` with NaN/Infinity guards
- [ ] Array bounds enforcement in `Grid` (get/set/swap throw `RangeError` out of bounds)
- [ ] Unit tests for loop pacing + bounds + bounded memory (`tests/safeguards.test.js`)
- [ ] SRI: `integrity="sha384-…" crossorigin="anonymous"` on every subresource in `index.html`
- [ ] SRI manifest `deploy/sri-manifest.json` matches current bundle hashes (tamper detection)
- [ ] No external (http/https) resources without integrity verification
- [ ] Verified locally (`npm test` + validator + headless-browser smoke) and committed/pushed

## Phase 3 — Definition of done
- [ ] All checks above complete
- [ ] `tools/validate_security.py` exits 0
- [ ] `npm test` green
- [ ] Final commit & push; repository hardened for public deployment

---

## Audit log
| Date | Track | Action | Verification | Result |
|------|-------|--------|--------------|--------|
| 2026-09-14 | Phase 1 | Baseline: tracker + `tools/validate_security.py` (structural nginx parser, directive checks, git/permission constraints, bundle/SRI integrity, client safeguards, node --test gate) | validator run: 13/21 pass (failures = pending tracks); `npm test` 34/34 | PASS (baseline) |
| 2026-09-14 | Track 1 | Added `deploy/nginx.conf`: `server_tokens off`, CSP (script/style `'self'`), XFO SAMEORIGIN, nosniff, Referrer-Policy, HSTS — all with `always` | validator: structural syntax + all 7 header/token checks PASS | PASS |
| 2026-09-14 | Track 2 | Added rate limiting (`limit_req_zone` 50r/s + `limit_req burst=20 nodelay` + `limit_conn 20/IP`, 429 status), body/header limits (1k body, 8k header buffers), timeouts (10s) + keepalive 15s/100 req, GET/HEAD-only method gate (405) | validator: all Track 2 directive checks PASS; method-regex simulation (GET/HEAD allowed, POST/PUT/DELETE/OPTIONS/PATCH → 405) PASS | PASS |
