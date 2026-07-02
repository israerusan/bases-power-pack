import { verifyLicense, type LicenseVerification } from "../shared/verifyLicense.mjs";
import { LICENSE_PUBLIC_KEY } from "./publicKey";

export type { LicensePayload, LicenseVerification } from "../shared/verifyLicense.mjs";

/**
 * Thin product binding over the shared verifier (src/shared/verifyLicense.ts,
 * vendored from obsidian-plugin-core — edit it there, not here).
 *
 * TODO(billing): The *delivery* side (taking a payment, then emailing the key)
 * is handled out-of-band by Lemon Squeezy / Gumroad. After a sale, run:
 *     npm run license:generate -- customer@email.com
 * and send the key. No plugin code change is needed to wire a storefront.
 */
export class LicenseManager {
	private static readonly PRODUCT = "bases-power-pack";

	static verify(licenseKey: string): LicenseVerification {
		return verifyLicense(licenseKey, LicenseManager.PRODUCT, LICENSE_PUBLIC_KEY);
	}
}
