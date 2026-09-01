import pool from "./db.js";
import { formatEmployeeCode } from "./sync.js";

async function runMigration() {
  try {
    console.log("Starting database migration for employee ID codes...");

    // 1. Fetch all employees
    const result = await pool.query("SELECT employee_id, role, employee_id_code, email, name FROM employees");
    console.log(`Found ${result.rows.length} employee records to process.`);

    let updatedCount = 0;

    for (const emp of result.rows) {
      const currentCode = emp.employee_id_code;
      if (!currentCode) continue;

      const newCode = formatEmployeeCode(emp.role, currentCode);

      if (newCode !== currentCode) {
        console.log(`Updating ${emp.name} (${emp.email}): ${currentCode} -> ${newCode}`);
        
        // Temporarily set to NULL to avoid unique constraint collisions
        await pool.query("UPDATE employees SET employee_id_code = NULL WHERE employee_id = $1", [emp.employee_id]);
        
        // Update to new code
        await pool.query("UPDATE employees SET employee_id_code = $1 WHERE employee_id = $2", [newCode, emp.employee_id]);
        updatedCount++;
      }
    }

    console.log(`\n✅ Migration complete! Updated ${updatedCount} employee code(s).`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed with error:", err);
    process.exit(1);
  }
}

runMigration();
