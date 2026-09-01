import pool from "./db.js";
import emsPool from "./emsDb.js";

export const formatEmployeeCode = (role, rawCode) => {
  if (!rawCode) return null;

  let targetPrefix = "UTPLE"; // Default for general employees, interns, store executives, etc.
  const lowerRole = (role || "").toLowerCase();

  if (lowerRole === "super_admin" || lowerRole === "superadmin") {
    targetPrefix = "UTPLS";
  } else if (lowerRole === "admin" || lowerRole === "hr_admin") {
    targetPrefix = "UTPLA";
  }

  let code = rawCode.trim();

  // 1. Matches UAV[optional letter][digits] (e.g. UAVA001, UAVE001, UAV001)
  const uavPattern = /^UAV([A-Z]*)(\d+)$/i;
  const uavMatch = code.match(uavPattern);
  if (uavMatch) {
    const digits = uavMatch[2];
    return `${targetPrefix}${digits}`;
  }

  // 2. Matches UTPL[optional letter][digits] (e.g. UTPLA001)
  const utplPattern = /^UTPL([A-Z]*)(\d+)$/i;
  const utplMatch = code.match(utplPattern);
  if (utplMatch) {
    const digits = utplMatch[2];
    return `${targetPrefix}${digits}`;
  }

  // 3. Matches pure digits (e.g. 001 or 12)
  if (/^\d+$/.test(code)) {
    return `${targetPrefix}${code.padStart(3, "0")}`;
  }

  // 4. Starts with UAV but has non-standard format (e.g. UAV-123)
  if (code.toUpperCase().startsWith("UAV")) {
    const remaining = code.substring(3).replace(/^[-_A-Z]+/i, "");
    return `${targetPrefix}${remaining}`;
  }

  // 5. Fallback for username-based or random codes: keep it as is
  return code;
};

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
        const formattedCode = formatEmployeeCode(user.role, user.employee_id_code);

        if (formattedCode) {
          await pool.query(`
            UPDATE employees
            SET employee_id_code = NULL
            WHERE employee_id_code = $1 AND email != $2
          `, [formattedCode, user.email]);
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
          formattedCode,
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
    formattedCode
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