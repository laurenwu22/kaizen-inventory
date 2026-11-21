/** Today's latest submitted line for an item (used to pre-fill counting). */
export type SubmittedEntry = {
  count: number | null;
  finalOrder: number;
  manuallyEdited: boolean;
  plenty: boolean;
  by: string; // first name
  at: string; // ISO
};
