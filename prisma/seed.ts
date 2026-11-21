// Seeds the cafes and the first admin. Safe to run repeatedly.
//
//   npx prisma db seed                 cafes + first admin
//   npx prisma db seed -- --sample     also adds sample sections/items/rules
//
// Requires SEED_ADMIN_PIN in .env (never commit it). SEED_ADMIN_FIRST_NAME and
// SEED_ADMIN_LAST_NAME are optional.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role, RuleType } from "../src/generated/prisma/client";

const CAFES = ["Kaizen Flagship", "Kaizen Commons", "Luma"];

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function seedCafesAndAdmin() {
  const firstName = process.env.SEED_ADMIN_FIRST_NAME?.trim() || "Lauren";
  const lastName = process.env.SEED_ADMIN_LAST_NAME?.trim() || "Wu";
  const adminPin = process.env.SEED_ADMIN_PIN?.trim();
  if (!adminPin || !/^\d{3,8}$/.test(adminPin)) {
    throw new Error("Set SEED_ADMIN_PIN in .env to a 3-8 digit PIN");
  }

  const cafes = [];
  for (const name of CAFES) {
    cafes.push(await prisma.cafe.upsert({ where: { name }, update: {}, create: { name } }));
  }

  const existing = await prisma.user.findUnique({ where: { pin: adminPin } });
  if (existing && (existing.firstName !== firstName || existing.lastName !== lastName)) {
    throw new Error(
      `PIN already belongs to "${existing.firstName} ${existing.lastName}". Pick another SEED_ADMIN_PIN.`,
    );
  }
  const admin = await prisma.user.upsert({
    where: { pin: adminPin },
    update: { active: true },
    create: { firstName, lastName, pin: adminPin },
  });

  for (const cafe of cafes) {
    await prisma.userCafe.upsert({
      where: { userId_cafeId: { userId: admin.id, cafeId: cafe.id } },
      update: { role: Role.ADMIN },
      create: { userId: admin.id, cafeId: cafe.id, role: Role.ADMIN },
    });
  }

  console.log(`Cafes: ${cafes.map((c) => c.name).join(", ")}`);
  console.log(`Admin: ${admin.firstName} ${admin.lastName} (ADMIN at all ${cafes.length} cafes)`);
  return cafes;
}

type SampleItem = {
  name: string;
  unit: string;
  min: number;
  max: number;
  weekdays?: { days: number[]; min: number; max: number };
  date?: { date: string; min: number; max: number };
};

const SAMPLE: { name: string; color: string; days: number[]; items: SampleItem[] }[] = [
  {
    name: "Perishables",
    color: "#6b8f71",
    days: [1, 3, 5], // Mon, Wed, Fri
    items: [
      {
        name: "Bananas",
        unit: "bunch",
        min: 2,
        max: 4,
        weekdays: { days: [5, 6, 0], min: 3, max: 6 }, // Fri-Sun
        date: { date: "2027-02-13", min: 5, max: 5 },
      },
      { name: "Cucumber", unit: "gallon", min: 1, max: 3 },
      { name: "Lemons", unit: "bag", min: 1, max: 2 },
      { name: "Mint", unit: "bunch", min: 0.5, max: 2 },
    ],
  },
  {
    name: "Sauce Ingredients",
    color: "#b8694a",
    days: [1, 4], // Mon, Thu
    items: [
      { name: "Brown sugar", unit: "bag", min: 1, max: 3 },
      { name: "Vanilla extract", unit: "bottle", min: 1, max: 2 },
    ],
  },
  {
    name: "Milk",
    color: "#4f7896",
    days: [0, 1, 2, 3, 4, 5, 6],
    items: [
      { name: "Whole", unit: "gallon", min: 10, max: 30 },
      { name: "Oat", unit: "carton", min: 6, max: 18 },
      { name: "Almond", unit: "carton", min: 2, max: 6 },
    ],
  },
];

async function seedSample(cafeId: string) {
  for (const [i, s] of SAMPLE.entries()) {
    const section = await prisma.section.upsert({
      where: { cafeId_name: { cafeId, name: s.name } },
      update: {},
      create: { cafeId, name: s.name, color: s.color, daysOfWeek: s.days, sortOrder: i },
    });
    for (const [j, it] of s.items.entries()) {
      const item = await prisma.item.upsert({
        where: { sectionId_name: { sectionId: section.id, name: it.name } },
        update: {},
        create: { sectionId: section.id, name: it.name, unit: it.unit, sortOrder: j },
      });
      // Only create rules for new items so re-running doesn't fight admin edits.
      if ((await prisma.quantityRule.count({ where: { itemId: item.id } })) > 0) continue;
      await prisma.quantityRule.create({
        data: { itemId: item.id, type: RuleType.DEFAULT, min: it.min, max: it.max },
      });
      for (const weekday of it.weekdays?.days ?? []) {
        await prisma.quantityRule.create({
          data: {
            itemId: item.id,
            type: RuleType.WEEKDAY,
            weekday,
            min: it.weekdays!.min,
            max: it.weekdays!.max,
          },
        });
      }
      if (it.date) {
        await prisma.quantityRule.create({
          data: {
            itemId: item.id,
            type: RuleType.DATE,
            date: new Date(`${it.date.date}T00:00:00.000Z`),
            min: it.date.min,
            max: it.date.max,
          },
        });
      }
    }
  }
  console.log("Sample sections and items added to the first cafe.");
}

async function main() {
  const cafes = await seedCafesAndAdmin();
  if (process.argv.includes("--sample")) await seedSample(cafes[0].id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
