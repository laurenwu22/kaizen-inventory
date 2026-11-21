-- CreateTable
CREATE TABLE "DayAddition" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "sectionId" TEXT,
    "itemId" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DayAddition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DayAddition_cafeId_businessDate_idx" ON "DayAddition"("cafeId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "DayAddition_cafeId_businessDate_sectionId_itemId_key" ON "DayAddition"("cafeId", "businessDate", "sectionId", "itemId") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "DayAddition" ADD CONSTRAINT "DayAddition_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayAddition" ADD CONSTRAINT "DayAddition_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayAddition" ADD CONSTRAINT "DayAddition_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayAddition" ADD CONSTRAINT "DayAddition_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The unique index above was edited to NULLS NOT DISTINCT so a section (or
-- item) can only be added once per cafe per day.

-- Exactly one of section / item.
ALTER TABLE "DayAddition" ADD CONSTRAINT "DayAddition_one_target_check"
  CHECK (("sectionId" IS NULL) <> ("itemId" IS NULL));
