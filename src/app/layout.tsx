import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { WalletStatus } from "@/components/ui";

export const metadata: Metadata = {
  title: "Tortoise Rights Registry",
  description:
    "Provable AI-training consent for music — opt in with a wallet signature, store consent on Walrus, license with USDC on Base, verify independently.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="mx-auto min-h-screen max-w-3xl px-5 py-8">
            {/* Persistent wallet control: a connected wallet can always disconnect from here,
                even on pages/states where no in-form wallet button is shown. Hidden when no
                wallet is connected. */}
            <WalletStatus className="mb-6 justify-end" />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
