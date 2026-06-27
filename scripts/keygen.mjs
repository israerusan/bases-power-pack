// Author-only one-time setup. Generates an Ed25519 keypair:
//   - writes the private (secret) key to scripts/.license-private.key (gitignored)
//   - prints the public key to paste into src/license/publicKey.ts
// Run once per project: node scripts/keygen.mjs
import fs from "fs";
import path from "path";
import nacl from "tweetnacl";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privateKeyPath = path.join(__dirname, ".license-private.key");

function toBase64(bytes) {
	return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

if (fs.existsSync(privateKeyPath)) {
	console.error("Refusing to overwrite existing scripts/.license-private.key. Delete it first if you really mean to rotate keys.");
	process.exit(1);
}

const pair = nacl.sign.keyPair();
fs.writeFileSync(privateKeyPath, toBase64(pair.secretKey), "utf8");

console.log("\nKeypair generated.");
console.log("Private key written to scripts/.license-private.key (keep secret, never commit).");
console.log("\nPaste this public key into src/license/publicKey.ts:\n");
console.log(`export const LICENSE_PUBLIC_KEY = "${toBase64(pair.publicKey)}";\n`);
