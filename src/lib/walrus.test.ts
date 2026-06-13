import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { blobIdFromResponse, putBlob, getBlob, PUBLIC_PUBLISHER_CAP } from "./walrus.js";

describe("blobIdFromResponse", () => {
  it("reads the newlyCreated shape", () => {
    expect(blobIdFromResponse({ newlyCreated: { blobObject: { blobId: "abc" } } })).toBe("abc");
  });
  it("reads the alreadyCertified shape", () => {
    expect(blobIdFromResponse({ alreadyCertified: { blobId: "xyz" } })).toBe("xyz");
  });
  it("returns null for an unrecognized shape", () => {
    expect(blobIdFromResponse({ nope: true })).toBeNull();
  });
});

describe("putBlob / getBlob (mocked fetch)", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.WALRUS_PUBLISHER = "https://pub.example";
    process.env.WALRUS_AGGREGATOR = "https://agg.example";
    process.env.WALRUS_PUBLISHER_AUTH = "";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("PUTs and parses the blobId", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ newlyCreated: { blobObject: { blobId: "B1" } } }), { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await putBlob(new Uint8Array([1, 2, 3]))).toEqual({ blobId: "B1" });
  });

  it("rejects oversize blobs when no auth publisher is set", async () => {
    const big = new Uint8Array(PUBLIC_PUBLISHER_CAP + 1);
    await expect(putBlob(big)).rejects.toThrow(/over the/);
  });

  it("GETs bytes back", async () => {
    globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([9, 8, 7]), { status: 200 })) as unknown as typeof fetch;
    const out = await getBlob("B1");
    expect(Array.from(out)).toEqual([9, 8, 7]);
  });
});
