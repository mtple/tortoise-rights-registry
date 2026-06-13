// Shared viem clients. Server routes + scripts use the public client to read Base and verify
// signatures (ERC-1271 + ERC-6492 aware). The web app holds NO private key — no walletClient here.

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

// Let viem infer the concrete client type (an explicit PublicClient annotation triggers
// "two different types with this name" friction across viem's generic client types).
let cached: ReturnType<typeof makeClient> | undefined;

function makeClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || undefined),
  });
}

/** A Base mainnet public client (RPC from env, public fallback). Memoized per process. */
export function basePublicClient() {
  if (!cached) cached = makeClient();
  return cached;
}

export const BASE_CHAIN_ID = base.id; // 8453
