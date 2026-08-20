import express from "express";
import pool from "../db.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Helper to get employee_id from token (supports both EMS and WorkStock tokens)
const getUserId = (req) => req.user.id || req.user.employee_id;

// GET last 10 transactions of a product
router.get("/transactions/:productId", verifyToken, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const result = await pool.query(`
      SELECT sh.*, e.email, e.employee_id_code, e.name, p.created_at as product_created_at
      FROM stock_history sh
      JOIN employees e ON sh.employee_id = e.employee_id
      JOIN products p ON sh.product_id = p.id
      WHERE sh.product_id = $1
      ORDER BY sh.created_at DESC
      LIMIT 10
    `, [productId]);
    res.json(result.rows);
  } catch (err) {
    console.error("Transaction error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ WITHDRAW PRODUCT
router.post("/stock-out", verifyToken, async (req, res) => {
  try {
    // Accept both camelCase (productId) and snake_case (product_id) from different clients
    const productId = req.body.product_id || req.body.productId;
    const { quantity, condition, item_category } = req.body;

    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "Invalid productId (or product_id) or quantity" });
    }

    // check stock
    const product = await pool.query(
      "SELECT quantity, is_machine FROM products WHERE id = $1",
      [productId]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (parseFloat(product.rows[0].quantity) < quantity) {
      return res.status(400).json({ message: "Not enough stock" });
    }

    // subtract stock
    await pool.query(
      `UPDATE products 
       SET quantity = quantity - $1 
       WHERE id = $2`,
      [quantity, productId]
    );

    // log transaction with condition and item_category
    await pool.query(
      `INSERT INTO stock_history (product_id, type, quantity, employee_id, condition, item_category)
       VALUES ($1, 'OUT', $2, $3, $4, $5)`,
      [productId, quantity, getUserId(req), condition || null, item_category || null]
    );

    res.json({ message: "Withdraw successful" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Withdraw failed" });
  }
});

// ✅ RETURN PRODUCT
router.post("/return", verifyToken, async (req, res) => {
  try {
    // Accept both camelCase (productId) and snake_case (product_id) from different clients
    const productId = req.body.product_id || req.body.productId;
    const quantity  = req.body.quantity;

    if (!productId || !quantity) {
      return res.status(400).json({ message: "Missing fields: productId (or product_id) and quantity are required" });
    }

    // ── Validate: employee cannot return more than they currently have outstanding ──
    const outstanding = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'OUT'    THEN quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN type = 'RETURN' THEN quantity ELSE 0 END), 0) AS net_out
      FROM stock_history
      WHERE product_id = $1 AND employee_id = $2
    `, [productId, getUserId(req)]);

    const netOut = parseFloat(outstanding.rows[0].net_out || 0);
    if (parseFloat(quantity) > netOut) {
      return res.status(400).json({
        message: `Cannot return ${quantity} — only ${netOut} units outstanding`
      });
    }

    // add stock back
    await pool.query(
      `UPDATE products 
       SET quantity = quantity + $1 
       WHERE id = $2`,
      [quantity, productId]
    );

    // log transaction
    await pool.query(
      `INSERT INTO stock_history (product_id, type, quantity, employee_id)
       VALUES ($1, 'RETURN', $2, $3)`,
      [productId, quantity, getUserId(req)]
    );

    res.json({ message: "Return successful" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Return failed" });
  }
});

router.get("/my-transactions", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sh.*, p.item_name, p.created_at as product_created_at
      FROM stock_history sh
      JOIN products p ON sh.product_id = p.id
      WHERE sh.employee_id = $1
      ORDER BY sh.created_at DESC
      LIMIT 20
    `, [getUserId(req)]);
    res.json(result.rows);
  } catch (err) {
    console.error("MY TRANSACTIONS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/withdrawal-summary/:productId", verifyToken, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);

    const prodResult = await pool.query(
      `SELECT p.item_name,
              p.quantity AS current_qty,
              (SELECT COALESCE(sh2.quantity, 0)
               FROM stock_history sh2
               WHERE sh2.product_id = p.id AND sh2.type = 'IN'
               ORDER BY sh2.created_at ASC LIMIT 1) AS master_list
       FROM products p
       WHERE p.id = $1`,
      [productId]
    );

    if (prodResult.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const { item_name, current_qty, master_list } = prodResult.rows[0];

    const txResult = await pool.query(
      `SELECT sh.id,
              sh.quantity,
              sh.created_at,
              e.employee_id_code,
              e.name
       FROM stock_history sh
       JOIN employees e ON sh.employee_id = e.employee_id
       WHERE sh.product_id = $1 AND sh.type = 'OUT'
       ORDER BY sh.created_at ASC`,
      [productId]
    );

    const depositResult = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total_deposit
       FROM stock_history
       WHERE product_id = $1 AND type = 'RETURN'`,
      [productId]
    );

    const totalDeposit = parseFloat(depositResult.rows[0].total_deposit || 0);
    const ml = parseFloat(master_list || 0);

    let runningRelease = 0;
    const rows = txResult.rows.map((tx) => {
      runningRelease += parseFloat(tx.quantity);
      const balance = ml - runningRelease + totalDeposit;
      return {
        item_name,
        employee_id_code: tx.employee_id_code || "—",
        name: tx.name || "—",
        date: tx.created_at,
        qty: parseFloat(tx.quantity),
        master_list: ml,
        inventory_release: runningRelease,
        deposit: totalDeposit,
        balance: parseFloat(balance.toFixed(2)),
      };
    });

    res.json(rows);
  } catch (err) {
    console.error("Withdrawal summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;