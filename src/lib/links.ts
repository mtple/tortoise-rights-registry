// External explorer / artifact links — so the UI can point at where everything is independently
// verifiable (Basescan, Walruscan, the Walrus aggregator, the ENS app). All public, read-only.

import { ENS_PARENT } from "./ens";

const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  process.env.WALRUS_AGGREGATOR ??
  "https://aggregator.walrus-testnet.walrus.space";

// Walruscan network: testnet (we store blobs on Walrus testnet). Override via env if that changes.
const WALRUSCAN_NETWORK = process.env.NEXT_PUBLIC_WALRUS_NETWORK ?? "testnet";

export const links = {
  /** Base tx on Basescan. */
  baseTx: (hash: string) => `https://basescan.org/tx/${hash}`,
  /** Base address (contract / wallet) on Basescan. */
  baseAddress: (addr: string) => `https://basescan.org/address/${addr}`,
  /** A Walrus blob on Walruscan (sender, storage epochs, Sui txs). */
  walruscanBlob: (blobId: string) => `https://walruscan.com/${WALRUSCAN_NETWORK}/blob/${blobId}`,
  /** Fetch the raw blob bytes/JSON straight from the aggregator. */
  walrusBlobRaw: (blobId: string) => `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`,
  /** The song's ENS name page on the ENS app. */
  ensName: (slug: string) => `https://app.ens.domains/${slug}.${ENS_PARENT}`,
};
