-- AlterTable
ALTER TABLE "SubmissionLine" ADD COLUMN     "wellStocked" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "currentCount" DROP NOT NULL;


-- A line is either counted (has a count) or marked "Plenty" (no count, orders nothing).
ALTER TABLE "SubmissionLine" ADD CONSTRAINT "SubmissionLine_well_stocked_check" CHECK (
  ("wellStocked" = false AND "currentCount" IS NOT NULL) OR
  ("wellStocked" = true AND "currentCount" IS NULL AND "autoOrder" = 0 AND "finalOrder" = 0)
);
