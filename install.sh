#!/bin/sh
# freebies installer
#   curl -fsSL https://raw.githubusercontent.com/VishiATChoudhary/freebies/main/install.sh | sh
# Installs the `freebies` command with npm. Needs Node.js 22 or newer.
set -e

INK='\033[48;2;11;57;134m\033[38;2;244;235;216m'
RESET='\033[0m'
DIM='\033[2m'
BOLD='\033[1m'
REPO="VishiATChoudhary/freebies"
RELEASE_TGZ="https://github.com/$REPO/releases/latest/download/freebies.tgz"

say() { printf '%b\n' "$*"; }
badge() { printf '%b' "${INK} ✺ freebies ${RESET}"; }
fail() { say ""; badge; say " $1"; [ -n "$2" ] && say "${DIM}$2${RESET}"; exit 1; }

say ""
badge; say "  ${DIM}bookkeeping for German freelancers${RESET}"
say ""

command -v node >/dev/null 2>&1 || fail "Node.js isn't installed." "Install Node 22 or newer (https://nodejs.org, or: brew install node) and run this again."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$NODE_MAJOR" -ge 22 ] 2>/dev/null || fail "freebies needs Node.js 22 or newer; you have $(node -v)." "Update Node (https://nodejs.org, or: brew upgrade node) and run this again."
command -v npm >/dev/null 2>&1 || fail "npm isn't available." "It ships with Node.js; reinstall Node from https://nodejs.org."

# Use the npm package only if it really is this project; otherwise the GitHub release.
if [ -n "$FREEBIES_PACKAGE" ]; then
  PKG="$FREEBIES_PACKAGE"
elif npm view freebies repository.url 2>/dev/null | grep -q "$REPO"; then
  PKG="freebies"
else
  PKG="$RELEASE_TGZ"
fi

say "  ${DIM}installing with npm…${RESET}"
if ! npm install --global --no-fund --no-audit --loglevel=error "$PKG"; then
  fail "npm couldn't install freebies." "If this was a permissions error, use a Node version manager such as fnm or nvm, or set an npm prefix you own: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"
fi

BIN_DIR="$(npm prefix -g)/bin"
command -v freebies >/dev/null 2>&1 || say "  ${DIM}Note: add ${BIN_DIR} to your PATH to run freebies.${RESET}"

say ""
say "  ${BOLD}Installed.${RESET} Start with:"
say ""
say "      freebies"
say ""
command -v claude >/dev/null 2>&1 || say "  ${DIM}Optional: install Claude Code to turn on the agent: npm install -g @anthropic-ai/claude-code${RESET}"
say ""
