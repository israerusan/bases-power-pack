export function setKanbanGroupValue(
	frontmatter: Record<string, unknown>,
	groupBy: string,
	columnName: string
): Record<string, unknown> {
	return {
		...frontmatter,
		[groupBy || "status"]: columnName,
	};
}

export function buildQuickAddPath(folder: string, title: string): string {
	const cleanFolder = trimSlashes(folder.trim());
	const cleanTitle = title.trim() || "Untitled";
	return cleanFolder ? `${cleanFolder}/${cleanTitle}.md` : `${cleanTitle}.md`;
}

export function buildQuickAddContent(groupBy: string, columnName: string, title: string): string {
	const key = groupBy || "status";
	const heading = title.trim() || `New ${columnName}`;
	// Quote the value so column names containing YAML-significant characters
	// (":", "[", "#", leading "@"/"*"/"&", …) still parse to the intended string.
	// JSON.stringify emits a valid YAML double-quoted scalar.
	return `---\n${key}: ${JSON.stringify(columnName)}\n---\n\n# ${heading}\n`;
}

export function buildQuickAddTitle(columnName: string, now: Date = new Date()): string {
	const yyyy = now.getFullYear();
	const mm = String(now.getMonth() + 1).padStart(2, "0");
	const dd = String(now.getDate()).padStart(2, "0");
	const hh = String(now.getHours()).padStart(2, "0");
	const mi = String(now.getMinutes()).padStart(2, "0");
	return `New ${columnName} ${yyyy}-${mm}-${dd} ${hh}-${mi}`;
}

function trimSlashes(value: string): string {
	return value.replace(/^[/\\]+|[/\\]+$/g, "");
}
