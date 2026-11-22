// Backup & transfer file format (version 1). Shared by the browser (reading a
// file and showing what's in it) and the server (validating every chunk).
//
// IDs and timestamps are kept exactly, so history imports back unchanged.
// Dates are "YYYY-MM-DD" (LA calendar dates); instants are ISO strings.
import { z } from "zod";

export const FORMAT = "kaizen-inventory-backup";
export const VERSION = 1;

export const PARTS = ["people", "sections", "history"] as const;
export type Part = (typeof PARTS)[number];
export const PART_LABELS: Record<Part, string> = {
  people: "People and roles",
  sections: "Sections and items",
  history: "Order history",
};

/** History refers to items and people, so it always brings them along. */
export function withDependencies(parts: Iterable<Part>): Set<Part> {
  const s = new Set(parts);
  if (s.has("history")) {
    s.add("people");
    s.add("sections");
  }
  return s;
}

const id = z.string().min(1).max(64);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.string().datetime({ offset: true });
const name = z.string().min(1).max(200);
const qty = z.number().finite().min(0).max(99999999);

export const cafeSchema = z.object({ id, name, createdAt: instant });

export const personSchema = z.object({
  id,
  firstName: name,
  lastName: name,
  pin: z.string().regex(/^\d{3,8}$/),
  active: z.boolean(),
  isManager: z.boolean(),
  createdAt: instant,
  memberships: z.array(z.object({ cafeId: id, role: z.enum(["EMPLOYEE", "ADMIN"]), createdAt: instant })),
});

export const ruleSchema = z.object({
  type: z.enum(["DEFAULT", "WEEKDAY", "DATE"]),
  weekday: z.number().int().min(0).max(6).nullable(),
  date: ymd.nullable(),
  min: qty,
  max: qty,
});

export const itemSchema = z.object({
  id,
  name,
  unit: z.string().max(100),
  sortOrder: z.number().int(),
  active: z.boolean(),
  createdAt: instant,
  rules: z.array(ruleSchema),
});

export const sectionSchema = z.object({
  id,
  cafeId: id,
  name,
  color: z.string().max(20),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  sortOrder: z.number().int(),
  active: z.boolean(),
  createdAt: instant,
  extraDates: z.array(ymd),
  items: z.array(itemSchema),
});

export const lineSchema = z.object({
  itemId: id,
  currentCount: qty.nullable(),
  autoOrder: qty,
  finalOrder: qty,
  manuallyEdited: z.boolean(),
  wellStocked: z.boolean(),
});

export const submissionSchema = z.object({
  id,
  cafeId: id,
  userId: id,
  businessDate: ymd,
  submittedAt: instant,
  lines: z.array(lineSchema),
});

export const additionSchema = z.object({
  cafeId: id,
  businessDate: ymd,
  sectionId: id.nullable(),
  itemId: id.nullable(),
  addedById: id,
  createdAt: instant,
});

export const backupSchema = z.object({
  format: z.literal(FORMAT),
  version: z.number().int(),
  exportedAt: instant,
  parts: z.array(z.enum(PARTS)),
  historyRange: z.object({ from: ymd.nullable(), to: ymd.nullable() }).nullable(),
  cafes: z.array(cafeSchema),
  people: z.array(personSchema),
  sections: z.array(sectionSchema),
  submissions: z.array(submissionSchema),
  additions: z.array(additionSchema),
});

export type BackupCafe = z.infer<typeof cafeSchema>;
export type BackupPerson = z.infer<typeof personSchema>;
export type BackupSection = z.infer<typeof sectionSchema>;
export type BackupSubmission = z.infer<typeof submissionSchema>;
export type BackupAddition = z.infer<typeof additionSchema>;
export type Backup = z.infer<typeof backupSchema>;

/** The parts of a backup imported in one go (everything except submissions). */
export const basePayloadSchema = z.object({
  cafes: z.array(cafeSchema),
  people: z.array(personSchema),
  sections: z.array(sectionSchema),
});
export type BasePayload = z.infer<typeof basePayloadSchema>;

/** File id -> id in this database, for records the history refers to. */
export const idMapsSchema = z.object({
  cafes: z.record(z.string(), z.string()),
  people: z.record(z.string(), z.string()),
  items: z.record(z.string(), z.string()),
  sections: z.record(z.string(), z.string()),
});
export type IdMaps = z.infer<typeof idMapsSchema>;

export type ExportOptions = { cafeIds: string[]; parts: Part[]; from: string | null; to: string | null };

/**
 * Reads a backup file's text. Returns the backup or a message for the person.
 * Files from a newer version of the app are refused rather than half-read.
 */
export function parseBackup(text: string): { backup: Backup } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "This file isn't a Kaizen backup (it couldn't be read)." };
  }
  if (!raw || typeof raw !== "object" || (raw as { format?: unknown }).format !== FORMAT) {
    return { error: "This file isn't a Kaizen backup." };
  }
  const version = (raw as { version?: unknown }).version;
  if (typeof version === "number" && version > VERSION) {
    return { error: "This backup was made by a newer version of the app. Update this site first, then import it." };
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `This backup is damaged or incomplete (${issue.path.join(".") || "file"}: ${issue.message}).` };
  }
  return { backup: parsed.data };
}

/**
 * Narrows a backup to the chosen cafes and parts (with dependencies). Used
 * before import so only what the person picked is sent.
 */
export function selectFromBackup(backup: Backup, cafeIds: Iterable<string>, parts: Iterable<Part>) {
  const cafes = new Set(cafeIds);
  const want = withDependencies(parts);
  const referenced = referencedPeople(backup, cafes, want);
  const people = want.has("people")
    ? backup.people
        .map((p) => ({ ...p, memberships: p.memberships.filter((m) => cafes.has(m.cafeId)) }))
        // Keep people who work at a chosen cafe, managers, and anyone the
        // chosen history refers to.
        .filter((p) => p.memberships.length > 0 || p.isManager || referenced.has(p.id))
    : [];
  return {
    base: {
      cafes: backup.cafes.filter((c) => cafes.has(c.id)),
      people,
      sections: want.has("sections") ? backup.sections.filter((s) => cafes.has(s.cafeId)) : [],
    } satisfies BasePayload,
    submissions: want.has("history") ? backup.submissions.filter((s) => cafes.has(s.cafeId)) : [],
    additions: want.has("history") ? backup.additions.filter((a) => cafes.has(a.cafeId)) : [],
  };
}

function referencedPeople(backup: Backup, cafes: Set<string>, want: Set<Part>): Set<string> {
  const ids = new Set<string>();
  if (!want.has("history")) return ids;
  for (const s of backup.submissions) if (cafes.has(s.cafeId)) ids.add(s.userId);
  for (const a of backup.additions) if (cafes.has(a.cafeId)) ids.add(a.addedById);
  return ids;
}

/** Splits submissions into batches small enough for one request (~600 KB). */
export function batchSubmissions(subs: BackupSubmission[], maxBytes = 600_000, maxCount = 150): BackupSubmission[][] {
  const batches: BackupSubmission[][] = [];
  let cur: BackupSubmission[] = [];
  let size = 0;
  for (const s of subs) {
    const n = JSON.stringify(s).length;
    if (cur.length > 0 && (size + n > maxBytes || cur.length >= maxCount)) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(s);
    size += n;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

export function countBackup(b: Pick<Backup, "cafes" | "people" | "sections" | "submissions">) {
  return {
    cafes: b.cafes.length,
    people: b.people.length,
    sections: b.sections.length,
    items: b.sections.reduce((n, s) => n + s.items.length, 0),
    submissions: b.submissions.length,
  };
}

/** Why a submission can't be imported with these maps, or null if it can. */
export function submissionProblem(s: BackupSubmission, maps: IdMaps): string | null {
  if (!maps.cafes[s.cafeId]) return "its cafe wasn't imported";
  if (!maps.people[s.userId]) return "the person who submitted it wasn't imported";
  if (s.lines.some((l) => !maps.items[l.itemId])) return "some of its items weren't imported";
  return null;
}
