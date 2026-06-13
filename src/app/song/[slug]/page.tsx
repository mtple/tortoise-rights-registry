"use client";

import { use, useEffect, useState } from "react";
import { useAccount, useConnect, useSignTypedData, useWriteContract, useChainId, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { parseUnits, type Hex } from "viem";
import { Button, Card, StatusBadge } from "@/components/ui";
import { tortoiseRightsRegistryAbi, RIGHTS_REGISTRY_ADDRESS } from "@/lib/registry";
import { LicensePurchase } from "@/components/LicensePurchase";

type Step = "idle" | "signing" | "storing" | "registering" | "done" | "error";

export default function SongPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  const [song, setSong] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [price, setPrice] = useState("5"); // USDC (human)
  const [step, setStep] = useState<Step>("idle");
  const [msg, setMsg] = useState<string>("");
  const [result, setResult] = useState<any>(null);

  // Load song facts for display via the digest phase (also fetches the audio hash).
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/opt-in", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phase: "digest", slug }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "failed to load song");
        if (live) setSong(data);
      } catch (e) {
        if (live) setLoadErr((e as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [slug]);

  async function optIn() {
    if (!isConnected || !address) return;
    setMsg("");
    setResult(null);
    try {
      if (chainId !== base.id) await switchChain({ chainId: base.id });

      // 1) digest (fresh, with the buyer's chosen price + a current timestamp)
      setStep("signing");
      setMsg("Building consent message…");
      const dRes = await fetch("/api/opt-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phase: "digest", slug }),
      });
      const digest = await dRes.json();
      if (!dRes.ok) throw new Error(digest.message);

      // 2) sign EIP-712 with the connected wallet
      setMsg("Sign the consent in your wallet…");
      const signature = (await signTypedDataAsync({
        domain: digest.typedData.domain,
        types: digest.typedData.types,
        primaryType: digest.typedData.primaryType,
        message: digest.typedData.message,
      })) as Hex;

      // 3) store: verify + mirror audio + upload manifest
      setStep("storing");
      setMsg("Verifying signature and storing on Walrus…");
      const priceUsdc = parseUnits(price || "0", 6).toString();
      const sRes = await fetch("/api/opt-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phase: "store", slug, signature, priceUsdc, timestamp: digest.timestamp }),
      });
      const stored = await sRes.json();
      if (!sRes.ok) throw new Error(stored.message);

      // 4) artist sends registerSong from their own wallet (pays gas)
      setStep("registering");
      setMsg("Confirm registerSong in your wallet…");
      const a = stored.registerArgs;
      const txHash = await writeContractAsync({
        address: RIGHTS_REGISTRY_ADDRESS,
        abi: tortoiseRightsRegistryAbi,
        functionName: "registerSong",
        args: [
          a.songId,
          a.artist,
          a.manifestHash,
          a.audioHash,
          a.permissionMode,
          a.licenseTermsHash,
          a.walrusManifestBlobId,
          a.walrusAudioBlobId,
          BigInt(a.priceUsdc),
          BigInt(a.consentTimestamp),
          a.signature,
        ],
      });

      setStep("done");
      setResult({ ...stored, txHash });
      setMsg("");
    } catch (e) {
      setStep("error");
      setMsg((e as Error).message);
    }
  }

  if (loadErr) {
    return (
      <main className="space-y-4">
        <a href="/" className="text-sm underline">← back</a>
        <Card>
          <p className="font-medium">Couldn’t load “{slug}”.</p>
          <p className="text-sm text-ink/70">{loadErr}</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <a href="/" className="text-sm underline">← back</a>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{song?.song?.title ?? slug}</h1>
        {song?.song?.artistName && <p className="text-ink/70">by {song.song.artistName}</p>}
      </header>

      <Card className="space-y-3">
        <h2 className="font-semibold">Opt this song into AI-training licensing</h2>
        {song ? (
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-ink/60">Artist wallet</dt>
            <dd className="font-mono text-xs">{song.artist}</dd>
            <dt className="text-ink/60">Audio hash</dt>
            <dd className="truncate font-mono text-xs">{song.audio?.keccak256}</dd>
            <dt className="text-ink/60">Audio size</dt>
            <dd>{((song.audio?.bytes ?? 0) / 1024 / 1024).toFixed(2)} MiB</dd>
          </dl>
        ) : (
          <p className="text-sm text-ink/60">Loading song…</p>
        )}

        <label className="block text-sm font-medium" htmlFor="price">
          License price (USDC)
        </label>
        <input
          id="price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          className="w-32 rounded-lg border border-ink/30 bg-white px-3 py-1.5"
        />

        {!isConnected ? (
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => (
              <Button key={c.uid} onClick={() => connect({ connector: c })}>
                Connect {c.name}
              </Button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink/60">
              Connected: <span className="font-mono">{address}</span>
            </p>
            <Button onClick={optIn} disabled={!song || step === "signing" || step === "storing" || step === "registering"}>
              {step === "idle" || step === "error" || step === "done" ? "Sign consent & register" : "Working…"}
            </Button>
          </div>
        )}

        {step !== "idle" && step !== "done" && msg && (
          <p className="text-sm">
            <StatusBadge kind={step === "error" ? "warn" : "info"}>{step}</StatusBadge> <span className="ml-2">{msg}</span>
          </p>
        )}
      </Card>

      {step === "done" && result && (
        <Card className="space-y-2">
          <p>
            <StatusBadge kind="ok">registered</StatusBadge>
          </p>
          <p className="text-sm">Consent recorded on Base. Audio + manifest stored on Walrus.</p>
          <ul className="space-y-1 text-xs">
            <li>
              tx:{" "}
              <a className="underline" href={`https://basescan.org/tx/${result.txHash}`} target="_blank" rel="noreferrer">
                {result.txHash}
              </a>
            </li>
            <li>
              manifest blob: <span className="font-mono">{result.manifestBlobId}</span>
            </li>
            <li>
              audio blob: <span className="font-mono">{result.audioBlobId}</span>
            </li>
            <li>
              manifest hash: <span className="font-mono">{result.manifestHash}</span>
            </li>
          </ul>
        </Card>
      )}

      {/* Buyer-facing license purchase — self-hides until the song is registered on-chain. */}
      {song?.song?.id && <LicensePurchase songId={song.song.id} />}

      <p className="text-xs text-ink/60">
        Consent infrastructure for a prototype — not legal advice. The signature proves the named wallet
        consented to this audio hash under the published terms; the wallet↔song link is Tortoise-attested.
      </p>
    </main>
  );
}
