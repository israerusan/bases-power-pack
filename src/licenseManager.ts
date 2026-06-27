import { requestUrl } from "obsidian";

/**
 * LicenseManager
 * -------------------------------------------------------------------------
 * Open-core license gate. Validates a license key against a configurable
 * validation endpoint. The network call is currently STUBBED/MOCKED so the
 * plugin is fully usable in development without a billing backend.
 *
 * TODO(billing): Wire this to Lemon Squeezy or Gumroad license-key validation.
 *   - Lemon Squeezy: POST https://api.lemonsqueezy.com/v1/licenses/validate
 *       body: { license_key, instance_name }
 *       -> response.valid === true
 *   - Gumroad: POST https://api.gumroad.com/v2/licenses/verify
 *       body: { product_id, license_key }
 *       -> response.success === true
 *   Replace `mockValidate()` below with a real `requestUrl(...)` call and map
 *   the provider response onto LicenseStatus.
 */

export interface LicenseStatus {
  valid: boolean;
  /** Optional human-readable note shown in settings. */
  message?: string;
  /** Epoch ms of last successful validation. */
  lastCheckedAt?: number;
}

export interface LicenseConfig {
  /** Validation endpoint. Configurable so self-hosters can point elsewhere. */
  endpoint: string;
  /** The user's license key. Empty string = lite tier. */
  licenseKey: string;
}

export class LicenseManager {
  private status: LicenseStatus = { valid: false };
  private config: LicenseConfig;

  constructor(config: LicenseConfig) {
    this.config = config;
  }

  /** Update config (e.g. after the user edits settings). */
  setConfig(config: Partial<LicenseConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Returns the cached premium state. Cheap, synchronous, call anywhere. */
  isPremium(): boolean {
    return this.status.valid;
  }

  getStatus(): LicenseStatus {
    return this.status;
  }

  /**
   * Validate the current license key against the endpoint.
   * Resolves to the new status and caches it for synchronous isPremium() checks.
   */
  async validate(): Promise<LicenseStatus> {
    const key = (this.config.licenseKey || "").trim();
    if (!key) {
      this.status = { valid: false, message: "No license key — running lite tier." };
      return this.status;
    }

    try {
      const result = await this.mockValidate(key);
      this.status = {
        valid: result.valid,
        message: result.valid ? "License active — premium unlocked." : "License key not valid.",
        lastCheckedAt: Date.now(),
      };
    } catch (err) {
      // Fail closed (lite) but keep the plugin usable.
      this.status = {
        valid: false,
        message: `Could not reach license server: ${(err as Error).message}`,
      };
    }
    return this.status;
  }

  /**
   * STUB validation. Accepts any key that looks like a real license
   * (prefix "PREMIUM-" or length >= 16) so premium features can be exercised
   * locally. Replace with a real network call — see TODO(billing) above.
   */
  private async mockValidate(key: string): Promise<{ valid: boolean }> {
    // Demonstrates the intended network shape without hitting a real server.
    // When wiring real billing, swap this block for:
    //
    //   const res = await requestUrl({
    //     url: this.config.endpoint,
    //     method: "POST",
    //     contentType: "application/json",
    //     body: JSON.stringify({ license_key: key }),
    //   });
    //   return { valid: res.json?.valid === true };
    void requestUrl; // keep the import referenced for the real implementation
    const looksValid = key.startsWith("PREMIUM-") || key.length >= 16;
    return Promise.resolve({ valid: looksValid });
  }
}
