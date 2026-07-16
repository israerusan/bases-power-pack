import "obsidian";

// Obsidian's settings window is a real but undocumented API. Declare the minimal
// shape we use so openSettings() can call it without an inline double-cast.
declare module "obsidian" {
	interface App {
		setting?: {
			open(): void;
			openTabById(id: string): void;
		};
	}
}
