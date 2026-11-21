/** Today's latest submitted line for an item (used to pre-fill counting). */
export type SubmittedEntry = {
  count: number | null;
  finalOrder: number;
  manuallyEdited: boolean;
  plenty: boolean;
  by: string; // first name
  at: string; // ISO
};

/** Sections/items added to a cafe's count for a day (shared once submitted). */
export type SharedAdditions = {
  /** sectionId -> first name of who added it */
  sections: Record<string, string>;
  /** itemId -> first name of who added it */
  items: Record<string, string>;
};
