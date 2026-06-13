// KEYLESS license-receipt route (plan §6, Phase 3.2). Holds NO private key.
//
// After a successful purchaseSongLicense, the client POSTs the purchase facts; this route builds
// the license-receipt manifest and uploads it to Walrus. The on-chain licenses mapping +
// LicensePurchased event are authoritative — this receipt is an optional/derived artifact.

import { NextResponse } from "next/server";
import { isAddress, getAddress, type Address, type Hex } from "viem";
import { buildLicenseReceipt } from "@/lib/manifest";
import { putBlob } from "@/lib/walrus";
import { basePublicClient } from "@/lib/client";
import { readLicense, RIGHTS_REGISTRY_ADDRESS } from "@/lib/registry";

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

export async function POST(req: Request) {
  if (!RIGHTS_REGISTRY_ADDRESS) return bad("RIGHTS_REGISTRY_ADDRESS not configured", 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }
  const { songId, buyer, paymentTx, licenseTermsHash } = body ?? {};
  if (!songId || typeof songId !== "string") return bad("songId required");
  if (!buyer || !isAddress(buyer)) return bad("valid buyer required");
  if (!paymentTx || !/^0x[a-fA-F0-9]{64}$/.test(paymentTx)) return bad("valid paymentTx required");
  if (!licenseTermsHash || !/^0x[a-fA-F0-9]{64}$/.test(licenseTermsHash)) return bad("valid licenseTermsHash required");

  // Source the licensed manifest hash from the authoritative on-chain snapshot (not the client).
  let songManifestHash: Hex;
  try {
    songManifestHash = await readLicense(basePublicClient(), songId, getAddress(buyer) as Address);
  } catch (e) {
    return bad(`could not read on-chain license: ${(e as Error).message}`, 502);
  }
  if (songManifestHash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    return bad("no on-chain license found for this buyer + song (did the purchase confirm?)", 409);
  }

  const { bytes } = buildLicenseReceipt({
    songId,
    buyer: getAddress(buyer) as Address,
    songManifestHash,
    licenseTermsHash: licenseTermsHash as Hex,
    paymentTx: paymentTx as Hex,
  });

  let blobId: string;
  try {
    blobId = (await putBlob(bytes)).blobId;
  } catch (e) {
    return bad(`Walrus receipt upload failed: ${(e as Error).message}`, 502);
  }

  return NextResponse.json({ receiptBlobId: blobId, songManifestHash });
}
