-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'ADMIN');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('DEFAULT', 'WEEKDAY', 'DATE');

-- CreateTable
CREATE TABLE "Cafe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cafe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCafe" (
    "userId" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCafe_pkey" PRIMARY KEY ("userId","cafeId")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionExtraDate" (
    "sectionId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "SectionExtraDate_pkey" PRIMARY KEY ("sectionId","date")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantityRule" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "RuleType" NOT NULL,
    "weekday" INTEGER,
    "date" DATE,
    "min" DECIMAL(10,2) NOT NULL,
    "max" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuantityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionLine" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "currentCount" DECIMAL(10,2) NOT NULL,
    "autoOrder" DECIMAL(10,2) NOT NULL,
    "finalOrder" DECIMAL(10,2) NOT NULL,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SubmissionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cafe_name_key" ON "Cafe"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_pin_key" ON "User"("pin");

-- CreateIndex
CREATE INDEX "UserCafe_cafeId_idx" ON "UserCafe"("cafeId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_cafeId_name_key" ON "Section"("cafeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_sectionId_name_key" ON "Item"("sectionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "QuantityRule_itemId_type_weekday_date_key" ON "QuantityRule"("itemId", "type", "weekday", "date") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "Submission_cafeId_businessDate_idx" ON "Submission"("cafeId", "businessDate");

-- CreateIndex
CREATE INDEX "Submission_cafeId_submittedAt_idx" ON "Submission"("cafeId", "submittedAt");

-- CreateIndex
CREATE INDEX "SubmissionLine_itemId_idx" ON "SubmissionLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionLine_submissionId_itemId_key" ON "SubmissionLine"("submissionId", "itemId");

-- AddForeignKey
ALTER TABLE "UserCafe" ADD CONSTRAINT "UserCafe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCafe" ADD CONSTRAINT "UserCafe_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionExtraDate" ADD CONSTRAINT "SectionExtraDate_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityRule" ADD CONSTRAINT "QuantityRule_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionLine" ADD CONSTRAINT "SubmissionLine_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionLine" ADD CONSTRAINT "SubmissionLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written constraints (Prisma schema language can't express these).
-- Prisma ignores CHECK constraints when diffing, so they survive later migrations.
-- ---------------------------------------------------------------------------

-- The QuantityRule unique index above was edited to NULLS NOT DISTINCT, giving
-- one DEFAULT, one rule per weekday, and one rule per date for each item.

-- Each rule type uses exactly the right fields.
ALTER TABLE "QuantityRule" ADD CONSTRAINT "QuantityRule_type_fields_check" CHECK (
  ("type" = 'DEFAULT' AND "weekday" IS NULL AND "date" IS NULL) OR
  ("type" = 'WEEKDAY' AND "weekday" BETWEEN 0 AND 6 AND "date" IS NULL) OR
  ("type" = 'DATE'    AND "weekday" IS NULL AND "date" IS NOT NULL)
);

-- 0 <= min <= max
ALTER TABLE "QuantityRule" ADD CONSTRAINT "QuantityRule_min_max_check"
  CHECK ("min" >= 0 AND "min" <= "max");

-- Section weekdays are 0-6.
ALTER TABLE "Section" ADD CONSTRAINT "Section_daysOfWeek_check"
  CHECK ("daysOfWeek" <@ ARRAY[0,1,2,3,4,5,6]);

-- PINs are digits only.
ALTER TABLE "User" ADD CONSTRAINT "User_pin_digits_check" CHECK ("pin" ~ '^[0-9]+$');

-- Counts and order amounts are never negative.
ALTER TABLE "SubmissionLine" ADD CONSTRAINT "SubmissionLine_nonnegative_check"
  CHECK ("currentCount" >= 0 AND "autoOrder" >= 0 AND "finalOrder" >= 0);
