"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Base mainnet only (D1). Connectors: Coinbase Smart Wallet (Base Account) + injected EOA.
// We replicate the app's WalletProvider pattern but drop the Farcaster mini-app connector
// (this is a standalone browser app, not in-frame).
const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({ appName: "Tortoise Rights Registry", preference: "all" }),
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
