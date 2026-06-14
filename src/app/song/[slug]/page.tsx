"use client";

import { use, useEffect, useState } from "react";
import { useAccount, useSignTypedData, useWriteContract, useChainId, useSwitchChain, usePublicClient } from "wagmi";
import { parseUnits, type Hex } from "viem";
import { Button, Card, StatusBadge, WalletButton } from "@/components/ui";
import { tortoiseRightsRegistryAbi, RIGHTS_REGISTRY_ADDRESS, tortoiseRegistrarAbi, songKey } from "@/lib/registry";
import { REGISTRY_CHAIN_ID, BASE_CHAIN_ID } from "@/lib/client";
import { TORTOISE_REGISTRAR_ADDRESS, buildSongTextRecords } from "@/lib/ens";
import { LicensePurchase } from "@/components/LicensePurchase";
import { VerifyLinks } from "@/components/VerifyLinks";
import { links, REGISTRY_CHAIN_NAME } from "@/lib/links";

type Step = "idle" | "signing" | "storing" | "registering" | "naming" | "done" | "error";

export default function SongPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  // Pinned to the registry chain: the registered-song read AND the registerSong receipt wait both
  // target the registry chain (Arc when configured), regardless of the wallet's current chain.
  const client = usePublicClient({ chainId: REGISTRY_CHAIN_ID });

  const [song, setSong] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [price, setPrice] = useState("5"); // USDC (human)
  const [step, setStep] = useState<Step>("idle");
  const [msg, setMsg] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  // On-chain registration status (null = unknown/checking). If already registered, we show an
  // "available for licensing" indicator instead of the opt-in form.
  const [registered, setRegistered] = useState<{ artist: string; licenseActive: boolean } | null>(null);

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

  // Read the on-chain record to see if this song already has consent recorded. Drives whether the
  // card shows the opt-in form or an "available for licensing" indicator. Re-runs after a fresh
  // opt-in (result) so the UI flips without a reload.
  const songId: string | undefined = song?.song?.songId;
  useEffect(() => {
    let live = true;
    (async () => {
      if (!client || !songId || !RIGHTS_REGISTRY_ADDRESS) return;
      try {
        const s = (await client.readContract({
          address: RIGHTS_REGISTRY_ADDRESS,
          abi: tortoiseRightsRegistryAbi,
          functionName: "songs",
          args: [songKey(songId)],
        })) as readonly [`0x${string}`, number, bigint, boolean, bigint, Hex, Hex, Hex, string, string];
        if (live) {
          setRegistered(
            s[0] === "0x0000000000000000000000000000000000000000"
              ? null
              : { artist: s[0], licenseActive: s[3] },
          );
        }
      } catch {
        /* RPC issue → leave as unknown; opt-in form stays available */
      }
    })();
    return () => {
      live = false;
    };
  }, [client, songId, result]);

  async function optIn() {
    if (!isConnected || !address) return;
    setMsg("");
    setResult(null);
    try {
      if (chainId !== REGISTRY_CHAIN_ID) await switchChain({ chainId: REGISTRY_CHAIN_ID });

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
      await client?.waitForTransactionReceipt?.({ hash: txHash }).catch(() => {});

      // Mint <slug>.tortmusic.eth in-flow — the artist sends registerByArtist themselves (keyless,
      // gated on-chain to the song's registered artist). Non-fatal: consent is already recorded,
      // so a naming failure (e.g. name already minted, or registrar not configured) doesn't undo it.
      //
      // TWO-CHAIN CASE: the ENS registrar is on Base, but when the registry is on Arc the wallet is
      // now on Arc — minting in-flow would force an Arc→Base switch mid-flow. So we only mint in-flow
      // when the registry is ALSO on Base; on Arc, naming is done backend-side via the admin CLI
      // (scripts/mint-song-name.mjs), keeping the demo flow single-network per action. (plan: two-chain coordination)
      let nameTx: Hex | undefined;
      let nameErr: string | undefined;
      const inflowMint = REGISTRY_CHAIN_ID === BASE_CHAIN_ID && !!TORTOISE_REGISTRAR_ADDRESS;
      if (inflowMint) {
        try {
          setStep("naming");
          setMsg("Confirm the ENS name mint in your wallet…");
          const records = buildSongTextRecords(a.songId, {
            manifestHash: a.manifestHash,
            walrusBlob: a.walrusManifestBlobId,
            walrusAudio: a.walrusAudioBlobId,
            rightsContract: RIGHTS_REGISTRY_ADDRESS,
            url: typeof window !== "undefined" ? `${window.location.origin}/song/${slug}` : "",
          });
          nameTx = await writeContractAsync({
            address: TORTOISE_REGISTRAR_ADDRESS,
            abi: tortoiseRegistrarAbi,
            functionName: "registerByArtist",
            args: [a.songId, records],
          });
        } catch (e) {
          nameErr = (e as Error).message; // keep going — the consent is what matters
        }
      }

      setStep("done");
      setResult({ ...stored, txHash, nameTx, nameErr, slug });
      setMsg("");
    } catch (e) {
      setStep("error");
      setMsg((e as Error).message);
    }
  }

  // True during the multi-step opt-in (sign → store on Walrus → register → name), where there are
  // long waits (Walrus uploads ~18s). Drives the in-button spinner so the user knows it's working.
  const working = step === "signing" || step === "storing" || step === "registering" || step === "naming";

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
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            {registered ? "This song is licensed for AI training" : "Opt this song into AI-training licensing"}
          </h2>
          {registered &&
            (registered.licenseActive ? (
              <StatusBadge kind="ok">available for licensing</StatusBadge>
            ) : (
              <StatusBadge kind="warn">licensing closed</StatusBadge>
            ))}
        </div>
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

        {registered ? (
          // Consent already recorded on-chain — no opt-in form. Point to the verify + purchase
          // panels below.
          <p className="text-sm text-ink/70">
            Consent for this song is recorded on {REGISTRY_CHAIN_NAME}.{" "}
            {registered.licenseActive
              ? "Buy a license below, or verify the full chain yourself."
              : "The artist has closed new licensing; you can still verify the chain below."}
          </p>
        ) : (
          <>
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
              <WalletButton />
            ) : (
              <Button onClick={optIn} loading={working} disabled={!song}>
                {working ? "Working…" : "Sign consent & register"}
              </Button>
            )}

            {step !== "idle" && step !== "done" && msg && (
              <p className="text-sm">
                <StatusBadge kind={step === "error" ? "warn" : "info"}>{step}</StatusBadge> <span className="ml-2">{msg}</span>
              </p>
            )}
          </>
        )}
      </Card>

      {step === "done" && result && (
        <Card className="space-y-2">
          <p>
            <StatusBadge kind="ok">registered</StatusBadge>{" "}
            {result.nameTx && <StatusBadge kind="ok">name minted</StatusBadge>}
          </p>
          <p className="text-sm">Consent recorded on {REGISTRY_CHAIN_NAME}, audio + manifest stored on Walrus. Details below.</p>
          <ul className="space-y-1 text-xs">
            <li>
              registerSong tx: <a className="underline" href={links.registryTx(result.txHash)} target="_blank" rel="noreferrer">{result.txHash.slice(0, 18)}…</a>
            </li>
            {result.nameTx && (
              <li>
                name mint tx (Base): <a className="underline" href={links.baseTx(result.nameTx)} target="_blank" rel="noreferrer">{result.nameTx.slice(0, 18)}…</a>
              </li>
            )}
            {result.nameErr && (
              <li className="text-amber-700">ENS name not minted (consent is still recorded): {result.nameErr}</li>
            )}
            {!result.nameTx && !result.nameErr && (
              <li className="text-ink/60">ENS name on Base is minted separately by Tortoise (backend) — consent + payment are on {REGISTRY_CHAIN_NAME}.</li>
            )}
          </ul>
        </Card>
      )}

      {/* Persistent verify panel — shows for ANY registered song on page load (reads on-chain),
          linking Walruscan / ENS / Basescan / the raw manifest + audio. */}
      {song?.song?.songId && <VerifyLinks songId={song.song.songId} slug={song.song.slug || slug} />}

      {/* Buyer-facing license purchase — self-hides until the song is registered on-chain.
          songId is the canonical on-chain key (the slug for Tortoise songs) — same value the
          opt-in route registered under, so songKey() matches. */}
      {song?.song?.songId && <LicensePurchase songId={song.song.songId} />}

      <p className="text-xs text-ink/60">
        Consent infrastructure for a prototype — not legal advice. The signature proves the named wallet
        consented to this audio hash under the published terms; the wallet↔song link is Tortoise-attested.
      </p>
    </main>
  );
}
