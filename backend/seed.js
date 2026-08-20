import pool from "./db.js";

async function seed() {
  try {
    console.log("Starting database seeding...");

    
    const adminCheck = await pool.query("SELECT * FROM employees WHERE role = 'admin' LIMIT 1");
    
    if (adminCheck.rows.length === 0) {
      console.log("No admin user found. Creating default admin...");
      await pool.query(
        `INSERT INTO employees (name, email, password, role, employee_id_code) 
         VALUES ($1, $2, $3, $4, $5)`,
        ['Admin User', 'admin@uavtech.ai', 'admin123', 'admin', 'UAVA001']
      );
      console.log("Default admin created: admin@uavtech.ai / admin123");
    } else {
      console.log("Admin user already exists.");
    }

    
    const employeeCheck = await pool.query("SELECT * FROM employees WHERE email = 'employee@uavtech.ai' LIMIT 1");
    if (employeeCheck.rows.length === 0) {
      console.log("No employee user found. Creating default employee...");
      const empResult = await pool.query(
        `INSERT INTO employees (name, email, password, role, employee_id_code) 
         VALUES ($1, $2, $3, $4, $5) RETURNING employee_id`,
        ['John Doe', 'employee@uavtech.ai', 'user123', 'employee', 'UAVE001']
      );
      console.log("Default employee created: employee@uavtech.ai / user123");

      // Add a sample withdrawal for the employee if a product exists
      const prodResult = await pool.query("SELECT id FROM products LIMIT 1");
      if (prodResult.rows.length > 0) {
        await pool.query(
          `INSERT INTO stock_history (product_id, employee_id, type, quantity, remarks) 
           VALUES ($1, $2, 'OUT', 2, 'Sample withdrawal for testing')`,
          [prodResult.rows[0].id, empResult.rows[0].employee_id]
        );
        console.log("Sample withdrawal added for the employee.");
      }
    }

    
    const productCheck = await pool.query("SELECT COUNT(*) FROM products");
    if (parseInt(productCheck.rows[0].count) === 0) {
      console.log("No products found. Creating sample product...");
      await pool.query(
        `INSERT INTO products (item_name, description, quantity, unit, item_code, category, unit_price, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['Sample Item', 'Initial stock item', 10, 'pcs', 'ITEM001', 'General', 100, 'Available']
      );
      console.log("Sample product created.");
    }

    console.log("Seeding completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding database:", err);
    process.exit(1);
  }
}

seed();
