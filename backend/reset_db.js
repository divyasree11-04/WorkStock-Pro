import pool from "./db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resetDB() {
  try {
    console.log("  Resetting database — dropping all tables...");

    await pool.query(`
      DROP TABLE IF EXISTS stock_history CASCADE;
      DROP TABLE IF EXISTS batches CASCADE;
      DROP TABLE IF EXISTS vendors CASCADE;
      DROP TABLE IF EXISTS products CASCADE;
      DROP TABLE IF EXISTS employees CASCADE;
    `);

    console.log("  All tables dropped.");

    console.log(" Re-initializing schema...");
    const sqlPath = path.join(__dirname, "init_db.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);

    console.log("✅ Database reset complete — all tables are empty and ready.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Reset failed:", err);
    process.exit(1);
  }
}

resetDB();