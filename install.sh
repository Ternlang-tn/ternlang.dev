#!/bin/sh
# Installs Tern: the tarball for this machine (built by tools/release/package.sh, uploaded by
# tools/release/publish.sh), checked against SHA256SUMS, unpacked into ~/.tern, and `tern`
# linked into ~/.local/bin. The site build serves this file as https://ternlang.dev/install.sh.
#
#     curl -fsSL https://ternlang.dev/install.sh | sh
#     curl -fsSL https://ternlang.dev/install.sh | TERN_HOME=/opt/tern TERN_BIN=/usr/local/bin sh
#
# Running it again updates in place. Tern compiles through C, so it needs clang.
set -eu
BASE="https://dxip8h5rbohq9.cloudfront.net/releases/latest"
HOME_DIR="${TERN_HOME:-$HOME/.tern}"
BIN_DIR="${TERN_BIN:-$HOME/.local/bin}"

say() { printf 'tern-install: %s\n' "$*"; }
die() { printf 'tern-install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
    Darwin) os=macos ;;
    Linux) os=linux ;;
    *) die "no Tern build for $(uname -s) yet (macOS and Linux only)" ;;
esac
case "$(uname -m)" in
    arm64 | aarch64) arch=arm64 ;;
    x86_64 | amd64) arch=x86_64 ;;
    *) die "no Tern build for $(uname -m) yet (arm64 and x86_64 only)" ;;
esac
platform="$os-$arch"

if command -v curl >/dev/null 2>&1; then
    fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
    fetch() { wget -q -O "$2" "$1"; }
else
    die "needs curl or wget"
fi
if command -v shasum >/dev/null 2>&1; then
    sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
elif command -v sha256sum >/dev/null 2>&1; then
    sha256() { sha256sum "$1" | cut -d' ' -f1; }
else
    die "needs shasum or sha256sum to check the download"
fi

tmp="$(mktemp -d "${TMPDIR:-/tmp}/tern-install.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT INT TERM
say "downloading Tern for $platform"
fetch "$BASE/tern-$platform.tar.gz" "$tmp/tern.tar.gz" || die "download failed: $BASE/tern-$platform.tar.gz"
fetch "$BASE/SHA256SUMS" "$tmp/SHA256SUMS" || die "download failed: $BASE/SHA256SUMS"
want="$(grep " tern-$platform.tar.gz\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)"
[ -n "$want" ] || die "SHA256SUMS has no entry for tern-$platform.tar.gz"
[ "$(sha256 "$tmp/tern.tar.gz")" = "$want" ] || die "checksum mismatch for tern-$platform.tar.gz (try again)"
tar --no-same-owner -C "$tmp" -xzf "$tmp/tern.tar.gz"
"$tmp/tern/bin/tern" version >/dev/null || die "the downloaded tern doesn't run on this machine"

# swap the new root in whole (an update never mixes old and new runtime files)
mkdir -p "$(dirname "$HOME_DIR")"
rm -rf "$HOME_DIR.new" "$HOME_DIR.old"
mv "$tmp/tern" "$HOME_DIR.new"
[ -e "$HOME_DIR" ] && mv "$HOME_DIR" "$HOME_DIR.old"
mv "$HOME_DIR.new" "$HOME_DIR"
rm -rf "$HOME_DIR.old"
mkdir -p "$BIN_DIR"
ln -sf "$HOME_DIR/bin/tern" "$BIN_DIR/tern"
say "installed Tern $(cat "$HOME_DIR/VERSION") in $HOME_DIR; \`tern\` is linked in $BIN_DIR"

case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) say "add $BIN_DIR to your PATH, e.g.: echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.$(basename "${SHELL:-sh}")rc" ;;
esac
if ! command -v clang >/dev/null 2>&1; then
    if [ "$os" = macos ]; then
        say "Tern needs clang: run \`xcode-select --install\`"
    else
        say "Tern needs clang: e.g. \`sudo apt install clang\` (Debian/Ubuntu) or \`sudo dnf install clang\`"
    fi
fi
if [ "$os" = linux ] && [ ! -f /usr/include/sqlite3.h ]; then
    say "for \`import sqlite\` (and the web template): \`sudo apt install libsqlite3-dev\` or \`sudo dnf install sqlite-devel\`"
fi
say "try: tern new hello && cd hello && echo 'to be or not to be' | tern run main.tn"
