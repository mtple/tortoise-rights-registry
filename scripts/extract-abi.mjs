#!/usr/bin/env node
// Extract contract ABIs from the Foundry build into src/lib/abi/ for the TS app.
// Run after `cd contracts && forge build`, or via `pnpm abi`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const targets = [
  ["TortoiseRightsRegistry", "contracts/out/TortoiseRightsRegistry.sol/TortoiseRightsRegistry.json"],
  ["TortoiseRegistrar", "contracts/out/TortoiseRegistrar.sol/TortoiseRegistrar.json"],
];

mkdirSync("src/lib/abi", { recursive: true });
for (const [name, src] of targets) {
  const artifact = JSON.parse(readFileSync(src, "utf8"));
  writeFileSync(`src/lib/abi/${name}.json`, JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`wrote src/lib/abi/${name}.json (${artifact.abi.length} entries)`);
}
