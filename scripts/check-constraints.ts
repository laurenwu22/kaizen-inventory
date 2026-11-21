// Verifies the database rejects invalid quantity rules and accepts valid ones.
// Creates a throwaway cafe/section/item and removes it afterwards.
//   npm run db:check
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RuleType } from "../src/generated/prisma/client";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failures = 0;

async function expect(label: string, shouldSucceed: boolean, fn: () => Promise<unknown>) {
  let ok: boolean;
  try {
    await fn();
    ok = true;
  } catch {
    ok = false;
  }
  const pass = ok === shouldSucceed;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}`);
}

async function main() {
  const cafe = await prisma.cafe.create({ data: { name: `__check_${Date.now()}` } });
  try {
    const section = await prisma.section.create({ data: { cafeId: cafe.id, name: "Check" } });
    const item = await prisma.item.create({
      data: { sectionId: section.id, name: "Bananas", unit: "bunch" },
    });
    const itemId = item.id;
    const d = new Date("2027-02-13T00:00:00.000Z");

    await expect("default rule accepted", true, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.DEFAULT, min: 2, max: 4 } }));
    await expect("second default rejected", false, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.DEFAULT, min: 1, max: 3 } }));
    await expect("Saturday rule accepted", true, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.WEEKDAY, weekday: 6, min: 4, max: 6 } }));
    await expect("second Saturday rule rejected", false, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.WEEKDAY, weekday: 6, min: 1, max: 2 } }));
    await expect("date rule accepted", true, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.DATE, date: d, min: 5, max: 5 } }));
    await expect("second rule for same date rejected", false, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.DATE, date: d, min: 1, max: 2 } }));
    await expect("decimal min/max accepted", true, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.WEEKDAY, weekday: 1, min: 0.5, max: 1.5 } }));
    await expect("min > max rejected", false, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.WEEKDAY, weekday: 2, min: 5, max: 4 } }));
    await expect("negative min rejected", false, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.WEEKDAY, weekday: 3, min: -1, max: 4 } }));
    await expect("weekday 7 rejected", false, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.WEEKDAY, weekday: 7, min: 1, max: 2 } }));
    await expect("weekday rule without weekday rejected", false, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.WEEKDAY, min: 1, max: 2 } }));
    await expect("default rule with a date rejected", false, () =>
      prisma.quantityRule.create({ data: { itemId, type: RuleType.DEFAULT, date: d, min: 1, max: 2 } }));
    await expect("section weekday 9 rejected", false, () =>
      prisma.section.create({ data: { cafeId: cafe.id, name: "Bad days", daysOfWeek: [1, 9] } }));
    await expect("duplicate section name rejected", false, () =>
      prisma.section.create({ data: { cafeId: cafe.id, name: "Check" } }));
    await expect("duplicate item name in section rejected", false, () =>
      prisma.item.create({ data: { sectionId: section.id, name: "Bananas", unit: "bunch" } }));
    await expect("non-digit PIN rejected", false, () =>
      prisma.user.create({ data: { name: "__check", pin: "12ab" } }));
  } finally {
    const sections = await prisma.section.findMany({ where: { cafeId: cafe.id }, select: { id: true } });
    const sectionIds = sections.map((s) => s.id);
    await prisma.quantityRule.deleteMany({ where: { item: { sectionId: { in: sectionIds } } } });
    await prisma.item.deleteMany({ where: { sectionId: { in: sectionIds } } });
    await prisma.section.deleteMany({ where: { cafeId: cafe.id } });
    await prisma.cafe.delete({ where: { id: cafe.id } });
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
