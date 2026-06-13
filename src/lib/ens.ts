// ENS — registrar mint + setText (admin CLI) and resolve helpers.
// Resolution goes through the Durin CCIP-Read gateway via viem getEnsText/getEnsAddress,
// with a --rpc-fallback that reads text records directly from the L2Registry on Base. (plan §3, R3)

import { encodeFunctionData, namehash, parseAbi, type Address, type Hex } from "viem";

export const ENS_PARENT = process.env.ENS_PARENT ?? "tortmusic.eth";
export const L2_REGISTRY_ADDRESS = (process.env.L2_REGISTRY_ADDRESS ?? "") as Address;
export const TORTOISE_REGISTRAR_ADDRESS = (process.env.TORTOISE_REGISTRAR_ADDRESS ?? "") as Address;

// Text record keys set at mint (pointers, not claims — C7):
export const TEXT_KEYS = {
  manifestHash: "manifest.hash",
  walrusBlob: "walrus.blob", // song manifest blob
  walrusAudio: "walrus.audio", // mirrored audio blob
  rightsContract: "rights.contract",
  url: "url",
} as const;

// Minimal ABIs for the pieces we call.
export const l2ResolverTextAbi = parseAbi([
  "function setText(bytes32 node, string key, string value)",
  "function text(bytes32 node, string key) view returns (string)",
]);
export const registrarRegisterAbi = parseAbi([
  "function register(string label, address owner, bytes[] records) returns (bytes32)",
]);

/** The node (namehash) of `<label>.<ENS_PARENT>`. */
export function songNode(label: string): Hex {
  return namehash(`${label}.${ENS_PARENT}`);
}

/**
 * Build the pre-encoded `setText` records that the registrar passes to L2Registry.createSubnode,
 * which runs them atomically against the new node at mint (plan §3). The new node's namehash is
 * computed from the label; each entry is encoded setText(node, key, value).
 */
export function buildSongTextRecords(
  label: string,
  values: { manifestHash: string; walrusBlob: string; walrusAudio: string; rightsContract: string; url: string },
): Hex[] {
  const node = songNode(label);
  const entries: [string, string][] = [
    [TEXT_KEYS.manifestHash, values.manifestHash],
    [TEXT_KEYS.walrusBlob, values.walrusBlob],
    [TEXT_KEYS.walrusAudio, values.walrusAudio],
    [TEXT_KEYS.rightsContract, values.rightsContract],
    [TEXT_KEYS.url, values.url],
  ];
  return entries.map(([key, value]) =>
    encodeFunctionData({ abi: l2ResolverTextAbi, functionName: "setText", args: [node, key, value] }),
  );
}
