// Manifest types + zod schemas + builders + hashBytes.
// HASH RULE: hash the EXACT bytes stored on Walrus (keccak256). No JSON canonicalization. (plan §5)

import { keccak256 } from "viem";
import type { Hex } from "viem";

// keccak256 over the exact bytes uploaded to Walrus — the artifact the hash commits to.
export function hashBytes(bytes: Uint8Array): Hex {
  return keccak256(bytes);
}

// Schemas live in /schemas/*.schema.json; zod parsers below are the runtime guard.
// TODO(Phase 2):
//   - SongManifest type + zSongManifest (tortoise-rights/song/1.0)
//   - LicenseReceipt type + zLicenseReceipt (tortoise-rights/license/1.0)
//   - buildSongManifest(...) -> { json, bytes } where bytes = new TextEncoder().encode(JSON.stringify(json))
//   - buildLicenseReceipt(...) -> { json, bytes }
// The manifest's keccak256(bytes) is what goes on-chain as manifestHash; the same bytes are PUT to Walrus.

export const SONG_MANIFEST_SCHEMA = "tortoise-rights/song/1.0" as const;
export const LICENSE_RECEIPT_SCHEMA = "tortoise-rights/license/1.0" as const;
