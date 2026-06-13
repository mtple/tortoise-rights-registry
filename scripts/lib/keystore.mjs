// Load the admin signing account from a forge keystore — NO raw private key in env or on disk.
// Shells out to `cast wallet decrypt-keystore`, which prompts (hidden) for the keystore password
// and returns the private key in-process only. Falls back to ADMIN_PRIVATE_KEY env if explicitly set
// (for CI), but the default + recommended path is the keystore.
//
// Usage:
//   const account = await loadAdminAccount();           // keystore "tortoise-admin"
//   const account = await loadAdminAccount("my-acct");

import { spawnSync } from "node:child_process";
import { privateKeyToAccount } from "viem/accounts";

export async function loadAdminAccount(name = process.env.ADMIN_KEYSTORE || "tortoise-admin") {
  // Escape hatch for non-interactive contexts (NOT recommended): a raw key in env.
  const envKey = process.env.ADMIN_PRIVATE_KEY;
  if (envKey) {
    return privateKeyToAccount(envKey.startsWith("0x") ? envKey : `0x${envKey}`);
  }

  // Decrypt the keystore interactively. `cast` prompts for the password on its own TTY;
  // inherit stdio for the prompt, but capture stdout (the key) via a pipe.
  const res = spawnSync("cast", ["wallet", "decrypt-keystore", name], {
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(
      `Could not decrypt keystore "${name}" (cast exited ${res.status}). ` +
        `Is it imported? \`cast wallet import ${name} --interactive\`. ` +
        `Or set ADMIN_PRIVATE_KEY for a non-interactive run.`,
    );
  }
  // cast prints e.g. `<name>'s private key is: 0xabc...`
  const m = (res.stdout || "").match(/0x[0-9a-fA-F]{64}/);
  if (!m) throw new Error(`Decrypted keystore but could not parse a private key from cast output.`);
  return privateKeyToAccount(m[0]);
}
