// src/database/db.js
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const  isProduction = process.env.NODE_ENV === 'production';

const db = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD) : undefined,
  port: Number(process.env.DB_PORT),
  // If you're on a managed DB that requires SSL, uncomment:
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

// Optional: quick sanity check at boot (remove if you prefer)
db.query("SELECT 1").catch(err => {
  console.error("DB connection failed:", err);
  process.exit(1);
});
export default db;