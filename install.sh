#!/usr/bin/env bash
# Branchless — one-command installer
# Usage:  curl -fsSL https://raw.githubusercontent.com/YOUR_USER/branchless/main/install.sh | bash

set -euo pipefail

REPO="YOUR_GITHUB_USERNAME/branchless"   # ← replace with your GitHub user/repo
APP_NAME="Branchless"
BINARY_NAME="branchless"

# ── helpers ───────────────────────────────────────────────────────────────────
info()  { printf "\033[1;34m→\033[0m %s\n" "$*"; }
ok()    { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
err()   { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || err "Required tool not found: $1. Please install it and re-run."
}

# ── detect platform ───────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  ASSET_PATTERN="arm64.dmg" ;;
      x86_64) ASSET_PATTERN="x64.dmg"   ;;
      *)      err "Unsupported macOS architecture: $ARCH" ;;
    esac
    PLATFORM="mac"
    ;;
  Linux)
    ASSET_PATTERN="x86_64.AppImage"
    PLATFORM="linux"
    ;;
  *)
    err "Unsupported OS: $OS. Download manually from https://github.com/$REPO/releases"
    ;;
esac

# ── fetch latest release ──────────────────────────────────────────────────────
require curl
require jq

info "Fetching latest release from github.com/$REPO ..."
RELEASE=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest") \
  || err "Failed to reach GitHub API. Check your internet connection."
VERSION=$(echo "$RELEASE" | jq -r '.tag_name')
ASSET_URL=$(echo "$RELEASE" | jq -r --arg pat "$ASSET_PATTERN" \
  '.assets[] | select(.name | contains($pat)) | .browser_download_url')

[[ -z "$ASSET_URL" || "$ASSET_URL" == "null" ]] && \
  err "Could not find a release asset matching '$ASSET_PATTERN'. Visit https://github.com/$REPO/releases"

info "Installing $APP_NAME $VERSION ..."

# ── macOS: mount DMG → copy .app ─────────────────────────────────────────────
if [[ "$PLATFORM" == "mac" ]]; then
  require hdiutil

  TMP_DMG=$(mktemp /tmp/branchless-XXXXXX.dmg)
  info "Downloading $ASSET_URL ..."
  curl -fsSL -o "$TMP_DMG" "$ASSET_URL"

  MOUNT_POINT=$(mktemp -d /tmp/branchless-mount-XXXXXX)
  hdiutil attach -quiet -nobrowse -mountpoint "$MOUNT_POINT" "$TMP_DMG"

  APP_SRC="$MOUNT_POINT/$APP_NAME.app"
  [[ -d "$APP_SRC" ]] || err "Could not find $APP_NAME.app inside the DMG."

  DEST="/Applications/$APP_NAME.app"
  [[ -d "$DEST" ]] && { info "Removing previous installation..."; rm -rf "$DEST"; }

  info "Copying to /Applications ..."
  cp -R "$APP_SRC" /Applications/

  hdiutil detach -quiet "$MOUNT_POINT"
  rm -f "$TMP_DMG"

  ok "$APP_NAME installed to /Applications/$APP_NAME.app"
  info "Launching..."
  open "/Applications/$APP_NAME.app"

# ── Linux: install AppImage ───────────────────────────────────────────────────
elif [[ "$PLATFORM" == "linux" ]]; then
  INSTALL_DIR="${HOME}/.local/bin"
  DEST="$INSTALL_DIR/$BINARY_NAME"
  mkdir -p "$INSTALL_DIR"

  info "Downloading $ASSET_URL ..."
  curl -fsSL -o "$DEST" "$ASSET_URL"
  chmod +x "$DEST"

  if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    info "Add this to your shell profile to use '$BINARY_NAME' from anywhere:"
    echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
  fi

  ok "$APP_NAME installed to $DEST"
  info "Run with:  $BINARY_NAME"
fi
