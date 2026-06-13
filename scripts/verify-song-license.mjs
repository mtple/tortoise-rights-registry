#!/usr/bin/env node
// THE CENTERPIECE (plan §9.6 / §10.7) — zero deps on Tortoise or this app's server.
//
//   node scripts/verify-song-license.mjs <slug>                    verify the song artifact + availability
//   node scripts/verify-song-license.mjs <slug> --buyer <address>  also verify that buyer's purchase
//   node scripts/verify-song-license.mjs <slug> --rpc-fallback     read ENS records direct from the L2Registry
//
// Checks (each prints PASS/FAIL; non-zero exit on any mismatch):
//   1. resolve <slug>.tortmusic.eth -> manifest.hash / walrus.blob / walrus.audio / rights.contract
//   2. read songs[key] on-chain (Base)
//   3. GET song manifest from Walrus; keccak256(bytes) == songs[key].manifestHash
//   4. GET audio from its Walrus blob; keccak256(bytes) == songs[key].audioHash
//   5. re-derive EIP-712 Consent digest from the manifest; verifyTypedData for the artist (ERC-1271-aware)
//   6. licenseTermsHash == keccak256(LICENSE_TERMS.md); manifest.priceUsdc == songs[key].priceUsdc
//   7. report licenseActive
//   8. (--buyer) licenses[key][buyer] == licensed manifest hash, cross-checked vs LicensePurchased event
//
// TODO(Phase 3): implement. Uses viem (publicClient over Base), src/lib/{registry,ens,manifest,eip712,walrus}.

console.error("TODO(Phase 3): verify-song-license.mjs not implemented yet.");
process.exit(1);
