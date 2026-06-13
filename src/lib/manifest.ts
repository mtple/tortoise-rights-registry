// Manifest types + zod schemas + builders + hashBytes.
// HASH RULE: hash the EXACT bytes stored on Walrus (keccak256). No JSON canonicalization. (plan §5)

import { keccak256, type Address, type Hex } from "viem";
import { z } from "zod";

export const SONG_MANIFEST_SCHEMA = "tortoise-rights/song/1.0" as const;
export const LICENSE_RECEIPT_SCHEMA = "tortoise-rights/license/1.0" as const;

// keccak256 over the exact bytes uploaded to Walrus — the artifact the hash commits to.
export function hashBytes(bytes: Uint8Array): Hex {
  return keccak256(bytes);
}

const hex32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const addr = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

// ---- Song manifest (mirror of schemas/song.schema.json) ----

export const zSongManifest = z.object({
  schema: z.literal(SONG_MANIFEST_SCHEMA),
  songId: z.string(),
  slug: z.string(),
  title: z.string(),
  artist: z.object({
    address: addr,
    name: z.string().optional(),
    fid: z.number().optional(),
  }),
  audio: z.object({
    keccak256: hex32,
    mimeType: z.string(),
    bytes: z.number(),
    sourceIpfsCid: z.string().optional(),
    walrusBlobId: z.string(),
  }),
  priceUsdc: z.string(), // 6 decimals, also on-chain
  license: z.object({
    name: z.string(),
    termsHash: hex32, // keccak256(LICENSE_TERMS.md)
    termsUrl: z.string(),
  }),
  consent: z.object({
    optIn: z.boolean(),
    permissionMode: z.string(),
    permissionModeId: z.number(),
    licenseTermsHash: hex32,
    timestamp: z.number(),
    signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
    eip712: z.object({ domain: z.record(z.unknown()), primaryType: z.literal("Consent") }),
  }),
  createdAt: z.string(),
});
export type SongManifest = z.infer<typeof zSongManifest>;

// ---- License receipt (mirror of schemas/license-receipt.schema.json) ----

export const zLicenseReceipt = z.object({
  schema: z.literal(LICENSE_RECEIPT_SCHEMA),
  songId: z.string(),
  buyer: addr,
  songManifestHash: hex32,
  licenseTermsHash: hex32,
  paymentTx: hex32,
  timestamp: z.number(),
});
export type LicenseReceipt = z.infer<typeof zLicenseReceipt>;

// Encode an object to the exact bytes we hash + upload. JSON.stringify with no extra args:
// the bytes ARE the artifact, so whatever this produces is what keccak256 commits to (no canonicalization).
function encode(json: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(json));
}

export interface BuildSongManifestInput {
  songId: string;
  slug: string;
  title: string;
  artist: { address: Address; name?: string; fid?: number };
  audio: { keccak256: Hex; mimeType: string; bytes: number; sourceIpfsCid?: string; walrusBlobId: string };
  priceUsdc: string;
  license: { name: string; termsHash: Hex; termsUrl: string };
  consent: {
    optIn: boolean;
    permissionMode: string;
    permissionModeId: number;
    licenseTermsHash: Hex;
    timestamp: number;
    signature: Hex;
    eip712: { domain: Record<string, unknown>; primaryType: "Consent" };
  };
  createdAt?: string;
}

/** Build the song manifest. Returns the parsed object, the exact bytes, and their keccak256
 *  (the value committed on-chain as manifestHash and pinned in the buyer's license snapshot). */
export function buildSongManifest(input: BuildSongManifestInput): {
  manifest: SongManifest;
  bytes: Uint8Array;
  hash: Hex;
} {
  const manifest = zSongManifest.parse({
    schema: SONG_MANIFEST_SCHEMA,
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  const bytes = encode(manifest);
  return { manifest, bytes, hash: hashBytes(bytes) };
}

export interface BuildLicenseReceiptInput {
  songId: string;
  buyer: Address;
  songManifestHash: Hex;
  licenseTermsHash: Hex;
  paymentTx: Hex;
  timestamp?: number;
}

/** Build the (optional/derived) license receipt manifest uploaded to Walrus after a purchase. */
export function buildLicenseReceipt(input: BuildLicenseReceiptInput): {
  receipt: LicenseReceipt;
  bytes: Uint8Array;
  hash: Hex;
} {
  const receipt = zLicenseReceipt.parse({
    schema: LICENSE_RECEIPT_SCHEMA,
    ...input,
    timestamp: input.timestamp ?? Math.floor(Date.now() / 1000),
  });
  const bytes = encode(receipt);
  return { receipt, bytes, hash: hashBytes(bytes) };
}

/** Parse + validate raw manifest bytes fetched from Walrus (used by the verify script). */
export function parseSongManifest(bytes: Uint8Array): SongManifest {
  return zSongManifest.parse(JSON.parse(new TextDecoder().decode(bytes)));
}
