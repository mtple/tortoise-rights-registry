// EIP-712 Consent — domain, types, and digest builders.
// The signed message binds WHO (artist) + WHAT audio (audioHash) + WHICH permission
// + under WHICH terms (licenseTermsHash). This is the core legal claim. (plan §5, C3)
//
// Verify signatures with viem `publicClient.verifyTypedData` (EOA + ERC-1271 + ERC-6492),
// never naive ecrecover — artists may connect a Base Account (smart wallet). (plan §4, R5)

import { hashTypedData, type Address, type Hex, type TypedDataDomain } from "viem";

export const CONSENT_PRIMARY_TYPE = "Consent" as const;

export const consentTypes = {
  Consent: [
    { name: "songId", type: "string" },
    { name: "artist", type: "address" },
    { name: "audioHash", type: "bytes32" },
    { name: "permissionMode", type: "uint8" }, // 0 = AI_TRAINING_ALLOWED
    { name: "licenseTermsHash", type: "bytes32" }, // keccak256(LICENSE_TERMS.md)
    { name: "optIn", type: "bool" },
    { name: "timestamp", type: "uint64" },
  ],
} as const;

export const consentDomain = (chainId: number, registry: Address) =>
  ({ name: "TortoiseRightsRegistry", version: "1", chainId, verifyingContract: registry }) as const;

export interface ConsentMessage {
  songId: string;
  artist: Address;
  audioHash: Hex;
  permissionMode: number;
  licenseTermsHash: Hex;
  optIn: boolean;
  timestamp: bigint;
}

/**
 * The full EIP-712 payload to hand to `signTypedData` (wallet) or `verifyTypedData` (server).
 * The shape matches the contract's CONSENT_TYPEHASH exactly — a golden-value test pins the digest.
 */
export function buildConsentTypedData(chainId: number, registry: Address, message: ConsentMessage) {
  return {
    domain: consentDomain(chainId, registry) satisfies TypedDataDomain,
    types: consentTypes,
    primaryType: CONSENT_PRIMARY_TYPE,
    message,
  } as const;
}

/** keccak256 EIP-712 digest for a Consent message — matches the contract's `consentDigest`. */
export function consentDigest(chainId: number, registry: Address, message: ConsentMessage): Hex {
  return hashTypedData(buildConsentTypedData(chainId, registry, message));
}
