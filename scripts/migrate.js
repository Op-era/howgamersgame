// One shot migration runner. Usage: node scripts/migrate.js <sql-file>
// Runs on the Fly machine where DATABASE_URL resolves.
const fs = require("fs");
const { Client } = require("pg");
(async () => {
  const file = process.argv[2];
  if (!file) { console.error("usage: node scripts/migrate.js <sql-file>"); process.exit(1); }
  const sql = fs.readFileSync(file, "utf8");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query(sql);
  console.log("MIGRATION OK:", file);
  await c.end();
})().catch(e => { console.error("MIGRATION FAILED:", e.message); process.exit(1); });
