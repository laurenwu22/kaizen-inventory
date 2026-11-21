import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (migrations, seed, studio) uses Neon's DIRECT (unpooled) connection.
// The app at runtime uses the pooled DATABASE_URL via the pg driver adapter
// (see src/lib/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
