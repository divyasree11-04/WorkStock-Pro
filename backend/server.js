import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import jwt from "jsonwebtoken";

import pool from "./db.js";
import emsPool from "./emsDb.js";
import { verifyToken, checkRole } from "./middleware/authMiddleware.js";
import transactionRoutes from "./routes/transactions_route.js";
import productRoutes from "./routes/products.js";
import batchRoutes, { runBatchMigration } from "./routes/batches.js";
import { syncEmployees } from "./sync.js";
import { checkStockOutWarnings } from "./utils/stockForecast.js";
import { sendLowStockAlertEmail } from "./utils/mailer.js";


dotenv.config();

import multer from "multer";
const upload = multer({ dest: "uploads/" });

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With", "Origin"],
  exposedHeaders: ["Content-Disposition"],
  optionsSuccessStatus: 200
}));


app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

app.use("/api/reports", transactionRoutes);
app.use("/api/products", productRoutes);
app.use("/api", batchRoutes); // /api/vendors, /api/stock/:id/batches, /api/products/next-item-code

app.post("/api/login", async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Email and password are required" });
  try {
    const user = await pool.query("SELECT * FROM employees WHERE email = $1", [email]);
    if (user.rows.length === 0)
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    if (password !== user.rows[0].password)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign(
      {
        id:   user.rows[0].employee_id,
        role: user.rows[0].role,
        name: user.rows[0].name,
        code: user.rows[0].employee_id_code
      },
      process.env.JWT_SECRET || process.env.EMS_JWT_SECRET || "sms_2026",
      { expiresIn: "8h" }
    );
    res.json({ success: true, token });
  } catch (err) {
    next(err);
  }
});

app.get("/api/auth/me", verifyToken, async (req, res, next) => {
  try {
    // 1. If the token already has name and code (WorkStock local token), use it
    if (req.user.name && req.user.code) {
      return res.json({ name: req.user.name, employee_id_code: req.user.code });
    }

    // 2. Fallback to DB (needed for EMS tokens that only contain id/email)
    const userId = req.user.id || req.user.employee_id;
    const userEmail = req.user.email;

    let user;
    if (userId) {
      user = await pool.query("SELECT employee_id_code, name FROM employees WHERE employee_id = $1", [userId]);
    }
    if ((!user || user.rows.length === 0) && userEmail) {
      user = await pool.query("SELECT employee_id_code, name FROM employees WHERE email = $1", [userEmail]);
    }

    if (user && user.rows.length > 0) {
      return res.json(user.rows[0]);
    }

    // 3. Last resort fallback to what we have
    if (req.user.name || req.user.fullname || req.user.username) {
       return res.json({ name: req.user.name || req.user.fullname || req.user.username, employee_id_code: '' });
    }

    return res.status(404).json({ message: "User not found" });
  } catch (err) { next(err); }
});


// ── Employee list (read from EMS DB) — used by the Withdraw form dropdown ──
app.get("/api/employees/list", verifyToken, async (req, res, next) => {
  try {
    const result = await emsPool.query(`
      SELECT
        u.id, u.fullname, u.role, u.email,
        COALESCE(e.phone, u.phone) AS phone,
        e.department,
        e.employee_uav_id, e.designation
      FROM users u
      LEFT JOIN employees e ON u.id = e.user_id
      WHERE u.role IN ('employee', 'intern', 'admin', 'hr_admin', 'store_executive')
      ORDER BY u.fullname ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("[SMS] /api/employees/list error:", err.message);
    res.status(500).json({ error: "Failed to load employees" });
  }
});

app.post("/api/stock-in", verifyToken, checkRole(['admin', 'store_executive', 'employee']), async (req, res, next) => {
  const { productId, quantity } = req.body;
  const employeeId = req.user.id;
  if (!productId || quantity === undefined || parseFloat(quantity) <= 0) {
    return res.status(400).json({ success: false, message: "productId and a positive quantity are required" });
  }
  try {
    await pool.query(
      "UPDATE products SET quantity = quantity + $1 WHERE id = $2",
      [quantity, productId]
    );
    await pool.query(
      `INSERT INTO stock_history (product_id, type, quantity, employee_id, remarks)
       VALUES ($1, 'IN', $2, $3, $4)`,
      [productId, quantity, employeeId, req.body.remarks || "Stock-in"]
    );
    res.json({ success: true, message: "Stock added successfully" });
  } catch (err) { next(err); }
});


app.post("/api/stock-out", verifyToken, checkRole(['admin', 'store_executive', 'employee']), async (req, res, next) => {
  const { productId, quantity, condition, item_category, employee_user_id } = req.body;
  const employeeId = employee_user_id || req.user.id;
  let qtyNeeded = parseFloat(quantity);
  if (!productId || quantity === undefined || qtyNeeded <= 0) {
    return res.status(400).json({ success: false, message: "productId and a positive quantity are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productRes = await client.query(
      "SELECT quantity, item_name, is_machine, min_stock FROM products WHERE id = $1 FOR UPDATE", [productId]
    );
    if (productRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const product = productRes.rows[0];

    if (product.is_machine) {
      const outstanding = await client.query(`
        SELECT COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) -
               COALESCE(SUM(CASE WHEN type = 'RETURN' THEN quantity ELSE 0 END), 0) as net_out
        FROM stock_history WHERE product_id = $1 AND employee_id = $2
      `, [productId, employeeId]);
      if (parseFloat(outstanding.rows[0].net_out) > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Return existing tool first" });
      }
    }

    const currentQty = parseFloat(product.quantity);
    const newQty = currentQty - qtyNeeded;
    if (newQty < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Insufficient stock" });
    }

    const targetBatchId = req.body.batch_id || null;

    let batchesRes;
    if (targetBatchId) {
      batchesRes = await client.query(
        `SELECT id, remaining_qty FROM batches WHERE product_id = $1 AND id = $2 AND remaining_qty > 0 FOR UPDATE`,
        [productId, targetBatchId]
      );
      if (batchesRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Selected batch is empty or invalid" });
      }
      if (qtyNeeded > parseFloat(batchesRes.rows[0].remaining_qty)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Requested quantity exceeds remaining stock in the selected batch" });
      }
    } else {
      // FIFO: consume oldest batches
      batchesRes = await client.query(
        `SELECT id, remaining_qty FROM batches
         WHERE product_id = $1 AND remaining_qty > 0
         ORDER BY in_date ASC NULLS LAST, created_at ASC
         FOR UPDATE`,
        [productId]
      );
    }

    if (batchesRes.rows.length === 0 && !targetBatchId) {
      // Legacy item with no batch rows yet — fall back to a plain OUT record.
      await client.query(
        `INSERT INTO stock_history (product_id, employee_id, type, quantity, condition, item_category, remarks)
         VALUES ($1, $2, 'OUT', $3, $4, $5, $6)`,
        [productId, employeeId, qtyNeeded, condition || null, item_category || null, req.body.remarks || null]
      );
    } else {
      for (const batch of batchesRes.rows) {
        if (qtyNeeded <= 0) break;
        const take = Math.min(parseFloat(batch.remaining_qty), qtyNeeded);
        await client.query("UPDATE batches SET remaining_qty = remaining_qty - $1 WHERE id = $2", [take, batch.id]);
        await client.query(
          `INSERT INTO stock_history (product_id, employee_id, type, quantity, condition, item_category, remarks, batch_id)
           VALUES ($1, $2, 'OUT', $3, $4, $5, $6, $7)`,
          [productId, employeeId, take, condition || null, item_category || null, req.body.remarks || null, batch.id]
        );
        qtyNeeded -= take;
      }
      if (qtyNeeded > 0) {
        // Batches under-account vs. the flat quantity (data drift) — still honor the withdrawal.
        await client.query(
          `INSERT INTO stock_history (product_id, employee_id, type, quantity, condition, item_category, remarks)
           VALUES ($1, $2, 'OUT', $3, $4, $5, $6)`,
          [productId, employeeId, qtyNeeded, condition || null, item_category || null, req.body.remarks || null]
        );
      }
    }

    await client.query("UPDATE products SET quantity = $1 WHERE id = $2", [newQty, productId]);
    let status = "Available";
    if (newQty <= 0) status = "Out of Stock";
    else if (newQty < (product.min_stock || 5)) status = "Low Stock";
    await client.query("UPDATE products SET status = $1 WHERE id = $2", [status, productId]);

    await client.query("COMMIT");
    res.json({ success: true, message: "Stock withdrawn successfully (FIFO)" });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});


app.post("/api/maintenance", verifyToken, checkRole(['admin', 'store_executive']), async (req, res, next) => {
  const { productId, remarks, condition, quantity } = req.body;
  const employeeId = req.user.id;
  try {
    await pool.query(
      "UPDATE products SET last_maintenance = CURRENT_TIMESTAMP WHERE id = $1", [productId]
    );
    await pool.query(
      `INSERT INTO stock_history (product_id, employee_id, type, quantity, condition, remarks)
       VALUES ($1, $2, 'MAINTENANCE', $3, $4, $5)`,
      [productId, employeeId, quantity || 0, condition || "Maintained", remarks || "Routine Maintenance"]
    );
    res.json({ success: true, message: "Maintenance logged" });
  } catch (err) { next(err); }
});


app.post("/api/stock-out-bulk", verifyToken, checkRole(['admin', 'store_executive']), async (req, res, next) => {
  const { items, remarks } = req.body;
  const employeeId = req.user.id;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const { productId, quantity, condition, item_category } = item;
      const product = await client.query(
        "SELECT quantity, item_name, min_stock FROM products WHERE id = $1", [productId]
      );
      if (product.rows.length === 0) throw new Error(`Product ${productId} not found`);
      const currentQty = parseFloat(product.rows[0].quantity);
      const newQty = currentQty - parseFloat(quantity);
      if (newQty < 0) throw new Error(`Insufficient stock for ${product.rows[0].item_name}`);
      await client.query("UPDATE products SET quantity = $1 WHERE id = $2", [newQty, productId]);
      let status = "Available";
      if (newQty <= 0) status = "Out of Stock";
      else if (newQty < (product.rows[0].min_stock || 5)) status = "Low Stock";
      await client.query("UPDATE products SET status = $1 WHERE id = $2", [status, productId]);
      await client.query(
        `INSERT INTO stock_history (product_id, employee_id, type, quantity, condition, item_category, remarks)
         VALUES ($1, $2, 'OUT', $3, $4, $5, $6)`,
        [productId, employeeId, quantity, condition || null, item_category || null, remarks || null]
      );
    }
    await client.query("COMMIT");
    res.json({ success: true, message: "Bulk transaction recorded" });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});


app.get("/api/dashboard", verifyToken, async (req, res, next) => {
  try {
    const [totalItems, totalQuantity, totalValue, lowStock, recentItems, machineAlerts] =
      await Promise.all([
        pool.query("SELECT COUNT(*) AS total_items FROM products"),
        pool.query("SELECT COALESCE(SUM(CAST(quantity AS NUMERIC)), 0) AS total_quantity FROM products WHERE quantity IS NOT NULL AND quantity != 'NaN'"),
        pool.query("SELECT COALESCE(SUM(CAST(quantity AS NUMERIC) * CAST(unit_price AS NUMERIC)), 0) AS total_value FROM products WHERE quantity IS NOT NULL AND quantity != 'NaN'"),
        pool.query(`
        SELECT * FROM products 
        WHERE quantity IS NOT NULL 
        AND quantity::text ~ '^[0-9]+(\\.[0-9]+)?$'
        AND CAST(quantity AS NUMERIC) < 5 
        ORDER BY quantity ASC
      `),
        pool.query(`SELECT * FROM products ORDER BY id DESC LIMIT 10`),
        pool.query(`
  SELECT id, item_name, warranty_expiry, maintenance_due,
  CASE
    WHEN warranty_expiry IS NOT NULL AND warranty_expiry < CURRENT_DATE THEN 'expired'
    WHEN warranty_expiry IS NOT NULL AND warranty_expiry <= CURRENT_DATE + INTERVAL '90 days' THEN 'warning'
    WHEN maintenance_due IS NOT NULL AND maintenance_due < CURRENT_DATE THEN 'expired'
    WHEN maintenance_due IS NOT NULL AND maintenance_due <= CURRENT_DATE + INTERVAL '90 days' THEN 'warning'
    ELSE 'good'
  END as warranty_status
  FROM products
  WHERE is_machine = TRUE 
  AND (
    (warranty_expiry IS NOT NULL AND warranty_expiry <= CURRENT_DATE + INTERVAL '90 days')
    OR
    (maintenance_due IS NOT NULL AND maintenance_due <= CURRENT_DATE + INTERVAL '90 days')
  )
  ORDER BY warranty_expiry ASC NULLS LAST
`)
]);
    res.json({
      totalItems:    totalItems.rows[0].total_items,
      totalQuantity: totalQuantity.rows[0].total_quantity,
      totalValue:    totalValue.rows[0].total_value,
      lowStock:      lowStock.rows,
      recentItems:   recentItems ? recentItems.rows : [],
      machineAlerts: machineAlerts && machineAlerts.rows ? machineAlerts.rows.map(m => ({
        ...m,
        warranty_status: m.warranty_status === "expired" ? "red" : "orange"
      })) : []
    });
  } catch (err) { next(err); }
});


app.get("/api/reports/export", verifyToken, checkRole(["admin", "super_admin"]), async (req, res, next) => {
  const { type } = req.query;
  try {
    const result = await pool.query(`
      SELECT sh.*, p.item_name, e.name as employee_name, p.created_at as product_created_at
      FROM stock_history sh
      JOIN products p ON sh.product_id = p.id
      JOIN employees e ON sh.employee_id = e.employee_id
      ORDER BY sh.created_at DESC
    `);
    if (type === "csv" || type === "excel") {
      const fields = ["id", "item_name", "type", "quantity", "employee_name", "remarks", "created_at"];
      const csv = [
        fields.join(","),
        ...result.rows.map(row => fields.map(f => `"${row[f] || ""}"`).join(","))
      ].join("\n");
      const filename = `workstock_report_${new Date().toISOString().slice(0, 10)}.${type === "excel" ? "xls" : "csv"}`;
      res.setHeader("Content-Type", type === "excel" ? "application/vnd.ms-excel" : "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      return res.send(csv);
    }
    if (type === "pdf") {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", "attachment; filename=workstock_report.txt");
      return res.send(JSON.stringify(result.rows, null, 2));
    }
    res.json(result.rows);
  } catch (err) { next(err); }
});


app.get("/api/my-withdrawals", verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT sh.*, p.item_name, p.created_at as product_created_at
      FROM stock_history sh
      JOIN products p ON sh.product_id = p.id
      WHERE sh.employee_id = $1 AND sh.type = 'OUT'
      ORDER BY sh.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) { next(err); }
});


app.get("/api/my-transactions", verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT sh.*, p.item_name, p.created_at as product_created_at
      FROM stock_history sh
      JOIN products p ON sh.product_id = p.id
      WHERE sh.employee_id = $1
      ORDER BY sh.created_at DESC
      LIMIT 20
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) { next(err); }
});


app.get("/api/reports/transactions/:productId", verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT sh.*, e.email, e.employee_id_code, e.name, p.created_at as product_created_at
      FROM stock_history sh
      JOIN employees e ON sh.employee_id = e.employee_id
      JOIN products p ON sh.product_id = p.id
      WHERE sh.product_id = $1
      ORDER BY sh.created_at DESC LIMIT 10
    `, [req.params.productId]);
    res.json(result.rows);
  } catch (err) { next(err); }
});


app.put("/api/stock-history/:id", verifyToken, async (req, res, next) => {
  const { quantity, condition, item_category } = req.body;
  const { id } = req.params;
  try {
    const old = await pool.query("SELECT * FROM stock_history WHERE id = $1", [id]);
    if (old.rows.length === 0)
      return res.status(404).json({ success: false, message: "Record not found" });
    const diff = parseFloat(quantity) - parseFloat(old.rows[0].quantity);
    await pool.query("UPDATE products SET quantity = quantity - $1 WHERE id = $2", [diff, old.rows[0].product_id]);
    const result = await pool.query(
      `UPDATE stock_history SET quantity=$1, condition=$2, item_category=$3 WHERE id=$4 RETURNING *`,
      [quantity, condition, item_category, id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});


app.get("/api/all-withdrawals", verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT sh.*, p.item_name, e.email, e.employee_id_code, e.name, p.created_at as product_created_at
      FROM stock_history sh
      JOIN products p ON sh.product_id = p.id
      JOIN employees e ON sh.employee_id = e.employee_id
      WHERE sh.type = 'OUT'
      ORDER BY sh.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});


app.get("/api/my-dashboard", verifyToken, async (req, res, next) => {
  const employeeId = req.user.id;
  try {
    const [withdrawals, deposits] = await Promise.all([
      pool.query(`
        SELECT sh.*, p.item_name, p.unit, p.unit_price, p.created_at as product_created_at
        FROM stock_history sh JOIN products p ON sh.product_id = p.id
        WHERE sh.employee_id = $1 AND sh.type = 'OUT'
        ORDER BY sh.created_at DESC
      `, [employeeId]),
      pool.query(`
        SELECT sh.*, p.item_name, p.unit, p.created_at as product_created_at
        FROM stock_history sh JOIN products p ON sh.product_id = p.id
        WHERE sh.employee_id = $1 AND (sh.type = 'IN' OR sh.type = 'RETURN')
        ORDER BY sh.created_at DESC
      `, [employeeId])
    ]);
    const totalWithdrawn = withdrawals.rows.reduce((s, w) => s + parseFloat(w.quantity || 0), 0);
    res.json({ withdrawals: withdrawals.rows, deposits: deposits.rows, totalWithdrawn, totalDeposits: deposits.rows.length });
  } catch (err) { next(err); }
});


app.post("/api/return", verifyToken, async (req, res, next) => {
  const { productId, quantity, remarks, condition, employee_user_id } = req.body;
  const userRole = req.user.role;
  const targetEmployeeId = employee_user_id || req.user.id;
  let qtyToReturn = parseFloat(quantity);
  if (!productId || !quantity || qtyToReturn <= 0)
    return res.status(400).json({ success: false, message: "productId and a positive quantity are required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let withdrawn;
    if (employee_user_id || !['admin', 'super_admin', 'superadmin', 'store_executive'].includes(userRole)) {
      withdrawn = await client.query(`
        SELECT COALESCE(SUM(CASE WHEN type = 'OUT'    THEN quantity ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN type = 'RETURN' THEN quantity ELSE 0 END), 0) AS net_out
        FROM stock_history WHERE product_id = $1 AND employee_id = $2
      `, [productId, targetEmployeeId]);
    } else {
      withdrawn = await client.query(`
        SELECT COALESCE(SUM(CASE WHEN type = 'OUT'    THEN quantity ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN type = 'RETURN' THEN quantity ELSE 0 END), 0) AS net_out
        FROM stock_history WHERE product_id = $1
      `, [productId]);
    }

    const netOut = parseFloat(withdrawn.rows[0].net_out);
    if (qtyToReturn > netOut) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: `Cannot return ${quantity} — only ${netOut} units outstanding` });
    }

    // Restore quantity to the batches it was originally withdrawn from,
    // oldest outstanding withdrawal first — keeps FIFO consistent both ways.
    let openOuts;
    if (employee_user_id || !['admin', 'super_admin', 'superadmin', 'store_executive'].includes(userRole)) {
      openOuts = await client.query(`
        SELECT sh.id, sh.batch_id, sh.quantity, sh.employee_id,
               sh.quantity - COALESCE((
                 SELECT SUM(r.quantity) FROM stock_history r
                 WHERE r.type = 'RETURN' AND r.employee_id = sh.employee_id
                   AND r.product_id = sh.product_id AND r.batch_id IS NOT DISTINCT FROM sh.batch_id
                   AND r.created_at > sh.created_at
               ), 0) AS still_outstanding
        FROM stock_history sh
        WHERE sh.product_id = $1 AND sh.employee_id = $2 AND sh.type = 'OUT'
        ORDER BY sh.created_at ASC
      `, [productId, targetEmployeeId]);
    } else {
      openOuts = await client.query(`
        SELECT sh.id, sh.batch_id, sh.quantity, sh.employee_id,
               sh.quantity - COALESCE((
                 SELECT SUM(r.quantity) FROM stock_history r
                 WHERE r.type = 'RETURN' AND r.employee_id = sh.employee_id
                   AND r.product_id = sh.product_id AND r.batch_id IS NOT DISTINCT FROM sh.batch_id
                   AND r.created_at > sh.created_at
               ), 0) AS still_outstanding
        FROM stock_history sh
        WHERE sh.product_id = $1 AND sh.type = 'OUT'
        ORDER BY sh.created_at ASC
      `, [productId]);
    }

    for (const row of openOuts.rows) {
      if (qtyToReturn <= 0) break;
      const outstanding = parseFloat(row.still_outstanding);
      if (outstanding <= 0) continue;
      const give = Math.min(outstanding, qtyToReturn);

      if (row.batch_id) {
        await client.query("UPDATE batches SET remaining_qty = remaining_qty + $1 WHERE id = $2", [give, row.batch_id]);
      }
      await client.query(
        `INSERT INTO stock_history (product_id, employee_id, type, quantity, remarks, condition, batch_id)
         VALUES ($1, $2, 'RETURN', $3, $4, $5, $6)`,
        [productId, row.employee_id || targetEmployeeId, give, remarks || "Item returned", condition || null, row.batch_id]
      );
      qtyToReturn -= give;
    }

    await client.query("UPDATE products SET quantity = quantity + $1 WHERE id = $2", [parseFloat(quantity), productId]);
    const prod = await client.query("SELECT quantity, min_stock FROM products WHERE id = $1", [productId]);
    const newQty = parseFloat(prod.rows[0].quantity);
    const minStock = parseFloat(prod.rows[0].min_stock) || 5;
    let status = "Available";
    if (newQty === 0) status = "Out of Stock";
    else if (newQty < minStock) status = "Low Stock";
    await client.query("UPDATE products SET status = $1 WHERE id = $2", [status, productId]);

    await client.query("COMMIT");
    res.json({ success: true, message: "Item returned successfully (FIFO)" });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});


app.get("/api/admins", verifyToken, checkRole(["admin", "super_admin", "superadmin"]), async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT employee_id, name, email, role FROM employees WHERE role IN ('admin', 'super_admin', 'superadmin') ORDER BY name ASC"
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});


app.post("/api/send-low-stock-alert", verifyToken, checkRole(["admin", "super_admin", "superadmin"]), async (req, res, next) => {
  const { recipients, itemIds, customEmail } = req.body;
  
  if (!Array.isArray(recipients) || !Array.isArray(itemIds)) {
    return res.status(400).json({ success: false, message: "recipients and itemIds arrays are required" });
  }

  // Combine recipients and customEmail (if valid and not empty)
  const allRecipients = [...recipients];
  if (customEmail && customEmail.trim() !== "") {
    allRecipients.push(customEmail.trim());
  }

  if (allRecipients.length === 0) {
    return res.status(400).json({ success: false, message: "At least one recipient email is required" });
  }

  try {
    // Fetch item details
    const itemsRes = await pool.query(
      "SELECT * FROM products WHERE id = ANY($1::int[])",
      [itemIds]
    );

    if (itemsRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: "No matching products found for the provided IDs" });
    }

    await sendLowStockAlertEmail(allRecipients, itemsRes.rows);
    res.json({ success: true, message: "Alert email sent successfully" });
  } catch (err) {
    next(err);
  }
});


app.use((err, req, res, next) => {
  console.error("[WorkStock Pro Error]", err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "An unexpected error occurred"
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`WorkStock Pro server running on port ${PORT}`);
  
  try {
   
    const columns = [
      "stock_out_warning_sent BOOLEAN DEFAULT FALSE",
      "maintenance_due DATE",
      "service_days VARCHAR(4)",
      "sde VARCHAR(50)",
      "fsn VARCHAR(50)"
    ];
    for (const colDef of columns) {
      try {
        await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${colDef}`);
      } catch (colErr) {
        // Ignore errors for individual columns (e.g., syntax issues in older PG versions or if exists)
      }
    }
    console.log("❇️ Database schema verification complete.");
  } catch (err) {
    console.error("❌ Schema migration failed during startup:", err.message);
  }

  await runBatchMigration(); // creates vendors/batches tables, links stock_history.batch_id

 
  await syncEmployees();
  setInterval(syncEmployees, 10 * 60 * 1000);

  
  await checkStockOutWarnings();
  setInterval(checkStockOutWarnings, 10 * 60 * 1000);
});