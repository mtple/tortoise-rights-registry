# Prerequisites status (plan §7.0)

Tracks the external gates before/around the build. ✅ done · 🔜 ready, needs you · ⏸ deferred to live session · ⚠️ note.

| # | Prerequisite | Status | Notes |
|---|--------------|--------|-------|
| 1 | Wallets (admin/owner, artist, buyer) | 🔜 | You hold keys. I never handle them — scripts read `ADMIN_PRIVATE_KEY` from gitignored `.env`/keystore; you run broadcasts. |
| 2 | Funding (real $) | ⏸ | Do at deploy time. ~$8–12 ETH on Base (admin) + ~$15–40 ETH on L1 (resolver txs) + artist ~$1–3 ETH + buyer ~8 USDC. **Do NOT pre-buy SUI/WAL** — Walrus is on testnet (free). |
| 3 | Public repo + `.gitignore` (.env) | ✅ | Remote `mtple/tortoise-rights-registry` exists; `.gitignore` ignores `.env` from commit 1. |
| 4 | durin.dev → deploy L2Registry on Base | ⏸ | Live session. Record address → `L2_REGISTRY_ADDRESS` + CCIP gateway → `DURIN_CCIP_GATEWAY`. Factory verified on Base. |
| 5 | **Walrus smoke-test (GATE)** | ✅ | **PASSED on TESTNET.** `scripts/smoke-walrus.mjs`. Mainnet has no free publisher (R1 realized) → using testnet for blobs (labeled). Round-trip byte-equal confirmed. |
| 6 | Audit tortmusic.eth records (R4) | ⚠️ | Owner `0xD441…6401`; **resolver currently set to ENS Public Resolver `0x231b…8E63`**. Switching to Durin L1 resolver replaces existing resolution — enumerate addr+text records BEFORE `setResolver`, re-set on L2 after. |
| 7 | L1 txs: setResolver → setL2Registry | ⏸ | Live session, from tortmusic.eth owner wallet. Low-gas window. |
| 8 | Deploy registrar + `addRegistrar` | ⏸ | Live session (forge broadcast). |
| 9 | ENS round-trip smoke (gate) | ⏸ | After 4/7/8. `scripts/smoke-ens.mjs` (to be written) — resolve via CCIP + direct L2 read. |
| 10 | Verify constants on Basescan | ✅ | USDC `decimals()=6` ✓, symbol "USDC" ✓. Durin L1 resolver + Universal Resolver have bytecode ✓. See memory `verified-onchain-constants`. |
| 11 | Env | ✅ (template) | `.env.example` has all verified addresses + Walrus testnet endpoints. Web app gets NO private key. |

## Verified live constants (2026-06-13)
- **USDC (Base)** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` — `decimals()=6`, `symbol()="USDC"`.
- **Durin L2RegistryFactory (Base)** `0xDddddDdDDD8Aa1f237b4fa0669cb46892346d22d` — bytecode present.
- **Durin L1 Resolver (L1)** `0x8A968aB9eb8C084FBC44c531058Fc9ef945c3D61` — bytecode present.
- **ENS Universal Resolver (L1)** `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` — bytecode present.
- **tortmusic.eth** namehash `0x3f7643db06a64a6b3586d59c35134a89cd2b67e95202e07abd05ff493684af40`, owner `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`, resolver `0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63`.

## Walrus (decided: testnet for blobs)
- Publisher `https://publisher.walrus-testnet.walrus.space`, aggregator `https://aggregator.walrus-testnet.walrus.space` — **round-trip verified**.
- Mainnet aggregators that returned 200 (reads, if ever needed): `https://aggregator.walrus-mainnet.walrus.space`, `https://sui-walrus-mainnet-aggregator.bwarelabs.com`.
- Mainnet **publishers**: no free first-party one exists; Staketab's was 502. `walrus.ts` stays env-driven for a later swap.
