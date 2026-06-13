// TortoiseRightsRegistry — ABI + typed read/write helpers.
// The contract is authoritative for live state (licenseActive, price). (plan §4, C7)

import { keccak256, toBytes, type Address, type Hex } from "viem";
import rightsRegistryAbi from "./abi/TortoiseRightsRegistry.json" with { type: "json" };
import registrarAbi from "./abi/TortoiseRegistrar.json" with { type: "json" };
import { buildConsentTypedData, type ConsentMessage } from "./eip712";
import { basePublicClient, BASE_CHAIN_ID } from "./client";

type Client = ReturnType<typeof basePublicClient>;

// ABIs are generated from the Foundry build: `pnpm abi` (see package.json). Keep in sync with contracts/.
export const tortoiseRightsRegistryAbi = rightsRegistryAbi;
export const tortoiseRegistrarAbi = registrarAbi;

// Browser (client components) can ONLY read NEXT_PUBLIC_* env. This module is imported by both the
// keyless API routes (server) and the song/purchase pages (client), so we prefer the NEXT_PUBLIC_
// twin and fall back to the bare name for server/scripts. Vercel must set NEXT_PUBLIC_RIGHTS_REGISTRY_ADDRESS
// or the live app will call viem with an empty address. (review fix: client env exposure)
export const RIGHTS_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_RIGHTS_REGISTRY_ADDRESS ??
  process.env.RIGHTS_REGISTRY_ADDRESS ??
  "") as Address;
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  process.env.USDC_ADDRESS ??
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as Address; // Base mainnet, decimals()=6 (verified)

/// songKey = keccak256(bytes(songId)) — must match the contract's keccak256(bytes(songId)).
export function songKey(songId: string): Hex {
  return keccak256(toBytes(songId));
}

// The public `songs(bytes32)` getter returns the SongRecord as a tuple in declaration order.
export interface SongRecord {
  artist: Address;
  permissionMode: number;
  consentTimestamp: bigint;
  licenseActive: boolean;
  priceUsdc: bigint;
  manifestHash: Hex;
  audioHash: Hex;
  licenseTermsHash: Hex;
  walrusManifestBlobId: string;
  walrusAudioBlobId: string;
}

/** Read a song's on-chain record. `artist == zeroAddress` means unregistered. */
export async function readSong(client: Client, songId: string): Promise<SongRecord> {
  const r = (await client.readContract({
    address: RIGHTS_REGISTRY_ADDRESS,
    abi: tortoiseRightsRegistryAbi,
    functionName: "songs",
    args: [songKey(songId)],
  })) as readonly [Address, number, bigint, boolean, bigint, Hex, Hex, Hex, string, string];
  return {
    artist: r[0],
    permissionMode: r[1],
    consentTimestamp: r[2],
    licenseActive: r[3],
    priceUsdc: r[4],
    manifestHash: r[5],
    audioHash: r[6],
    licenseTermsHash: r[7],
    walrusManifestBlobId: r[8],
    walrusAudioBlobId: r[9],
  };
}

/** The manifest hash a buyer licensed (bytes32(0) = no license). */
export async function readLicense(client: Client, songId: string, buyer: Address): Promise<Hex> {
  return (await client.readContract({
    address: RIGHTS_REGISTRY_ADDRESS,
    abi: tortoiseRightsRegistryAbi,
    functionName: "licenses",
    args: [songKey(songId), buyer],
  })) as Hex;
}

/**
 * Verify an artist's EIP-712 Consent signature, ERC-1271/6492-aware (Base Account smart wallets).
 * Uses viem's verifyTypedData via the public client — never naive ecrecover (R5).
 */
export async function verifyConsent(
  client: Client,
  registry: Address,
  message: ConsentMessage,
  signature: Hex,
): Promise<boolean> {
  const td = buildConsentTypedData(BASE_CHAIN_ID, registry, message);
  return client.verifyTypedData({
    address: message.artist,
    domain: td.domain,
    types: td.types,
    primaryType: td.primaryType,
    message: td.message as unknown as Record<string, unknown>,
    signature,
  });
}
