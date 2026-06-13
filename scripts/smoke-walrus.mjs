#!/usr/bin/env node
// Walrus smoke test (plan §7.0 item 5 / §10.2).
// PUTs a small blob to each candidate publisher, GETs it back from each aggregator,
// and asserts byte-equality. Handles both `newlyCreated` and `alreadyCertified` shapes.
//
// Usage:
//   node scripts/smoke-walrus.mjs                # uses WALRUS_PUBLISHER / WALRUS_AGGREGATOR from env (+ .env)
//   node scripts/smoke-walrus.mjs --file path    # round-trip a real file (e.g. demo audio; checks the size cap)
//
// Exit code 0 = at least one publisher+aggregator pair round-trips. Non-zero otherwise.

import { readFileSync } from "node:fs";

// Minimal .env loader (no dep): only sets vars not already in process.env.
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env — rely on real env / defaults */ }

const PUBLISHERS = (process.env.WALRUS_PUBLISHER || "https://publisher.walrus-testnet.walrus.space")
  .split(",").map((s) => s.trim()).filter(Boolean);
const AGGREGATORS = (process.env.WALRUS_AGGREGATOR || "https://aggregator.walrus-testnet.walrus.space")
  .split(",").map((s) => s.trim()).filter(Boolean);
const EPOCHS = process.env.WALRUS_EPOCHS || "2";
const AUTH = process.env.WALRUS_PUBLISHER_AUTH || "";

const PUBLIC_PUBLISHER_CAP = 10 * 1024 * 1024; // ~10 MiB advisory cap for public publishers (R2)

const fileArgIdx = process.argv.indexOf("--file");
const filePath = fileArgIdx !== -1 ? process.argv[fileArgIdx + 1] : null;

const body = filePath
  ? readFileSync(filePath)
  : Buffer.from(`tortoise-rights-registry walrus smoke ${new Date().toISOString()} ${Math.random()}`);

function blobIdFrom(json) {
  return json?.newlyCreated?.blobObject?.blobId ?? json?.alreadyCertified?.blobId ?? null;
}

async function put(publisher) {
  const url = `${publisher}/v1/blobs?epochs=${EPOCHS}`;
  const headers = AUTH ? { Authorization: AUTH } : {};
  const res = await fetch(url, { method: "PUT", body, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`PUT ${url} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`PUT ${url} -> non-JSON: ${text.slice(0, 200)}`); }
  const blobId = blobIdFrom(json);
  if (!blobId) throw new Error(`PUT ${url} -> no blobId in response: ${text.slice(0, 200)}`);
  const shape = json.newlyCreated ? "newlyCreated" : "alreadyCertified";
  return { blobId, shape };
}

async function get(aggregator, blobId) {
  const url = `${aggregator}/v1/blobs/${blobId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log(`Walrus smoke test`);
  console.log(`  body: ${filePath ? `${filePath} (${body.length} bytes)` : `${body.length}-byte random`}`);
  console.log(`  publishers:  ${PUBLISHERS.join(", ")}`);
  console.log(`  aggregators: ${AGGREGATORS.join(", ")}`);
  console.log(`  epochs: ${EPOCHS}${AUTH ? "  (auth header set)" : ""}\n`);

  if (filePath && body.length > PUBLIC_PUBLISHER_CAP) {
    console.warn(`  ⚠️  ${body.length} bytes exceeds the ~10 MiB public-publisher cap (R2). ` +
      `Public publishers will likely 413. Use a smaller file or a self-run publisher.\n`);
  }

  let storedBlobId = null;
  let okPublisher = null;
  for (const p of PUBLISHERS) {
    try {
      const { blobId, shape } = await put(p);
      console.log(`  ✓ PUT ${p}  -> blobId=${blobId} (${shape})`);
      storedBlobId = blobId; okPublisher = p; break;
    } catch (e) {
      console.log(`  ✗ PUT ${p}  -> ${e.message}`);
    }
  }
  if (!storedBlobId) {
    console.error(`\n❌ No publisher accepted the blob. (Mainnet has no free publisher — see README.)`);
    process.exit(1);
  }

  let anyReadOk = false;
  for (const a of AGGREGATORS) {
    try {
      const got = await get(a, storedBlobId);
      const equal = Buffer.compare(got, body) === 0;
      console.log(`  ${equal ? "✓" : "✗"} GET ${a}  -> ${got.length} bytes, byte-equal=${equal}`);
      anyReadOk ||= equal;
    } catch (e) {
      console.log(`  ✗ GET ${a}  -> ${e.message}`);
    }
  }

  if (!anyReadOk) {
    console.error(`\n❌ Stored via ${okPublisher} but no aggregator returned matching bytes.`);
    process.exit(2);
  }
  console.log(`\n✅ Walrus round-trip OK (publisher ${okPublisher}). blobId=${storedBlobId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
