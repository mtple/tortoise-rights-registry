import { describe, it, expect } from "vitest";
import { keccak256, toBytes, type Address, type Hex } from "viem";
import {
  buildSongManifest,
  buildLicenseReceipt,
  parseSongManifest,
  hashBytes,
  SONG_MANIFEST_SCHEMA,
} from "./manifest.js";

const artist = "0x00000000000000000000000000000000000000A1" as Address;
const songInput = {
  songId: "uuid-1",
  slug: "flux",
  title: "Flux",
  artist: { address: artist, name: "Artist", fid: 1 },
  audio: {
    keccak256: keccak256(toBytes("audio")),
    mimeType: "audio/mpeg",
    bytes: 1234,
    sourceIpfsCid: "bafyfixture",
    walrusBlobId: "blob-audio",
  },
  priceUsdc: "5000000",
  license: { name: "Tortoise AI Training License v0.1", termsHash: keccak256(toBytes("terms")), termsUrl: "https://x/LICENSE_TERMS.md" },
  consent: {
    optIn: true,
    permissionMode: "AI_TRAINING_ALLOWED",
    permissionModeId: 0,
    licenseTermsHash: keccak256(toBytes("terms")),
    timestamp: 1700000000,
    signature: "0xdeadbeef" as Hex,
    eip712: { domain: { chainId: 8453 }, primaryType: "Consent" as const },
  },
};

describe("hashBytes", () => {
  // Known-answer tests — assert against independent keccak256 constants, NOT against hashBytes
  // itself, so a mutation that makes hashBytes return a constant is caught (mutation-tested).
  it("matches the canonical empty-input keccak256", () => {
    expect(hashBytes(new Uint8Array(0))).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });
  it('matches keccak256("abc")', () => {
    expect(hashBytes(new TextEncoder().encode("abc"))).toBe(
      "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
  });
});

describe("buildSongManifest", () => {
  it("produces bytes whose keccak256 equals the returned hash (the on-chain manifestHash)", () => {
    const { bytes, hash } = buildSongManifest(songInput);
    expect(hash).toBe(hashBytes(bytes));
  });

  it("round-trips through parseSongManifest", () => {
    const { bytes, manifest } = buildSongManifest(songInput);
    const parsed = parseSongManifest(bytes);
    expect(parsed).toEqual(manifest);
    expect(parsed.schema).toBe(SONG_MANIFEST_SCHEMA);
    expect(parsed.audio.walrusBlobId).toBe("blob-audio");
  });

  it("is deterministic — same input yields the same bytes + hash", () => {
    const a = buildSongManifest({ ...songInput, createdAt: "2026-01-01T00:00:00Z" });
    const b = buildSongManifest({ ...songInput, createdAt: "2026-01-01T00:00:00Z" });
    expect(a.hash).toBe(b.hash);
  });

  it("rejects a malformed manifest on parse", () => {
    const bad = new TextEncoder().encode(JSON.stringify({ schema: "wrong" }));
    expect(() => parseSongManifest(bad)).toThrow();
  });
});

describe("buildLicenseReceipt", () => {
  it("builds + hashes a receipt", () => {
    const { receipt, bytes, hash } = buildLicenseReceipt({
      songId: "uuid-1",
      buyer: artist,
      songManifestHash: keccak256(toBytes("m")),
      licenseTermsHash: keccak256(toBytes("terms")),
      paymentTx: keccak256(toBytes("tx")),
    });
    expect(hash).toBe(hashBytes(bytes));
    expect(receipt.schema).toBe("tortoise-rights/license/1.0");
    expect(typeof receipt.timestamp).toBe("number");
  });
});
