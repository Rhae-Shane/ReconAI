import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./supabase/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});
