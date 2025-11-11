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
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// __dirname = Website/server/db
const ROOT    = path.resolve(__dirname, "..", "..");     // -> Website/
const DB_PATH = path.join(ROOT,"server", "db", "eco_env.sqlite"); // <- SAME as seeder

sqlite3.verbose(); // helpful debugging logs

console.log("🔗 SQLite path:", dbPath);

console.log("🔗 Using DB:", DB_PATH);

// Guard: warn if file missing or suspiciously small
try {
  const stat = fs.statSync(dbPath);
  if (stat.size < 1024) {
    console.warn("⚠️ DB file exists but is very small. Is this the right database?");
  }
} catch {
  console.warn("⚠️ DB file not found at that path. You might be creating a new empty DB.");
}


export const db = await open({
  filename: DB_PATH,
  driver: sqlite3.Database,
});

console.log("✅ database connect successfully！");

await db.exec("PRAGMA journal_mode = WAL;");
await db.exec("PRAGMA synchronous = NORMAL;");
console.log("Journal mode: WAL, Synchronous: NORMAL");
const t = await db.get(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='country'"
);
if (!t) {
  console.warn('⚠️ Table "country" not found. Did you open the correct DB file?');
}
