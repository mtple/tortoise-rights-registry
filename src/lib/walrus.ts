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

// TODO(Phase 2): putBlob(bytes: Uint8Array): Promise<{ blobId: string }>
//   - throw a clear error if bytes.length > PUBLIC_PUBLISHER_CAP and no auth publisher set
//   - try each publisher in order with N retries; parse via blobIdFromResponse
export async function putBlob(_bytes: Uint8Array): Promise<{ blobId: string }> {
  void PUBLISHERS; void EPOCHS; void AUTH;
  throw new Error("TODO(Phase 2): implement putBlob");
}

// TODO(Phase 2): getBlob(blobId): Promise<Uint8Array> — try each aggregator in order.
export async function getBlob(_blobId: string): Promise<Uint8Array> {
  void AGGREGATORS;
  throw new Error("TODO(Phase 2): implement getBlob");
}
