"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base, arcTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { REGISTRY_CHAIN_ID, ARC_CHAIN_ID } from "@/lib/client";

// Two chains: the registry + USDC payment live on the registry chain (Arc testnet when
// REGISTRY_CHAIN_ID=5042002, else Base); ENS stays on Base. We register BOTH so the wallet can be
// asked to switch to whichever the registry is on, and order them with the registry chain FIRST
// (wagmi's default connect target) so opt-in/purchase land on the right network. Walrus is off-chain.
//
// Connectors: injected() only.
//   wagmi's EIP-6963 multi-injected discovery surfaces one entry per browser wallet the user has
//   installed (MetaMask, Rainbow, Phantom, the Coinbase Wallet extension, etc.), so the connect
//   modal lists each by name without us hard-coding them.
//   We deliberately do NOT include baseAccount()/coinbaseWallet(): Base Account is intentionally
//   removed from this app, and the Coinbase Wallet SDK connector routed to the extension's EOA
//   (a different address) which broke opt-in (signer != song walletAddress).
// Standalone browser app, so no Farcaster mini-app connector.
const onArc = REGISTRY_CHAIN_ID === ARC_CHAIN_ID;
const config = createConfig({
  chains: onArc ? [arcTestnet, base] : [base, arcTestnet],
  connectors: [injected()],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined),
    [arcTestnet.id]: http(process.env.NEXT_PUBLIC_ARC_RPC_URL || undefined),
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
