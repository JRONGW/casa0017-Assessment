// SQL Connection Configuration
/*import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host:'localhost', 
  user:'root', 
  password:'password', 
  database:'eco_env',
  waitForConnections:true, 
  connectionLimit:10,
  namedPlaceholders:true
});

try {
  const conn = await pool.getConnection();
  console.log("✅ database connect successfully！");
  conn.release();
} catch (err) {
  console.error("❌ database connect failed：", err.message);
}*/
import sqlite3 from "sqlite3";
import { open } from "sqlite"; 
import path from "path";
import { fileURLToPath } from "url";

// __dirname setup //
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite connection //
const dbPath = path.resolve(__dirname, "eco_env.sqlite");

console.log("🔗 SQLite path:", dbPath);

export const db = await open({
  filename: dbPath,
  driver: sqlite3.Database,
});
console.log("✅ database connect successfully！");

await db.exec("PRAGMA journal_mode = DELETE;");