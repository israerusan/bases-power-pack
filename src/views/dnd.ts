/**
 * Drag-and-drop MIME types, defined once. These strings are matched by exact
 * value in dragover/drop handlers, so a single source of truth prevents a typo
 * in one view from silently breaking a drop with no compile-time catch.
 */
export const DND_ROW = "application/x-bpp-row";
export const DND_COLUMN = "application/x-bpp-column";
export const DND_TREE = "application/x-bpp-tree";
