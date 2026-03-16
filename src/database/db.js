// src/database/db.js
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const db = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD) : undefined,
  port: Number(process.env.DB_PORT) || 5432,
  // If you're on a managed DB that requires SSL, uncomment:
  // ssl: { rejectUnauthorized: false },
});

export default db;