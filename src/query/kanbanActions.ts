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

export function buildQuickAddTitle(columnName: string, now: Date = new Date()): string {
	const yyyy = now.getFullYear();
	const mm = String(now.getMonth() + 1).padStart(2, "0");
	const dd = String(now.getDate()).padStart(2, "0");
	const hh = String(now.getHours()).padStart(2, "0");
	const mi = String(now.getMinutes()).padStart(2, "0");
	return `New ${columnName} ${yyyy}-${mm}-${dd} ${hh}-${mi}`;
}
