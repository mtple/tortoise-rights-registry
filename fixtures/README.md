# Local dev fixtures

Files used for local development and demos. **Audio binaries here are gitignored** —
the canonical audio lives on Walrus (referenced by content hash) and IPFS (provenance),
so there's no reason to commit large media into the repo.

- `*.mp3` / `*.wav` / etc. — demo songs for the opt-in flow. Under the ~10 MiB Walrus
  public-publisher cap (R2). Not tracked by git.
- `getaudio-*.json` (optional) — cached `GET /api/getAudio?slug=` responses, so the
  opt-in flow can run offline when the live Tortoise API is unreachable (D9 / R8).

To run the demo, drop a sub-10 MiB audio file here and point the opt-in flow / vertical-slice
script at it (or at a Tortoise slug / pasted URL).
