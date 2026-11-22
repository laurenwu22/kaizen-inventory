"use server";

// Backup & transfer (managers only). The browser drives export and import in
// small steps so no single request or response is too large for the host.
// Every input is re-validated here; nothing from the browser is trusted.
import { z } from "zod";
import { requireManager } from "@/lib/auth/dal";
import { LastManagerError } from "@/lib/admin/employees";
import {
  additionSchema,
  basePayloadSchema,
  idMapsSchema,
  PARTS,
  submissionSchema,
  type ExportOptions,
} from "@/lib/transfer/format";
import { exportBase, exportHistoryPage } from "@/lib/transfer/export";
import {
  existingSubmissionIds,
  importAdditions,
  importBase,
  importSubmissions,
  previewBase,
  type BaseResult,
} from "@/lib/transfer/import";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const exportOptionsSchema = z.object({
  cafeIds: z.array(z.string().min(1).max(64)).min(1).max(200),
  parts: z.array(z.enum(PARTS)).min(1),
  from: ymd,
  to: ymd,
});
const modeSchema = z.enum(["keep", "update"]);

function options(raw: unknown): ExportOptions {
  return exportOptionsSchema.parse(raw);
}

export async function exportBaseAction(raw: unknown) {
  await requireManager();
  return exportBase(options(raw));
}

export async function exportHistoryAction(raw: unknown, cursor: string | null) {
  await requireManager();
  return exportHistoryPage(options(raw), cursor === null ? null : z.string().max(64).parse(cursor));
}

type BaseOutcome = { ok: true; result: BaseResult } | { ok: false; error: string };

function baseError(e: unknown): BaseOutcome {
  if (e instanceof LastManagerError) {
    return { ok: false, error: `${e.message} This file would leave no active manager, so nothing was changed.` };
  }
  throw e;
}

export async function previewImportAction(rawBase: unknown, rawMode: unknown): Promise<BaseOutcome> {
  await requireManager();
  try {
    return { ok: true, result: await previewBase(basePayloadSchema.parse(rawBase), modeSchema.parse(rawMode)) };
  } catch (e) {
    return baseError(e);
  }
}

export async function existingSubmissionsAction(rawIds: unknown): Promise<string[]> {
  await requireManager();
  return existingSubmissionIds(z.array(z.string().min(1).max(64)).max(5000).parse(rawIds));
}

export async function importBaseAction(rawBase: unknown, rawMode: unknown): Promise<BaseOutcome> {
  await requireManager();
  try {
    return { ok: true, result: await importBase(basePayloadSchema.parse(rawBase), modeSchema.parse(rawMode)) };
  } catch (e) {
    return baseError(e);
  }
}

export async function importSubmissionsAction(rawSubs: unknown, rawMaps: unknown) {
  await requireManager();
  return importSubmissions(z.array(submissionSchema).max(500).parse(rawSubs), idMapsSchema.parse(rawMaps));
}

export async function importAdditionsAction(rawAdds: unknown, rawMaps: unknown) {
  await requireManager();
  return importAdditions(z.array(additionSchema).max(20000).parse(rawAdds), idMapsSchema.parse(rawMaps));
}
