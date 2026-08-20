import pool from "./db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDB() {
  try {
    console.log("Initializing database schema...");
    const sqlPath = path.join(__dirname, "init_db.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await pool.query(sql);
    console.log("Database schema initialized successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Error initializing database:", err);
    process.exit(1);
  }
}

initDB();
