#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_DIR="$ROOT_DIR/extension"
OUTPUT_DIR="$ROOT_DIR/dist/safari-xcode"

if xcrun -f safari-web-extension-packager >/dev/null 2>&1; then
  PACKAGER="safari-web-extension-packager"
elif xcrun -f safari-web-extension-converter >/dev/null 2>&1; then
  PACKAGER="safari-web-extension-converter"
else
  echo "未找到 Safari Web Extension Packager。请安装完整 Xcode 后重试。"
  echo "也可以在 Safari 中临时加载: $EXTENSION_DIR"
  exit 1
fi

xcrun "$PACKAGER" "$EXTENSION_DIR" \
  --project-location "$OUTPUT_DIR" \
  --app-name "ABDM Safari Capture" \
  --bundle-identifier "local.abdm.safari.capture" \
  --macos-only \
  --swift \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

echo "已生成 Safari Xcode 项目: $OUTPUT_DIR"
