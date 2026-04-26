#!/usr/bin/env node
// Apply SQL files in supabase/migrations/ in order to the database
// pointed at by POSTGRES_URL_NON_POOLING in .env.local.
//
// Usage: node scripts/run-migrations.mjs

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");

// Tiny .env.local loader (no dotenv dep needed)
const envText = readFileSync(join(projectRoot, ".env.local"), "utf8");
for (const raw of envText.split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const key = line.slice(0, eq);
  let val = line.slice(eq + 1);
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  if (!process.env[key]) process.env[key] = val;
}

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error("Missing POSTGRES_URL_NON_POOLING in .env.local");
  process.exit(1);
}

const migrationsDir = join(projectRoot, "supabase", "migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Strip sslmode from URL — pg 8.20 treats sslmode=require as verify-full,
// which fails on Supabase's pooler cert chain. We pass ssl config in JS instead.
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "").replace(/[?&]uselibpqcompat=[^&]*/g, "");
const client = new pg.Client({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), "utf8");
    process.stdout.write(`Applying ${f}... `);
    await client.query(sql);
    console.log("ok");
  }
} catch (err) {
  console.error("\nMigration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}

console.log("All migrations applied.");
