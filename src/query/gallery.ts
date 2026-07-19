/**
 * Gallery image-reference parsing. A cover-image frontmatter value can be a bare
 * path, a wikilink (`[[img.png]]` / `![[img.png]]`), a markdown image
 * (`![alt](path)`), a full URL, or a list of any of those. This resolves the raw
 * value to a normalized reference the view can turn into a resource URL. Pure, so
 * the (surprisingly fiddly) parsing is unit-tested rather than eyeballed.
 */

export interface ImageRef {
	kind: "url" | "vault";
	/** A URL to load directly, or a vault-relative link target to resolve. */
	ref: string;
}

/** Parse one string form into an ImageRef, or null if it isn't an image ref. */
function parseString(input: string): ImageRef | null {
	let s = input.trim();
	if (!s) return null;

	// Embedded / linked forms: unwrap to the inner target.
	const wiki = s.match(/^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
	if (wiki) s = wiki[1].trim();
	// Markdown image: capture the whole destination greedily (so a filename with its
	// own parentheses like `cover(1).png` isn't cut at the first `)`), then strip an
	// optional `"title"` / `'title'` suffix that markdown allows after the URL.
	const md = s.match(/^!?\[[^\]]*\]\((.+)\)$/);
	if (md) {
		s = md[1].trim();
		const titled = s.match(/^(.*\S)\s+["'][^"']*["']$/);
		if (titled) s = titled[1].trim();
	}

	// A markdown link can wrap the URL in angle brackets; strip surrounding quotes too.
	s = s.replace(/^<([^>]*)>$/, "$1").trim();
	s = s.replace(/^["']|["']$/g, "").trim();
	if (!s) return null;

	if (/^https?:\/\//i.test(s)) return { kind: "url", ref: s };
	// A `file:`/`data:` or protocol-relative ref is untrusted noise for a vault
	// gallery — only http(s) URLs and vault paths are honored.
	if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//")) return null;
	return { kind: "vault", ref: s };
}

/**
 * Resolve a frontmatter value to a single image reference. Arrays are searched in
 * order for the first usable entry. Returns null when there's no image.
 */
export function parseImageRef(value: unknown): ImageRef | null {
	if (typeof value === "string") return parseString(value);
	if (Array.isArray(value)) {
		for (const item of value) {
			const ref = typeof item === "string" ? parseString(item) : null;
			if (ref) return ref;
		}
	}
	return null;
}
