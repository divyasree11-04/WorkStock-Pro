import express from "express";
import pool from "../db.js";
import multer from "multer";
import { verifyToken } from "../middleware/authMiddleware.js";
import { sendProductNotification } from "../utils/mailer.js";
import { checkStockOutWarnings } from "../utils/stockForecast.js";


const router = express.Router();


router.use((req, res, next) => {
  if (req.is('application/json')) {
    express.json()(req, res, next);
  } else {
    next();
  }
});


const upload = multer({ dest: "uploads/" });


const ITEM_CODE_PREFIX = "UAVTSA";

async function generateItemCode() {
  const res = await pool.query(
    `SELECT item_code FROM products WHERE item_code LIKE $1 ORDER BY item_code DESC LIMIT 1`,
    [`${ITEM_CODE_PREFIX}%`]
  );

  let seq = 1;
  if (res.rows.length > 0) {
    const last = res.rows[0].item_code;
    const numPart = parseInt(last.slice(ITEM_CODE_PREFIX.length), 10);
    if (!isNaN(numPart)) seq = numPart + 1;
  }
  return `${ITEM_CODE_PREFIX}${String(seq).padStart(3, "0")}`;
}


router.get("/next-item-code", verifyToken, async (req, res, next) => {
  try {
    
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    const code = await generateItemCode();
    res.json({ item_code: code });
  } catch (err) { next(err); }
});


router.get("/next-rack", verifyToken, async (req, res) => {
  try {
    const lastProduct = await pool.query(
      "SELECT rack FROM products WHERE rack IS NOT NULL AND rack ~ '^[A-Z][0-9]{4}-[A-Z]$' ORDER BY id DESC LIMIT 1"
    );

    if (lastProduct.rows.length === 0) {
      return res.json({ nextRack: "A0001-A" });
    }

    const lastRack = lastProduct.rows[0].rack;
    const match = lastRack.match(/^([A-Z])([0-9]{4})-([A-Z])$/);

    if (!match) {
      return res.json({ nextRack: "A0001-A" });
    }

    let charCode = match[1].charCodeAt(0);
    let num = parseInt(match[2]);

    
    charCode++;
    if (charCode > 90) { // Past 'Z'
      charCode = 65; // Back to 'A'
      num++;
    }

    const nextChar = String.fromCharCode(charCode);
    const nextNum = num.toString().padStart(4, "0");
    const nextRack = `${nextChar}${nextNum}-${nextChar}`;

    res.json({ nextRack });
  } catch (err) {
    console.error("Error generating next rack:", err);
    res.status(500).json({ error: err.message });
  }
});




router.post("/:id/add-quantity", verifyToken, async (req, res) => {
  const productId = parseInt(req.params.id);
  const {
    quantity, entry_date, unit_price, make, incharge,
    rack, lead_time, min_stock, safety_stock,
    reorder_quantity, warranty_expiry, service_days, remarks
  } = req.body;

  if (!quantity || parseFloat(quantity) <= 0) {
    return res.status(400).json({ message: "Invalid quantity" });
  }

  try {
    
    await pool.query(`
      UPDATE products SET
        quantity          = quantity + $1,
        unit_price        = COALESCE(NULLIF($2, ''), unit_price::text)::numeric,
        make              = COALESCE(NULLIF($3, ''), make),
        incharge          = COALESCE(NULLIF($4, ''), incharge),
        rack              = COALESCE(NULLIF($5, ''), rack),
        lead_time         = COALESCE(NULLIF($6, ''), lead_time::text)::integer,
        min_stock         = COALESCE(NULLIF($7, ''), min_stock::text)::numeric,
        safety_stock      = COALESCE(NULLIF($8, ''), safety_stock::text)::numeric,
        reorder_quantity  = COALESCE(NULLIF($9, ''), reorder_quantity::text)::numeric,
        warranty_expiry   = COALESCE(NULLIF($10, ''), NULL)::date,
        service_days      = COALESCE(NULLIF($11, ''), service_days),
        status            = CASE
                              WHEN quantity + $1 <= 0 THEN 'Out of Stock'
                              WHEN quantity + $1 < min_stock THEN 'Low Stock'
                              ELSE 'Available'
                            END
      WHERE id = $12
    `, [
      parseFloat(quantity), unit_price, make, incharge,
      rack, lead_time, min_stock, safety_stock,
      reorder_quantity, warranty_expiry || null, service_days, productId
    ]);

    
    await pool.query(`
      INSERT INTO stock_history (product_id, type, quantity, employee_id, remarks)
      VALUES ($1, 'IN', $2, $3, $4)
    `, [productId, parseFloat(quantity), req.user.id || req.user.employee_id, remarks || 'Stock added']);

    res.json({ success: true, message: "Quantity added successfully" });
  } catch (err) {
    console.error("Add quantity error:", err);
    res.status(500).json({ message: err.message });
  }
});

const parseNum = (val, defaultVal = null) => {
  if (val === undefined || val === null || val === "" || isNaN(parseFloat(val))) {
    return defaultVal;
  }
  return parseFloat(val);
};

router.post(
  "/",
  verifyToken,
  upload.single("warranty_file"),
  async (req, res) => {
    try {
      const {
        item_name, description, quantity, unit, make, incharge,
        rack, lead_time, unit_price, item_code, category, sde, fsn, uom,
        min_stock, max_stock, reorder_quantity, safety_stock,
        danger_level, storage_id, qr_reference,
        warranty_expiry, is_machine, date, service_days
      } = req.body;

      if (
        (quantity !== undefined && parseFloat(quantity) < 0) ||
        (unit_price !== undefined && parseFloat(unit_price) < 0) ||
        (min_stock !== undefined && parseFloat(min_stock) < 0) ||
        (max_stock !== undefined && parseFloat(max_stock) < 0) ||
        (reorder_quantity !== undefined && parseFloat(reorder_quantity) < 0) ||
        (safety_stock !== undefined && parseFloat(safety_stock) < 0) ||
        (danger_level !== undefined && parseFloat(danger_level) < 0)
      ) {
        return res.status(400).json({ success: false, message: "Numeric values cannot be negative." });
      }

      const qty = parseFloat(quantity) || 0;

      let status = "Available";
      if (qty === 0) status = "Out of Stock";
      else if (qty < (parseNum(min_stock, 5))) status = "Low Stock";

     
      const warranty_file_path = req.file ? req.file.path : null;

      const formatted_warranty_expiry =
        warranty_expiry && warranty_expiry.trim() !== ""
          ? warranty_expiry
          : null;

      
      const { warranty_drive_link } = req.body;

      
      const entryDate = date && date.trim() !== "" ? new Date(date) : new Date();

      let calculated_maintenance_due = null;
      if (service_days) {
        const days = parseInt(service_days, 10);
        if (!isNaN(days) && days > 0) {
          calculated_maintenance_due = new Date(entryDate.getTime() + days * 24 * 60 * 60 * 1000);
        }
      }

      
      const result = await pool.query(
        `INSERT INTO products (
          item_name, description, quantity, unit, make, incharge,
          rack, lead_time, unit_price, item_code, category, sde, fsn, uom,
          min_stock, max_stock, reorder_quantity, safety_stock,
          danger_level, storage_id, qr_reference,
          warranty_expiry, is_machine, status,
          warranty_file_path, warranty_drive_link, created_at, service_days, maintenance_due
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,$12,$13,$14,
          $15,$16,$17,$18,
          $19,$20,$21,
          $22,$23,$24,
          $25,$26,$27,$28,$29
        ) RETURNING *`,
        [
          item_name || null,
          description || null,
          qty,
          unit || null,
          make || null,
          incharge || null,
          rack || null,
          lead_time || null,
          parseNum(unit_price, 0),
          item_code || null,
          category || null,
          sde || null,
          fsn || null,
          uom || null,
          parseNum(min_stock, 5),
          parseNum(max_stock),
          parseNum(reorder_quantity),
          parseNum(safety_stock),
          parseNum(danger_level),
          storage_id || null,
          qr_reference || null,
          formatted_warranty_expiry,
          is_machine === "true" || is_machine === true || false,
          status,
          warranty_file_path,
          warranty_drive_link || null,
          entryDate,
          service_days || null,
          calculated_maintenance_due
        ]
      );

      const savedProduct = result.rows[0];

      
      if (qty > 0) {
        await pool.query(
          `INSERT INTO stock_history (product_id, employee_id, type, quantity, remarks, created_at)
           VALUES ($1, $2, 'IN', $3, $4, $5)`,
          [
            savedProduct.id,
            req.user.id,
            qty,
            "Initial Stock Entry",
            entryDate
          ]
        );
      }

      res.json(savedProduct);

      
      sendProductNotification(savedProduct).catch(err => {
        console.error("Email background task failed:", err.message);
      });

    } catch (err) {
      console.error("🔥 FULL PRODUCT ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET all products
router.get("/", verifyToken, async (req, res) => {
  try {
    
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    // Base product list
    const result = await pool.query(`
      SELECT *,
        COALESCE(
          CASE
            WHEN quantity IS NOT NULL AND quantity::text ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN CAST(quantity AS NUMERIC) * COALESCE(unit_price, 0)
            ELSE 0
          END,
          0
        ) AS stock_value,
        COALESCE(
          CASE
            WHEN quantity IS NOT NULL AND quantity::text ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN CAST(quantity AS NUMERIC) * COALESCE(unit_price, 0)
            ELSE 0
          END,
          0
        ) AS current_stock_value
      FROM products
      ORDER BY id DESC
    `);

    
    try {
      const batchValues = await pool.query(`
        SELECT
          product_id,
          COALESCE(SUM(total_qty * unit_price), 0)      AS stock_value,
          COALESCE(SUM(accepted_qty * unit_price), 0)   AS current_stock_value
        FROM batches
        GROUP BY product_id
      `);

      const batchMap = {};
      for (const row of batchValues.rows) {
        batchMap[row.product_id] = {
          stock_value: parseFloat(row.stock_value),
          current_stock_value: parseFloat(row.current_stock_value),
        };
      }

      const enriched = result.rows.map((p) => {
        if (batchMap[p.id]) {
          return {
            ...p,
            stock_value: batchMap[p.id].stock_value,
            current_stock_value: batchMap[p.id].current_stock_value,
          };
        }
        return p;
      });

      return res.json(enriched);
    } catch (_batchErr) {
      
      return res.json(result.rows);
    }
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: err.message });
  }
});


router.get("/:id", verifyToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: "Item not found" });

    const outstanding = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) -
             COALESCE(SUM(CASE WHEN type = 'RETURN' THEN quantity ELSE 0 END), 0) as net_out
      FROM stock_history WHERE product_id = $1 AND employee_id = $2
    `, [req.params.id, req.user.id || req.user.employee_id]);

    const product = result.rows[0];
    product.net_out = parseFloat(outstanding.rows[0].net_out || 0);

    res.json(product);
  } catch (err) {
    console.error("Error fetching product by ID:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/add-quantity", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      quantity,
      entry_date,
      unit_price,
      make,
      incharge,
      rack,
      lead_time,
      min_stock,
      safety_stock,
      reorder_quantity,
      warranty_expiry,
      service_days,
      remarks,
    } = req.body;

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: "Valid quantity is required." });
    }

    const eDate = entry_date && entry_date.trim() !== "" ? new Date(entry_date) : new Date();

    let calculated_maintenance_due = null;
    if (service_days) {
      const days = parseInt(service_days, 10);
      if (!isNaN(days) && days > 0) {
        calculated_maintenance_due = new Date(eDate.getTime() + days * 24 * 60 * 60 * 1000);
      }
    }

    const formatted_warranty = (warranty_expiry && warranty_expiry.trim() !== "") ? warranty_expiry : null;

    const prodRes = await pool.query("SELECT min_stock, quantity FROM products WHERE id = $1", [id]);
    if (prodRes.rows.length === 0) {
       return res.status(404).json({ success: false, message: "Product not found" });
    }
    const oldProd = prodRes.rows[0];
    const newStockQty = parseFloat(oldProd.quantity || 0) + qty;
    
    let status = "Available";
    if (newStockQty === 0) status = "Out of Stock";
    else if (newStockQty < (parseNum(min_stock, oldProd.min_stock) || 5)) status = "Low Stock";

    const updateQuery = `
      UPDATE products SET
        quantity = quantity + $1,
        unit_price = $2,
        make = $3,
        incharge = $4,
        rack = $5,
        lead_time = $6,
        min_stock = $7,
        safety_stock = $8,
        reorder_quantity = $9,
        warranty_expiry = $10,
        service_days = $11,
        maintenance_due  = $12,
        status = $13
      WHERE id = $14 RETURNING *
    `;

    const updated = await pool.query(updateQuery, [
      qty,
      parseNum(unit_price, 0),
      make || null,
      incharge || null,
      rack || null,
      lead_time || null,
      parseNum(min_stock, 5),
      parseNum(safety_stock),
      parseNum(reorder_quantity),
      formatted_warranty,
      service_days || null,
      calculated_maintenance_due,
      status,
      id
    ]);

    await pool.query(
      `INSERT INTO stock_history (product_id, employee_id, type, quantity, remarks, created_at)
       VALUES ($1, $2, 'IN', $3, $4, $5)`,
      [id, req.user.id, qty, remarks || "Batch Stock Entry", eDate]
    );

    res.json({ success: true, product: updated.rows[0] });
  } catch (err) {
    console.error("Error in add-quantity:", err);
    res.status(500).json({ error: err.message });
  }
});

// Trigger a manual stock-out prediction check for testing (supports simulation mode)
router.post("/test-stock-out-check", verifyToken, async (req, res) => {
  const { simulate } = req.body;
  try {
    if (simulate) {
      console.log("Initiating simulated stock-out forecast test...");

      // 1. Create a dummy product with 10 units
      const prodRes = await pool.query(`
        INSERT INTO products (
          item_name, item_code, quantity, min_stock, rack, lead_time, status, incharge
        ) VALUES (
          'Simulated Depleting Drill Bit', 'SIM-DRILL-999', 10, 5, 'T-999', '14 Days', 'Available', 'Simulated Admin'
        ) RETURNING *
      `);
      const dummyProduct = prodRes.rows[0];

      // 2. Insert high-velocity withdrawals in stock_history to simulate fast consumption
      const employeeId = req.user.id;
      const now = new Date();

      const dates = [
        new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      ];

      for (let i = 0; i < dates.length; i++) {
        await pool.query(`
          INSERT INTO stock_history (product_id, employee_id, type, quantity, remarks, created_at)
          VALUES ($1, $2, 'OUT', 5, 'Simulated rapid usage', $3)
        `, [dummyProduct.id, employeeId, dates[i]]);
      }

      console.log(" Dummy product and withdrawals inserted. Running depletion check...");

      // 3. Trigger forecast engine
      await checkStockOutWarnings();

      
      const checkStatus = await pool.query(
        "SELECT stock_out_warning_sent FROM products WHERE id = $1",
        [dummyProduct.id]
      );
      const wasWarningSent = checkStatus.rows[0]?.stock_out_warning_sent;

    
      await pool.query("DELETE FROM stock_history WHERE product_id = $1", [dummyProduct.id]);
      await pool.query("DELETE FROM products WHERE id = $1", [dummyProduct.id]);

      console.log(" Simulated test completed and cleaned up successfully!");

      return res.json({
        success: true,
        message: "Simulation run completed successfully. See server terminal logs for email printout.",
        details: {
          simulatedProduct: dummyProduct.item_name,
          warningFlagTriggered: wasWarningSent
        }
      });
    }

    
    await checkStockOutWarnings();
    res.json({ success: true, message: "Manual stock-out prediction check completed." });
  } catch (err) {
    console.error(" Error in manual stock-out check:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MY ISSUED ITEMS — everything currently checked out to the logged-in employee
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/my-issued-items", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.item_name, p.item_code, p.unit, p.uom,
             SUM(CASE WHEN sh.type = 'OUT' THEN sh.quantity ELSE 0 END) -
             SUM(CASE WHEN sh.type = 'RETURN' THEN sh.quantity ELSE 0 END) AS net_out
      FROM stock_history sh
      JOIN products p ON p.id = sh.product_id
      WHERE sh.employee_id = $1
      GROUP BY p.id, p.item_name, p.item_code, p.unit, p.uom
      HAVING SUM(CASE WHEN sh.type = 'OUT' THEN sh.quantity ELSE 0 END) -
             SUM(CASE WHEN sh.type = 'RETURN' THEN sh.quantity ELSE 0 END) > 0
      ORDER BY p.item_name ASC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching issued items:", err);
    res.status(500).json({ error: err.message });
  }
});


router.get("/employees/list", verifyToken, async (req, res) => {
  try {
    const usersResult = await pool.query("SELECT * FROM users ORDER BY id ASC");

    let employeesMap = {};
    try {
      const empResult = await pool.query("SELECT * FROM employees");
      empResult.rows.forEach((e) => {
        employeesMap[e.user_id] = e;
      });
    } catch (empErr) {
      // employees table missing/renamed/whatever — proceed with users data only
      console.error("[employees/list] employees table lookup failed, continuing without it:", empErr.message);
    }

    const rows = usersResult.rows
      .map((u) => {
        const emp = employeesMap[u.id];
        return {
          user_id: u.id,
          employee_uav_id: (emp && emp.employee_uav_id) || u.username || String(u.id),
          fullname: (emp && emp.fullname) || u.fullname || u.name || u.username || `User #${u.id}`,
          role: u.role,
        };
      })
      .sort((a, b) => a.fullname.localeCompare(b.fullname));

    res.json(rows);
  } catch (err) {
    console.error("Error fetching employee list:", err);
    res.status(500).json({ error: err.message });
  }
});



export default router;