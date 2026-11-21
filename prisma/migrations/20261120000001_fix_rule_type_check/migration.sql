-- Fix: "weekday" BETWEEN 0 AND 6 is NULL (not false) when weekday is NULL, and
-- CHECK constraints pass on NULL, so WEEKDAY rules without a weekday got through.
ALTER TABLE "QuantityRule" DROP CONSTRAINT "QuantityRule_type_fields_check";
ALTER TABLE "QuantityRule" ADD CONSTRAINT "QuantityRule_type_fields_check" CHECK (
  ("type" = 'DEFAULT' AND "weekday" IS NULL AND "date" IS NULL) OR
  ("type" = 'WEEKDAY' AND "weekday" IS NOT NULL AND "weekday" BETWEEN 0 AND 6 AND "date" IS NULL) OR
  ("type" = 'DATE'    AND "weekday" IS NULL AND "date" IS NOT NULL)
);
