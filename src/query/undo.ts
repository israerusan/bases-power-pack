/**
 * Undo core — pure, DOM-free, and unit-tested. Bases Power Pack writes
 * frontmatter on the user's own notes (drag-to-move, bulk edit, column rename,
 * Move Rules). Every one of those writes is captured here as an *inverse* set of
 * writes so a single command can put the vault back the way it was. The view
 * layer applies the recorded inverses through the same transactional write path
 * it uses for forward edits.
 */

/** One frontmatter mutation — structurally compatible with viewData's PropertyWrite. */
export interface InverseWrite {
	key: string;
	value?: unknown;
	remove?: boolean;
}

interface UndoNote {
	path: string;
	writes: InverseWrite[];
}

export interface UndoEntry {
	label: string;
	notes: UndoNote[];
}

/**
 * The inverse of applying `writes` to a note whose current frontmatter is
 * `before`: for every key touched, restore its original value (or remove it if
 * it didn't exist). Deduped by key so a batch that writes the same key twice
 * still restores the single original value — never an intermediate one.
 */
export function invertWrites(
	before: Record<string, unknown>,
	writes: Array<{ key: string; value?: unknown; remove?: boolean }>
): InverseWrite[] {
	const seen = new Set<string>();
	const inverse: InverseWrite[] = [];
	for (const write of writes) {
		if (seen.has(write.key)) continue;
		seen.add(write.key);
		if (Object.prototype.hasOwnProperty.call(before, write.key)) {
			inverse.push({ key: write.key, value: cloneValue(before[write.key]) });
		} else {
			inverse.push({ key: write.key, remove: true });
		}
	}
	return inverse;
}

/**
 * Structured clone so a captured before-value can't be mutated later. Only plain
 * arrays/objects are recursed; a `Date`, a class instance, or any non-plain
 * object is returned as-is (recursing would flatten it to `{}` and lose data).
 */
function cloneValue(value: unknown): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(cloneValue);
	const proto = Object.getPrototypeOf(value) as unknown;
	if (proto !== Object.prototype && proto !== null) return value;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = cloneValue(v);
	return out;
}

/**
 * An open, reentrant undo batch. Each operation gets its own handle from
 * `beginBatch`, so two operations interleaving across `await` boundaries never
 * cross-contaminate — a note recorded against one handle can't leak into
 * another's. The handle is committed (pushed as one entry) via `commitBatch`.
 */
export class UndoBatch {
	readonly notes: UndoNote[] = [];
	constructor(readonly label: string) {}
}

/**
 * A bounded LIFO stack of undoable edits. A *batch* groups many single-note
 * writes (e.g. a column rename that rewrites 30 notes) into one entry so undo
 * reverts the whole operation at once. Writes made without a batch each become
 * their own entry.
 */
export class UndoManager {
	private stack: UndoEntry[] = [];

	constructor(private readonly limit = 25) {}

	/** Open a batch; pass the returned handle to each write's options, then commit. */
	beginBatch(label: string): UndoBatch {
		return new UndoBatch(label);
	}

	/** Push the batch as a single entry, keeping it only if it captured a note. */
	commitBatch(batch: UndoBatch): void {
		if (batch.notes.length > 0) this.push({ label: batch.label, notes: [...batch.notes] });
	}

	/**
	 * Record the inverse of a just-applied write. No-op for an empty inverse. With
	 * a `batch` handle the record joins that batch; without one it becomes its own
	 * single-note entry.
	 */
	record(label: string, path: string, inverse: InverseWrite[], batch?: UndoBatch): void {
		if (inverse.length === 0) return;
		if (batch) {
			batch.notes.push({ path, writes: inverse });
			return;
		}
		this.push({ label, notes: [{ path, writes: inverse }] });
	}

	private push(entry: UndoEntry): void {
		this.stack.push(entry);
		if (this.stack.length > this.limit) this.stack.shift();
	}

	canUndo(): boolean {
		return this.stack.length > 0;
	}

	/** The label of the edit undo would reverse next, or null when the stack is empty. */
	peekLabel(): string | null {
		return this.stack.length > 0 ? this.stack[this.stack.length - 1].label : null;
	}

	pop(): UndoEntry | null {
		return this.stack.pop() ?? null;
	}

	clear(): void {
		this.stack = [];
	}
}
