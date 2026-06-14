"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Base mainnet only (D1). Connectors: injected() only.
//   wagmi's EIP-6963 multi-injected discovery surfaces one entry per browser wallet the user has
//   installed (MetaMask, Rainbow, Phantom, the Coinbase Wallet extension, etc.), so the connect
//   modal lists each by name without us hard-coding them.
//   We deliberately do NOT include baseAccount()/coinbaseWallet(): Base Account is intentionally
//   removed from this app, and the Coinbase Wallet SDK connector routed to the extension's EOA
//   (a different address) which broke opt-in (signer != song walletAddress).
// Standalone browser app, so no Farcaster mini-app connector.
const config = createConfig({
  chains: [base],
  connectors: [injected()],
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
