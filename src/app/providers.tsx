"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { injected, baseAccount } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Base mainnet only (D1). Connectors:
//   - baseAccount(): the dedicated Base Account (smart wallet, passkey) connector. This is what
//     lets an artist connect their actual Base Account as the SAME address recorded on the song.
//     NOTE: we deliberately do NOT use coinbaseWallet() — with the Coinbase Wallet browser
//     extension installed it routes to the extension's EOA (a different address), which broke
//     opt-in (signer != song walletAddress). baseAccount is a distinct, smart-wallet-only connector.
//   - injected(): plain EOA (e.g. the buyer, or anyone using MetaMask). Listed second.
// Standalone browser app, so no Farcaster mini-app connector.
const config = createConfig({
  chains: [base],
  connectors: [
    baseAccount({ appName: "Tortoise Rights Registry" }),
    injected(),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per app instance (memoized via useState; never recreate on render).
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
