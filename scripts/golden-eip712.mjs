#!/usr/bin/env node
// Regenerates the EIP-712 golden digest asserted by contracts/test/Eip712Golden.t.sol.
// Run from the repo root: `node scripts/golden-eip712.mjs`
// If you change the Consent type/domain in src/lib/eip712.ts, re-run this and update the test.

import { hashTypedData, keccak256, toBytes } from "viem";

const domain = {
  name: "TortoiseRightsRegistry",
  version: "1",
  chainId: 8453,
  verifyingContract: "0x1111111111111111111111111111111111111111",
};
const types = {
  Consent: [
    { name: "songId", type: "string" },
    { name: "artist", type: "address" },
    { name: "audioHash", type: "bytes32" },
    { name: "permissionMode", type: "uint8" },
    { name: "licenseTermsHash", type: "bytes32" },
    { name: "optIn", type: "bool" },
    { name: "timestamp", type: "uint64" },
  ],
};
const message = {
  songId: "song-123",
  artist: "0x00000000000000000000000000000000000000A1",
  audioHash: keccak256(toBytes("audio")),
  permissionMode: 0,
  licenseTermsHash: keccak256(toBytes("terms")),
  optIn: true,
  timestamp: 1700000000n,
};

console.log("audioHash        =", keccak256(toBytes("audio")));
console.log("licenseTermsHash =", keccak256(toBytes("terms")));
console.log("EXPECTED_DIGEST  =", hashTypedData({ domain, types, primaryType: "Consent", message }));
