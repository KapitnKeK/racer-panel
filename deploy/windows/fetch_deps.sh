#!/usr/bin/env bash
# Holt Python (Windows embeddable, SHA-256 gegen python.org geprüft) und die Wheels für build_bundle.sh.
set -euo pipefail
cd "$(dirname "$0")"
PYVER="${PYVER:-3.13.17}"
mkdir -p build/wheels
curl -fsSL -o build/python-embed.zip "https://www.python.org/ftp/python/$PYVER/python-$PYVER-embed-amd64.zip"
REL=$(curl -fsSL "https://www.python.org/api/v2/downloads/release/?name=Python%20$PYVER" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["resource_uri"].rstrip("/").split("/")[-1])')
WANT=$(curl -fsSL "https://www.python.org/api/v2/downloads/release_file/?release=$REL" | python3 -c 'import sys,json;print([f["sha256_sum"] for f in json.load(sys.stdin) if f["url"].endswith("embed-amd64.zip")][0])')
HAVE=$(sha256sum build/python-embed.zip | cut -d" " -f1)
[ "$WANT" = "$HAVE" ] || { echo "SHA-256 stimmt nicht: $HAVE != $WANT"; exit 1; }
echo "python-embed.zip ok ($HAVE)"
PYTAG="${PYVER%.*}"; PYTAG="${PYTAG/./}"
python3 -m pip download -q --dest build/wheels --only-binary=:all: --platform win_amd64 \
  --python-version "${PYVER%.*}" --implementation cp --abi "cp$PYTAG" -r requirements-win.txt
ls build/wheels | wc -l | xargs echo "Wheels:"
