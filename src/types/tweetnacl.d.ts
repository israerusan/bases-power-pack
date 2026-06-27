declare module "tweetnacl" {
	interface TweetNacl {
		sign: {
			detached: {
				verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean;
			};
		};
	}

	const nacl: TweetNacl;
	export default nacl;
}
