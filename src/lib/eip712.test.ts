import { describe, it, expect } from "vitest";
import { keccak256, toBytes, type Address } from "viem";
import { buildConsentTypedData, consentDigest, consentTypes, CONSENT_PRIMARY_TYPE } from "./eip712.js";

// Mirrors contracts/test/Eip712Golden.t.sol — the contract proves its on-chain digest equals this
// exact value, so asserting it here pins the TS signing path to the contract (cross-stack guarantee).
describe("eip712 Consent", () => {
  const chainId = 8453;
  const registry = "0x1111111111111111111111111111111111111111" as Address;
  const message = {
    songId: "song-123",
    artist: "0x00000000000000000000000000000000000000A1" as Address,
    audioHash: keccak256(toBytes("audio")),
    permissionMode: 0,
    licenseTermsHash: keccak256(toBytes("terms")),
    optIn: true,
    timestamp: 1700000000n,
  };

  it("matches the on-chain golden digest", () => {
    expect(consentDigest(chainId, registry, message)).toBe(
      "0xb33ec1a6fffaa5ef4f08a3704f7cc23cb3780cdca9ea5bdb98918e4a48b21179",
    );
  });

  it("builds a typed-data payload with the correct domain + primaryType", () => {
    const td = buildConsentTypedData(chainId, registry, message);
    expect(td.primaryType).toBe(CONSENT_PRIMARY_TYPE);
    expect(td.domain).toEqual({
      name: "TortoiseRightsRegistry",
      version: "1",
      chainId: 8453,
      verifyingContract: registry,
    });
    expect(td.types).toBe(consentTypes);
  });

  it("changes the digest when any signed field changes", () => {
    const base = consentDigest(chainId, registry, message);
    expect(consentDigest(chainId, registry, { ...message, timestamp: 1700000001n })).not.toBe(base);
    expect(consentDigest(chainId, registry, { ...message, permissionMode: 1 })).not.toBe(base);
    expect(consentDigest(8454, registry, message)).not.toBe(base); // chainId is in the domain
  });
});
