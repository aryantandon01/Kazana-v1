/**
 * Company level bands (L1–L9) — the single vocabulary shared by the Share form,
 * the reports API validation, and the browse filters, so they cannot drift.
 */

export const REPORT_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];

/** react-select options for the same bands ({ value, label }). */
export const REPORT_LEVEL_OPTIONS = REPORT_LEVELS.map((level) => ({ value: level, label: level }));
