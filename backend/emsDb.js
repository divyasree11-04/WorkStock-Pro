import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const emsPool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '172.31.14.42',
  database: 'ems_dbs1',
  password: process.env.DB_PASSWORD || 'data7',
  port: process.env.DB_PORT || 5432,
});

export default emsPool;
