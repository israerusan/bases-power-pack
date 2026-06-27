import nacl from "tweetnacl";
import { LICENSE_PUBLIC_KEY } from "./publicKey";

/**
 * Offline license verification (Ed25519).
 * ---------------------------------------------------------------------------
 * A license key is `base64url(payload).base64url(signature)`. The signature is
 * produced by the author with the matching private key (see
 * scripts/generate-license.mjs) and verified here against the embedded public
 * key. No network, no account, no server — verification is fully local.
 *
 * This mirrors the proven approach in the Vault Spotlight plugin.
 *
 * TODO(billing): The *delivery* side (taking a payment, then emailing the key)
 * is handled out-of-band by Lemon Squeezy / Gumroad. After a sale, run:
 *     npm run license:generate -- customer@email.com
 * and send the key. No plugin code change is needed to wire a storefront.
 */
export interface LicensePayload {
	product: string;
	email: string;
	issued: string;
}

export class LicenseManager {
	private static readonly PRODUCT = "bases-power-pack";

	static verify(licenseKey: string): { valid: boolean; email?: string; error?: string } {
		const trimmed = licenseKey.trim();
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
			const publicKey = base64ToBytes(LICENSE_PUBLIC_KEY);

			if (!nacl.sign.detached.verify(payloadBytes, signature, publicKey)) {
				return { valid: false, error: "Invalid license signature." };
			}

			const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as LicensePayload;
			if (payload.product !== LicenseManager.PRODUCT) {
				return { valid: false, error: "License is for a different product." };
			}

			return { valid: true, email: payload.email };
		} catch {
			return { valid: false, error: "Could not parse license key." };
		}
	}
}

function base64ToBytes(value: string): Uint8Array {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
