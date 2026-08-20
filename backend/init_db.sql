-- Create Employees Table
CREATE TABLE IF NOT EXISTS employees (
    employee_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'employee',
    employee_id_code VARCHAR(100) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Products Table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity NUMERIC DEFAULT 0,
    unit VARCHAR(50),
    make VARCHAR(255),
    incharge VARCHAR(255),
    rack VARCHAR(100),
    lead_time VARCHAR(100),
    unit_price NUMERIC DEFAULT 0,
    item_code VARCHAR(100) UNIQUE,
    category VARCHAR(100),
    sde VARCHAR(50),
    fsn VARCHAR(50),
    uom VARCHAR(50),
    min_stock NUMERIC DEFAULT 5,
    max_stock NUMERIC,
    reorder_quantity NUMERIC,
    safety_stock NUMERIC,
    danger_level NUMERIC,
    storage_id VARCHAR(100),
    qr_reference VARCHAR(255),
    warranty_expiry DATE,
    maintenance_due DATE,        
    is_machine BOOLEAN DEFAULT FALSE,
    last_maintenance TIMESTAMP,
    status VARCHAR(50) DEFAULT 'Available',
    service_days VARCHAR(4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS stock_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(employee_id) ON DELETE SET NULL,
    type VARCHAR(12) CHECK (type IN ('IN', 'OUT', 'RETURN', 'MAINTENANCE')),
    quantity NUMERIC NOT NULL,
    condition VARCHAR(255),
    item_category VARCHAR(100),
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS warranty_file_path TEXT,
  ADD COLUMN IF NOT EXISTS warranty_drive_link TEXT,
  ADD COLUMN IF NOT EXISTS stock_out_warning_sent BOOLEAN DEFAULT FALSE;

