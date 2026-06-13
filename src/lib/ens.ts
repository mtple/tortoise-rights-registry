// ENS — registrar mint + setText (admin CLI) and resolve helpers.
// Resolution goes through the Durin CCIP-Read gateway via viem getEnsText/getEnsAddress,
// with a --rpc-fallback that reads text records directly from the L2Registry on Base. (plan §3, R3)

import type { Address } from "viem";

export const ENS_PARENT = process.env.ENS_PARENT ?? "tortmusic.eth";
export const L2_REGISTRY_ADDRESS = (process.env.L2_REGISTRY_ADDRESS ?? "") as Address;
export const TORTOISE_REGISTRAR_ADDRESS = (process.env.TORTOISE_REGISTRAR_ADDRESS ?? "") as Address;

// Text record keys set at mint (pointers, not claims — C7):
export const TEXT_KEYS = {
  manifestHash: "manifest.hash",
  walrusBlob: "walrus.blob", // song manifest blob
  walrusAudio: "walrus.audio", // mirrored audio blob
  rightsContract: "rights.contract",
  url: "url",
} as const;

// TODO(Phase 3):
//   - resolveSongText(slug, key, { rpcFallback }) — getEnsText via mainnet Universal Resolver (CCIP),
//     or direct L2Registry read on Base when rpcFallback.
//   - mintSongName(...) used by scripts/mint-song-name.mjs (admin key) — registrar.register(label, owner, records).
