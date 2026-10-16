import { App, TFile } from "obsidian";
import { parseInlineFields } from "../query/inlineFields";
import { parseTasks, type TaskItem } from "../query/tasks";

/**
 * The body index — the piece that makes inline fields and task rows possible.
 *
 * Obsidian's metadata cache is synchronous but exposes only frontmatter, tags
 * and links; it never gives you the note TEXT. Everything Bases cannot see
 * (`key:: value`, `- [ ]` lines) lives in that text, so it has to be read and
 * cached ourselves.
 *
 * The cache is keyed by (mtime, size), so a steady-state refresh re-reads
 * nothing and a single note edit re-reads exactly one file. The first build
 * walks the vault once; reads go through `vault.cachedRead` and yield to the
 * UI every batch so a large vault doesn't freeze Obsidian.
 *
 * Off by default. When no feature needs it, the index is never built at all.
 */

export interface BodyEntry {
	mtime: number;
	size: number;
	inline: Record<string, unknown>;
	tasks: TaskItem[];
}

/** Files read per batch before yielding back to the event loop. */
const BATCH_SIZE = 64;

export class BodyIndex {
	private entries = new Map<string, BodyEntry>();
	private inFlight: Promise<boolean> | null = null;
	/** Bumped whenever a build changed anything, so the view cache can key off it. */
	private version = 0;
	/** Paths explicitly invalidated since the last build. */
	private dirty = new Set<string>();

	constructor(private readonly app: App) {}

	getVersion(): number {
		return this.version;
	}

	get(path: string): BodyEntry | undefined {
		return this.entries.get(path);
	}

	/** Drop one note's entry so the next build re-reads it. Marked dirty even if
	 * nothing was cached: the invalidation may be racing a build that is about to
	 * write a (now stale) entry for this very path. */
	invalidate(path: string): void {
		this.entries.delete(path);
		this.dirty.add(path);
	}

	/** Forget everything (feature turned off, or a vault-wide change). */
	clear(): void {
		this.dirty.clear();
		if (this.entries.size === 0) return;
		this.entries.clear();
		this.version++;
	}

	/**
	 * Bring the index up to date. Concurrent callers share one build — two views
	 * refreshing at once must not each walk the vault. Resolves to true when any
	 * entry changed, so the caller knows whether to invalidate its row cache.
	 */
	async ensure(): Promise<boolean> {
		if (this.inFlight) return this.inFlight;
		this.inFlight = this.buildUntilClean().finally(() => {
			this.inFlight = null;
		});
		return this.inFlight;
	}

	/**
	 * A note edited WHILE a build is walking the vault invalidates an entry the
	 * walk has already passed, so one pass can finish with that entry missing and
	 * no version bump — the view would then cache a result with the note's body
	 * data absent. Re-run while invalidations keep arriving (bounded, so a vault
	 * being edited continuously can't spin forever).
	 */
	private async buildUntilClean(): Promise<boolean> {
		let changed = false;
		for (let pass = 0; pass < 3; pass++) {
			changed = (await this.build()) || changed;
			if (this.dirty.size === 0) break;
		}
		return changed;
	}

	private async build(): Promise<boolean> {
		const files = this.app.vault.getMarkdownFiles();
		const live = new Set<string>();
		let changed = this.dirty.size > 0;
		this.dirty.clear();
		let sinceYield = 0;

		for (const file of files) {
			live.add(file.path);
			const prev = this.entries.get(file.path);
			if (prev && prev.mtime === file.stat.mtime && prev.size === file.stat.size) continue;
			const entry = await this.read(file);
			// Invalidated again while that read was in flight — drop what we just
			// built rather than caching content that is already out of date.
			if (this.dirty.has(file.path)) continue;
			this.entries.set(file.path, entry);
			changed = true;
			if (++sinceYield >= BATCH_SIZE) {
				sinceYield = 0;
				await yieldToUi();
			}
		}

		for (const path of [...this.entries.keys()]) {
			if (!live.has(path)) {
				this.entries.delete(path);
				changed = true;
			}
		}
		if (changed) this.version++;
		return changed;
	}

	private async read(file: TFile): Promise<BodyEntry> {
		// Stamp with the stat as it was BEFORE the read. `TFile.stat` is mutable
		// and the read is async, so taking it afterwards could brand old content
		// with the new file's mtime — and every later pass would then accept the
		// stale entry as current.
		const mtime = file.stat.mtime;
		const size = file.stat.size;
		let text = "";
		try {
			text = await this.app.vault.cachedRead(file);
		} catch {
			// A file that vanished mid-walk, or an unreadable one: index it as empty
			// rather than aborting the whole build.
			text = "";
		}
		return {
			mtime,
			size,
			inline: parseInlineFields(text),
			tasks: parseTasks(text, file.path, file.basename),
		};
	}
}

/** Hand control back to the UI between batches. */
function yieldToUi(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}
