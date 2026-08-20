import pool from "./db.js";
import emsPool from "./emsDb.js";

export const syncEmployees = async () => {
  try {
    const emsUsers = await emsPool.query(`
      SELECT DISTINCT ON (u.email)
        u.id,
        u.email,
        u.password,
        u.role,
        COALESCE(u.fullname, u.username) as name,
        COALESCE(e.employee_uav_id, u.username) as employee_id_code
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      ORDER BY u.email, u.id ASC
    `);

    for (const user of emsUsers.rows) {
      try {
        if (user.employee_id_code) {
          await pool.query(`
            UPDATE employees
            SET employee_id_code = NULL
            WHERE employee_id_code = $1 AND email != $2
          `, [user.employee_id_code, user.email]);
        }

        await pool.query(`
          UPDATE employees
          SET employee_id      = $1,
              name             = $2,
              password         = $3,
              role             = CASE WHEN $4 = 'super_admin' THEN 'admin' ELSE $4 END,
              employee_id_code = $5
          WHERE email = $6 AND employee_id != $1
        `, [
          user.id,
          user.name,
          user.password,
          user.role,
          user.employee_id_code,
          user.email
        ]);

        await pool.query(`
    INSERT INTO employees (employee_id, name, email, password, role, employee_id_code)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (employee_id) DO UPDATE SET
      name             = EXCLUDED.name,
      email            = EXCLUDED.email,
      password         = EXCLUDED.password,
      role             = CASE WHEN EXCLUDED.role = 'super_admin' THEN 'admin' ELSE EXCLUDED.role END,
      employee_id_code = COALESCE(EXCLUDED.employee_id_code, employees.employee_id_code)
  `, [
    user.id,
    user.name,
    user.email,
    user.password,
    user.role === 'super_admin' ? 'admin' : user.role,
    user.employee_id_code
  ]);
      } catch (err) {
        console.error(`❌ Sync error for user ${user.email} (${user.id}):`, err.message);
      }
    }

    console.log(`✅ Synced ${emsUsers.rows.length} employees from EMS.`);
  } catch (err) {
    console.error("❌ Sync error:", err.message);
  }
};