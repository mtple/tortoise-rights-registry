// TortoiseRightsRegistry — ABI + typed read/write helpers.
// The contract is authoritative for live state (licenseActive, price). (plan §4, C7)

import type { Address } from "viem";

export const RIGHTS_REGISTRY_ADDRESS = (process.env.RIGHTS_REGISTRY_ADDRESS ?? "") as Address;
export const USDC_ADDRESS = (process.env.USDC_ADDRESS ??
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as Address; // Base mainnet, decimals()=6 (verified)

// TODO(Phase 1): export the ABI (generated from contracts/out or hand-written for the used fns):
//   registerSong, revokeConsent, purchaseSongLicense, songs(bytes32), licenses(bytes32,address)
//   + events SongRegistered / ConsentRevoked / LicensePurchased
// TODO(Phase 1): songKey(songId: string): Hex = keccak256(toBytes(songId))
// TODO(Phase 2/3): readSong(client, songId), readLicense(client, songId, buyer), and write helpers
//   used by the page (artist sends registerSong; buyer does approve -> purchaseSongLicense).

export const tortoiseRightsRegistryAbi = [] as const; // filled in Phase 1
