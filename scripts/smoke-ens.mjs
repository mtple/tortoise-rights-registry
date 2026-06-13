#!/usr/bin/env node
// ENS round-trip smoke (plan §7.0 item 9 / §10.4) — run AFTER the L2Registry + registrar deploy
// and the two L1 resolver txs. Mints <label>.tortmusic.eth with a test text record, then resolves it
// via BOTH (a) getEnsText through the mainnet Universal Resolver (CCIP / Durin gateway), and
// (b) a direct read from the L2Registry on Base (the --rpc-fallback path).
//
//   node scripts/smoke-ens.mjs <label>
//
// Owner-only (mints): reads ADMIN_PRIVATE_KEY. Pick a throwaway label you don't need.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWalletClient, createPublicClient, http, namehash, encodeFunctionData, parseAbi, getAddress } from "viem";
import { base, mainnet } from "viem/chains";
import { loadAdminAccount } from "./lib/keystore.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
try {
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const label = process.argv[2];
if (!label) {
  console.error("usage: smoke-ens.mjs <label>   (a throwaway label)");
  process.exit(64);
}
const REGISTRAR = process.env.TORTOISE_REGISTRAR_ADDRESS;
const L2_REGISTRY = process.env.L2_REGISTRY_ADDRESS;
const ENS_PARENT = process.env.ENS_PARENT || "tortmusic.eth";
for (const [k, v] of [["TORTOISE_REGISTRAR_ADDRESS", REGISTRAR], ["L2_REGISTRY_ADDRESS", L2_REGISTRY]]) {
  if (!v) {
    console.error(`Missing required env ${k} (ENS must be deployed first — see plans/PREREQUISITES.md).`);
    process.exit(78);
  }
}

// Signing account from the forge keystore (prompts for password) — no raw key in env. (user policy)
const account = await loadAdminAccount();
const wallet = createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL || undefined) });
const baseClient = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || undefined) });
const l1Client = createPublicClient({ chain: mainnet, transport: http(process.env.L1_RPC_URL || undefined) });

const resolverAbi = parseAbi([
  "function setText(bytes32 node, string key, string value)",
  "function text(bytes32 node, string key) view returns (string)",
]);
const registrarAbi = parseAbi(["function register(string label, address owner, bytes[] records) returns (bytes32)"]);

const KEY = "smoke.test";
const VALUE = `ok-${Date.now()}`;

async function main() {
  const name = `${label}.${ENS_PARENT}`;
  const node = namehash(name);
  console.log(`\nENS smoke: mint ${name} with text ${KEY}=${VALUE}\n`);

  const records = [encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [node, KEY, VALUE] })];
  const hash = await wallet.writeContract({ address: getAddress(REGISTRAR), abi: registrarAbi, functionName: "register", args: [label, account.address, records] });
  await baseClient.waitForTransactionReceipt({ hash });
  console.log(`  ✓ minted (tx ${hash})`);

  // (b) direct L2Registry read on Base
  let direct = "";
  try {
    direct = await baseClient.readContract({ address: getAddress(L2_REGISTRY), abi: resolverAbi, functionName: "text", args: [node, KEY] });
    console.log(`  ${direct === VALUE ? "✓" : "✗"} direct L2Registry read: "${direct}"`);
  } catch (e) {
    console.log(`  ✗ direct L2Registry read failed: ${e.shortMessage || e.message}`);
  }

  // (a) CCIP-Read via mainnet Universal Resolver
  let ccip = "";
  try {
    ccip = await l1Client.getEnsText({ name, key: KEY });
    console.log(`  ${ccip === VALUE ? "✓" : "✗"} getEnsText (CCIP gateway): "${ccip}"`);
  } catch (e) {
    console.log(`  ✗ getEnsText (CCIP) failed: ${e.shortMessage || e.message} (gateway down? direct read still works)`);
  }

  const ok = direct === VALUE; // direct read is the hard requirement; CCIP can lag/propagate
  console.log(`\n${ok ? "✅ ENS round-trip OK" : "❌ ENS round-trip FAILED"} (note whether the registrar can setText post-mint for the C7 stretch)\n`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("\nfatal:", e.shortMessage || e.message, "\n");
  process.exit(1);
});
