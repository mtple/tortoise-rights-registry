# Tortoise Rights Registry

**Provable AI-training consent for music.** An artist opts a song into AI-training
licensing with an EIP-712 wallet signature; the audio and a consent manifest are
stored on [Walrus](https://walrus.xyz); a minimal contract on **Base** records the
consent hash and sells a **USDC** license for that song; an ENS subname under
`tortmusic.eth` (via [Durin](https://durin.dev)) names it; and a standalone
verification script lets **anyone confirm every claim without trusting Tortoise**.

This is a standalone, open-source companion to [Tortoise Music](https://tortoise.studio).
It reads real Tortoise songs over a public, read-only HTTP seam and requires **zero
changes** to the Tortoise app. It is **consent infrastructure for a prototype** —
not legal advice, and not a promise of artist revenue.

**Live app:** https://tortoise-rights-registry.vercel.app

---

## How it works (end to end)

1. **Opt in.** An artist opens the app for one of their songs (loaded by slug from
   Tortoise's public API, or by pasting an audio URL/CID), connects their wallet, and
   signs the EIP-712 `Consent` message binding *who* consents, to *which audio*
   (by content hash), under *which* license terms.
2. **Store on Walrus.** The server hashes the audio (keccak256), mirrors the audio
   bytes to Walrus, builds the song manifest, and stores it on Walrus too.
3. **Record on Base.** The **artist's own wallet** sends `registerSong` (paying gas),
   committing the manifest hash, audio hash, permission mode, license-terms hash, the
   Walrus blob ids, and the price on-chain. The app holds no private key.
4. **Name in ENS.** An admin CLI mints `<slug>.tortmusic.eth` with text records
   pointing at the manifest, audio blob, and contract.
5. **License.** A model developer approves USDC and calls `purchaseSongLicense`. The
   payment goes directly to the treasury; the buyer's license is recorded on-chain.
6. **Verify.** Anyone runs `node scripts/verify-song-license.mjs <slug>` from a clean
   clone and gets a per-check, all-green (or non-zero-exit) report.

## Architecture

- **`contracts/`** — Foundry. `TortoiseRightsRegistry.sol` (EIP-712 consent + USDC
  licensing) and `TortoiseRegistrar.sol` (an **onlyOwner** Durin registrar — the
  example registrar is open-mint and is deliberately *not* used).
- **`src/`** — a Next.js app (artist opt-in + buyer license page) plus a viem-only
  core library (`src/lib/`): `eip712`, `walrus`, `manifest`, `registry`, `ens`,
  `tortoise`. The `/api` routes are **keyless** (hashing + Walrus mirroring only).
- **`scripts/`** — `verify-song-license.mjs` (the centerpiece), `mint-song-name.mjs`
  (admin CLI), and smoke tests for Walrus and ENS.
- **`schemas/`** — JSON Schema for the song and license-receipt manifests.
- **`LICENSE_TERMS.md`** — the license whose keccak256 is the signed `licenseTermsHash`.

No database. Canonical state lives on-chain + Walrus + ENS, which is what makes every
claim independently verifiable.

## Setup

```bash
# 1. JS / app deps
pnpm install

# 2. Foundry deps (pinned; contracts/lib is gitignored)
cd contracts && ./install-deps.sh && forge build && cd ..

# 3. Config — fill in addresses as you deploy. The web app needs NO private key;
#    only the local CLI/deploy scripts read ADMIN_PRIVATE_KEY (from .env or a keystore).
cp .env.example .env

# 4. Smoke-test the Walrus blob store (no wallet needed)
pnpm smoke:walrus

# 5. Contract tests (USDC paths run against a Base mainnet fork)
cd contracts && BASE_RPC_URL=https://mainnet.base.org forge test --fork-url base && cd ..

# 6. App unit tests + dev server
pnpm test
pnpm dev
```

## Full walkthrough (deploy → opt-in → name → license → verify)

Requires a funded admin wallet on Base, and an artist + buyer wallet. See
`plans/PREREQUISITES.md` for the one-time on-chain setup (Durin L2Registry, the two L1
resolver txs, funding). Walrus uses testnet (free) — see the note below.

```bash
# A. Deploy the registry to Base (constructor: USDC + treasury). Anvil-fork dry-run first.
cd contracts
ln -sf ../.env .env                              # forge reads env from contracts/, not the repo root (gitignored)
cast wallet import tortoise-admin --interactive  # one-time: encrypt the admin key (keeps it out of shell history)
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify \
  --account tortoise-admin --sender <ADMIN_ADDR>   # --broadcast alone will NOT sign — pass a signer
#  → record the address into .env as RIGHTS_REGISTRY_ADDRESS *and* NEXT_PUBLIC_RIGHTS_REGISTRY_ADDRESS
#    (same value — the browser only reads NEXT_PUBLIC_*), and into Vercel env.
#  ⚠️ Deploy BEFORE collecting any opt-in signature — the EIP-712 domain binds this
#     address; a redeploy invalidates every signature already collected.

# B. Deploy the onlyOwner registrar, then authorize it on the L2Registry.
forge script script/DeployRegistrar.s.sol --rpc-url base --broadcast --verify \
  --account tortoise-admin --sender <ADMIN_ADDR>
#  → then: cast send <L2Registry> "addRegistrar(address)" <registrar> --rpc-url base --account tortoise-admin ; cd ..

# C. Opt a song in — from the live app (or pnpm dev): open /song/<slug>, connect the
#    artist wallet, sign the consent, and send registerSong (the artist pays gas).
#    Audio + manifest are mirrored to Walrus; the consent hash lands on Base.

# D. Name it (admin CLI, local — never the hosted app):
pnpm mint:name <slug>        # mints <slug>.tortmusic.eth with pointer text records

# E. License it — a buyer opens /song/<slug>, approves USDC, and buys (two steps).

# F. Verify everything, trusting nothing:
pnpm verify <slug>                       # song artifact + consent + availability
pnpm verify <slug> --buyer <address>     # also that buyer's on-chain license
pnpm verify <slug> --rpc-fallback        # read ENS direct from the L2Registry
```

`verify-song-license.mjs` resolves the song's ENS name, fetches the manifest + audio
from Walrus and checks their hashes against the contract, re-derives and verifies the
artist's EIP-712 consent (ERC-1271-aware), confirms `licenseTermsHash ==
keccak256(LICENSE_TERMS.md)` and that the manifest price matches on-chain, and reports
`licenseActive`. It prints a per-check result and exits non-zero on any mismatch.

## Deployed addresses (Base mainnet, chainId 8453)

| What | Address |
| ---- | ------- |
| USDC (Circle) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Durin L2RegistryFactory | `0xDddddDdDDD8Aa1f237b4fa0669cb46892346d22d` |
| Durin L1 Resolver (Ethereum mainnet) | `0x8A968aB9eb8C084FBC44c531058Fc9ef945c3D61` |
| `TortoiseRightsRegistry` | [`0xA0bd2b9f2d9554cA3AAeD618E420Aac816d80bbe`](https://basescan.org/address/0xA0bd2b9f2d9554cA3AAeD618E420Aac816d80bbe) |
| `TortoiseRegistrar` (artist-gated mint) | [`0x7640eB413A5AD4aa1D28485db09a658629e30601`](https://basescan.org/address/0x7640eB413A5AD4aa1D28485db09a658629e30601) |
| `tortmusic.eth` L2Registry (Durin) | [`0x8aB7bB948298826D7495656290dFD241a544A680`](https://basescan.org/address/0x8aB7bB948298826D7495656290dFD241a544A680) |

Live example: [`licensetest5.tortmusic.eth`](https://tortoise-rights-registry.vercel.app/song/licensetest5) — opted in, named, and licensed; verify it with `node scripts/verify-song-license.mjs licensetest5`.

## A note on Walrus (testnet blobs)

Walrus has **no free first-party publisher on mainnet** (by design), so blobs (audio +
manifests) are stored on the free, open **Walrus testnet** publisher while the contract,
USDC, and ENS all run on **mainnet**. A `blobId` is a deterministic content hash, so
integrity is provable regardless of which Walrus network holds the bytes. Endpoints are
env-driven (`WALRUS_PUBLISHER` / `WALRUS_AGGREGATOR`), so swapping to a self-run mainnet
publisher later is a config change. See `plans/PREREQUISITES.md`.

**Durability is finite.** Testnet blobs are deleted once `WALRUS_EPOCHS` elapse (and testnet is
periodically reset), so the bytes — and therefore `verify-song-license.mjs`'s audio + manifest
checks — stay available only for a window (~weeks at `WALRUS_EPOCHS=53`). The on-chain consent,
licenses, and committed hashes are permanent; because a `blobId` is a content hash, re-pinning the
*same* bytes to any Walrus network restores full verification unchanged. For a durable deployment,
run an authed mainnet publisher (`WALRUS_PUBLISHER` + `WALRUS_PUBLISHER_AUTH`).

## Honest framing

- **Consent, not provenance.** The signature proves *a named wallet consented to this
  audio hash under these terms*. The wallet↔song-ownership link is attested by Tortoise
  (the song's public `walletAddress`), not cryptographically proven.
- **No revenue promise.** USDC payments go to the treasury. This is a prototype.
- **Single song (MVP).** Bundling many songs into curated training *packages* is the
  explicit next step, not part of this build.

## License

MIT (code) — see `LICENSE`. The AI-training license terms are in `LICENSE_TERMS.md`.
