#!/usr/bin/env node
// Admin CLI (plan §7 Phase 3.1) — mint <slug>.tortmusic.eth with text records for an opted-in song.
// Owner-only: reads ADMIN_PRIVATE_KEY from env/keystore. NEVER run from the hosted app. (user secrets boundary)
//
//   node scripts/mint-song-name.mjs <slug>
//
// Reads the song's on-chain record + manifest, then registrar.register(label, owner, records) where
// records pre-encode setText(manifest.hash, walrus.blob, walrus.audio, rights.contract, url) at mint.
//
// TODO(Phase 3): implement with viem walletClient (Base) from ADMIN_PRIVATE_KEY + src/lib/ens.ts.

if (!process.env.ADMIN_PRIVATE_KEY) {
  console.error("ADMIN_PRIVATE_KEY not set (use .env or a keystore). Refusing to run.");
  process.exit(1);
}
console.error("TODO(Phase 3): mint-song-name.mjs not implemented yet.");
process.exit(1);
