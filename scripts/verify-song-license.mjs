#!/usr/bin/env node
// THE CENTERPIECE (plan §9.6 / §10.7) — independently verify a song's AI-training consent and
// (optionally) a buyer's license, trusting NOTHING from Tortoise or this app's server. Self-contained:
// only viem + the ABI + LICENSE_TERMS.md. Clone-and-run.
//
//   node scripts/verify-song-license.mjs <slug|songId>                    verify the song artifact + availability
//   node scripts/verify-song-license.mjs <slug> --buyer <address>         also verify that buyer's purchase
//   node scripts/verify-song-license.mjs <slug> --rpc-fallback            read ENS records direct from the L2Registry
//   node scripts/verify-song-license.mjs <slug> --song-id <id>            skip ENS; use this songId directly
//
// Exits non-zero on the first failed check. Reads config from .env (or the real environment).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  hashTypedData,
  namehash,
  getAddress,
  parseAbi,
} from "viem";
import { base, mainnet, arcTestnet } from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---- tiny .env loader (no dep) ----
try {
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* rely on real env */
}

// ---- args ----
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const rpcFallback = args.includes("--rpc-fallback");
const buyer = flag("--buyer");
const songIdArg = flag("--song-id");
function flag(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}
if (!slug) {
  console.error("usage: verify-song-license.mjs <slug> [--buyer <addr>] [--rpc-fallback] [--song-id <id>]");
  process.exit(64);
}

// ---- config ----
// Two chains: the REGISTRY + payment + EIP-712 consent live on the registry chain (Arc testnet when
// REGISTRY_CHAIN_ID=5042002, else Base); ENS subnames are always on Base (read via the L1 Universal
// Resolver / CCIP, or directly off the L2Registry with --rpc-fallback). So `registryClient` reads
// songs()/licenses() + re-verifies the signature, while baseClient/l1Client handle the ENS leg.
const REGISTRY_CHAIN_ID = Number(process.env.REGISTRY_CHAIN_ID || base.id);
const ON_ARC = REGISTRY_CHAIN_ID === arcTestnet.id;
const registryChain = ON_ARC ? arcTestnet : base;

// Registry address + deploy block are chain-keyed: on Arc, prefer ARC_* so the Base values in .env
// stay untouched (flip back to Base by just changing REGISTRY_CHAIN_ID). Falls back to the bare vars.
const REGISTRY = ON_ARC
  ? (process.env.ARC_RIGHTS_REGISTRY_ADDRESS || need("RIGHTS_REGISTRY_ADDRESS"))
  : need("RIGHTS_REGISTRY_ADDRESS");
const DEPLOY_BLOCK = ON_ARC
  ? (process.env.ARC_REGISTRY_DEPLOY_BLOCK || process.env.REGISTRY_DEPLOY_BLOCK)
  : process.env.REGISTRY_DEPLOY_BLOCK;
const L2_REGISTRY = process.env.L2_REGISTRY_ADDRESS || "";
const ENS_PARENT = process.env.ENS_PARENT || "tortmusic.eth";
const AGGREGATORS = (process.env.WALRUS_AGGREGATOR || "https://aggregator.walrus-testnet.walrus.space")
  .split(",").map((s) => s.trim()).filter(Boolean);

const baseClient = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || undefined) });
const l1Client = createPublicClient({ chain: mainnet, transport: http(process.env.L1_RPC_URL || undefined) });
const registryClient = ON_ARC
  ? createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL || undefined) })
  : baseClient;

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env ${name} (set it in .env). Cannot verify without the contract address.`);
    process.exit(78);
  }
  return v;
}

// ---- check harness ----
let failed = 0;
const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failed++;
  return ok;
}

// ---- ABIs (only what we read) ----
const registryAbi = JSON.parse(readFileSync(join(ROOT, "src/lib/abi/TortoiseRightsRegistry.json"), "utf8"));
const TEXT_KEYS = {
  manifestHash: "manifest.hash",
  walrusBlob: "walrus.blob",
  walrusAudio: "walrus.audio",
  rightsContract: "rights.contract",
  url: "url",
};

// EIP-712 Consent — must match src/lib/eip712.ts and the contract exactly.
const consentTypes = {
  Consent: [
    { name: "songId", type: "string" },
    { name: "artist", type: "address" },
    { name: "audioHash", type: "bytes32" },
    { name: "permissionMode", type: "uint8" },
    { name: "licenseTermsHash", type: "bytes32" },
    { name: "optIn", type: "bool" },
    { name: "timestamp", type: "uint64" },
  ],
};

const songKey = (id) => keccak256(toBytes(id));

async function getBlob(blobId) {
  const errs = [];
  for (const base of AGGREGATORS) {
    try {
      const res = await fetch(`${base}/v1/blobs/${blobId}`);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      errs.push(`${base} -> HTTP ${res.status}`);
    } catch (e) {
      errs.push(`${base} -> ${e.message}`);
    }
  }
  throw new Error(`all aggregators failed: ${errs.join("; ")}`);
}

// Resolve a song's ENS text record, via CCIP gateway or (with --rpc-fallback) direct L2Registry read.
async function resolveText(name, key) {
  if (rpcFallback) {
    if (!L2_REGISTRY) throw new Error("--rpc-fallback needs L2_REGISTRY_ADDRESS");
    const node = namehash(name);
    return baseClient.readContract({
      address: getAddress(L2_REGISTRY),
      abi: parseAbi(["function text(bytes32 node, string key) view returns (string)"]),
      functionName: "text",
      args: [node, key],
    });
  }
  return l1Client.getEnsText({ name, key }); // CCIP-Read via the mainnet Universal Resolver
}

async function main() {
  console.log(`\nVerifying "${slug}"  (registry ${REGISTRY} on ${registryChain.name}; ENS on Base${rpcFallback ? ", --rpc-fallback" : ""})\n`);

  // 1) Resolve songId — from ENS, or from --song-id (lets you skip ENS before names are minted).
  let songId = songIdArg;
  const ensName = `${slug}.${ENS_PARENT}`;
  if (!songId) {
    try {
      const fromEns = await resolveText(ensName, TEXT_KEYS.manifestHash);
      // The on-chain songId IS the slug (the opt-in route keys by urlSlug), and the ENS name is
      // <slug>.tortmusic.eth — so resolving the name proves it's minted, and songKey(slug) reads the
      // right record. (--song-id overrides for the paste-flow edge case where a song had no slug.)
      check(`resolve ${ensName} (manifest.hash present)`, !!fromEns, fromEns || "empty — is the name minted?");
      songId = songIdArg || slug; // songId defaults to slug unless overridden
    } catch (e) {
      check(`resolve ${ensName}`, false, e.message + " (use --song-id to skip ENS)");
      songId = slug;
    }
  }

  // 2) On-chain record.
  let s;
  try {
    s = await registryClient.readContract({ address: getAddress(REGISTRY), abi: registryAbi, functionName: "songs", args: [songKey(songId)] });
  } catch (e) {
    check(`read song record on-chain`, false, `${e.shortMessage || e.message} (is RIGHTS_REGISTRY_ADDRESS a deployed registry?)`);
    return done();
  }
  const rec = {
    artist: s[0], permissionMode: Number(s[1]), consentTimestamp: s[2], licenseActive: s[3],
    priceUsdc: s[4], manifestHash: s[5], audioHash: s[6], licenseTermsHash: s[7],
    walrusManifestBlobId: s[8], walrusAudioBlobId: s[9],
  };
  if (!check(`song registered on-chain`, rec.artist !== "0x0000000000000000000000000000000000000000", `artist ${rec.artist}`)) {
    return done();
  }

  // 3) Manifest from Walrus, hash matches on-chain manifestHash.
  let manifest;
  try {
    const bytes = await getBlob(rec.walrusManifestBlobId);
    const h = keccak256(bytes);
    check(`manifest hash matches on-chain`, h.toLowerCase() === rec.manifestHash.toLowerCase(), `${h}`);
    manifest = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    check(`fetch manifest blob ${rec.walrusManifestBlobId}`, false, e.message);
    return done();
  }

  // 4) Audio from Walrus, keccak matches signed audioHash.
  try {
    const audio = await getBlob(rec.walrusAudioBlobId);
    const h = keccak256(audio);
    check(`audio hash matches signed audioHash`, h.toLowerCase() === rec.audioHash.toLowerCase(), `${h}`);
  } catch (e) {
    check(`fetch audio blob ${rec.walrusAudioBlobId}`, false, e.message);
  }

  // 5) Re-derive the EIP-712 Consent digest from the manifest and verify the artist's signature.
  try {
    const c = manifest.consent;
    const digestOk = await registryClient.verifyTypedData({
      address: getAddress(rec.artist),
      domain: { name: "TortoiseRightsRegistry", version: "1", chainId: registryChain.id, verifyingContract: getAddress(REGISTRY) },
      types: consentTypes,
      primaryType: "Consent",
      message: {
        songId,
        artist: getAddress(rec.artist),
        audioHash: rec.audioHash,
        permissionMode: rec.permissionMode,
        licenseTermsHash: rec.licenseTermsHash,
        optIn: true,
        timestamp: rec.consentTimestamp,
      },
      signature: c.signature,
    });
    check(`artist EIP-712 consent signature valid (ERC-1271-aware)`, digestOk, `signer ${rec.artist}`);
  } catch (e) {
    check(`verify consent signature`, false, e.message);
  }

  // 6) licenseTermsHash equals keccak256(LICENSE_TERMS.md bytes), and manifest price == on-chain price.
  const termsHash = keccak256(new Uint8Array(readFileSync(join(ROOT, "LICENSE_TERMS.md"))));
  check(`licenseTermsHash == keccak256(LICENSE_TERMS.md)`, termsHash.toLowerCase() === rec.licenseTermsHash.toLowerCase(), termsHash);
  check(`manifest price == on-chain priceUsdc`, String(manifest.priceUsdc) === String(rec.priceUsdc), `${rec.priceUsdc}`);

  // 7) Report current licensing availability (authoritative on-chain flag).
  console.log(`  • licenseActive (available for AI-training licensing): ${rec.licenseActive}`);
  console.log(`  • price: ${rec.priceUsdc} (6 decimals)`);

  // 8) --buyer: verify the buyer's license against the SNAPSHOT mapping + the LicensePurchased event
  //    (authoritative; NOT the live manifest — re-registration can orphan the live blob).
  if (buyer) {
    const b = getAddress(buyer);
    const licensed = await registryClient.readContract({ address: getAddress(REGISTRY), abi: registryAbi, functionName: "licenses", args: [songKey(songId), b] });
    check(`buyer holds a license (snapshot present)`, licensed !== "0x0000000000000000000000000000000000000000000000000000000000000000", `snapshot ${licensed}`);

    // Cross-check against the LicensePurchased event (best-effort — the snapshot above is
    // authoritative). Public RPCs cap eth_getLogs ranges (~10k blocks), so scope from the
    // registry's deploy block when known (REGISTRY_DEPLOY_BLOCK), else a bounded recent window.
    try {
      const latest = await registryClient.getBlockNumber();
      const deployBlock = DEPLOY_BLOCK ? BigInt(DEPLOY_BLOCK) : undefined;
      const fromBlock = deployBlock ?? (latest > 9000n ? latest - 9000n : 0n);
      const logs = await registryClient.getContractEvents({
        address: getAddress(REGISTRY), abi: registryAbi, eventName: "LicensePurchased",
        args: { songKey: songKey(songId), buyer: b }, fromBlock, toBlock: "latest",
      });
      const ev = logs.at(-1);
      if (ev) {
        check(`LicensePurchased event matches the buyer's snapshot`, ev.args.manifestHash.toLowerCase() === String(licensed).toLowerCase(), `tx ${ev.transactionHash}`);
      } else {
        // Not finding the event isn't a hard failure (range-limited window); the snapshot already proved the license.
        console.log(`  • LicensePurchased event not found in the scanned range${deployBlock ? "" : " (set REGISTRY_DEPLOY_BLOCK for a full scan)"} — snapshot above is authoritative`);
      }
    } catch (e) {
      console.log(`  • LicensePurchased event cross-check skipped (${e.shortMessage || e.message}); snapshot is authoritative`);
    }
  }

  done();
}

function done() {
  console.log(`\n${failed === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failed} CHECK(S) FAILED`}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nfatal:", e.message, "\n");
  process.exit(1);
});
