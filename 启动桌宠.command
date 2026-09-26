#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
version=$(node -p "require('./package.json').version")
arch=$(uname -m)
folder=mac
if [ "$arch" = arm64 ]; then folder=mac-arm64; fi
app="dist/releases/v${version}/${folder}/BA桌宠.app"
if [ -d "$app" ]; then
  open "$app"
else
  printf '%s\n' '尚未构建当前 Mac 版本。请先运行 npm ci 和 npm run release:mac。'
  exit 1
fi
