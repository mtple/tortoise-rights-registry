"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { type Address, type Hex } from "viem";
import { Card } from "@/components/ui";
import { tortoiseRightsRegistryAbi, RIGHTS_REGISTRY_ADDRESS, songKey } from "@/lib/registry";
import { links } from "@/lib/links";

type Rec = {
  artist: Address;
  manifestHash: Hex;
  manifestBlob: string;
  audioBlob: string;
};

const ZERO = "0x0000000000000000000000000000000000000000";

// Persistent "verify it yourself" panel — shown on a song's page whenever it's registered on-chain
// (not just right after opt-in). Links to every place the claim can be independently checked:
// Walruscan / the raw manifest + audio on Walrus, the ENS name, and Basescan.
export function VerifyLinks({ songId, slug }: { songId: string; slug: string }) {
  const client = usePublicClient();
  const [rec, setRec] = useState<Rec | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!client || !RIGHTS_REGISTRY_ADDRESS) return;
      try {
        const s = (await client.readContract({
          address: RIGHTS_REGISTRY_ADDRESS,
          abi: tortoiseRightsRegistryAbi,
          functionName: "songs",
          args: [songKey(songId)],
        })) as readonly [Address, number, bigint, boolean, bigint, Hex, Hex, Hex, string, string];
        if (live && s[0] !== ZERO) {
          setRec({ artist: s[0], manifestHash: s[5], manifestBlob: s[8], audioBlob: s[9] });
        }
      } catch {
        /* not registered / RPC issue → panel stays hidden */
      }
    })();
    return () => {
      live = false;
    };
  }, [client, songId]);

  if (!rec) return null; // not registered → nothing to verify yet

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <li className="flex flex-wrap gap-x-2">
      <span className="text-ink/60">{label}</span>
      {children}
    </li>
  );
  const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a className="break-all underline hover:opacity-80" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );

  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Verify this song — trust nothing, check it yourself</h2>
      <p className="text-xs text-ink/70">
        Every claim below is independently verifiable on public infrastructure. Or run{" "}
        <code className="rounded bg-ink/10 px-1">node scripts/verify-song-license.mjs {slug}</code>.
      </p>
      <ul className="space-y-1.5 text-xs">
        <Row label="ENS name">
          <A href={links.ensName(slug)}>{slug}.tortmusic.eth</A>
        </Row>
        <Row label="Consent + price (Base)">
          <A href={links.baseAddress(RIGHTS_REGISTRY_ADDRESS)}>contract on Basescan</A>
        </Row>
        <Row label="Manifest (Walrus)">
          <A href={links.walrusBlobRaw(rec.manifestBlob)}>JSON</A>
          <A href={links.walruscanBlob(rec.manifestBlob)}>Walruscan</A>
          <span className="font-mono text-ink/50">{rec.manifestBlob}</span>
        </Row>
        <Row label="Audio (Walrus)">
          <A href={links.walrusBlobRaw(rec.audioBlob)}>file</A>
          <A href={links.walruscanBlob(rec.audioBlob)}>Walruscan</A>
          <span className="font-mono text-ink/50">{rec.audioBlob}</span>
        </Row>
        <Row label="Artist wallet">
          <A href={links.baseAddress(rec.artist)}>{rec.artist}</A>
        </Row>
        <Row label="Manifest hash (on-chain commitment)">
          <span className="break-all font-mono text-ink/50">{rec.manifestHash}</span>
        </Row>
      </ul>
    </Card>
  );
}
