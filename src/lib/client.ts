// Shared viem clients. Server routes + scripts use the public client to read chain state and verify
// signatures (ERC-1271 + ERC-6492 aware). The web app holds NO private key — no walletClient here.
//
// Two chains (Arc integration): the RIGHTS REGISTRY + USDC payment live on the "registry chain"
// (Arc testnet when configured, else Base mainnet); ENS subnames stay on Base regardless (Durin
// can't prove a non-rollup L1's state). REGISTRY_CHAIN_ID is the single switch the rest of the app
// reads so chain selection isn't scattered. Walrus is chain-agnostic (see walrus.ts).

import { createPublicClient, http, type PublicClient } from "viem";
import { base, arcTestnet } from "viem/chains";

export const BASE_CHAIN_ID = base.id; // 8453
export const ARC_CHAIN_ID = arcTestnet.id; // 5042002

// Which chain the registry/payment + EIP-712 domain target. Defaults to Base (preserves the
// original single-chain behavior); set REGISTRY_CHAIN_ID=5042002 to move them to Arc. The
// NEXT_PUBLIC_ twin lets client components read the same value (browser can't see bare env).
export const REGISTRY_CHAIN_ID =
  Number(process.env.NEXT_PUBLIC_REGISTRY_CHAIN_ID ?? process.env.REGISTRY_CHAIN_ID ?? BASE_CHAIN_ID);

const ON_ARC = REGISTRY_CHAIN_ID === ARC_CHAIN_ID;

// ---- Base client (always available — ENS reads/verify use it even when the registry is on Arc) ----
let baseCached: ReturnType<typeof makeBase> | undefined;
function makeBase() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || undefined),
  });
}
/** A Base mainnet public client (RPC from env, public fallback). Memoized per process. */
export function basePublicClient() {
  if (!baseCached) baseCached = makeBase();
  return baseCached;
}

// ---- Arc client (only meaningful when REGISTRY_CHAIN_ID is Arc) ----
let arcCached: ReturnType<typeof makeArc> | undefined;
function makeArc() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || undefined),
  });
}
/** An Arc testnet public client (RPC from env, viem default fallback). Memoized per process. */
export function arcPublicClient() {
  if (!arcCached) arcCached = makeArc();
  return arcCached;
}

/**
 * The public client for the REGISTRY chain — the one to read songs()/licenses() from and to verify
 * the EIP-712 consent against. Base by default, Arc when REGISTRY_CHAIN_ID=5042002. Use this (not
 * basePublicClient) wherever you touch the registry, so the app follows the configured chain.
 */
export function registryPublicClient(): PublicClient {
  // Return as the structural PublicClient so callers get one clean type, not a union of two
  // concrete chain clients (which trips viem's "two different types with this name").
  return (ON_ARC ? arcPublicClient() : basePublicClient()) as unknown as PublicClient;
}
