#!/usr/bin/env node
// Arc testnet go/no-go smoke gate (Arc integration plan §"Go/No-Go smoke gate").
// READ-ONLY: confirms Arc testnet is usable BEFORE we sink time into the port. It checks chain
// liveness + id, the USDC ERC-20 interface (decimals/symbol), and an address's gas balance
// (USDC IS the gas token on Arc, so a dry wallet strands the build). It then prints the exact
// keystore-signed commands YOU run to finish the gate (deploy + an approve/transferFrom round-trip)
// — this script never touches a private key. (user policy: never handle the admin key)
//
// Usage:
//   node scripts/smoke-arc.mjs                  # uses ARC_RPC_URL + ADMIN_ADDRESS from env/.env
//   node scripts/smoke-arc.mjs <address>        # report gas balance for this address
//
// Exit 0 = read-only checks pass (chain live, chainId 5042002, USDC decimals()==6). Non-zero otherwise.
// PASS the full gate only once the printed deploy + transfer round-trip also succeed.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, getAddress, formatEther, parseAbi } from "viem";
import { arcTestnet } from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---- tiny .env loader (no dep), matching the other smoke scripts ----
try {
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* rely on real env */
}

const EXPECTED_CHAIN_ID = 5042002;
// Arc testnet USDC ERC-20 interface (system contract, 6 decimals). Confirmed on-chain.
// Prefer ARC_USDC_ADDRESS so a Base USDC_ADDRESS in .env doesn't silently get checked on Arc.
const ARC_USDC =
  process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
const RPC = process.env.ARC_RPC_URL || arcTestnet.rpcUrls.default.http[0];
const admin = process.argv[2] || process.env.ADMIN_ADDRESS || process.env.OWNER_ADDRESS || "";

const client = createPublicClient({ chain: arcTestnet, transport: http(RPC) });
const erc20 = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

let failed = 0;
function check(label, ok, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failed++;
  return ok;
}

async function main() {
  console.log(`\nArc testnet smoke gate  (rpc ${RPC})\n`);

  // 1) Chain live + correct id.
  let chainId;
  try {
    chainId = await client.getChainId();
    check(`chainId == ${EXPECTED_CHAIN_ID}`, chainId === EXPECTED_CHAIN_ID, String(chainId));
  } catch (e) {
    check("RPC reachable", false, e.shortMessage || e.message);
    return done(); // nothing else will work
  }

  // 2) Block height advancing (liveness sanity).
  try {
    const bn = await client.getBlockNumber();
    check("block height readable", bn > 0n, `#${bn}`);
  } catch (e) {
    check("block height readable", false, e.shortMessage || e.message);
  }

  // 3) USDC ERC-20 interface: decimals()==6 + symbol "USDC". This is the address purchaseSongLicense
  //    will use; 6 decimals (not the 18-decimal native gas USDC) keeps our amounts/approvals right.
  try {
    const dec = await client.readContract({ address: getAddress(ARC_USDC), abi: erc20, functionName: "decimals" });
    check(`USDC ${ARC_USDC} decimals() == 6`, Number(dec) === 6, String(dec));
  } catch (e) {
    check(`USDC ${ARC_USDC} decimals()`, false, e.shortMessage || e.message);
  }
  try {
    const sym = await client.readContract({ address: getAddress(ARC_USDC), abi: erc20, functionName: "symbol" });
    check(`USDC symbol() == "USDC"`, sym === "USDC", sym);
  } catch (e) {
    check("USDC symbol()", false, e.shortMessage || e.message);
  }

  // 4) Gas balance (USDC is the native gas token on Arc). ADVISORY only — don't fail the read-only
  //    verdict on it, since the gate runs BEFORE the faucet claim. It just tells you if you're funded.
  if (admin) {
    try {
      const wei = await client.getBalance({ address: getAddress(admin) });
      const usdc = formatEther(wei); // native is 18-decimal USDC
      if (wei === 0n) {
        console.log(`  ⚠️  ${admin} has 0 gas — claim from faucet.circle.com (20 USDC / 2h) before deploying`);
      } else if (Number(usdc) < 1) {
        console.log(`  ⚠️  ${admin} low gas: ${usdc} USDC — may need another faucet claim for multiple deploys`);
      } else {
        console.log(`  ✓ ${admin} funded: ${usdc} USDC (native gas)`);
      }
    } catch (e) {
      console.log(`  • gas balance check skipped (${e.shortMessage || e.message})`);
    }
  } else {
    console.log(`  • gas balance: pass an address (or set ADMIN_ADDRESS) to check — USDC is gas on Arc`);
  }

  done();
}

function done() {
  const ok = failed === 0;
  console.log(`\n${ok ? "✅ READ-ONLY CHECKS PASSED" : `❌ ${failed} CHECK(S) FAILED — consider aborting to Base-only`}\n`);
  if (ok) {
    const A = admin || "<ADMIN_ADDR>";
    console.log("Finish the gate with these keystore-signed steps (you run them — this script holds no key):");
    console.log("  1. Fund the wallet:    https://faucet.circle.com  (20 USDC / 2h / address)");
    console.log("  2. Deploy the registry (best smoke test — the real artifact):");
    console.log("       cd contracts && ln -sf ../.env .env");
    console.log(`       forge script script/Deploy.s.sol --rpc-url ${RPC} --broadcast --account tortoise-admin --sender ${A}`);
    console.log("       # (set USDC_ADDRESS + TREASURY_ADDRESS for Arc in .env first; drop --verify if ArcScan is flaky)");
    console.log("  3. Read it back:       cast call <DEPLOYED> \"treasury()(address)\" --rpc-url " + RPC);
    console.log(`  4. ERC-20 round-trip:  cast send ${ARC_USDC} "transfer(address,uint256)" <ANY_ADDR> 1 --rpc-url ${RPC} --account tortoise-admin`);
    console.log("\nABORT to Base-only if: the faucet caps you below ~2 deploys, reads time out, or a deploy");
    console.log("fails to confirm (verify via `cast call`, never `--resume`).\n");
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("\nfatal:", e.shortMessage || e.message, "\n");
  process.exit(1);
});
