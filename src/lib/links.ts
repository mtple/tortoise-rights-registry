// External explorer / artifact links — so the UI can point at where everything is independently
// verifiable (Basescan/ArcScan, Walruscan, the Walrus aggregator, the ENS app). All public, read-only.
//
// Two chains: the registry + payment live on the registry chain (Arc testnet or Base), ENS on Base.
// So `registryTx`/`registryAddress` follow the registry chain's explorer, while `baseTx`/`baseAddress`
// are for the Base-only ENS leg. Don't cross them (a registerSong tx on Arc isn't on Basescan).

import { ENS_PARENT } from "./ens";
import { REGISTRY_CHAIN_ID, ARC_CHAIN_ID } from "./client";

// Registry-chain explorer base. ArcScan for Arc testnet, Basescan for Base.
const REGISTRY_EXPLORER =
  REGISTRY_CHAIN_ID === ARC_CHAIN_ID ? "https://testnet.arcscan.app" : "https://basescan.org";
export const REGISTRY_EXPLORER_NAME = REGISTRY_CHAIN_ID === ARC_CHAIN_ID ? "ArcScan" : "Basescan";
// Human name for the registry chain, for UI copy ("Consent recorded on …").
export const REGISTRY_CHAIN_NAME = REGISTRY_CHAIN_ID === ARC_CHAIN_ID ? "Arc" : "Base";

const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  process.env.WALRUS_AGGREGATOR ??
  "https://aggregator.walrus-testnet.walrus.space";

// Walruscan network: testnet (we store blobs on Walrus testnet). Override via env if that changes.
const WALRUSCAN_NETWORK = process.env.NEXT_PUBLIC_WALRUS_NETWORK ?? "testnet";

export const links = {
  /** A tx on the REGISTRY chain's explorer (ArcScan on Arc, Basescan on Base). */
  registryTx: (hash: string) => `${REGISTRY_EXPLORER}/tx/${hash}`,
  /** An address on the REGISTRY chain's explorer. */
  registryAddress: (addr: string) => `${REGISTRY_EXPLORER}/address/${addr}`,
  /** Base tx on Basescan — for the Base-only ENS leg (always Base regardless of registry chain). */
  baseTx: (hash: string) => `https://basescan.org/tx/${hash}`,
  /** Base address (contract / wallet) on Basescan — Base-only ENS leg. */
  baseAddress: (addr: string) => `https://basescan.org/address/${addr}`,
  /** A Walrus blob on Walruscan (sender, storage epochs, Sui txs). */
  walruscanBlob: (blobId: string) => `https://walruscan.com/${WALRUSCAN_NETWORK}/blob/${blobId}`,
  /** Fetch the raw blob bytes/JSON straight from the aggregator. */
  walrusBlobRaw: (blobId: string) => `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`,
  /** The song's ENS name page on the ENS app. */
  ensName: (slug: string) => `https://app.ens.domains/${slug}.${ENS_PARENT}`,
};
