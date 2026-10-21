import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` writes SQL to ./drizzle; scripts/embed-migrations.mjs turns it into src/migrations.generated.ts.
export default defineConfig({ dialect: "sqlite", schema: "./src/schema.ts", out: "./drizzle" });
