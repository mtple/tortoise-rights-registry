import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

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
          <div className="mx-auto min-h-screen max-w-3xl px-5 py-8">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
