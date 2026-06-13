// Load a real Tortoise song via the PUBLIC read seam: GET {TORTOISE_API_BASE}/api/getAudio?slug=
// Paste-URL/CID fallback when the live app is unreachable. (plan D9, §6)
//
// VERIFIED live response shape (2026-06): fields are camelCase. `walletAddress` is the song's
// on-record artist wallet used for the opt-in signer check. The plan's `wallet_address` was wrong.

import { z } from "zod";

const TORTOISE_API_BASE = process.env.TORTOISE_API_BASE ?? "https://tortoise.studio";

// Parser matched to the real endpoint (extra fields tolerated).
export const zGetAudio = z.object({
  id: z.string(),
  url: z.string().url(), // Pinata gateway audio URL
  title: z.string(),
  artist: z.string(), // display name
  imageUrl: z.string().url().optional(),
  artistFid: z.number().optional(),
  walletAddress: z.string(), // <-- artist wallet (signer check)
  txHash: z.string().optional(),
  price: z.string().optional(),
  urlSlug: z.string().optional(),
  onchainData: z.record(z.any()).optional(),
});
export type TortoiseSong = z.infer<typeof zGetAudio>;

/** Load a real Tortoise song by slug via the public getAudio endpoint. */
export async function loadSongBySlug(slug: string): Promise<TortoiseSong> {
  const res = await fetch(`${TORTOISE_API_BASE}/api/getAudio?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) {
    throw new Error(`getAudio(${slug}) -> HTTP ${res.status} (live app unreachable? use the paste fallback)`);
  }
  return zGetAudio.parse(await res.json());
}

/**
 * Paste fallback (D9): build a minimal song from a raw audio URL/CID when the live API is down.
 * The caller must supply the artist wallet (normally read from getAudio's walletAddress).
 */
export function songFromPaste(input: {
  audioUrl: string;
  walletAddress: string;
  title?: string;
  artist?: string;
  slug?: string;
  songId?: string;
}): TortoiseSong {
  return zGetAudio.parse({
    id: input.songId ?? input.audioUrl,
    url: input.audioUrl,
    title: input.title ?? "Untitled",
    artist: input.artist ?? "Unknown",
    walletAddress: input.walletAddress,
    urlSlug: input.slug,
  });
}

/** Fetch the raw audio bytes (from the public Pinata gateway URL) to hash + mirror to Walrus. */
export async function fetchAudioBytes(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio fetch -> HTTP ${res.status}`);
  const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType };
}

/** Extract the original IPFS CID from a Pinata gateway URL (provenance), if present. */
export function ipfsCidFromUrl(url: string): string | undefined {
  return url.match(/\/ipfs\/([a-zA-Z0-9]+)/)?.[1];
}
