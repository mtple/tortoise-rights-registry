# Tortoise AI Training License v0.1

> **⚠️ DRAFT — load-bearing file.** The keccak256 hash of the exact bytes of this
> file is the `licenseTermsHash` that artists sign (EIP-712 `Consent`) and that is
> stored on-chain in `TortoiseRightsRegistry`. **Changing one byte changes the hash
> and invalidates every signature and on-chain record that referenced the old text.**
> Finalize this wording *before* the first opt-in signature is collected. Do not edit
> after go-live without a deliberate re-registration plan.

## What this license is

This document defines the terms an artist consents to when they opt a single song
into AI-training licensing through the Tortoise Rights Registry, and the terms a
licensee accepts when they purchase a license for that song with USDC on Base.

This is **consent infrastructure for a prototype** — a provable, on-chain record
that a named wallet opted a specific audio recording (identified by its content
hash) into AI-training use under these terms. **It is not legal advice and is not a
warranty of rights, ownership, or revenue.**

## 1. Definitions

- **Work** — the specific audio recording identified by the `audioHash` (keccak256
  of the exact audio bytes stored on Walrus) in the song manifest.
- **Artist** — the wallet address that signed the EIP-712 `Consent` message and sent
  the `registerSong` transaction for the Work.
- **Licensee** — a wallet that completed `purchaseSongLicense` for the Work.
- **AI Training** — using the Work as input data to train, fine-tune, evaluate, or
  otherwise develop machine-learning models.

## 2. Grant (TODO: finalize legal wording before go-live)

Subject to payment of the song's USDC price, the Artist grants the Licensee a
non-exclusive, worldwide, non-transferable license to use the Work for AI Training.

## 3. Reservations

- The Artist represents they have the right to grant this license for the Work.
  (The Registry records consent; it does **not** independently verify ownership —
  the wallet↔song binding is attested by Tortoise, not cryptographically proven.)
- Revocation (`revokeConsent`) stops **new** licenses from being sold. Licenses
  already purchased remain valid as snapshots of the Work at purchase time.

## 4. No warranty

THE WORK AND THIS LICENSE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
THIS IS A PROTOTYPE AND NOT LEGAL ADVICE.

---

*Permission mode: `AI_TRAINING_ALLOWED` (enum 0). Version string: "Tortoise AI
Training License v0.1" — must match the `license.name` field in the song manifest.*
