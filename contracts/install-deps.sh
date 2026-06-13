#!/usr/bin/env bash
# Restore pinned Foundry dependencies (lib/ is gitignored for a clean public repo).
# Run once after cloning: `cd contracts && ./install-deps.sh`
set -euo pipefail
cd "$(dirname "$0")"

# Pinned versions — keep in sync with foundry.toml remappings.
forge install --no-git foundry-rs/forge-std@v1.9.6
forge install --no-git OpenZeppelin/openzeppelin-contracts@v5.6.1

echo "✓ Dependencies installed. Run: forge build"
