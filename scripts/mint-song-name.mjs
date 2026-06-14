#!/usr/bin/env node
// Admin CLI (plan §7 Phase 3.1) — mint <slug>.tortmusic.eth with text records for an opted-in song.
// Owner-only: signs with the forge keystore (prompts for password). NEVER run from the hosted app.
//
//   node scripts/mint-song-name.mjs <label> [--song-id <id>] [--owner <addr>]
//
// Reads the song's on-chain record (manifestHash + Walrus blob ids), builds pre-encoded setText
// records, and calls registrar.register(label, owner, records) → createSubnode sets them at mint.
// `label` defaults the songId to itself unless --song-id is given. owner defaults to the artist.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  toBytes,
  namehash,
  encodeFunctionData,
  parseAbi,
  getAddress,
} from "viem";
import { base, arcTestnet } from "viem/chains";
import { loadAdminAccount } from "./lib/keystore.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// tiny .env loader
try {
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* rely on real env */
}

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--"));
const songId = flag("--song-id") || label;
const ownerArg = flag("--owner");
function flag(n) {
  const i = args.indexOf(n);
  return i !== -1 ? args[i + 1] : undefined;
}
if (!label) {
  console.error("usage: mint-song-name.mjs <label> [--song-id <id>] [--owner <addr>]");
  process.exit(64);
}

const REGISTRAR = need("TORTOISE_REGISTRAR_ADDRESS"); // ENS registrar — always Base (Durin)
const ENS_PARENT = process.env.ENS_PARENT || "tortmusic.eth";
function need(n) {
  if (!process.env[n]) {
    console.error(`Missing required env ${n}.`);
    process.exit(78);
  }
  return process.env[n];
}

// Two chains: the song record is READ from the registry chain (Arc when REGISTRY_CHAIN_ID=5042002,
// else Base) — using the Arc registry address there — while the ENS name is MINTED on Base. Mixing
// these up was the bug: reading the Base registry on an Arc deployment reports the song unregistered.
const ON_ARC = Number(process.env.REGISTRY_CHAIN_ID || base.id) === arcTestnet.id;
const REGISTRY = ON_ARC
  ? (process.env.ARC_RIGHTS_REGISTRY_ADDRESS || need("RIGHTS_REGISTRY_ADDRESS"))
  : need("RIGHTS_REGISTRY_ADDRESS");

// Signing account from the forge keystore (prompts for password) — no raw key in env. (user policy)
const account = await loadAdminAccount();
// Wallet + registrar reads/writes are on BASE (ENS lives on Base regardless of the registry chain).
const wallet = createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL || undefined) });
const pub = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || undefined) });
// Registry read uses the registry chain's client.
const registryPub = ON_ARC
  ? createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL || undefined) })
  : pub;

const registryAbi = JSON.parse(readFileSync(join(ROOT, "src/lib/abi/TortoiseRightsRegistry.json"), "utf8"));
const resolverAbi = parseAbi(["function setText(bytes32 node, string key, string value)"]);
const registrarAbi = parseAbi(["function register(string label, address owner, bytes[] records) returns (bytes32)"]);

const songKey = (id) => keccak256(toBytes(id));

async function main() {
  console.log(`\nMinting ${label}.${ENS_PARENT} (songId "${songId}") from admin ${account.address}`);
  console.log(`  registry ${REGISTRY} on ${ON_ARC ? "Arc Testnet" : "Base"}; minting ENS on Base\n`);

  // 1) Read the song record (from the REGISTRY chain) to source the pointer values.
  const s = await registryPub.readContract({ address: getAddress(REGISTRY), abi: registryAbi, functionName: "songs", args: [songKey(songId)] });
  const rec = { artist: s[0], manifestHash: s[5], walrusManifestBlobId: s[8], walrusAudioBlobId: s[9] };
  if (rec.artist === "0x0000000000000000000000000000000000000000") {
    console.error(`Song "${songId}" is not registered on-chain — register it before minting its name.`);
    process.exit(1);
  }
  const owner = ownerArg ? getAddress(ownerArg) : getAddress(rec.artist);

  // 2) Build pre-encoded setText records for the new node.
  const node = namehash(`${label}.${ENS_PARENT}`);
  const values = {
    "manifest.hash": rec.manifestHash,
    "walrus.blob": rec.walrusManifestBlobId,
    "walrus.audio": rec.walrusAudioBlobId,
    "rights.contract": getAddress(REGISTRY),
    url: `https://tortoise-rights-registry.vercel.app/song/${label}`,
  };
  const records = Object.entries(values).map(([key, value]) =>
    encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [node, key, String(value)] }),
  );

  // 3) registrar.register(label, owner, records)
  console.log("records:", values);
  const hash = await wallet.writeContract({
    address: getAddress(REGISTRAR),
    abi: registrarAbi,
    functionName: "register",
    args: [label, owner, records],
  });
  console.log("register tx:", hash);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`\n✅ minted ${label}.${ENS_PARENT} (owner ${owner}) in block ${receipt.blockNumber}\n`);
}

main().catch((e) => {
  console.error("\nfatal:", e.shortMessage || e.message, "\n");
  process.exit(1);
});
