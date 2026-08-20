import express from "express";
import pool from "../db.js";
import multer from "multer";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });


export async function runBatchMigration() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. vendors table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id        SERIAL PRIMARY KEY,
        name      VARCHAR(255) UNIQUE NOT NULL,
        make      VARCHAR(255),
        model     VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. batches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS batches (
        id               SERIAL PRIMARY KEY,
        product_id       INTEGER REFERENCES products(id) ON DELETE CASCADE,
        batch_no         VARCHAR(20)  NOT NULL,
        grn              VARCHAR(100),
        vendor           VARCHAR(255),
        make             VARCHAR(255),
        model            VARCHAR(255),
        in_date          DATE         DEFAULT CURRENT_DATE,
        expire_date      DATE,
        service_period   VARCHAR(100),
        units            VARCHAR(50),
        unit_price       NUMERIC      DEFAULT 0,
        lead_time        INTEGER,
        employee_id      VARCHAR(100),
        description      TEXT,
        storage_location VARCHAR(255),
        total_qty        NUMERIC      DEFAULT 0,
        accepted_qty     NUMERIC      DEFAULT 0,
        rejected_qty     NUMERIC      DEFAULT 0,
        remaining_qty    NUMERIC      DEFAULT 0,
        condition        VARCHAR(100),
        document_path    TEXT,
        created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, batch_no)
      )
    `);

    // 3. link stock_history to a batch
    await client.query(`
      ALTER TABLE stock_history
        ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL
    `);

    // 4. fields matching the printed Goods Receipt Note form
    await client.query(`
      ALTER TABLE batches
        ADD COLUMN IF NOT EXISTS invoice_number    VARCHAR(100),
        ADD COLUMN IF NOT EXISTS delivery_challan  VARCHAR(100),
        ADD COLUMN IF NOT EXISTS project           VARCHAR(255),
        ADD COLUMN IF NOT EXISTS inspected_by      VARCHAR(255),
        ADD COLUMN IF NOT EXISTS inspection_doc_no VARCHAR(100)
    `);

    

    await client.query("COMMIT");
    console.log("✅ Batch migration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Batch migration error:", err.message);
  } finally {
    client.release();
  }
}






async function generateBatchNo(productId) {
  const res = await pool.query(
    `SELECT batch_no FROM batches WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [productId]
  );

  if (res.rows.length === 0) return "BA01";

  const last = res.rows[0].batch_no; // e.g. "BA01"
  const letter = last[1]; // A-Z
  const num    = parseInt(last.slice(2), 10); // 1-99

  if (num < 99) {
    return `B${letter}${String(num + 1).padStart(2, "0")}`;
  }
  // Roll letter
  const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1);
  if (nextLetter > "Z") {
    // Wrap around (shouldn't happen in practice)
    return "BA01";
  }
  return `B${nextLetter}01`;
}


async function generateUAVTGRN() {
  const res = await pool.query(
    `SELECT grn FROM batches WHERE grn LIKE 'UAVTGRN%' ORDER BY id DESC LIMIT 1`
  );
  if (res.rows.length === 0) return "UAVTGRN0001";
  
  const lastGrn = res.rows[0].grn;
  const numPart = parseInt(lastGrn.slice(7), 10);
  if (!isNaN(numPart)) {
    return 'UAVTGRN' + String(numPart + 1).padStart(4, "0");
  }
  return "UAVTGRN0001";
}



// GET /api/vendors
router.get("/vendors", verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM vendors ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/vendors  – upsert (by name)
router.post("/vendors", verifyToken, async (req, res, next) => {
  const { name, make, model } = req.body;
  if (!name) return res.status(400).json({ message: "Vendor name is required" });
  try {
    const result = await pool.query(
      `INSERT INTO vendors (name, make, model)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET make = EXCLUDED.make, model = EXCLUDED.model
       RETURNING *`,
      [name.trim(), make || null, model || null]
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.get("/next-grn", verifyToken, async (req, res, next) => {
  try {
    const nextGroup = await generateUAVTGRN();
    res.json({ grn: nextGroup });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BATCHES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/stock/:productId/batches  – FIFO order (oldest in_date first)
router.get("/stock/:productId/batches", verifyToken, async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    const result = await pool.query(
      `SELECT * FROM batches WHERE product_id = $1 ORDER BY in_date ASC, created_at ASC`,
      [req.params.productId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/stock/:productId/batches  – create a refill batch
router.post(
  "/stock/:productId/batches",
  verifyToken,
  upload.single("document"),
  async (req, res, next) => {
    const productId = parseInt(req.params.productId, 10);
    const {
      vendor, make, model,
      in_date, expire_date, grn,
      service_period, units, unit_price, lead_time,
      employee_id, description, storage_location,
      total_qty, accepted_qty, rejected_qty,
      condition,
      invoice_number, delivery_challan, project,
      inspected_by, inspection_doc_no,
    } = req.body;

    if (!vendor)
      return res.status(400).json({ message: "Vendor is required" });
    if (!total_qty || parseFloat(total_qty) <= 0)
      return res.status(400).json({ message: "Total quantity must be positive" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Ensure the product exists
      const prodRes = await client.query(
        "SELECT * FROM products WHERE id = $1 FOR UPDATE",
        [productId]
      );
      if (prodRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Product not found" });
      }
      const product = prodRes.rows[0];

      // Auto-generate batch_no
      const batch_no = await generateBatchNo(productId);

      // Auto-generate or use provided GRN
      const finalGRN = grn && grn.trim() !== "" ? grn.trim() : await generateUAVTGRN();

      // Accepted quantity defaults to total if not provided
      const totalQty    = parseFloat(total_qty);
      const acceptedQty = accepted_qty !== undefined && accepted_qty !== "" ? parseFloat(accepted_qty) : totalQty;
      const rejectedQty = rejected_qty !== undefined && rejected_qty !== "" ? parseFloat(rejected_qty) : 0;

      // Document path if uploaded
      const document_path = req.file ? req.file.path : null;

      // Insert batch
      const batchRes = await client.query(
        `INSERT INTO batches (
          product_id, batch_no, grn, vendor, make, model,
          in_date, expire_date, service_period, units, unit_price, lead_time,
          employee_id, description, storage_location,
          total_qty, accepted_qty, rejected_qty, remaining_qty,
          condition, document_path,
          invoice_number, delivery_challan, project, inspected_by, inspection_doc_no
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,$12,
          $13,$14,$15,
          $16,$17,$18,$19,
          $20,$21,
          $22,$23,$24,$25,$26
        ) RETURNING *`,
        [
          productId, batch_no, finalGRN, vendor.trim(), make || null, model || null,
          in_date || new Date().toISOString().slice(0, 10),
          expire_date || null,
          service_period || null, units || null,
          parseFloat(unit_price) || 0,
          lead_time ? parseInt(lead_time) : null,
          employee_id || null, description || null, storage_location || null,
          totalQty, acceptedQty, rejectedQty, acceptedQty, // remaining = accepted on entry
          condition || "Good",
          document_path,
          invoice_number || null, delivery_challan || null, project || null,
          inspected_by || null, inspection_doc_no || null,
        ]
      );
      const batch = batchRes.rows[0];

      // Update product stock (add accepted_qty)
      const reqMinStock = req.body.min_stock !== undefined && req.body.min_stock !== "" ? parseFloat(req.body.min_stock) : parseFloat(product.min_stock || 5);
      const reqDangerLevel = req.body.danger_level !== undefined && req.body.danger_level !== "" ? parseFloat(req.body.danger_level) : parseFloat(product.danger_level || 0);
      const reqUnit = req.body.unit || product.unit;
      const reqUnitPrice = req.body.unit_price !== undefined && req.body.unit_price !== "" ? parseFloat(req.body.unit_price) : parseFloat(product.unit_price || 0);

      const newQty = parseFloat(product.quantity || 0) + acceptedQty;
      let status = "Available";
      if (newQty <= 0) status = "Out of Stock";
      else if (newQty < reqMinStock) status = "Low Stock";

      await client.query(
        `UPDATE products SET quantity = $1, status = $2, min_stock = $3, danger_level = $4, unit = $5, unit_price = $6 WHERE id = $7`,
        [newQty, status, reqMinStock, reqDangerLevel, reqUnit, reqUnitPrice, productId]
      );

      // Log stock_history IN record linked to this batch
      await client.query(
        `INSERT INTO stock_history (product_id, employee_id, type, quantity, remarks, batch_id)
         VALUES ($1, $2, 'IN', $3, $4, $5)`,
        [
          productId,
          req.user.id,
          acceptedQty,
          `Batch refill \u2013 ${batch_no} (GRN: ${finalGRN})`,
          batch.id
        ]
      );

      // Upsert vendor for future autosuggest
      await client.query(
        `INSERT INTO vendors (name, make, model)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET make = EXCLUDED.make, model = EXCLUDED.model`,
        [vendor.trim(), make || null, model || null]
      );

      await client.query("COMMIT");

      res.json({ success: true, batch_no, grn: finalGRN, batch });
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  }
);

export default router;