# Contracts — Tortoise Rights Registry

Foundry project for the on-chain layer. See the [root README](../README.md) for the full system.

## Contracts (`src/`)
- **`TortoiseRightsRegistry.sol`** — EIP-712 artist consent + per-song USDC licensing. Records the
  consent hash, audio hash, license-terms hash, Walrus blob ids, and price; sells licenses via
  `purchaseSongLicense` (buyer-supplied `maxPrice`, SafeERC20 to an immutable treasury).
- **`TortoiseRegistrar.sol`** — a Durin registrar. `register()` is `onlyOwner` (admin CLI);
  `registerByArtist()` lets the song's registered artist mint `<slug>.tortmusic.eth` themselves
  (keyless app path), gated to `msg.sender == rights.songs(key).artist`.
- **`IL2Registry.sol`** — minimal interface to the Durin L2Registry.

## Setup
```bash
./install-deps.sh   # restores pinned forge-std + OpenZeppelin (lib/ is gitignored)
forge build
```

## Test
```bash
forge test                                                         # 42 tests (offline)
BASE_RPC_URL=https://mainnet.base.org forge test --fork-url base   # incl. real-USDC Base-fork test
```

## Deploy
Env-driven (`USDC_ADDRESS`, `TREASURY_ADDRESS`, `L2_REGISTRY_ADDRESS`, `RIGHTS_REGISTRY_ADDRESS`),
read from a `.env` symlink (`ln -sf ../.env .env`). Sign with a keystore, not a raw key. See the
root README's "Full walkthrough" and `../plans/GO_LIVE.md`.
```bash
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify --account tortoise-admin --sender <ADMIN>
forge script script/DeployRegistrar.s.sol --rpc-url base --broadcast --verify --account tortoise-admin --sender <ADMIN>
```

Deployed (Base mainnet): registry `0xA0bd2b9f2d9554cA3AAeD618E420Aac816d80bbe`,
registrar `0x7640eB413A5AD4aa1D28485db09a658629e30601` (both verified on Basescan).
