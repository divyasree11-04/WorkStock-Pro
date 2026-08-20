import pool from "../db.js";
import { sendStockOutWarningEmail } from "./mailer.js";

/**
 * Analyzes recent stock transactions to forecast depletion times
 * and dispatches warning emails if stock is expected to run out in <= 30 days.
 */
export const checkStockOutWarnings = async () => {
  try {
    console.log("📈 Checking stock out predictions...");

    // Dynamic database migration to add column if it doesn't exist (safety fallback)
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS stock_out_warning_sent BOOLEAN DEFAULT FALSE
    `);

    // Fetch products along with their OUT/RETURN history from the last 30 days
    const result = await pool.query(`
      SELECT 
        p.id,
        p.item_name,
        p.item_code,
        p.quantity,
        p.min_stock,
        p.incharge,
        p.rack,
        p.lead_time,
        p.stock_out_warning_sent,
        COALESCE(SUM(CASE WHEN sh.type = 'OUT' THEN sh.quantity ELSE 0 END), 0) AS total_out,
        COALESCE(SUM(CASE WHEN sh.type = 'RETURN' THEN sh.quantity ELSE 0 END), 0) AS total_return
      FROM products p
      LEFT JOIN stock_history sh ON sh.product_id = p.id AND sh.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY p.id
    `);

    let warningCount = 0;

    for (const row of result.rows) {
      const quantity = parseFloat(row.quantity || 0);
      const totalOut = parseFloat(row.total_out || 0);
      const totalReturn = parseFloat(row.total_return || 0);
      const netWithdrawn = totalOut - totalReturn;

      // Net daily consumption rate over the last 30 days
      const dailyRate = netWithdrawn / 30.0;
      
      if (dailyRate > 0 && quantity > 0) {
        const daysRemaining = quantity / dailyRate;
        
        if (daysRemaining <= 30) {
          if (!row.stock_out_warning_sent) {
            console.log(`⚠️ Product "${row.item_name}" is at risk of stocking out in ${daysRemaining.toFixed(1)} days (Daily rate: ${dailyRate.toFixed(2)}). Triggering email alert...`);
            
            await sendStockOutWarningEmail(row, daysRemaining, dailyRate);
            
            await pool.query(
              "UPDATE products SET stock_out_warning_sent = TRUE WHERE id = $1", 
              [row.id]
            );
            warningCount++;
          }
        } else {
          // If days remaining is > 30, reset the warning flag so it can fire again if stock depletes
          if (row.stock_out_warning_sent) {
            await pool.query(
              "UPDATE products SET stock_out_warning_sent = FALSE WHERE id = $1", 
              [row.id]
            );
          }
        }
      } else {
        // No active net withdrawals or 0 quantity (meaning already out of stock, or usage stopped)
        if (row.stock_out_warning_sent) {
          await pool.query(
            "UPDATE products SET stock_out_warning_sent = FALSE WHERE id = $1", 
            [row.id]
          );
        }
      }
    }

    console.log(`✅ Stock out check completed. Triggered ${warningCount} new warnings.`);
  } catch (err) {
    console.error("❌ Stock out check error:", err.message);
  }
};
