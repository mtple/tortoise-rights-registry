# Go-Live Runbook

The code is complete and tested (39 Foundry + 16 vitest, mutation-proven; app live on
Vercel). What remains is a sequence of **on-chain transactions** (real funds) plus setting
Vercel env. Nothing left to write — this is execution, in dependency order.

> **Secrets:** `ADMIN_PRIVATE_KEY` lives only in a gitignored `.env` or a forge keystore.
> The web app holds no key. Run every broadcast yourself.

---

## Step 0 — Before you touch anything

**Wallets & funding** (see also `PREREQUISITES.md`):

| Wallet | Role | Fund with |
| ------ | ---- | --------- |
| Admin (likely also `tortmusic.eth` owner) | deploys, owns registry+registrar, mints names | ~$8–12 ETH on Base + ~$15–40 ETH on L1 |
| Artist | signs consent, sends `registerSong` | ~$1–3 ETH on Base |
| Buyer | USDC license purchase | ~8 USDC + ~$2 ETH on Base |

- **Do NOT buy SUI/WAL** — Walrus runs on testnet (free).
- ⚠️ **R4 landmine:** `tortmusic.eth` already has a resolver set (`0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63`). Step 2 replaces it, which stops whatever records resolve today. **Before Step 2, audit existing records in the ENS manager** and note any to re-create on the L2 afterward.

---

## Step 1 — Deploy the Durin L2Registry (durin.dev)

On **durin.dev**, connect the admin wallet, deploy an L2Registry for `tortmusic.eth` on **Base mainnet**. Record into `.env`:
- registry address → `L2_REGISTRY_ADDRESS`
- the CCIP gateway hostname it reports → `DURIN_CCIP_GATEWAY`

---

## Step 2 — Wire `tortmusic.eth` on L1 (two txs, owner wallet, Ethereum mainnet)

1. `setResolver(tortmusic.eth → 0x8A968aB9eb8C084FBC44c531058Fc9ef945c3D61)` (Durin L1 resolver)
2. `setL2Registry(<L2_REGISTRY_ADDRESS>, 8453)`

Low-gas window; wait for confirmations. (Did the Step 0 records audit first?)

---

## Step 3 — Deploy `TortoiseRightsRegistry` ⭐

**Hard ordering (C4): deploy BEFORE collecting any opt-in signature.** The EIP-712 domain
binds this contract's address; a redeploy invalidates every signature already collected.

```bash
cd contracts
# 3a. Dry-run on a local Base fork first (separate terminal: anvil --fork-url $BASE_RPC_URL)
forge script script/Deploy.s.sol --rpc-url http://localhost:8545
# 3b. Real broadcast + Basescan verify
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
```
`.env` needs `USDC_ADDRESS` (default is correct), `TREASURY_ADDRESS` (**triple-check — immutable, C9**), `ADMIN_PRIVATE_KEY`, `ETHERSCAN_API_KEY`.
Record: deployed address → `RIGHTS_REGISTRY_ADDRESS`; deploy block → `REGISTRY_DEPLOY_BLOCK`.

---

## Step 4 — Deploy the registrar + authorize it

```bash
forge script script/DeployRegistrar.s.sol --rpc-url base --broadcast --verify
```
Record → `TORTOISE_REGISTRAR_ADDRESS`. Then **one more owner-only tx** on the L2Registry:

```bash
cast send <L2_REGISTRY_ADDRESS> "addRegistrar(address)" <TORTOISE_REGISTRAR_ADDRESS> \
  --rpc-url base --private-key $ADMIN_PRIVATE_KEY
```
(The registrar cannot mint until this is done.)

---

## Step 5 — Set Vercel env + redeploy

In Vercel project settings, set (NO private key):
`RIGHTS_REGISTRY_ADDRESS`, `WALRUS_PUBLISHER`, `WALRUS_AGGREGATOR`, `WALRUS_EPOCHS`,
`TREASURY_ADDRESS`, `ENS_PARENT`, `L2_REGISTRY_ADDRESS`, `TORTOISE_REGISTRAR_ADDRESS`,
`USDC_ADDRESS`, `TORTOISE_API_BASE`, `NEXT_PUBLIC_RPC_URL`, `BASE_RPC_URL`.
Redeploy. `/api/opt-in` flips from "not configured" to working.

---

## Step 6 — ENS round-trip smoke (gate before the real mint)

```bash
node scripts/smoke-ens.mjs throwaway123
```
Must resolve via **both** the CCIP gateway (`getEnsText`) and a direct L2 read. Proves Steps 1–4.

---

## Step 7 — Opt a song in (real demo flow)

On the live app `/song/<slug>` (demo: a song under ~9 MiB — `mi-amor-por-ti` fits):
1. Connect the **artist wallet**, sign the consent.
2. App mirrors audio + manifest to Walrus, then prompts `registerSong` — confirm (artist pays gas).

> ERC-1271 note: a smart-wallet (Base Account) signer works; the signer must own the song's `walletAddress`.

---

## Step 8 — Mint the song's ENS name

```bash
node scripts/mint-song-name.mjs <slug>
```
Reads the on-chain record, sets pointer text records, mints `<slug>.tortmusic.eth`.

---

## Step 9 — Buy a license (validate the purchase path)

On `/song/<slug>`, connect the **buyer wallet**, "License with USDC" → approve → purchase.
**Test with the small price first.** Confirm the page shows "licensed" and the treasury balance moved.
(The UI passes `maxPrice` automatically — audit F1 fix — so a price-bump revert shows "price changed, refresh".)

---

## Step 10 — Independent verification (the payoff)

```bash
node scripts/verify-song-license.mjs <slug>                    # song + consent + availability
node scripts/verify-song-license.mjs <slug> --buyer <address>  # + that buyer's license
node scripts/verify-song-license.mjs <slug> --rpc-fallback     # bypass the CCIP gateway
```
All-green = anyone can confirm every claim without trusting Tortoise. (Proven on a fork; this runs it against mainnet.)

---

## Step 11 — Publish polish

- Fill the **Deployed addresses** table in `README.md` (the `_set after deploy_` rows).
- Re-run the leak audit: working tree + `git log` grep for `supabase|pinata-web3|SESSION_SECRET|NEYNAR|iron-session` → nothing (already clean).
- Make the GitHub repo **public**.
- Optional: record a short end-to-end walkthrough for the README.

---

## Quick reference — verified constants (Base mainnet)

| What | Address |
| ---- | ------- |
| USDC (`decimals()=6`, verified) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Durin L2RegistryFactory | `0xDddddDdDDD8Aa1f237b4fa0669cb46892346d22d` |
| Durin L1 Resolver (Ethereum mainnet) | `0x8A968aB9eb8C084FBC44c531058Fc9ef945c3D61` |
| Walrus publisher (testnet) | `https://publisher.walrus-testnet.walrus.space` |
| Walrus aggregator (testnet) | `https://aggregator.walrus-testnet.walrus.space` |

When you're ready, run it as "you drive, I co-pilot" — paste command output back and I'll
decode results / give the next step.
