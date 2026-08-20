import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool, types } = pkg;

// Fix for Node.js converting UTC timestamps to local node time incorrectly
// This forces PostgreSQL 'timestamp without time zone' (1114) to be parsed as UTC
types.setTypeParser(1114, str => new Date(str.replace(' ', 'T') + 'Z'));

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

export default pool;