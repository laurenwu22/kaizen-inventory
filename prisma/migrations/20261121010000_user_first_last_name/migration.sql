-- Split User.name into firstName and lastName.
-- Existing rows: first word -> firstName, the rest -> lastName ("Lauren Wu" -> "Lauren", "Wu").
ALTER TABLE "User" ADD COLUMN "firstName" TEXT, ADD COLUMN "lastName" TEXT;

UPDATE "User" SET
  "firstName" = split_part(btrim("name"), ' ', 1),
  "lastName"  = btrim(substr(btrim("name"), length(split_part(btrim("name"), ' ', 1)) + 1));

ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL, ALTER COLUMN "lastName" SET NOT NULL;
ALTER TABLE "User" DROP COLUMN "name";

-- Names can't be blank.
ALTER TABLE "User" ADD CONSTRAINT "User_firstName_not_blank_check" CHECK (btrim("firstName") <> '');
ALTER TABLE "User" ADD CONSTRAINT "User_lastName_not_blank_check" CHECK (btrim("lastName") <> '');
