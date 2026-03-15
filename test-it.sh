#!/bin/bash
#
# Quick test script for Jacbot
# Run from the project root: ./test-it.sh
#
# This uses --dry-run so NO tokens are consumed.
# Pass --obsidian to test with Obsidian vault integration.
#

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USE_OBSIDIAN=false

# Parse flags
for arg in "$@"; do
  if [ "$arg" = "--obsidian" ]; then
    USE_OBSIDIAN=true
  fi
done

echo "══════════════════════════════════════"
echo "  Jacbot Test Run"
if [ "$USE_OBSIDIAN" = true ]; then
  echo "  (with Obsidian vault integration)"
fi
echo "══════════════════════════════════════"
echo ""

# ─── 1. Build ──────────────────────────────────────────────────────────────
echo "▸ Installing dependencies..."
npm install

echo ""
echo "▸ Building packages (core → memory → cli)..."
npm run build

echo ""
echo "▸ Build complete!"
echo ""

# ─── 2. Set up a test project ─────────────────────────────────────────────
TEST_DIR=$(mktemp -d)
JACBOT="node $SCRIPT_DIR/packages/cli/dist/bin.js"

echo "▸ Test directory: $TEST_DIR"
cd "$TEST_DIR"

echo ""
echo "── jacbot init ──────────────────────"
if [ "$USE_OBSIDIAN" = true ]; then
  VAULT_DIR="$TEST_DIR/test-vault"
  mkdir -p "$VAULT_DIR"
  $JACBOT init my-test-project --obsidian "$VAULT_DIR" Build a todo app with authentication
else
  $JACBOT init my-test-project Build a todo app with authentication
fi

echo ""
echo "── jacbot agent add ─────────────────"
$JACBOT agent add architect --role lead --runtime claude-code --budget 5
$JACBOT agent add coder --role worker --runtime claude-code --budget 3

echo ""
echo "── jacbot task create ────────────────"
$JACBOT task create "Project setup" --description "Init the Node.js project with TypeScript and Express" --tag setup
$JACBOT task create "Auth system" --description "Add JWT auth with login and register endpoints" --depends project-setup --tag auth
$JACBOT task create "Todo CRUD" --description "Build CRUD routes for todos with validation" --depends project-setup --tag api
$JACBOT task create "Write tests" --description "Integration tests for auth and todo endpoints" --depends auth-system --depends todo-crud --tag testing

echo ""
echo "── jacbot task list ─────────────────"
$JACBOT task list

echo ""
echo "── jacbot waves ─────────────────────"
$JACBOT waves

echo ""
echo "── jacbot status ────────────────────"
$JACBOT status

echo ""
echo "── jacbot run --dry-run ─────────────"
$JACBOT run --dry-run

echo ""
echo "── jacbot check runtime ─────────────"
$JACBOT check runtime

# ─── 3. Show Obsidian vault if used ───────────────────────────────────────
if [ "$USE_OBSIDIAN" = true ]; then
  echo ""
  echo "── Obsidian vault structure ────────"
  echo "  $VAULT_DIR/Jacbot/"
  find "$VAULT_DIR/Jacbot" -type f | sort | while read -r f; do
    echo "    ${f#$VAULT_DIR/}"
  done
  echo ""
  echo "── Dashboard preview ──────────────"
  head -30 "$VAULT_DIR/Jacbot/00 Dashboard.md" 2>/dev/null || echo "  (dashboard not found)"
  echo ""
  echo "── Task note preview ──────────────"
  head -30 "$VAULT_DIR/Jacbot/Tasks/Task · Project setup.md" 2>/dev/null || echo "  (task note not found)"
fi

echo ""
echo "══════════════════════════════════════"
echo "  All commands ran successfully!"
echo ""
echo "  Test dir: $TEST_DIR"
if [ "$USE_OBSIDIAN" = true ]; then
  echo "  Vault:    $VAULT_DIR/Jacbot/"
  echo ""
  echo "  Open in Obsidian: File → Open Vault → $VAULT_DIR"
fi
echo ""
echo "  To test REAL execution (uses tokens):"
echo "    cd $TEST_DIR"
echo "    $JACBOT run"
echo "══════════════════════════════════════"
