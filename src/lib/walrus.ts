// Walrus blob store — raw HTTP, multi-endpoint failover + retries.
// Handles BOTH `newlyCreated.blobObject.blobId` and `alreadyCertified.blobId` shapes. (plan §3)
//
// NOTE: We store blobs on Walrus TESTNET (mainnet has no free publisher — see README/PREREQUISITES).
// Endpoints come from env so a later swap to a self-run mainnet publisher is config-only.
// blobId is a deterministic content commitment, so integrity is provable regardless of network.

const PUBLISHERS = () => (process.env.WALRUS_PUBLISHER ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const AGGREGATORS = () => (process.env.WALRUS_AGGREGATOR ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const EPOCHS = () => process.env.WALRUS_EPOCHS ?? "6";
const AUTH = () => process.env.WALRUS_PUBLISHER_AUTH ?? "";

export const PUBLIC_PUBLISHER_CAP = 10 * 1024 * 1024; // ~10 MiB advisory cap (R2)

export function blobIdFromResponse(json: unknown): string | null {
  const j = json as Record<string, any>;
  return j?.newlyCreated?.blobObject?.blobId ?? j?.alreadyCertified?.blobId ?? null;
}

const RETRIES = 2; // attempts per endpoint beyond the first

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Copy into a fresh ArrayBuffer-backed view so fetch's BodyInit typing is satisfied across TS libs
// (a Uint8Array's generic .buffer can type as SharedArrayBuffer under TS 5.7+ DOM lib).
function toBody(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

/**
 * Store bytes on Walrus. Tries each publisher in order, with a couple of retries each, and
 * handles both `newlyCreated` and `alreadyCertified` response shapes. Returns the blobId
 * (a deterministic content commitment — same bytes always yield the same id).
 */
export async function putBlob(bytes: Uint8Array): Promise<{ blobId: string }> {
  const publishers = PUBLISHERS();
  if (publishers.length === 0) throw new Error("WALRUS_PUBLISHER not configured");
  const auth = AUTH();
  if (bytes.length > PUBLIC_PUBLISHER_CAP && !auth) {
    throw new Error(
      `Blob is ${bytes.length} bytes, over the ~${PUBLIC_PUBLISHER_CAP}-byte public-publisher cap (R2). ` +
        `Use a smaller file or a self-run/authed publisher.`,
    );
  }

  const headers: Record<string, string> = { "content-type": "application/octet-stream" };
  if (auth) headers.authorization = auth;

  const errors: string[] = [];
  for (const base of publishers) {
    const url = `${base}/v1/blobs?epochs=${EPOCHS()}`;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await fetch(url, { method: "PUT", body: toBody(bytes), headers });
        if (!res.ok) {
          errors.push(`PUT ${base} -> HTTP ${res.status}`);
        } else {
          const blobId = blobIdFromResponse(await res.json());
          if (blobId) return { blobId };
          errors.push(`PUT ${base} -> no blobId in response`);
        }
      } catch (e) {
        errors.push(`PUT ${base} -> ${(e as Error).message}`);
      }
      if (attempt < RETRIES) await sleep(300 * (attempt + 1));
    }
  }
  throw new Error(`All Walrus publishers failed:\n  ${errors.join("\n  ")}`);
}

/** Fetch bytes for a blobId, trying each aggregator in order with retries. */
export async function getBlob(blobId: string): Promise<Uint8Array> {
  const aggregators = AGGREGATORS();
  if (aggregators.length === 0) throw new Error("WALRUS_AGGREGATOR not configured");

  const errors: string[] = [];
  for (const base of aggregators) {
    const url = `${base}/v1/blobs/${blobId}`;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) return new Uint8Array(await res.arrayBuffer());
        errors.push(`GET ${base} -> HTTP ${res.status}`);
      } catch (e) {
        errors.push(`GET ${base} -> ${(e as Error).message}`);
      }
      if (attempt < RETRIES) await sleep(300 * (attempt + 1));
    }
  }
  throw new Error(`All Walrus aggregators failed for ${blobId}:\n  ${errors.join("\n  ")}`);
}

/** Convenience for the verify script: fetch a blob and assert its keccak256 matches `expected`. */
export async function getBlobChecked(blobId: string, expected: string): Promise<Uint8Array> {
  const bytes = await getBlob(blobId);
  const { keccak256 } = await import("viem");
  const got = keccak256(bytes);
  if (got.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Walrus blob ${blobId} hash mismatch: got ${got}, expected ${expected}`);
  }
  return bytes;
}
