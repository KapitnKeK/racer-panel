#!/usr/bin/env bash
# Baut r3e-panel-win.zip (Python embeddable + Wheels + App + Frontend + Installer) fuer die Windows-VM.
# Voraussetzung: deploy/windows/build/python-embed.zip und build/wheels/ (siehe README), Frontend gebaut.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
OUT=build/bundle
rm -rf "$OUT" && mkdir -p "$OUT"
(cd "$ROOT/frontend" && npm run build >/dev/null)
cp -r "$ROOT/backend/app" "$OUT/app" && find "$OUT/app" -name __pycache__ -type d -prune -exec rm -rf {} +
cp -r "$ROOT/frontend/dist" "$OUT/static"
cp build/python-embed.zip "$OUT/"
cp -r build/wheels "$OUT/wheels"
cp install.ps1 uninstall.ps1 README.txt "$OUT/"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$OUT/VERSION"
rm -f build/r3e-panel-win.zip
(cd "$OUT" && python3 -c "
import zipfile, os
z = zipfile.ZipFile('../r3e-panel-win.zip', 'w', zipfile.ZIP_DEFLATED)
for d, _, fs in os.walk('.'):
    for f in fs:
        p = os.path.join(d, f)
        z.write(p, os.path.relpath(p, '.').replace(os.sep, '/'))
z.close()")
sha256sum build/r3e-panel-win.zip
ls -la build/r3e-panel-win.zip
