"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

export default function Home() {
  const [slug, setSlug] = useState("");
  const router = useRouter();

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Tortoise Rights Registry</h1>
        <p className="text-ink/80">
          Provable AI-training consent for music. Opt a song in with a wallet signature, store the consent
          manifest on Walrus, and let model developers license it with USDC on Base — verifiable by anyone.
        </p>
      </header>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (slug.trim()) router.push(`/song/${encodeURIComponent(slug.trim())}`);
          }}
          className="space-y-3"
        >
          <label className="block text-sm font-medium" htmlFor="slug">
            Tortoise song slug
          </label>
          <input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. test"
            className="w-full rounded-lg border border-ink/30 bg-white px-3 py-2 outline-none focus:border-ink"
          />
          <Button type="submit" disabled={!slug.trim()}>
            Open song →
          </Button>
        </form>
      </Card>

      <p className="text-xs text-ink/60">
        Consent infrastructure for a prototype — not legal advice, and not a promise of artist revenue. Audio
        and manifests are stored on Walrus testnet (labeled); contract, USDC, and ENS are on Base mainnet.
      </p>
    </main>
  );
}
