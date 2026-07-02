import nacl from "tweetnacl";

/**
 * Offline Ed25519 license verification shared by all plugins in this
 * portfolio. Keys are `base64url(payload).base64url(signature)`; the payload
 * is JSON with a `product` field that must match the calling plugin, so keys
 * are never cross-compatible between products.
 *
 * CANONICAL COPY: obsidian-plugin-core/shared/verifyLicense.mjs (+ .d.mts).
 * Plugins vendor these files via `npm run sync:shared` — edit them there,
 * never in a plugin repo, or the copies drift (that's how the last licensing
 * bug happened twice). Plain .mjs so each plugin's Node test suite exercises
 * this exact code with ephemeral keypairs — no signing key required.
 */
export function verifyLicense(licenseKey, product, publicKeyB64) {
	const trimmed = String(licenseKey ?? "").trim();
	if (!trimmed) {
		return { valid: false, error: "No license key provided." };
	}

	const parts = trimmed.split(".");
	if (parts.length !== 2) {
		return { valid: false, error: "Invalid license format." };
	}

	try {
		const payloadBytes = base64ToBytes(parts[0]);
		const signature = base64ToBytes(parts[1]);
		const publicKey = base64ToBytes(publicKeyB64);

		if (!nacl.sign.detached.verify(payloadBytes, signature, publicKey)) {
			return { valid: false, error: "Invalid license signature." };
		}

		const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
		if (payload.product !== product) {
			return { valid: false, error: "License is for a different product." };
		}

		return { valid: true, email: payload.email };
	} catch {
		return { valid: false, error: "Could not parse license key." };
	}
}

function base64ToBytes(value) {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
