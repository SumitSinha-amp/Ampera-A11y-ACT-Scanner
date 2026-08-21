/** All five UI-level identifiers for the accessibility scope selector. */
export const ALL_SCAN_LEVELS = ["A", "AA", "AAA", "WAI-ARIA", "Best Practice"] as const;
export type ScanLevel = (typeof ALL_SCAN_LEVELS)[number];
