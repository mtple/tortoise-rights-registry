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

> **Status: scaffolding.** Prerequisite gates are verified (see `PREREQUISITES.md`);
> the contract, app, and verification script are being implemented phase by phase.

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

## Quick start

```bash
# 1. JS / app deps
pnpm install

# 2. Foundry deps (pinned; lib/ is gitignored)
cd contracts && ./install-deps.sh && forge build && cd ..

# 3. Config
cp .env.example .env   # fill in addresses as you deploy; web app needs NO private key

# 4. Smoke-test the Walrus blob store (no wallet needed)
pnpm smoke:walrus

# 5. Contract tests (USDC paths run against a Base mainnet fork)
cd contracts && forge test && cd ..

# 6. Dev server
pnpm dev
```

## A note on Walrus (testnet blobs)

Walrus has **no free first-party publisher on mainnet** (by design), so blobs (audio +
manifests) are stored on the free, open **Walrus testnet** publisher while the contract,
USDC, and ENS all run on **mainnet**. A `blobId` is a deterministic content hash, so
integrity is provable regardless of which Walrus network holds the bytes. Endpoints are
env-driven (`WALRUS_PUBLISHER` / `WALRUS_AGGREGATOR`), so swapping to a self-run mainnet
publisher later is a config change. See `PREREQUISITES.md`.

## Honest framing

- **Consent, not provenance.** The signature proves *a named wallet consented to this
  audio hash under these terms*. The wallet↔song-ownership link is attested by Tortoise
  (the song's public `walletAddress`), not cryptographically proven.
- **No revenue promise.** USDC payments go to the treasury. This is a prototype.
- **Single song (MVP).** Bundling many songs into curated training *packages* is the
  explicit next step, not part of this build.

## License

MIT (code) — see `LICENSE`. The AI-training license terms are in `LICENSE_TERMS.md`.
