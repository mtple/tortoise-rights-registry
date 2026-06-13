# Tortoise Rights Registry — Implementation Plan

## Context

Tortoise Music — the private app repo `mtple/tortoise` — is an app for streaming, collecting, and sharing music on Base. This project adds an **AI Training Rights Registry**: an artist opts a song into AI-training licensing via an EIP-712 wallet signature, the audio + a consent manifest live on Walrus as the canonical artifact store, a minimal new contract on Base records the consent hash and sells a USDC license for that song, an ENS subname under `tortmusic.eth` (via Durin on Base) names it, and a standalone verification script lets anyone confirm every claim without trusting Tortoise. The registry ships as a **new public open-source repo** ("Tortoise Rights Registry"); the app repo stays private. Built solo over a focused ~36-hour window, so scope is deliberately tight (see §7). Architecture is decided (see task brief); this plan operationalizes it.

**Execution context (revised with user):** this plan builds **entirely in the new public repo `tortoise-rights-registry`** — a standalone, Tortoise-branded **Next.js app** (artist opt-in UI + a song license page with the USDC purchase + its own **keyless** `/api` routes for audio-hash/mirror and the license receipt) plus Foundry contracts and scripts. **The private Tortoise app `mtple/tortoise` requires ZERO changes**, so nothing proprietary is open-sourced. The two repos coexist through **read-only public seams only**: the feature app loads real songs via Tortoise's public `GET /api/getAudio?slug=` endpoint (with a paste-URL/CID fallback), mirrors their publicly-readable audio to Walrus and stores manifests there (computing the audio's content hash for the onchain commitment), and issues subnames under the shared `tortmusic.eth`. As a possible future step (out of scope here, and a change made only in the private app), the main Tortoise app could add a link on a song's page that points to this feature app's URL for that song — a small, optional integration that exposes none of the app's internals. Established Tortoise-app patterns inform the new app only as **techniques to replicate** (see §12), never as imports. **No database** in the feature app — canonical state is on-chain + Walrus + ENS (this both simplifies the build and keeps every claim independently verifiable).

**Core flow (single song, MVP):** an artist opts one song in with an EIP-712 signature → its audio + manifest are stored on Walrus → its hash is recorded on Base → an ENS name (`<slug>.tortmusic.eth`) resolves those records → a model developer licenses the song with USDC → anyone can independently verify the entire chain with the verification script. The USDC song-license purchase and the verification script are the two load-bearing pieces; everything else supports them. (Packages — bundling many songs into curated datasets — are the explicit next step, not in MVP.)

---

## 1. Integration seam (how this public repo couples to Tortoise)

> This public repo is self-contained. It couples to the Tortoise app through **read-only public seams only** — no imports, no shared database, no proprietary code. The points below are the seams and the constraints they impose; private-app internals are deliberately omitted.

### Song data (consumed over a public HTTP seam)
- The feature app loads a real song via Tortoise's **public, unauthenticated** `GET /api/getAudio?slug=<slug>` endpoint, which returns the song's title, artist display name, a public audio gateway URL, image URL, and the artist's on-record wallet address. No auth, no secret, no import.
- A paste-URL/CID fallback covers the case where the live endpoint is unreachable.
- The audio is fetched from its **public** gateway URL (the same URL anonymous listeners stream) — reading needs no credential.

### Identity / consent binding
- The artist connects their own wallet in the feature app and signs the EIP-712 consent; the server checks the signer matches the song's public on-record wallet address. This is an honest, Tortoise-attested binding (stated plainly in the README), not a cryptographic ownership proof.

### Wallet / signing / chain stack (the feature app's own choices)
- Standalone Next.js app on **Base mainnet only**; connectors = Base Account (Coinbase Smart Wallet) + injected EOA in a normal browser. The feature app picks its own current versions (viem 2.x, wagmi 2.x, Next 16, React 19, TS strict, pnpm, Tailwind 3.4) — no cross-repo version coupling.
- **EIP-712 `signTypedData`** is the consent primitive. Smart-wallet signatures verify via ERC-1271 (OZ `SignatureChecker` on-chain; viem `verifyTypedData` off-chain) — never naive `ecrecover` (R5).
- ERC-20 `approve`/`transferFrom` is the USDC purchase primitive (standard interface).
- **The web app holds NO private key.** The artist sends `registerSong` from their own wallet (pays gas); owner-only ops (deploy, ENS minting) run from a **local admin CLI**, never the hosted app.

### No database / no server auth
- The feature app has no database and no server-side auth: canonical state is on-chain + Walrus + ENS. Server `/api` routes are **keyless** (hash audio, mirror to Walrus, build manifests). This both simplifies the build and keeps every claim independently verifiable.

### UI / brand
- Brand colors are public: cream `#cbbfb9` + purple `#280274`; the app uses **Inter**. The feature app replicates these tokens (Tailwind 3.4). (The brief mentioned Futura/Jost/EB Garamond; matched to the actual brand instead — flagged to user.)

### Landmines
1. ~~Chain mismatch~~ **Resolved by all-mainnet decision (D1)**: the standalone feature app uses Base Account / injected connectors in a normal browser. Residual: real-money txs — keep the song license price small, fund the admin key minimally, test the purchase with my own wallet first.
2. **Audio size vs Walrus public publishers**: public Walrus publishers commonly cap ~10MiB per request. Audio mirroring is part of the **core** opt-in flow, so we **assume demo audio is within the ~10MiB cap** (pick small songs); the opt-in route checks size and reports clearly if exceeded. A larger file would need a self-run publisher (out of scope by assumption).
3. **The artist wallet is captured at consent time** (the public song record may not always carry one) — opt-in records the connected wallet rather than assuming it exists.
4. Provider/SDK-init fragility: new pages must not disturb app SDK init; new providers must be memoized; no duplicate QueryClient.
5. Never trust a client-sent wallet/identity for the consent binding — the server re-derives it from the signature + the song's public on-record wallet.

---

## 2. Decision list — RESOLVED with user

| # | Decision | Resolution |
|---|----------|------------|
| D1 | Networks | **ALL MAINNET** (user choice): contract + Durin L2 registry on Base mainnet (8453), Walrus mainnet, mainnet ENS, real USDC. Research confirms mainnet ENS *requires* a mainnet L2 anyway. Guardrails: song license priced small (e.g. 5 USDC), admin key funded minimally, contract kept tiny + Foundry-tested before deploy. The feature app targets Base mainnet directly; the artist signs with a Base Account / injected wallet in-browser and sends `registerSong` themselves. |
| D2 | `tortmusic.eth` | **Owned on mainnet, owner wallet available for the build.** Prerequisite: 2 L1 txs from that wallet (set resolver → Durin L1 resolver `0x8A968aB9eb8C084FBC44c531058Fc9ef945c3D61`, then `setL2Registry(registryAddr, 8453)`). ⚠️ Changing the resolver replaces ALL existing record resolution for tortmusic.eth (if records exist today, they stop resolving unless re-set on the L2) — check current records before switching. |
| D3 | Deployment target & repo model | **Deployed standalone feature app** (Vercel) built from the public repo — the public repo IS the deployable Next.js app. No submodule / workspace / `transpilePackages` / cross-repo consumption. Private Tortoise app: zero changes. (Supersedes the brief's "private app consumes open lib" model — see §6.) |
| D8 | Where the feature UI lives | **Standalone Next.js app in the public repo** (user choice). Reads real Tortoise songs via the public `/api/getAudio` endpoint + paste fallback (D9). No Supabase. |
| D9 | Song source | **Public Tortoise API + paste fallback** (user choice): feature app fetches a real song by slug from `https://tortoise.studio/api/getAudio?slug=`; if the live app is unreachable, paste an audio URL/CID. A test song's `getAudio` response can be cached locally as a development fixture. |
| D4 | Licensed unit | **Single song** (user decision, MVP scope). The song carries its own `priceUsdc`; a buyer licenses it directly via `purchaseSongLicense`. Packages are cut for MVP (future — §11 pitch). |
| D5 | ENS name structure | **One song subname per opted-in song**: `<slug>.tortmusic.eth` (research: Durin nesting unsupported, so flat). Custom `TortoiseRegistrar` (onlyOwner — Durin's example registrar is OPEN-MINT, must not ship as-is). |
| D6 | registerSong submission | **No relayer (user decision).** The **artist sends `registerSong` from their own wallet and pays gas**. The EIP-712 consent signature is still produced as the portable, off-chain-verifiable consent proof in the manifest, and the contract verifies it on-chain. `revokeConsent` = direct artist tx. Owner-only ops (ENS minting, deploys) run from a **local admin CLI** with `ADMIN_PRIVATE_KEY` — never a hosted signer. |
| D7 | Walrus epochs | Mainnet: epoch = 14 days. Store at ~6 epochs (~3 months) to keep WAL cost trivial while lasting comfortably beyond the project's near-term lifetime. |

---

## 3. External research findings (distilled; full report from research agent)

### Durin (github.com/namestonehq/durin, durin.dev)
- **L2RegistryFactory** `0xDddddDdDDD8Aa1f237b4fa0669cb46892346d22d` (same address on Base mainnet + all supported chains). **L1 Resolver** `0x8A968aB9eb8C084FBC44c531058Fc9ef945c3D61` (same on mainnet + Sepolia).
- Setup: (1) deploy L2Registry via durin.dev on Base; (2) on L1 set tortmusic.eth resolver to Durin L1 resolver + `setL2Registry(addr, 8453)`; (3) deploy custom registrar; (4) `addRegistrar(registrar)` on the registry.
- **Pairing rule: mainnet ENS ↔ mainnet L2 only** (chainId-bound; testnet L2s need a Sepolia ENS name). All-mainnet choice satisfies this.
- Minting: registrar calls `registry.createSubnode(baseNode, label, owner, bytes[] data)` — `data` = pre-encoded `setText`/`setAddr` multicall, so **text records can be set atomically at mint**. `setText(bytes32 node, string key, string value)` standard; arbitrary keys (e.g. `manifest.hash`, `walrus.blob`, `walrus.audio`) resolve through L1 `getEnsText` via CCIP-Read automatically.
- ⚠️ Default example `L2Registrar.register()` has **no access control** — write our own onlyOwner registrar.
- Nested sub-subnames (x.packs.tortmusic.eth): unsupported by the shipped registrar → flat names.
- CCIP-Read gateway is operated by NameStone/Durin (single point of failure for live resolution; hostname comes from the durin.dev deploy flow). Mitigation: verification script + UI get a `--rpc-fallback` that reads records directly from the L2Registry on Base.
- Verify during ENS setup: whether the registrar can update text records post-mint when the subname is owned by the artist (signature-relay variants `setTextWithSignature` exist, gated by registrar-or-owner). Fallback: set records only at mint.

### Walrus (mainnet, HTTP API)
- Store: `PUT {publisher}/v1/blobs?epochs=N` (raw bytes body) → response is `newlyCreated.blobObject.blobId` **or** `alreadyCertified.blobId` (client must handle both). Read: `GET {aggregator}/v1/blobs/{blobId}`. No Sui wallet needed — the publisher pays WAL/SUI.
- **blobId is a deterministic content commitment** (same bytes → same blobId), URL-safe base64.
- ⚠️ **Public publishers default to 10MiB max body** (HTTP 413 above) → core audio mirroring assumes files within ~9MiB (we pick demo songs accordingly); a larger file would need a self-run publisher. Manifests are tiny and always fine.
- ⚠️ **Mainnet public publishers may rate-limit / require auth / be unreliable** (testnet ones are free and open). Known: `walrus-mainnet-publisher-1.staketab.org`; expect a `*.walrus-mainnet.walrus.space` family. **First task: smoke-test mainnet publishers** (§7.0 item 5). Contingency: run own publisher (Walrus CLI + ~$10–20 of SUI/WAL); last-resort: blobs on Walrus testnet (free, open, but wipeable — weakens the mainnet story).
- Mainnet epoch = 14 days; cost ~100k FROST/MB storage + 20k FROST/MB write (trivial WAL for a few small blobs).

### USDC / faucets / viem
- USDC Base **mainnet**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals — verify on basescan before hardcoding). (Sepolia ref: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, faucet.circle.com.)
- viem `getEnsText`/`getEnsAddress` follow CCIP-Read automatically (mainnet Universal Resolver `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe`; pin recent viem v2 — app has 2.21.55, may need bump in the public lib only). Gateway 404 ≈ unregistered name; 5xx/timeout = gateway down; expect few-hundred-ms..2s resolution latency.

---

## 4. Contract spec — `TortoiseRightsRegistry.sol` (one standalone contract, Foundry, OZ imports only)

**⚠️ Smart-wallet reality check (changes the brief's wording, not its intent):** in the standalone feature app, artists connect a **Base Account (Coinbase Smart Wallet — a contract wallet)** or an injected EOA. Contract-wallet signatures verify via **ERC-1271**, not `ecrecover`. So consent verification uses OZ `SignatureChecker.isValidSignatureNow(artist, digest, sig)` (handles EOA + ERC-1271), and the verification script uses viem `publicClient.verifyTypedData` (handles EOA + ERC-1271 + ERC-6492) instead of naive signer recovery. (Smart-wallet message verification — `publicClient.verifyMessage` for SIWE — is an established pattern; the consent check applies the typed-data equivalent.)

**Single song is the unit (MVP).** Packages are cut for now (future work — see §11 pitch). The song itself carries the price and is the thing licensed.

```solidity
contract TortoiseRightsRegistry is EIP712, Ownable {
    using SafeERC20 for IERC20;                   // OZ — avoids token-return-value weirdness

    enum PermissionMode { AI_TRAINING_ALLOWED }   // MVP: one mode; enum is extensible later

    struct SongRecord {
        address artist;
        bytes32 manifestHash;          // keccak256 of song manifest bytes on Walrus
        bytes32 audioHash;             // keccak256 of audio bytes (signed)
        uint8   permissionMode;        // PermissionMode (signed)
        bytes32 licenseTermsHash;      // keccak256(LICENSE_TERMS.md bytes) (signed)
        string  walrusManifestBlobId;  // song manifest blob
        string  walrusAudioBlobId;     // mirrored audio blob
        uint96  priceUsdc;             // 6 decimals; set by the artist at registration (msg.sender == artist)
        uint64  consentTimestamp;
        bool    licenseActive;         // future licensing currently ALLOWED for this song; false after revoke. NOT "already sold" — buyers are tracked separately in `licenses`.
    }

    IERC20  public immutable USDC;
    address public immutable treasury;            // receives license payments directly

    mapping(bytes32 => SongRecord) public songs;  // key = keccak256(bytes(songId))
    mapping(bytes32 => mapping(address => bytes32)) public licenses; // songKey → buyer → song manifestHash snapshot

    bytes32 private constant CONSENT_TYPEHASH = keccak256(
        "Consent(string songId,address artist,bytes32 audioHash,uint8 permissionMode,bytes32 licenseTermsHash,bool optIn,uint64 timestamp)");
    // The signed message binds WHO (artist), WHAT audio (audioHash), WHICH permission (permissionMode),
    // and under WHICH terms (licenseTermsHash) — not just "opted in". That is the core legal claim.
    // (Price is NOT signed — the artist sets it as a registerSong arg and the tx itself (msg.sender == artist) authorizes it.)

    event SongRegistered(bytes32 indexed songKey, string songId, address indexed artist,
                         bytes32 manifestHash, bytes32 audioHash, uint8 permissionMode, bytes32 licenseTermsHash,
                         string walrusManifestBlobId, string walrusAudioBlobId, uint96 priceUsdc, uint64 consentTimestamp);
    event ConsentRevoked(bytes32 indexed songKey, string songId, address indexed artist);
    event LicensePurchased(bytes32 indexed songKey, string songId, address indexed buyer,
                           bytes32 manifestHash, uint96 price);

    // ARTIST-SUBMITTED ONLY: require(msg.sender == artist, "ONLY_ARTIST") — the tx itself reinforces consent (no relayer).
    // Also verifies SignatureChecker over Consent{songId, artist, audioHash, permissionMode, licenseTermsHash, optIn:true, timestamp}
    //   for `artist` (EOA + ERC-1271) — binds the on-chain record to the exact signed terms; the same sig is the portable manifest proof.
    // ANTI-REPLAY (C1): require(consentTimestamp > songs[key].consentTimestamp) — strict monotonicity (first register vs 0);
    //   re-opt-in after revoke needs a FRESH signature. Re-registration: same artist only (manifest/terms/price update).
    // On first registration AND re-opt-in: set licenseActive = true.
    function registerSong(string calldata songId, address artist, bytes32 manifestHash, bytes32 audioHash,
                          uint8 permissionMode, bytes32 licenseTermsHash, string calldata walrusManifestBlobId,
                          string calldata walrusAudioBlobId, uint96 priceUsdc, uint64 consentTimestamp,
                          bytes calldata signature) external;

    // Forward-looking: require(msg.sender == songs[key].artist). Sets licenseActive = false (no NEW licenses).
    // Existing buyer licenses remain valid as snapshots (manifestHash recorded at purchase).
    function revokeConsent(string calldata songId) external;

    // Buyer pays the song's price in USDC and receives a license. Unlimited distinct buyers.
    //   require(songs[key].licenseActive, "LICENSE_INACTIVE")           — artist hasn't revoked future licensing
    //   require(expectedManifestHash == songs[key].manifestHash)       — snapshot + no bait-and-switch (C2/C5)
    //   require(licenses[key][msg.sender] == bytes32(0), "ALREADY_LICENSED") — blocks only a REPEAT purchase by the same buyer (C13)
    //   USDC.safeTransferFrom(msg.sender, treasury, songs[key].priceUsdc) (C14); licenses[key][msg.sender] = manifestHash; emit.
    function purchaseSongLicense(string calldata songId, bytes32 expectedManifestHash) external;
}
```

- `licenseTermsHash = keccak256(LICENSE_TERMS.md bytes)` — the public-repo license file (see §5 / §6); `permissionMode` MVP value is `AI_TRAINING_ALLOWED` (enum 0).
- EIP-712 domain: `{ name: "TortoiseRightsRegistry", version: "1", chainId: 8453, verifyingContract }` → **contract must deploy before the first opt-in signature** (domain binds to its address; a redeploy invalidates collected signatures). USDC = `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (verify on basescan), treasury = user's wallet.
- Second small contract in the public repo: **`TortoiseRegistrar.sol`** (Durin registrar, `onlyOwner` = the admin key) with `register(string label, address owner, bytes[] records)` → `registry.createSubnode(baseNode, label, owner, records)`. The owner (admin CLI) mints **one song subname** per opted-in song: `<slug>.tortmusic.eth`. Durin's example registrar is open-mint and must not be used as-is.
- No JSON onchain; strings limited to `songId`/blobIds. Events carry everything the verifier needs to cross-check Walrus content.
- License UX is two txs (USDC `approve` → `purchaseSongLicense`) — UI shows a two-step button. (EIP-2612 permit is a stretch-polish, not planned.)
- Foundry project in the public repo: unit tests for sig verification (EOA + 1271 mock), **`msg.sender == artist` gate**, timestamp monotonicity/replay rejection, revoke flips `licenseActive=false`, `purchaseSongLicense` (requires `licenseActive` + `expectedManifestHash` match; `LICENSE_INACTIVE` revert after revoke; **two different buyers both succeed**; **`ALREADY_LICENSED`** on the same buyer's repeat), **SafeERC20 transfer**, USDC paths via Base-mainnet fork test.

### Spec review notes (resolved during planning — referenced as C1–C14 elsewhere)
- **C1 (High, fixed in spec above)**: without timestamp monotonicity, an archived valid signature could be replayed after `revokeConsent` to silently re-license a song. Fixed with `consentTimestamp > stored` requirement.
- **C2 (High, addressed)**: `registerSong` re-registration can change a song's live manifest after a buyer licensed it. The **license snapshots what was bought**: `purchaseSongLicense` requires `expectedManifestHash == songs[key].manifestHash` and stores that hash in `licenses[key][buyer]` (and in the license receipt manifest). `verify-song-license.mjs` checks the licensed manifest hash (from the receipt / mapping) against the fetched manifest — so a later re-registration can't retroactively change what a buyer licensed.
- **C3 (Med, fixed in spec above)**: `Consent` now includes `artist`, `permissionMode`, and `licenseTermsHash` (not just songId/audioHash/optIn/timestamp) — the signed message binds *who* consents, to *which permission*, under *which license terms*, for *which audio*. This is the core legal claim; all three additions are in the contract before the first signature.
- **C4 (covered)**: domain pins chainId 8453 + verifyingContract → no cross-chain/cross-deploy replay. Enforce: deploy before first signature; a redeploy invalidates all collected sigs.
- **C5 (Low)**: `expectedManifestHash` mismatch (artist re-registered between read and buy) reverts safely; the license page reads the hash fresh right before building the tx and shows "song changed, refresh" on revert.
- **C6 (n/a)**: packages are cut for MVP — no package registration and no related front-run surface.
- **C7 (ENS records are pointers, not claims)**: the song subname `<slug>.tortmusic.eth` carries text records that **point to** the song manifest / audio blob / contract (`manifest.hash`, `walrus.blob`, `walrus.audio`, `rights.contract`, `url`), set at mint. There is no `ai.licensed` text record to go stale — the song's live `licenseActive` flag and price on-chain are authoritative and are what the verify script + UI read.
- **C8 (None)**: `uint96` price (max ~7.9e22 USDC at 6 decimals) and `uint64` timestamp are ample. Verify `decimals()==6` on Basescan before hardcoding.
- **C9 (Low, by design)**: immutable `treasury` = no custody/withdraw surface; tradeoff is redeploy-to-change — triple-check the constructor arg before broadcast.
- **C10 (Low)**: both `registerSong` and `revokeConsent` require `msg.sender == artist`; with Base Account the artist address IS the smart-wallet address — opt-in records the connected wagmi address and both txs are sent from that same account.
- **C11 (Low)**: `licenses[songKey][buyer]` = per-buyer record of which manifest hash they licensed (the buyer-level mapping); price + timestamp live in the `LicensePurchased` event, which the verify script reads for the human-readable record.
- **C15 (naming clarity)**: two distinct concepts — **`licenseActive`** (song-level bool: future licensing is currently *allowed*; revoke sets it false) vs **`licenses[songKey][buyer]`** (buyer-level: who has bought a license). `licenseActive=false` ≠ "sold out" and ≠ "someone licensed it". Unlimited buyers may license while `licenseActive` is true; only a repeat purchase by the *same* buyer is blocked. UI/README copy uses "available for AI-training licensing" (active) and "licensing closed by the artist" (inactive).
- **C12 (fixed, license-terms binding)**: `licenseTermsHash` is signed by the artist and stored on-chain, so the song license points at a defined `LICENSE_TERMS.md` (not a vague "ai-training" string). The verify script confirms it equals `keccak256(LICENSE_TERMS.md)`.
- **C13 (fixed, no double-purchase)**: `purchaseSongLicense` requires `licenses[key][msg.sender] == bytes32(0)` so a buyer can't accidentally pay twice / overwrite their record.
- **C14 (fixed, token safety)**: USDC moves via OZ `SafeERC20.safeTransferFrom`, avoiding non-standard return-value issues.

## 5. Manifest schemas + EIP-712 types

**Hash rule everywhere: hash the exact bytes stored on Walrus (keccak256). No JSON canonicalization anywhere.** The bytes uploaded are the artifact; hashes commit to those bytes.

```ts
// EIP-712 (src/lib/eip712.ts in the public app)
export const consentTypes = {
  Consent: [
    { name: "songId",          type: "string"  },
    { name: "artist",          type: "address" },
    { name: "audioHash",       type: "bytes32" },
    { name: "permissionMode",  type: "uint8"   },   // 0 = AI_TRAINING_ALLOWED
    { name: "licenseTermsHash",type: "bytes32" },   // keccak256(LICENSE_TERMS.md)
    { name: "optIn",           type: "bool"    },
    { name: "timestamp",       type: "uint64"  },
  ],
} as const;
export const consentDomain = (chainId: number, registry: Address) =>
  ({ name: "TortoiseRightsRegistry", version: "1", chainId, verifyingContract: registry }) as const;
```

```jsonc
// Song manifest (tortoise-rights/song/1.0) — uploaded to Walrus; keccak256(bytes) goes onchain
{
  "schema": "tortoise-rights/song/1.0",
  "songId": "the song's id (UUID)",
  "slug": "flux",
  "title": "Flux",
  "artist": { "address": "0x…", "name": "…", "fid": 123 },   // no artist ENS subname (decision)
  "audio": { "keccak256": "0x…", "mimeType": "audio/mpeg", "bytes": 4812345,
             "sourceIpfsCid": "Qm…",       // original audio source (provenance)
             "walrusBlobId": "…" },        // audio mirrored to Walrus on opt-in; verify fetches from here
  "priceUsdc": "5000000",                  // string, 6 decimals — the song's license price (also onchain)
  "license": { "name": "Tortoise AI Training License v0.1",
               "termsHash": "0x…",          // keccak256(LICENSE_TERMS.md) — also signed in consent
               "termsUrl": "https://github.com/<org>/tortoise-rights-registry/blob/main/LICENSE_TERMS.md" },
  "consent": { "optIn": true, "permissionMode": "AI_TRAINING_ALLOWED", "permissionModeId": 0,
               "licenseTermsHash": "0x…", "timestamp": 1781234567, "signature": "0x…",
               "eip712": { "domain": { /* full domain incl. chainId+registry */ }, "primaryType": "Consent" } },
  "createdAt": "2026-06-13T01:00:00Z"
}
```

```jsonc
// License receipt manifest (tortoise-rights/license/1.0) — built + uploaded to Walrus after a successful purchase
{
  "schema": "tortoise-rights/license/1.0",
  "songId": "…",
  "buyer": "0x…",
  "songManifestHash": "0x…",        // the snapshot the buyer licensed (matches licenses[key][buyer] onchain)
  "licenseTermsHash": "0x…",        // keccak256(LICENSE_TERMS.md)
  "paymentTx": "0x…",               // the purchaseSongLicense tx hash
  "timestamp": 1781239999
}
```
The on-chain `licenses` mapping + `LicensePurchased` event are authoritative; the receipt manifest is an **optional/derived** portable artifact (the verifier does not require it).

Schemas ship as JSON Schema files in `schemas/` + zod parsers in the TS lib (zod is NOT currently an app dep — add to public lib only).

## 6. Repo model — single public repo, zero private-app changes

The brief's original "private app consumes an open library" model is **superseded** (user decision D3/D8): open-sourcing anything in the private app is off the table, so the entire feature — UI included — lives in the public repo as a self-contained Next.js app. This is simpler for a solo sprint (no submodule, no workspace, no cross-repo version skew) and makes the standalone-readiness requirement trivially true.

### Public repo `tortoise-rights-registry` (standalone Next.js app + Foundry + scripts; clean history, MIT)
```
contracts/                       # Foundry — the onchain layer
  src/TortoiseRightsRegistry.sol
  src/TortoiseRegistrar.sol      # onlyOwner Durin registrar (example registrar is open-mint — don't ship it)
  test/Registry.t.sol            # EOA + ERC-1271 mock sigs, replay/monotonicity, revoke, purchaseSongLicense (USDC fork)
  script/Deploy.s.sol
  foundry.toml
LICENSE_TERMS.md                 # Tortoise AI Training License v0.1 — its keccak256 is the signed licenseTermsHash
src/
  lib/                           # viem-only core (the would-be "library"; also reusable later)
    eip712.ts                    # domain/types/digest builders
    manifest.ts                  # types + zod schemas + buildSongManifest + buildLicenseReceipt + hashBytes(keccak256)
    walrus.ts                    # putBlob/getBlob raw HTTP, multi-endpoint fallback + retries, both response shapes
    ens.ts                       # registrar mint + setText; resolve helpers (CCIP-Read) + --rpc-fallback direct L2 read
    registry.ts                  # contract ABI + typed read/write helpers
    tortoise.ts                  # load a song via PUBLIC https://tortoise.studio/api/getAudio?slug= + paste fallback
  app/                           # Next.js app router (the deployable feature app)
    page.tsx                     # landing: enter a Tortoise song slug / paste an audio URL
    song/[slug]/page.tsx         # artist opt-in (sign → registerSong) AND buyer "License with USDC" + status/verify links
    api/opt-in/route.ts          # KEYLESS: audio fetch+hash (digest) → verify sig → mirror audio + upload manifest to Walrus → return {manifestHash, blobId, audioBlobId}. Artist's wallet sends registerSong.
    api/license-receipt/route.ts # KEYLESS: after a purchase, build + upload the license receipt manifest to Walrus
    providers.tsx                # wagmi (Base mainnet; baseAccount + injected/Coinbase connectors) + QueryClient
  components/                    # branded UI (cream #cbbfb9 / purple #280274): AiLicenseCard, LicenseButton, Button, StatusBadge
  styles/                        # brand tokens replicated from the public app CSS (colors/fonts are public, not proprietary)
schemas/                         # *.schema.json (song, license-receipt)
scripts/
  verify-song-license.mjs        # THE centerpiece — §9; zero deps on Tortoise or this app's server
  mint-song-name.mjs             # admin CLI: mint <slug>.tortmusic.eth + text records for an opted-in song
  smoke-walrus.mjs / smoke-ens.mjs   # prerequisite gate tests (§7.0)
README.md / .env.example / LICENSE (MIT) / .gitignore (.env from commit 1)
```

### How the two repos coexist (read-only public seams only)
1. **Song data** — feature app calls Tortoise's **public, unauthenticated** `GET /api/getAudio?slug=<slug>` (confirmed in §1: returns audio URL, title, artist, `wallet_address`, image). No auth, no secret, no private import. Paste-URL/CID fallback if the live app is down (D9).
2. **Audio** — fetched from its **public** Pinata gateway URL (the same URL anonymous listeners stream). Reading needs no Pinata JWT (that's upload-only). The keyless server route fetches the bytes → keccak256 (committed onchain + in the manifest) → **mirrors the audio to Walrus**; the manifest records the Walrus `audioBlobId` plus the original IPFS CID as provenance.
3. **Identity** — the artist connects their own wallet in the feature app and signs EIP-712; the server checks the signer matches the song's public `wallet_address` (honest, Tortoise-attested binding — stated plainly in README). No Tortoise auth dependency.
4. **Naming** — subnames under the shared `tortmusic.eth` (user owns it). The only Tortoise-specific config is the public ENS parent name + deployed contract addresses (public by nature).
5. **No database** — opt-in, price, and `licenseActive` read from the contract (`songs[key]` + `SongRegistered`); a buyer's license reads from `licenses[key][buyer]` + the `LicensePurchased` event. Walrus holds the song manifest, audio, and license-receipt blobs.

### Standalone-readiness (true by construction)
A stranger clones the repo, fills `.env` from `.env.example` (their own admin key for the CLI + public RPC/Walrus endpoints; the web app needs no key), `pnpm install && pnpm dev`, and runs the full flow + `verify-song-license.mjs <slug>` against the live song — with no Tortoise secrets anywhere. Pre-publish audit: `git log` = only this project's commits; `grep for private-app secrets/SDKs (Supabase, Pinata, session secrets, etc.)` in the public repo returns nothing (a documented public `getAudio` URL string is fine); `.env` gitignored from commit 1.

### Optional future (out of scope now, NOT open-sourced)
The main Tortoise app could add a one-line "License for AI training" link on its song page → `https://<feature-app>/song/<slug>`. Pure deep link; exposes no app internals. The `src/lib/` core can later be extracted to an npm package if the app wants in-process integration.

## 7. Work plan & scope

**Scope.** Deliberately tight and prioritized around the **core flow** (§ Context); trim up front rather than mid-build:
- **One** artist, **one** song — packages are out of scope for MVP (the explicit next step; see §11 pitch).
- Revoke = direct artist wagmi tx, DB-free status read from chain (artist-sent, like registerSong; the contract function is present and verifiable).
- ENS text records set at mint only; no post-mint updates (C7 semantics).
- **Walrus stores BOTH the audio file and its manifest** on opt-in (and the license-receipt manifest after a purchase) — it is the canonical artifact store the verify script reads. **Assume audio files are within the public publisher's size limit** (pick a demo song accordingly); mirroring is a single extra HTTP PUT in the same server route that already fetches the audio to hash it, so it adds little complexity.
- The audio's keccak256 is computed from the bytes and committed onchain + in the manifest, so consent anchors to the exact audio; the original IPFS CID is kept as provenance.
- Opt-in UI = a single card on the song page; a post-upload-style prompt is future work.
- The verification script takes priority over UI polish.

**All work is in the public repo `tortoise-rights-registry`.** The private Tortoise app is untouched. Dropping the cross-repo wiring (submodule, pnpm workspace, `transpilePackages`, Supabase migration, viem-version reconciliation) removes a meaningful chunk of work.

**Commit cadence (judges read the git history).** Commit early and often so progress is visible and reviewable:
- Commit directly to `main` (solo project → clean linear history reads best). Push after each commit.
- **Commit at every phase boundary** (the Phase 0–4 milestones below), and within a phase whenever a self-contained unit is green — e.g. the contract compiling, a test suite passing, a smoke gate clearing, a lib module landing. Rule of thumb: if it builds/typechecks/tests-green and is a coherent step, commit it.
- Each commit must leave the repo in a working state (installs + typechecks; tests green when present). Never commit secrets — `.env` is gitignored from commit 1; the leak-audit grep (§10.8) gates any doc/code that mentions private-app internals.
- Imperative, scoped messages (e.g. "Add TortoiseRightsRegistry + Foundry tests"); end with the Co-Authored-By trailer. Commit/push happens when I ask (default at phase boundaries).
- **Phase 0 (scaffold + verified prerequisite gates) is the first such commit.**

### Onchain deployments (one-time, in order; all from the local admin key)
1. **Durin `L2Registry`** for `tortmusic.eth` on Base mainnet — via durin.dev (§7.0 item 4). Record its address.
2. **`TortoiseRegistrar`** (our onlyOwner Durin registrar) on Base mainnet (`forge script` broadcast), then `L2Registry.addRegistrar(registrar)` (§7.0 item 8).
3. **`TortoiseRightsRegistry`** on Base mainnet — `forge script script/Deploy.s.sol --rpc-url <base> --broadcast`; constructor args = (USDC `0x8335…2913`, treasury wallet); **dry-run first on a local anvil Base fork**; then **`forge verify-contract` on Basescan** so the source is publicly readable (part of the trust-nothing claim); record `RIGHTS_REGISTRY_ADDRESS` in `.env` + Vercel. **Must precede any opt-in signature** — the EIP-712 domain binds this address, and redeploying invalidates every collected signature (C4).

Nothing else is deployed. All three addresses live in `.env` + the README.

### 7.0 Prerequisites (do these before writing feature code)
1. **Wallets**: (a) **admin/owner key** → `ADMIN_PRIVATE_KEY`, used **locally by the CLI + deploy scripts only, never in the web app** (deploys the contracts, owns the registry + registrar, runs `mint-song-name.mjs` for the song ENS subname); (b) **`tortmusic.eth` owner wallet** for the 2 L1 resolver txs (may be the same wallet as the admin key); (c) **artist wallet** — signs the EIP-712 consent and sends `registerSong` (pays gas); (d) **buyer wallet** — USDC purchase (pays USDC + gas). For a one-artist demo some may overlap; distinct wallets show the roles cleanly. Never commit any key.
2. **Funding (real $)**: admin/owner key — on Base ~$8–12 ETH (deploys + the song ENS mint) and on L1 ~$15–40 ETH for the two resolver txs (low-gas window); artist wallet ~$1–3 ETH on Base (`registerSong` gas — the Walrus audio/manifest PUTs cost no gas); buyer wallet ~8 USDC + ~$2 ETH on Base. Do NOT pre-buy SUI/WAL — only if item 5 fails.
3. **GitHub**: create/confirm the public repo `tortoise-rights-registry` (MIT); `.gitignore` with `.env` is commit 1. Split this planning doc into the public Part A and the private Part B here. All registry code is written in this repo from the start — nothing to scrub later.
4. **durin.dev**: deploy L2Registry on **Base mainnet** for tortmusic.eth (factory `0xDddd…d22d`). Record registry address + the CCIP gateway hostname it reports.
5. **Walrus smoke test (gate)**: `PUT {publisher}/v1/blobs?epochs=6` with ~1KB body across 2–3 mainnet publishers (`walrus-mainnet-publisher-1.staketab.org`, `*.walrus-mainnet.walrus.space` family) → `GET` back from an aggregator. ≥1 works unauthenticated → record in `.env`, continue. All fail → trigger R1 contingency (run own publisher, needs SUI/WAL) or testnet-blobs backup.
6. **Audit tortmusic.eth current records** (read-only) before touching the resolver (R4).
7. **L1 txs from owner wallet**: `setResolver(node, 0x8A968aB9eb8C084FBC44c531058Fc9ef945c3D61)` → `setL2Registry(<registry from item 4>, 8453)`. Wait for confirmations.
8. **Registrar**: deploy `TortoiseRegistrar.sol` (onlyOwner = the admin key); `registry.addRegistrar(registrar)`.
9. **ENS round-trip smoke test (gate)**: mint a throwaway subname with a text record at mint → resolve via (a) `getEnsText` (CCIP gateway) AND (b) direct L2Registry read on Base. Both must return the value. Also note whether registrar can `setText` post-mint (informs C7 stretch).
10. **Verify constants on Basescan**: USDC `0x8335…2913` has `decimals()==6`; note Universal Resolver + Durin L1 resolver addresses.
11. **Env.** Web app (Vercel) — **no private key**, only config: `WALRUS_PUBLISHER`, `WALRUS_AGGREGATOR`, `RIGHTS_REGISTRY_ADDRESS` (after the contract deploy), `TORTOISE_REGISTRAR_ADDRESS`, `L2_REGISTRY_ADDRESS`, `ENS_PARENT=tortmusic.eth`, `USDC_ADDRESS`, `TREASURY_ADDRESS`, `TORTOISE_API_BASE=https://tortoise.studio` (public read base), `NEXT_PUBLIC_RPC_URL`. Local CLI/scripts only (gitignored, never deployed): `ADMIN_PRIVATE_KEY`. `.env.example` documents names only.

### Phase 1 — Contract + prove the core loop
**Done when:** one real consent is recorded on Base mainnet referencing a real Walrus manifest, and `verifyTypedData` confirms the signature. This proves the three hardest unknowns (contract, Walrus, EIP-712 signing) at once.
1. Complete the §7.0 prerequisites (including both smoke-test gates).
2. **Contract** authored with C1 (timestamp monotonicity) + C3 (artist in struct) baked in; Foundry tests green (EOA sig, ERC-1271 mock, replay rejection, revoke gate, `purchaseSongLicense` tests, USDC on Base fork); then **deploy `TortoiseRightsRegistry` per the "Onchain deployments" list above** (constructor args USDC + treasury — triple-check the treasury arg, C9; anvil-fork dry-run; broadcast to Base mainnet; Basescan verify; record `RIGHTS_REGISTRY_ADDRESS`). **No opt-in signature exists before this deploy** (the domain binds the address).
3. **Vertical slice**: a script that fetches one real small song's audio bytes → keccak → builds the Consent digest → **signs with a real wallet** (Base Account) → `putBlob` the audio to Walrus + `putBlob` the song manifest → **sends `registerSong` from the artist wallet** (pays gas) → reads `SongRegistered` back → confirms `verifyTypedData` passes (this is where ERC-1271 surprises surface; apply the smart-wallet verification technique from §12).
- **If scope must shrink, defer in this order**: (1) script polish — hardcoded values are fine; (2) text-records-at-mint → after basic mint resolves. **Must land**: contract deployed + one signature verifying + the audio and manifest on Walrus.

### Phase 2 — Feature app + opt-in
**Done when:** from the live deployed feature app, opt-in on a real Tortoise song signs and the artist's wallet sends `registerSong` (pays gas), with the audio + manifest stored on Walrus and the consent recorded onchain. (ENS naming happens in Phase 3.)
1. **Scaffold the Next.js app**: app router, `providers.tsx` (wagmi Base mainnet + `baseAccount()` + injected/Coinbase connectors, QueryClient), brand tokens replicated from the public app CSS (cream/purple; Inter — see §11 fonts), base layout + `Button`/`Card`/`StatusBadge`. Deploy a hello-world to Vercel early to de-risk the deploy path (plain Next.js — no submodule).
2. **Organize `src/lib/`** from the Phase 1 slice: `eip712`, `walrus` (multi-endpoint + both response shapes), `manifest` (zod + hashBytes), `registry`, `ens`, and `tortoise.ts` (load song via public `getAudio` + paste fallback; cache a development fixture).
3. **Opt-in flow**: `/song/[slug]` page (load song via `tortoise.ts`; connect wallet; `useSignTypedData`) + **keyless** `/api/opt-in/route.ts` (digest phase: server fetches audio bytes → keccak → returns the EIP-712 payload; signature phase: `verifyTypedData` ERC-1271-aware, check signer == song `wallet_address`, **mirror the audio to Walrus** and build+upload the **song manifest** (carrying `audio.keccak256`, `audio.walrusBlobId`, and the IPFS CID as provenance) → return `{manifestHash, blobId, audioBlobId}`). The **artist's wallet then sends `registerSong`** (pays gas; wagmi `useWriteContract`). ENS naming happens in the admin CLI (Phase 3), not here. Honest copy ("consent infrastructure," no revenue claims).
4. **Result + status UI**: show the audio + manifest Walrus links, the Basescan tx, and onchain status; revoke button (direct artist wagmi tx). The song ENS name `<slug>.tortmusic.eth` appears once minted (Phase 3). Brand-native `AiLicenseCard`.
5. **Vercel deploy** with config env (no key); verify the deployed opt-in works end-to-end on a real song.
- **If scope must shrink, defer in this order**: (1) revoke button → status only; (2) paste fallback → hardcode the one test song. **Must land**: opt-in from the deployed app producing onchain consent + the audio and manifest on Walrus.

### Phase 3 — Song license purchase + verification
**Done when:** the song license page renders, a real USDC purchase succeeds, the song ENS name resolves, and `verify-song-license.mjs` prints all-green.
1. **`mint-song-name.mjs`** (admin key, local CLI): read the song's on-chain record + manifest → mint `<slug>.tortmusic.eth` with text records (`manifest.hash`, `walrus.blob`, `walrus.audio`, `rights.contract`, `url`). Run once for the opted-in song.
2. **Song license on `/song/[slug]`**: for a registered song, show its price and — when `licenseActive` — a **two-step "License with USDC" button** (approve → `purchaseSongLicense(songId, expectedManifestHash)`, hash read fresh — C5); the connected buyer's own license state reads from `licenses[key][buyer]` (and a revoked song shows "licensing closed by the artist"); Basescan link on success; on success POST to the keyless `/api/license-receipt` route, which uploads the license receipt manifest to Walrus. ERC-20 approve/allowance ABI per the standard interface (§12).
3. **Validate the purchase path** with my own buyer wallet (~6 USDC) while a revert is still cheap to fix. Confirm `licenses[key][buyer]` is set and the treasury balance moved.
4. **`verify-song-license.mjs`** — zero Tortoise deps. **With just `<slug>`** it verifies the song artifact + licensing availability: resolve `<slug>.tortmusic.eth` → song record onchain → GET song manifest from Walrus, `keccak == songs[key].manifestHash` → GET audio from its Walrus blob, `keccak == audioHash` → re-derive the EIP-712 Consent digest from the manifest, `verifyTypedData` for the artist (ERC-1271-aware) → confirm `licenseTermsHash == keccak256(LICENSE_TERMS.md)` and **`manifest.priceUsdc == songs[key].priceUsdc`** (manifest/UI/onchain price aligned) → report `licenseActive`. **With `<slug> --buyer <address>`** it additionally verifies that buyer's purchase: `licenses[key][buyer]` equals the licensed manifest hash, cross-checked against the `LicensePurchased` event (**the on-chain mapping + event are authoritative**; the license receipt manifest on Walrus is optional/derived). `--rpc-fallback` reads ENS records direct from the L2Registry (bypasses CCIP gateway).
- **If scope must shrink, defer in this order**: (1) ENS resolution inside the script → accept a `slug`/`songId` arg instead; (2) license-receipt manifest upload (the on-chain license suffices); (3) licensed-state read on the page. **Must land**: the two-step USDC purchase succeeding + the script printing all-green. The verification script is the project's central claim (independent verification) and takes priority over UI polish.

### Phase 4 — Docs & publish
1. **README** (clone-and-run walkthrough, `.env.example`, MIT LICENSE) covering: deploy the contracts, opt a song in, mint its ENS name, run `verify-song-license.mjs <slug>`. **Leak audit**: `git log` shows only this project's commits; grep the public repo for private-app secrets/SDKs → nothing (the documented public `getAudio` URL is allowed); `.env` gitignored.
2. **Publish**: finalize the public repo, confirm the deployed app + live song URL + Basescan links all resolve from a clean state.
3. **Optional short walkthrough recording** of the end-to-end flow (§9) for the README.
- Demo preparation and the submission checklist live in **Part B (private)** — not in the public repo.

### If time remains
- Post-mint `setText` on revoke (if §7.0 item 9 showed the registrar can update records after mint).

### Future / out of scope for the initial build
**Packages** — bundle many song manifests into curated training datasets (package manifest + `registerPackage` + `<package>.tortmusic.eth` + pro-rata splits + a package page) — this is the headline next step in the pitch. Then: dual-write new uploads to Walrus → ENSIP-26 agent records for tortOS → extract `src/lib/` to an npm package for in-process integration by the main app.

## 8. Risk register

| # | Risk | L | Impact | Mitigation | Fallback / resilience |
|---|------|---|--------|------------|----------------------|
| R1 | Walrus mainnet publishers authed/down/flaky | High | High (blocks manifests) | §7.0 item 5 smoke gate across 2–3 endpoints; `walrus.ts` multi-endpoint failover + retry + both response shapes; working endpoint in `.env`. | Run my own publisher (~$15–20 SUI/WAL, ~45min) as a contingency; testnet blobs as a clearly-labeled last resort. Because blobId is a deterministic content hash, a retained copy of the exact bytes is provably the same object. |
| R2 | Audio exceeds the ~10MiB publisher cap (core audio mirroring) | Low (assumed not to occur) | Low | We pick demo songs within the limit; the opt-in route checks size and reports clearly if exceeded. | A larger file would need a self-run publisher (Walrus CLI + SUI/WAL) — out of scope by assumption; the rest of the flow is unaffected. |
| R3 | Durin CCIP gateway down/slow (NameStone-operated, single point of failure) | Med | High (ENS resolution) | `--rpc-fallback` direct-L2 reads in script + UI; pre-warm resolution. | Read records directly from the L2Registry on Base (still onchain ENS data), bypassing the gateway. |
| R4 | tortmusic.eth resolver switch breaks existing records | Low | High if real | §7.0 item 6 audits records BEFORE `setResolver`. | Re-set needed records on the L2; worst case use another owned name. |
| R5 | EIP-712 × ERC-1271 pitfalls with Base Account (smart-wallet) signatures | Med | High | `verifyTypedData` everywhere (EOA+1271+6492), never raw recover; OZ `SignatureChecker` onchain; smart-wallet message verification is a known pattern (§12); prove Base Account + a plain EOA in Phase 1. | Use whichever wallet type is proven working in Phase 1; browser Base Account is the primary, well-supported path. |
| R6 | Base Account connect/popup friction in the standalone app | Low-Med | Med | Standalone web app (not in-frame) → simpler wallet UX; one EIP-712 sign + one artist-sent `registerSong` tx (no chained txs). | Injected EOA as a backup connector. |
| R7 | Admin CLI key handling / artist gas | Low-Med | Med | Admin key stays **local** (CLI + deploy only), never in the web app or committed; run owner ops serially (await receipts). Artist funds a small ETH buffer for `registerSong`. | The web app holds no key (nothing to leak there); owner ops are re-runnable; the artist's and buyer's txs are independent of the admin key. |
| R8 | Live Tortoise `getAudio` API unreachable (song load) | Med | Med | Paste-URL/CID fallback in the feature app (D9); optional local fixture for offline dev. | Paste the audio URL/CID — the opt-in flow proceeds identically without the live API. |
| R9 | Vercel deploy of the feature app fails | Low-Med | High (no deployed app) | Plain standalone Next.js — no submodule/workspace; deploy a hello-world early (Phase 2); verify ahead of time. | Run locally with `pnpm dev` — the full flow works the same. |
| R10 | USDC `purchaseSongLicense` reverts (allowance/decimals/stale hash) | Med | High (core purchase flow) | Validate the purchase against a Base fork and with a real wallet before relying on it (Phase 3); verify `decimals()==6` onchain; two-step approve→purchase; read `expectedManifestHash` fresh pre-tx. | Surface clear revert reasons in the UI (allowance too low → re-approve; stale hash → refresh). |
| R11 | Signature replay / manifest bait-and-switch | Med | Med (correctness) | §4 C1 (monotonic timestamp, onchain) + C2 (the license snapshots the song manifest hash; verify checks it). | Designed out, not worked around — see C1/C2. |

Each external dependency (Walrus, the CCIP gateway, hosting) has an engineering fallback above; none relies on staging or fabrication.

## 9. End-to-end flow

What actually happens, start to finish — the same path the README documents and that anyone can reproduce against the live deployment:

1. **Opt in.** An artist opens the feature app for one of their songs (loaded by slug from Tortoise's public API, or by pasting an audio URL/CID), connects their wallet, and signs the EIP-712 `Consent` message. The server verifies the signature (EOA or ERC-1271), confirms it matches the song's on-record wallet, and checks the audio size.
2. **Store on Walrus.** The server hashes the audio (keccak256), **mirrors the audio bytes to Walrus**, builds the song manifest (song id, artist, audio hash, the Walrus `audioBlobId`, the original IPFS source as provenance, the signature and its EIP-712 domain), and stores the **manifest** on Walrus too. Both are readable at `{aggregator}/v1/blobs/{blobId}`.
3. **Record on Base.** The **artist's wallet sends `registerSong`** (paying gas), committing the manifest hash, audio hash, permission mode, license-terms hash, the Walrus blob ids, and the price on-chain. The `SongRegistered` event is visible on Basescan; no JSON is stored on-chain.
4. **Name in ENS.** The owner (admin CLI) mints `<slug>.tortmusic.eth` with text records pointing at the song manifest, audio blob, and contract — resolvable via `getEnsText` (with a direct-L2 read as a fallback).
5. **License.** The song's `/song/<slug>` page shows the price and a "License with USDC" button. A buyer approves USDC and calls `purchaseSongLicense`; the page reflects that the buyer now holds a license and links the tx, and a license receipt manifest is stored on Walrus.
6. **Verify.** Anyone runs `node scripts/verify-song-license.mjs <slug>` from a clean clone: it resolves the song ENS name, fetches the song manifest from Walrus and checks its hash against the contract, fetches the audio from its Walrus blob and checks its keccak256 against the committed `audioHash`, validates the artist's EIP-712 consent (signer == recorded artist, ERC-1271-aware) over the full signed terms, confirms `licenseTermsHash == keccak256(LICENSE_TERMS.md)` and that the manifest price matches the on-chain `priceUsdc`, and reports `licenseActive`. Adding `--buyer <address>` also verifies that buyer's purchase against the on-chain `licenses` mapping + `LicensePurchased` event (authoritative; the receipt manifest is optional/derived). It prints a per-check result and exits non-zero on any mismatch, confirming every claim without trusting Tortoise.

Honest framing throughout: this is **consent infrastructure** — provable opt-in and licensing — **not a promise of artist revenue**. The USDC payment goes directly to the treasury; this is a prototype, not legal advice (see `LICENSE_TERMS.md`).

## 10. Verification (how we know it works)

Layer-by-layer, in build order — each milestone ends with its check passing:

1. **Contract**: `forge test` in `contracts/` — EIP-712 digest matches viem's `hashTypedData` (golden-value test), EOA + ERC-1271-mock signature paths, `msg.sender == artist` gate, revoke→replay rejected, `purchaseSongLicense` happy path + wrong-hash revert + `ALREADY_LICENSED` revert + revoked-song revert (fork test against Base mainnet USDC via `forge test --fork-url`). Deploy script dry-run on a local anvil fork of Base before the real deploy.
2. **Walrus**: smoke script (`scripts/` in public repo): `PUT` a small test blob to each candidate mainnet publisher → `GET` from two aggregators → byte-equality + handle both `newlyCreated`/`alreadyCertified` response shapes. Re-run with a real (sub-cap) audio file to confirm audio uploads round-trip — audio mirroring is on the core path.
3. **EIP-712 e2e (Phase 1 exit test)**: one real song — sign with a real wallet (Base Account), send `registerSong` from the artist wallet, then a one-off viem script verifies `verifyTypedData` passes for the artist wallet and the onchain record matches the manifest bytes' keccak256.
4. **ENS**: after registry+registrar deploy and the two L1 txs: mint `test.tortmusic.eth` with text records → `getEnsText` via mainnet client (CCIP-Read) returns them → also read the same record direct from the L2Registry on Base (the fallback path) → delete/ignore test name afterward.
5. **Feature-app `/api/opt-in` route**: light vitest (the app's `vi.hoisted` route-test pattern is the reference) for the route branches: signer ≠ song `wallet_address` rejected, oversize-audio 4xx, happy path calls lib functions in order. Keep these few and cheap — the weekend's real verification is the live loop, and there's no Supabase/auth to mock.
6. **Purchase**: with my own wallet, approve → purchase on the deployed page → the `licenses[key][buyer]` read flips the page to show the buyer holds a license → the `LicensePurchased` event is visible on Basescan.
7. **The centerpiece**: `node scripts/verify-song-license.mjs <slug>` (and `<slug> --buyer <address>` to also verify a purchase) from a clean clone of the public repo (separate directory, fresh `pnpm install`, only `.env.example`-documented vars) — all checks green. Run it from a fresh machine and network before publishing.
8. **Public-repo standalone audit**: clean-clone README walkthrough (a stranger runs the full flow + verify script with only `.env.example` vars + their own admin key for the CLI); `grep for private-app secrets/SDKs` in the public repo returns nothing (the documented public `getAudio` URL is allowed); `git log` contains only this project's commits.

## 11. Open items / honest flags

- **Repo-model change (user-approved, supersedes the brief)**: the brief described a private app consuming an open library with the opt-in UI native to the app's pages. Because the private app cannot be open-sourced, the **entire feature — UI included — lives in the standalone public Next.js app**, and the private app gets **zero changes**. Trade-off: the opt-in button isn't literally embedded in the Tortoise song page; it's a brand-matched sibling app reading real Tortoise songs, with an optional one-line deep-link from the main app possible later. Net effect on scope is *negative* (less work): submodule/workspace/migration/cross-repo-version reconciliation all disappear.
- **Deliberate deviation from the brief**: the EIP-712 `Consent` struct gains an `artist` address field (brief listed songId/audioHash/optIn/timestamp). Reason: §4 C3 — the signed message must bind who consents. Also `registerSong` enforces timestamp monotonicity (C1) to prevent post-revoke signature replay. Both must be in the contract before the first real signature.
- **No relayer; artist pays gas (user decision)**: the artist sends `registerSong` from their own wallet and the **web app holds no private key**. The EIP-712 consent signature is still the portable proof in the manifest and is verified on-chain. Owner-only actions — contract deploys and the song's **ENS subname minting** — run from a local admin CLI (only the `tortmusic.eth` owner mints under it).
- **Audio + manifests on Walrus (core)**: on opt-in the audio file is mirrored to Walrus and its song manifest stored there; after a purchase the license-receipt manifest is stored too. These are the canonical artifacts the verify script reads. The audio's keccak256 is committed onchain so integrity is provable; the original IPFS CID is retained as provenance. Assumes audio within the ~10MiB public-publisher cap.
- **ENS records are pointers (C7)**: the song subname's text records point to the manifest / audio / contract (set at mint); the contract is authoritative for live state (`licenseActive`, price). There is no `ai.licensed`-style status record that could go stale.
- **Fonts**: brief says Futura/Jost + EB Garamond; the existing app uses Inter everywhere. The feature app matches the app's actual styles (raw-hex Tailwind + brand colors). If the font brand matters for the song page, that's a polish item, not structural.
- **Artist↔song binding honesty**: the EIP-712 signature proves *the named wallet consented to this audio hash*; the wallet↔song-ownership mapping is Tortoise-attested (from the song's public `wallet_address`), not cryptographically proven. README states this plainly — it's consent infrastructure, not provenance proof.
- **Single song (MVP scope) + the pitch**: the build does one song end to end. The pitch frames the next step honestly: *"Tortoise Rights Registry lets an artist opt one song into AI training, stores the audio and consent manifest on Walrus, names it with `tortmusic.eth`, and lets a model developer buy a USDC license that anyone can verify. The next step is packages: many song manifests bundled into curated training datasets."*
- **`tortmusic.eth` resolver switch**: setting the Durin L1 resolver replaces existing record resolution for the name. Check current records in the ENS manager first; re-set anything needed on the L2 after.

## 12. Techniques applied (re-implemented fresh in the public app)

These are established patterns the public app implements from scratch — nothing is imported from or copied out of any other repo:
- **Smart-wallet (ERC-1271) signature verification** via viem `publicClient.verifyTypedData({ chain: base })` — handles EOA + ERC-1271 + ERC-6492, the template for the consent check (never naive `ecrecover`).
- **`useWriteContract` → `useWaitForTransactionReceipt` discipline** and a two-step button UX, used for the USDC approve → purchase flow.
- **Base-mainnet wagmi config** with a Base Account (Coinbase Smart Wallet) connector + an injected/Coinbase connector (`providers.tsx`).
- **The one live seam:** the public `GET /api/getAudio?slug=` endpoint (response: audio URL, title, artist, on-record wallet address, image) consumed over HTTP by `tortoise.ts` — never imported.
- **Standard ERC-20 ABI** (`approve`/`allowance`/`transferFrom`) for the USDC interaction.
- **Brand tokens** (`#cbbfb9` cream / `#280274` purple, Inter) replicated into the feature app's styles — public brand.