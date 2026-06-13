// KEYLESS opt-in route (plan §6, Phase 2.3). Holds NO private key.
//
// Two phases (the artist's wallet signs between them, and sends registerSong after):
//   phase "digest": fetch the song's audio bytes -> keccak256 -> return the EIP-712 Consent payload
//                   the wallet should sign (+ the audio facts the artist is consenting to).
//   phase "store":  given the signed signature, verify it (ERC-1271-aware) against the song's
//                   on-record walletAddress, mirror the audio to Walrus, build + upload the song
//                   manifest, and return { manifestHash, manifestBlobId, audioBlobId, payload }.
//
// The artist's wallet then calls registerSong(... these values ...) itself (pays gas).

import { NextResponse } from "next/server";
import { type Address, type Hex, isAddress, getAddress } from "viem";
import { loadSongBySlug, songFromPaste, fetchAudioBytes, ipfsCidFromUrl } from "@/lib/tortoise";
import { hashBytes, buildSongManifest } from "@/lib/manifest";
import { putBlob, PUBLIC_PUBLISHER_CAP } from "@/lib/walrus";
import { RIGHTS_REGISTRY_ADDRESS, verifyConsent } from "@/lib/registry";
import { basePublicClient, BASE_CHAIN_ID } from "@/lib/client";
import { consentTypes, type ConsentMessage } from "@/lib/eip712";

const PERMISSION_MODE = 0; // AI_TRAINING_ALLOWED
const PERMISSION_MODE_NAME = "AI_TRAINING_ALLOWED";
const LICENSE_NAME = "Tortoise AI Training License v0.1";

// licenseTermsHash = keccak256(LICENSE_TERMS.md bytes), read at request time so it always matches the repo.
async function licenseTermsHash(): Promise<Hex> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const bytes = await readFile(join(process.cwd(), "LICENSE_TERMS.md"));
  return hashBytes(new Uint8Array(bytes));
}

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

async function loadSong(body: any) {
  if (body.slug) return loadSongBySlug(String(body.slug));
  if (body.audioUrl && body.walletAddress) {
    return songFromPaste({ audioUrl: String(body.audioUrl), walletAddress: String(body.walletAddress), slug: body.slug, title: body.title });
  }
  throw new Error("Provide `slug`, or `audioUrl` + `walletAddress` (paste fallback).");
}

export async function POST(req: Request) {
  if (!RIGHTS_REGISTRY_ADDRESS) return bad("RIGHTS_REGISTRY_ADDRESS not configured (deploy the contract first).", 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }
  const phase = body.phase;
  if (phase !== "digest" && phase !== "store") return bad("phase must be 'digest' or 'store'");

  let song;
  try {
    song = await loadSong(body);
  } catch (e) {
    return bad((e as Error).message);
  }
  if (!isAddress(song.walletAddress)) return bad("song has no valid artist walletAddress");
  const artist = getAddress(song.walletAddress) as Address;

  // Canonical on-chain song key: prefer the human slug, so the ENS name <slug>.tortmusic.eth, the
  // mint CLI, and the verify script all key by the SAME value with no extra flags. Fall back to the
  // Tortoise id only for the paste flow, where no slug exists. (review fix: songId must == slug)
  const canonicalSongId = song.urlSlug ?? (body.slug ? String(body.slug) : song.id);

  // Fetch audio + hash it (the consent anchors to these exact bytes).
  let audio;
  try {
    audio = await fetchAudioBytes(song.url);
  } catch (e) {
    return bad(`could not fetch audio: ${(e as Error).message}`, 502);
  }
  const audioHash = hashBytes(audio.bytes);
  const timestamp = Number(body.timestamp ?? Math.floor(Date.now() / 1000));
  const termsHash = await licenseTermsHash();

  const message: ConsentMessage = {
    songId: canonicalSongId,
    artist,
    audioHash,
    permissionMode: PERMISSION_MODE,
    licenseTermsHash: termsHash,
    optIn: true,
    timestamp: BigInt(timestamp),
  };

  const typedData = {
    domain: { name: "TortoiseRightsRegistry", version: "1", chainId: BASE_CHAIN_ID, verifyingContract: RIGHTS_REGISTRY_ADDRESS },
    types: consentTypes,
    primaryType: "Consent" as const,
    message: { ...message, timestamp: timestamp }, // wallet wants a JSON-friendly value
  };

  // ---- digest phase: return what to sign + the audio facts ----
  if (phase === "digest") {
    if (audio.bytes.length > PUBLIC_PUBLISHER_CAP) {
      return bad(`audio is ${audio.bytes.length} bytes, over the ~${PUBLIC_PUBLISHER_CAP}-byte Walrus cap; pick a smaller song.`);
    }
    return NextResponse.json({
      typedData,
      artist,
      audio: { keccak256: audioHash, mimeType: audio.mimeType, bytes: audio.bytes.length, sourceIpfsCid: ipfsCidFromUrl(song.url) },
      song: { songId: canonicalSongId, id: canonicalSongId, slug: song.urlSlug ?? body.slug ?? null, title: song.title, artistName: song.artist, fid: song.artistFid ?? null },
      licenseTermsHash: termsHash,
      timestamp,
    });
  }

  // ---- store phase: verify signature, mirror audio + upload manifest ----
  const signature = body.signature as Hex | undefined;
  if (!signature) return bad("store phase requires `signature`");
  const priceUsdc = String(body.priceUsdc ?? "");
  if (!/^\d+$/.test(priceUsdc)) return bad("priceUsdc must be an integer string (6 decimals)");

  let ok = false;
  try {
    ok = await verifyConsent(basePublicClient(), RIGHTS_REGISTRY_ADDRESS, message, signature);
  } catch (e) {
    return bad(`signature verification error: ${(e as Error).message}`, 502);
  }
  if (!ok) return bad("signature does not verify for the song's artist wallet (signer != walletAddress?)", 401);

  // Mirror audio to Walrus, then build + upload the manifest referencing it.
  let audioBlobId: string;
  try {
    audioBlobId = (await putBlob(audio.bytes)).blobId;
  } catch (e) {
    return bad(`Walrus audio upload failed: ${(e as Error).message}`, 502);
  }

  const { manifest, bytes: manifestBytes, hash: manifestHash } = buildSongManifest({
    songId: canonicalSongId,
    slug: song.urlSlug ?? String(body.slug ?? ""),
    title: song.title,
    artist: { address: artist, name: song.artist, fid: song.artistFid },
    audio: { keccak256: audioHash, mimeType: audio.mimeType, bytes: audio.bytes.length, sourceIpfsCid: ipfsCidFromUrl(song.url), walrusBlobId: audioBlobId },
    priceUsdc,
    license: { name: LICENSE_NAME, termsHash, termsUrl: `https://github.com/mtple/tortoise-rights-registry/blob/main/LICENSE_TERMS.md` },
    consent: {
      optIn: true,
      permissionMode: PERMISSION_MODE_NAME,
      permissionModeId: PERMISSION_MODE,
      licenseTermsHash: termsHash,
      timestamp,
      signature,
      eip712: { domain: typedData.domain, primaryType: "Consent" },
    },
  });

  let manifestBlobId: string;
  try {
    manifestBlobId = (await putBlob(manifestBytes)).blobId;
  } catch (e) {
    return bad(`Walrus manifest upload failed: ${(e as Error).message}`, 502);
  }

  // Everything the artist's wallet needs to call registerSong itself:
  return NextResponse.json({
    manifestHash,
    manifestBlobId,
    audioBlobId,
    audioHash,
    licenseTermsHash: termsHash,
    timestamp,
    priceUsdc,
    artist,
    registerArgs: {
      songId: canonicalSongId,
      artist,
      manifestHash,
      audioHash,
      permissionMode: PERMISSION_MODE,
      licenseTermsHash: termsHash,
      walrusManifestBlobId: manifestBlobId,
      walrusAudioBlobId: audioBlobId,
      priceUsdc,
      consentTimestamp: timestamp,
      signature,
    },
    manifestPreview: manifest,
  });
}
