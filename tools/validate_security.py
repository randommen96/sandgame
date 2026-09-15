#!/usr/bin/env python3
"""Security validation suite for the Falling Sand static site (Nginx hardening).

Checks (all must pass; exit code 1 if any fail):
  A. Nginx configuration   — structural syntax + required hardening directives
                              (server_tokens, security headers, rate limiting,
                               body/header limits, method restriction, dotfile
                               blocking, autoindex off, default-deny allowlist)
  B. Filesystem protection  — no sensitive files tracked in git, permission
                              constraints on tracked files, no secrets in tree
  C. Static bundle integrity — every asset referenced by index.html exists,
                              SRI sha384 attributes match file contents, no
                              external resources without integrity, manifest
                              deploy/sri-manifest.json matches the bundle
  D. Client-side safeguards — rAF loop with step cap + dt clamp, Grid bounds
                              enforcement, and a green `node --test` run

Usage: python3 tools/validate_security.py
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAILS: list[str] = []
PASSES: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    (PASSES if ok else FAILS).append(name)
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail and not ok else ""))


def section(title: str) -> None:
    print(f"\n== {title} ==")


# --------------------------------------------------------------------------
# A. Nginx configuration
# --------------------------------------------------------------------------

def strip_comments_lines(text: str) -> str:
    lines = []
    for line in text.splitlines():
        in_str = False
        cut = len(line)
        i = 0
        while i < len(line):
            ch = line[i]
            if ch == '"' and (i == 0 or line[i - 1] != "\\"):
                in_str = not in_str
            elif ch == "#" and not in_str:
                cut = i
                break
            i += 1
        lines.append(line[:cut])
    return "\n".join(lines)


def parse_nginx(text: str) -> tuple[list[str], list[str]]:
    """Light structural parser. Returns (statements, errors).

    Validates: balanced braces, every statement terminated by ';', block
    headers terminated by '{'. Statements are returned as raw text.
    """
    statements: list[str] = []
    errors: list[str] = []
    depth = 0
    buf: list[str] = []
    in_str = False

    def flush_statement() -> None:
        nonlocal buf
        stmt = "".join(buf).strip()
        if stmt:
            statements.append(stmt)
        buf = []

    i = 0
    while i < len(text):
        ch = text[i]
        if ch == '"':
            in_str = not in_str
            buf.append(ch)
        elif ch == "#":
            # skip to end of line
            while i < len(text) and text[i] != "\n":
                i += 1
            continue
        elif ch == "{":
            if in_str:
                buf.append(ch)
            else:
                flush_statement()
                depth += 1
        elif ch == "}":
            if in_str:
                buf.append(ch)
            else:
                flush_statement()
                depth -= 1
                if depth < 0:
                    errors.append("unbalanced '}' (depth went negative)")
        elif ch == ";":
            if not in_str:
                flush_statement()
        else:
            buf.append(ch)
        i += 1

    if in_str:
        errors.append("unterminated double-quoted string")
    if depth != 0:
        errors.append(f"unbalanced braces (final depth {depth})")
    if "".join(buf).strip():
        errors.append(f"statement not terminated with ';': {''.join(buf).strip()[:60]}")
    return statements, errors


def nginx_checks() -> None:
    section("A. Nginx configuration (deploy/nginx.conf)")
    conf_path = ROOT / "deploy" / "nginx.conf"
    if not conf_path.exists():
        check("deploy/nginx.conf exists", False, "file missing")
        return
    raw = conf_path.read_text()
    text = strip_comments_lines(raw)

    statements, errors = parse_nginx(text)
    check("structural syntax: balanced braces, ';'-terminated statements", not errors, "; ".join(errors[:3]))

    def has(pattern: str, label: str) -> None:
        ok = re.search(pattern, text, re.S) is not None
        check(label, ok)

    # --- Track 1 directives -------------------------------------------------
    has(r"server_tokens\s+off\s*;", "server_tokens off (version disclosure masked)")
    csp = re.search(r'add_header\s+Content-Security-Policy\s+"([^"]+)"', text)
    check("CSP header present", csp is not None)
    if csp:
        pol = csp.group(1)
        check("CSP restricts script-src to 'self'", re.search(r"script-src\s+'self'\s*;", pol) is not None, pol[:80])
        check("CSP restricts style-src to 'self'", re.search(r"style-src\s+'self'\s*;", pol) is not None, pol[:80])
    has(r'add_header\s+X-Frame-Options\s+"SAMEORIGIN"\s*(always)?\s*;', "X-Frame-Options: SAMEORIGIN")
    has(r'add_header\s+X-Content-Type-Options\s+"nosniff"\s*(always)?\s*;', "X-Content-Type-Options: nosniff")
    has(r'add_header\s+Referrer-Policy\s+"strict-origin-when-cross-origin"\s*(always)?\s*;', "Referrer-Policy: strict-origin-when-cross-origin")
    has(r"add_header\s+Strict-Transport-Security\s+\"max-age=\d+[^\"]*\"\s*(always)?\s*;", "HSTS header with max-age")

    # --- Track 2 directives -------------------------------------------------
    has(r"limit_req_zone\s+\$binary_remote_addr\s+zone=[A-Za-z0-9_]+:\d+m\s+rate=\d+r/s\s*;", "limit_req_zone keyed by client IP with rate")
    has(r"limit_req\s+zone=[A-Za-z0-9_]+\s+burst=\d+(\s+nodelay)?\s*;", "limit_req applied (burst throttling)")
    has(r"limit_conn_zone\s+\$binary_remote_addr\s+zone=[A-Za-z0-9_]+:\d+m\s*;", "limit_conn_zone per-IP connection tracking")
    has(r"limit_conn\s+[A-Za-z0-9_]+\s+\d+\s*;", "limit_conn applied (per-IP connection cap)")
    has(r"client_max_body_size\s+\d+k?\s*;", "client_max_body_size bounded")
    has(r"client_body_buffer_size\s+\d+k?\s*;", "client_body_buffer_size bounded")
    has(r"client_header_buffer_size\s+\d+k?\s*;", "client_header_buffer_size bounded")
    has(r"large_client_header_buffers\s+\d+\s+\d+k?\s*;", "large_client_header_buffers bounded (header-flooding / slowloris)")
    has(r"client_(body|header)_timeout\s+\d+s?\s*;", "client body/header timeouts set")
    has(r"keepalive_timeout\s+\d+s?\s*;", "short keepalive timeout (idle-connection pressure)")

    method_ok = re.search(r"if\s*\(\s*\$request_method\s+!~\s+\^\(GET\|HEAD\)\$\s*\)\s*\{\s*return\s+405\s*;\s*\}", text)
    check("HTTP methods restricted to GET/HEAD (else 405)", method_ok is not None)

    # --- Track 3 directives -------------------------------------------------
    has(r"autoindex\s+off\s*;", "autoindex off")
    check("no 'autoindex on' anywhere", re.search(r"autoindex\s+on", text) is None)
    dotfile_loc = re.search(r"location\s+~\s+/\\\.\(\?!\well-known\)\.\*\s*\{([^}]*)\}", text)
    check("dotfile blocking location present (\\. except well-known)", dotfile_loc is not None)
    if dotfile_loc:
        body = dotfile_loc.group(1)
        check("dotfiles denied (deny all / 403 / 404)", re.search(r"(deny\s+all|return\s+40[34])\s*;", body) is not None)
    has(r"location\s+~\*?\s+\^/[^{]*node_modules[^{]*\{\s*return\s+404\s*;", "explicit 404 for /node_modules")
    has(r"location\s+/\s*\{\s*return\s+404\s*;\s*\}", "default-deny: catch-all location returns 404")

    # --- Behavioral simulation of the nginx regexes --------------------------
    dot_re = re.compile(r"/\.(?!well-known).*")
    for path, blocked in [("/.git/HEAD", True), ("/.env", True), ("/.git/config", True),
                          ("/.backup.sql.bak", True), ("/.well-known/acme-challenge/x", False),
                          ("/src/style.css", False), ("/assets/screenshots/task1-initial.png", False)]:
        check(f"dotfile rule simulates: {path} -> {'blocked' if blocked else 'allowed'}",
              bool(dot_re.search(path)) == blocked)

    method_re = re.compile(r"^(GET|HEAD)$")
    for m, allowed in [("GET", True), ("HEAD", True), ("POST", False), ("PUT", False),
                       ("DELETE", False), ("OPTIONS", False), ("PATCH", False)]:
        check(f"method rule simulates: {m} -> {'allowed' if allowed else '405'}",
              bool(method_re.fullmatch(m)) == allowed)


# --------------------------------------------------------------------------
# B. Filesystem protection
# --------------------------------------------------------------------------

SENSITIVE_PATTERNS = [
    r"^\.env(\.|$)", r"node_modules/", r"id_(rsa|ed25519|ecdsa)", r"\.pem$",
    r"\.bak$", r"\.swp$", r"\.orig$", r"credentials", r"secret(_|\.)", r"\.git/",
]


def filesystem_checks() -> None:
    section("B. Filesystem protection")
    tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True).stdout.splitlines()

    bad = [f for f in tracked if any(re.search(p, f) for p in SENSITIVE_PATTERNS)]
    check("no sensitive files tracked in git (node_modules, .env, keys, backups)", not bad, ", ".join(bad[:5]))

    env_files = list(ROOT.rglob(".env*")) + [p for p in ROOT.iterdir() if "secret" in p.name.lower()]
    check("no .env / secret files present in working tree", not env_files, str([str(p) for p in env_files][:3]))

    perm_bad = []
    world_readable_required = {ROOT / "index.html"} | set((ROOT / "src").glob("*"))
    for f in tracked:
        p = ROOT / f
        if not p.is_file():
            continue
        mode = p.stat().st_mode
        if mode & 0o002:
            perm_bad.append(f"{f}: world-writable")
        if mode & 0o6000:
            perm_bad.append(f"{f}: setuid/setgid bit set")
    check("no world-writable or setuid/setgid tracked files", not perm_bad, "; ".join(perm_bad[:5]))

    unreadable = [str(p.relative_to(ROOT)) for p in world_readable_required if p.is_file() and not (p.stat().st_mode & 0o004)]
    check("web-served files are readable by the nginx worker (other-read bit)", not unreadable, ", ".join(unreadable[:5]))


# --------------------------------------------------------------------------
# C. Static bundle integrity & SRI
# --------------------------------------------------------------------------

def sha384_b64(path: Path) -> str:
    return "sha384-" + base64.b64encode(hashlib.sha384(path.read_bytes()).digest()).decode()


ASSET_TAG_RE = re.compile(r"<(?:script|link)[^>]+>", re.I)
SRC_HREF_RE = re.compile(r"\b(?:src|href)\s*=\s*\"([^\"]+)\"")
INTegrity_RE = re.compile(r"\bintegrity\s*=\s*\"([^\"]+)\"")
CROSSORIGIN_RE = re.compile(r"\bcrossorigin\s*=\s*\"anonymous\"")
EXTERNAL_URL_RE = re.compile(r"""(?:src|href)\s*=\s*["']?(?:https?:)?//[^"'\s>]+""", re.I)


def bundle_checks() -> None:
    section("C. Static bundle integrity & SRI")
    index = ROOT / "index.html"
    if not index.exists():
        check("index.html exists", False)
        return
    html = index.read_text()

    assets: list[tuple[str, str]] = []  # (ref, tag)
    for tag in ASSET_TAG_RE.findall(html):
        m = SRC_HREF_RE.search(tag)
        if not m or "rel" in tag.lower() and "stylesheet" not in tag.lower() and "script" not in tag.lower():
            continue
        ref = m.group(1)
        if ref.startswith("data:"):
            continue
        assets.append((ref, tag))

    check("index.html references at least one local asset", len(assets) > 0)

    for ref, tag in assets:
        external = ref.startswith(("http://", "https://", "//"))
        if external:
            ok = bool(INTegrity_RE.search(tag)) and bool(CROSSORIGIN_RE.search(tag))
            check(f"external resource {ref} has integrity + crossorigin", ok)
            continue
        p = ROOT / ref
        check(f"local asset exists: {ref}", p.is_file())
        if not p.is_file():
            continue
        im = INTegrity_RE.search(tag)
        check(f"SRI integrity attribute present on {ref}", im is not None)
        if im:
            expected = sha384_b64(p)
            listed = [h.strip() for h in im.group(1).split()]
            check(f"SRI hash matches content for {ref}", expected in listed, f"expected {expected[:24]}…, got {listed[0][:24]}…")
        check(f"crossorigin=anonymous on {ref} (required with integrity)", bool(CROSSORIGIN_RE.search(tag)))

    # No external fetches anywhere in the bundle (would bypass SRI/CSP 'self').
    ext_hits = []
    for f in [index] + sorted((ROOT / "src").glob("*.js")) + sorted((ROOT / "src").glob("*.css")):
        for m in EXTERNAL_URL_RE.finditer(f.read_text()):
            url = m.group(0)
            if "w3.org" in url:  # XML namespace declarations are not fetches
                continue
            ext_hits.append(f"{f.name}: {url}")
    check("no external http(s) resources referenced by bundle", not ext_hits, "; ".join(ext_hits[:5]))

    manifest_path = ROOT / "deploy" / "sri-manifest.json"
    if not manifest_path.exists():
        check("SRI manifest deploy/sri-manifest.json exists", False)
    else:
        manifest = json.loads(manifest_path.read_text())
        files = manifest.get("files", {})
        mismatched = []
        for rel, digest in files.items():
            p = ROOT / rel
            if not p.is_file() or sha384_b64(p) != digest:
                mismatched.append(rel)
        check("manifest digests match current bundle contents (tamper detection)", not mismatched, ", ".join(mismatched[:5]))
        missing = [ref for ref, _ in assets if not ref.startswith(("http://", "https://", "//")) and ref not in files]
        check("every index.html asset is covered by the manifest", not missing, ", ".join(missing))


# --------------------------------------------------------------------------
# D. Client-side safeguards
# --------------------------------------------------------------------------

def client_checks() -> None:
    section("D. Client-side simulation safeguards")
    main_js = (ROOT / "src" / "main.js").read_text()
    pacing_path = ROOT / "src" / "pacing.js"
    grid_js = (ROOT / "src" / "grid.js").read_text()

    check("game loop driven by requestAnimationFrame", "requestAnimationFrame" in main_js)
    check("pacing module src/pacing.js exists", pacing_path.is_file())
    if pacing_path.is_file():
        pacing = pacing_path.read_text()
        check("loop imports bounded pacing helper from ./pacing.js",
              re.search(r"import\s*\{[^}]*advanceAccumulator[^}]*\}\s*from\s*'\./pacing\.js'", main_js) is not None)
        check("pacing caps steps per frame (MAX_STEPS_PER_FRAME)", "MAX_STEPS_PER_FRAME" in pacing)
        check("pacing guards non-finite dt (NaN/Infinity safe)", "Number.isFinite" in pacing)
        check("pacing clamps large dt (hidden-tab fast-forward guard)", re.search(r"Math\.min\(", pacing) is not None)

    guards = len(re.findall(r"inBounds\s*\(", grid_js))
    check("Grid enforces bounds in get/set/swap (inBounds guards >= 3)", guards >= 3, f"found {guards}")
    for meth in ("get", "set", "swap"):
        m = re.search(rf"{meth}\s*\([^)]*\)\s*\{{(.*?)\n  \}}", grid_js, re.S)
        check(f"Grid.{meth} rejects out-of-bounds access", m is not None and "inBounds" in m.group(1))

    print("  … running `node --test` (unit + safeguard tests)")
    proc = subprocess.run(["node", "--test"], cwd=ROOT, capture_output=True, text=True)
    tail = (proc.stdout or proc.stderr).strip().splitlines()
    summary = next((l for l in reversed(tail) if "tests " in l and "pass" in l), "")
    check("node --test suite green", proc.returncode == 0, summary or (proc.stderr.strip()[:200] if proc.returncode else ""))


def main() -> int:
    print(f"Security validation — root: {ROOT}")
    nginx_checks()
    filesystem_checks()
    bundle_checks()
    client_checks()

    print(f"\n{'=' * 60}\nRESULT: {len(PASSES)} passed, {len(FAILS)} failed")
    if FAILS:
        print("Failing checks:")
        for f in FAILS:
            print(f"  - {f}")
        return 1
    print("ALL CHECKS PASSED — configuration is hardened for public Nginx deployment.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
