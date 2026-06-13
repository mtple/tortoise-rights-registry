// TortoiseRightsRegistry — ABI + typed read/write helpers.
// The contract is authoritative for live state (licenseActive, price). (plan §4, C7)

import { keccak256, toBytes, type Address, type Hex } from "viem";
import rightsRegistryAbi from "./abi/TortoiseRightsRegistry.json" with { type: "json" };
import registrarAbi from "./abi/TortoiseRegistrar.json" with { type: "json" };

// ABIs are generated from the Foundry build: `pnpm abi` (see package.json). Keep in sync with contracts/.
export const tortoiseRightsRegistryAbi = rightsRegistryAbi;
export const tortoiseRegistrarAbi = registrarAbi;

export const RIGHTS_REGISTRY_ADDRESS = (process.env.RIGHTS_REGISTRY_ADDRESS ?? "") as Address;
export const USDC_ADDRESS = (process.env.USDC_ADDRESS ??
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as Address; // Base mainnet, decimals()=6 (verified)

/// songKey = keccak256(bytes(songId)) — must match the contract's keccak256(bytes(songId)).
export function songKey(songId: string): Hex {
  return keccak256(toBytes(songId));
}

// TODO(Phase 2/3): readSong(client, songId), readLicense(client, songId, buyer), and write helpers
//   used by the page (artist sends registerSong; buyer does approve -> purchaseSongLicense).
