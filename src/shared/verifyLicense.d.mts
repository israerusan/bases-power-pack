export interface LicensePayload {
	product: string;
	email: string;
	issued: string;
}

export interface LicenseVerification {
	valid: boolean;
	email?: string;
	error?: string;
}

export function verifyLicense(
	licenseKey: string,
	product: string,
	publicKeyB64: string
): LicenseVerification;
