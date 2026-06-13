#!/usr/bin/env node
// Admin CLI (plan §7 Phase 3.1) — mint <slug>.tortmusic.eth with text records for an opted-in song.
// Owner-only: reads ADMIN_PRIVATE_KEY from env/keystore. NEVER run from the hosted app.
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
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

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

const PK = process.env.ADMIN_PRIVATE_KEY;
if (!PK) {
  console.error("ADMIN_PRIVATE_KEY not set (use .env or a keystore). Refusing to run.");
  process.exit(78);
}
const REGISTRAR = need("TORTOISE_REGISTRAR_ADDRESS");
const REGISTRY = need("RIGHTS_REGISTRY_ADDRESS");
const ENS_PARENT = process.env.ENS_PARENT || "tortmusic.eth";
function need(n) {
  if (!process.env[n]) {
    console.error(`Missing required env ${n}.`);
    process.exit(78);
  }
  return process.env[n];
}

const account = privateKeyToAccount(PK.startsWith("0x") ? PK : `0x${PK}`);
const wallet = createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL || undefined) });
const pub = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || undefined) });

const registryAbi = JSON.parse(readFileSync(join(ROOT, "src/lib/abi/TortoiseRightsRegistry.json"), "utf8"));
const resolverAbi = parseAbi(["function setText(bytes32 node, string key, string value)"]);
const registrarAbi = parseAbi(["function register(string label, address owner, bytes[] records) returns (bytes32)"]);

const songKey = (id) => keccak256(toBytes(id));

async function main() {
  console.log(`\nMinting ${label}.${ENS_PARENT} (songId "${songId}") from admin ${account.address}\n`);

  // 1) Read the song record to source the pointer values.
  const s = await pub.readContract({ address: getAddress(REGISTRY), abi: registryAbi, functionName: "songs", args: [songKey(songId)] });
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
