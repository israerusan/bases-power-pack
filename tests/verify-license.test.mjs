import assert from "assert";
import nacl from "tweetnacl";
import { verifyLicense } from "../src/shared/verifyLicense.mjs";

// Exercise the ACTUAL vendored verifier with an ephemeral keypair — no
// gitignored signing key required, so this runs in CI and on fresh clones.
const keyPair = nacl.sign.keyPair();
const b64url = (bytes) =>
	Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const signKey = (payload) => {
	const bytes = new TextEncoder().encode(JSON.stringify(payload));
	const sig = nacl.sign.detached(bytes, keyPair.secretKey);
	return `${b64url(bytes)}.${b64url(sig)}`;
};
const publicKey = b64url(keyPair.publicKey);

const good = signKey({ product: "test-product", email: "test@example.com", issued: "2026-07-02" });

const ok = verifyLicense(good, "test-product", publicKey);
assert.equal(ok.valid, true, "correctly signed key must verify");
assert.equal(ok.email, "test@example.com", "email must round-trip");

const padded = verifyLicense(`  ${good}  `, "test-product", publicKey);
assert.equal(padded.valid, true, "surrounding whitespace is trimmed");

const wrongProduct = verifyLicense(good, "other-product", publicKey);
assert.equal(wrongProduct.valid, false, "keys are product-bound");
assert.equal(wrongProduct.error, "License is for a different product.");

const [payloadB64] = good.split(".");
const forged = `${payloadB64}.${b64url(new Uint8Array(64))}`;
const badSig = verifyLicense(forged, "test-product", publicKey);
assert.equal(badSig.valid, false, "forged signature must fail");
assert.equal(badSig.error, "Invalid license signature.");

assert.equal(verifyLicense("", "test-product", publicKey).error, "No license key provided.");
assert.equal(verifyLicense("not-a-key", "test-product", publicKey).error, "Invalid license format.");
assert.equal(
	verifyLicense("###.###", "test-product", publicKey).error,
	"Could not parse license key.",
	"garbage base64 is rejected, not thrown"
);

console.log("verify-license tests passed");
