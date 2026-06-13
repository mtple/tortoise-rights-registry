#!/usr/bin/env node
// ENS round-trip smoke (plan §7.0 item 9 / §10.4) — run AFTER the L2Registry + registrar deploy
// and the two L1 resolver txs.
//
//   node scripts/smoke-ens.mjs <label>     mint <label>.tortmusic.eth with a text record, then resolve it
//
// Asserts the text record resolves via BOTH:
//   (a) getEnsText through the mainnet Universal Resolver (CCIP-Read / Durin gateway), and
//   (b) a direct read from the L2Registry on Base (the --rpc-fallback path).
// Also notes whether the registrar can setText AFTER mint (informs the C7 stretch goal).
//
// TODO(Phase 3 prereq): implement once L2_REGISTRY_ADDRESS + TORTOISE_REGISTRAR_ADDRESS exist.

console.error("TODO: smoke-ens.mjs — implement after ENS deploys (Phase 3 prerequisite).");
process.exit(1);
