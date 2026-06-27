// Author-only tool. Requires scripts/.license-private.key (never commit or publish).
// Usage: npm run license:generate -- customer@email.com
import fs from "fs";
import path from "path";
import nacl from "tweetnacl";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privateKeyPath = path.join(__dirname, ".license-private.key");
const PRODUCT = "bases-power-pack";

function toBase64(bytes) {
	return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64(value) {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	return new Uint8Array(Buffer.from(padded, "base64"));
}

const email = process.argv[2];
if (!email) {
	console.error("Usage: npm run license:generate -- customer@email.com");
	process.exit(1);
}

if (!fs.existsSync(privateKeyPath)) {
	console.error("Missing scripts/.license-private.key — run scripts/keygen.mjs first.");
	process.exit(1);
}

const secretKey = fromBase64(fs.readFileSync(privateKeyPath, "utf8").trim());
const payload = {
	product: PRODUCT,
	email,
	issued: new Date().toISOString(),
};
const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
const signature = nacl.sign.detached(payloadBytes, secretKey);
const licenseKey = `${toBase64(payloadBytes)}.${toBase64(signature)}`;

console.log("\nBases Power Pack — premium license\n");
console.log(`Email: ${email}`);
console.log(`Key:   ${licenseKey}\n`);
