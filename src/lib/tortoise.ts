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

// TODO(Phase 2): loadSongBySlug(slug): fetch `${TORTOISE_API_BASE}/api/getAudio?slug=${slug}` -> zGetAudio.parse
//   + a paste-fallback variant that takes a raw audio URL/CID. Optionally read a cached dev fixture.
export async function loadSongBySlug(_slug: string): Promise<TortoiseSong> {
  void TORTOISE_API_BASE;
  throw new Error("TODO(Phase 2): implement loadSongBySlug");
}
