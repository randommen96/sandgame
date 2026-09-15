# Deployment notes — public Nginx serving

## Web root layout

The document root (`/var/www/sandgame`) must contain **only** public assets:

```
/var/www/sandgame/
├── index.html
├── src/          # main.js, engine.js, grid.js, elements.js, renderer.js,
│                 # ui.js, rng.js, pacing.js, style.css
└── assets/       # screenshots (public imagery)
```

Do **not** symlink or copy `node_modules/`, `tests/`, `tools/`, manifests, or
dev files into the web root. Even if you accidentally do, the config's
default-deny allowlist (`location / { return 404; }`) plus the explicit
`/node_modules|tests|tools` 404 rule and dotfile deny keep them unreachable.

## TLS / HSTS

The shipped `nginx.conf` listens on port 80 and sets HSTS. For production:

1. Obtain a certificate (e.g. Let's Encrypt). The ACME HTTP-01 challenge path
   is intentionally left open by the dotfile rule (`well-known` exemption):
   add a matching `location ^~ /.well-known/acme-challenge/ { }` block that
   serves the challenge directory.
2. Add a TLS listener (`listen 443 ssl;`) with your cert/key, and either keep
   port 80 as a redirect to HTTPS or drop it.
3. Only enable `Strict-Transport-Security` once HTTPS reliably works — the
   header is already present in this config and takes effect on first TLS
   response.

## SRI manifest

`deploy/sri-manifest.json` pins the sha384 of every shipped file. The
`integrity` attributes in `index.html` are what the browser enforces; the
manifest is the source of truth for regeneration after any bundle change:

```bash
python3 - <<'EOF'
import base64, hashlib, json, os
def sri(p): return "sha384-" + base64.b64encode(hashlib.sha384(open(p,'rb').read()).digest()).decode()
files = ["index.html", "src/style.css"] + [f"src/{f}" for f in sorted(os.listdir("src"))]
json.dump({"algorithm": "sha384", "files": {f: sri(f) for f in sorted(set(files))}},
          open("deploy/sri-manifest.json", "w"), indent=2)
EOF
```

Then update the two `integrity="…"` attributes in `index.html` to match.
`tools/validate_security.py` fails if manifest digests ever drift from the
bundle contents (tamper detection), and `tests/browser/sri.cjs`
(`npm run test:sri`) proves in a real browser that a modified `src/main.js`
is refused.

## Verification before deploy

```bash
npm test                 # unit + safeguard tests (node --test)
npm run test:browser     # headless-Chrome UI/loop smoke (14 checks)
npm run test:sri         # headless-Chrome SRI load + tamper proof
npm run validate         # full security validator (nginx, fs, SRI, client)
```

All three must be green before the site is pointed at a public IP.
