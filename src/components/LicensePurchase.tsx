"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount, useChainId, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { erc20Abi, formatUnits, getAddress, type Address, type Hex } from "viem";
import { Button, Card, StatusBadge, WalletButton } from "@/components/ui";
import { tortoiseRightsRegistryAbi, RIGHTS_REGISTRY_ADDRESS, USDC_ADDRESS, songKey } from "@/lib/registry";
import { BASE_CHAIN_ID } from "@/lib/client";
import { links } from "@/lib/links";

type Rec = { artist: Address; licenseActive: boolean; priceUsdc: bigint; manifestHash: Hex; licenseTermsHash: Hex };
type Step = "idle" | "approving" | "purchasing" | "receipt" | "done" | "error";

export function LicensePurchase({ songId }: { songId: string }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  // Pin the read client to Base (not whatever chain the wallet happens to be on). The registry +
  // licenses live on Base, and awaiting switchChain doesn't rebind a plain usePublicClient()
  // captured in the async handler — a chainId-pinned client always reads/waits on Base.
  const client = usePublicClient({ chainId: BASE_CHAIN_ID });

  const [rec, setRec] = useState<Rec | null>(null);
  const [licensed, setLicensed] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [msg, setMsg] = useState("");
  const [tx, setTx] = useState<Hex | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    const s = (await client.readContract({
      address: RIGHTS_REGISTRY_ADDRESS,
      abi: tortoiseRightsRegistryAbi,
      functionName: "songs",
      args: [songKey(songId)],
    })) as readonly [Address, number, bigint, boolean, bigint, Hex, Hex, Hex, string, string];
    setRec({ artist: s[0], licenseActive: s[3], priceUsdc: s[4], manifestHash: s[5], licenseTermsHash: s[7] });
    if (address) {
      const lic = (await client.readContract({
        address: RIGHTS_REGISTRY_ADDRESS,
        abi: tortoiseRightsRegistryAbi,
        functionName: "licenses",
        args: [songKey(songId), address],
      })) as Hex;
      setLicensed(lic !== "0x0000000000000000000000000000000000000000000000000000000000000000");
    }
  }, [client, songId, address]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  async function buy() {
    if (!isConnected || !address || !client || !rec) return;
    setMsg("");
    setTx(null);
    try {
      if (chainId !== BASE_CHAIN_ID) await switchChain({ chainId: BASE_CHAIN_ID });

      // Read price + manifest FRESH right before the tx (C5 + audit F1 maxPrice).
      const fresh = (await client.readContract({
        address: RIGHTS_REGISTRY_ADDRESS,
        abi: tortoiseRightsRegistryAbi,
        functionName: "songs",
        args: [songKey(songId)],
      })) as readonly [Address, number, bigint, boolean, bigint, Hex, Hex, Hex, string, string];
      const price = fresh[4];
      const manifestHash = fresh[5];

      // 1) approve USDC for exactly the price (no infinite approval → no front-run drain surface).
      setStep("approving");
      setMsg("Approve USDC in your wallet…");
      const approveTx = await writeContractAsync({
        chainId: BASE_CHAIN_ID, // pin to Base — never approve on whatever chain the wallet is on
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [RIGHTS_REGISTRY_ADDRESS, price],
      });
      await client.waitForTransactionReceipt({ hash: approveTx });

      // 2) purchaseSongLicense(songId, expectedManifestHash, maxPrice) — buyer pins price (audit F1).
      setStep("purchasing");
      setMsg("Confirm the license purchase…");
      const buyTx = await writeContractAsync({
        chainId: BASE_CHAIN_ID, // pin the purchase to Base
        address: RIGHTS_REGISTRY_ADDRESS,
        abi: tortoiseRightsRegistryAbi,
        functionName: "purchaseSongLicense",
        args: [songId, manifestHash, price],
      });
      await client.waitForTransactionReceipt({ hash: buyTx });
      setTx(buyTx);

      // 3) best-effort: upload a license receipt to Walrus (on-chain is authoritative).
      setStep("receipt");
      setMsg("Saving receipt…");
      try {
        await fetch("/api/license-receipt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ songId, buyer: address, paymentTx: buyTx, licenseTermsHash: rec.licenseTermsHash }),
        });
      } catch {
        /* receipt is optional/derived */
      }

      setStep("done");
      setMsg("");
      await refresh();
    } catch (e) {
      setStep("error");
      // Surface the common reverts helpfully.
      const m = (e as Error).message;
      if (/PriceTooHigh/.test(m)) setMsg("Price changed since you loaded the page — refresh and try again.");
      else if (/ManifestMismatch/.test(m)) setMsg("Song was updated — refresh and try again.");
      else if (/AlreadyLicensed/.test(m)) setMsg("This wallet already holds a license for this song.");
      else if (/LicenseInactive/.test(m)) setMsg("Licensing was closed by the artist.");
      else setMsg(m);
    }
  }

  if (!rec) return null;
  if (rec.artist === "0x0000000000000000000000000000000000000000") return null; // not registered → no purchase UI

  const busy = step === "approving" || step === "purchasing" || step === "receipt";

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">License this song for AI training</h2>
        {rec.licenseActive ? (
          <StatusBadge kind="ok">available</StatusBadge>
        ) : (
          <StatusBadge kind="warn">licensing closed by the artist</StatusBadge>
        )}
      </div>

      <p className="text-sm">
        Price: <strong>{formatUnits(rec.priceUsdc, 6)} USDC</strong>
      </p>

      {licensed ? (
        <p className="text-sm">
          <StatusBadge kind="ok">licensed</StatusBadge>{" "}
          <span className="ml-2">This wallet holds a license for this song.</span>
        </p>
      ) : !isConnected ? (
        <WalletButton />
      ) : rec.licenseActive ? (
        <Button onClick={buy} loading={busy}>
          {busy ? "Working…" : "License with USDC (2 steps)"}
        </Button>
      ) : null}

      {step !== "idle" && step !== "done" && msg && (
        <p className="text-sm">
          <StatusBadge kind={step === "error" ? "warn" : "info"}>{step}</StatusBadge> <span className="ml-2">{msg}</span>
        </p>
      )}

      {step === "done" && tx && (
        <p className="text-sm">
          <StatusBadge kind="ok">purchased</StatusBadge>{" "}
          <a className="ml-2 underline" href={links.baseTx(tx)} target="_blank" rel="noreferrer">
            view tx
          </a>
        </p>
      )}
    </Card>
  );
}
