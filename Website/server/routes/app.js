// server/routes/app.js  
import express from "express";
import cors from "cors";
import { db } from "../db/config.js";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";

const app = express();
app.use(cors());
app.use(express.json());
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://unpkg.com"],
      styleSrc:  ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:   ["'self'", "https://fonts.gstatic.com"],
      imgSrc:    ["'self'", "data:"],
      connectSrc:["'self'"]
    }
  }
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.resolve(__dirname, "../../client"); 


app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/countries", async (req, res, next) => {
  try {
    const rows = await db.all("SELECT name, iso3 FROM country ORDER BY name");
    res.json(rows);
  } catch (err) { next(err); }
});

app.get("/api/indicators", async (req, res, next) => {
  try {
    const rows = await db.all(
      "SELECT code, name, unit, igroup FROM indicator ORDER BY igroup, code"
    );
    res.json(rows);
  } catch (err) { next(err); }
});

app.get("/api/country/:iso3/series", async (req, res, next) => {
  const codes = (req.query.codes || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!codes.length) return res.status(400).json({ error: "codes required" });

  try {
    const placeholders = codes.map(() => "?").join(",");
    const query = `
      SELECT i.code, i.name, i.unit, d.year, d.value
      FROM datapoint d
      JOIN indicator i ON i.id = d.indicator_id
      JOIN country  c ON c.id = d.country_id
      WHERE c.iso3 = ? AND i.code IN (` + placeholders + `)
      ORDER BY i.code, d.year
    `;
    const params = [req.params.iso3, ...codes];
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

app.get("/api/indicator/:code/slice", async (req, res, next) => {
  const { code } = req.params;
  const { year, countries = "BRA,POL,KOR" } = req.query;
  if (!year) return res.status(400).json({ error: "year required" });

  try {
    const list = countries.split(",").map(s => s.trim());
    const placeholders = list.map(() => "?").join(",");
    const query = `
      SELECT c.iso3, d.value
      FROM datapoint d
      JOIN indicator i ON i.id = d.indicator_id
      JOIN country  c ON c.id = d.country_id
      WHERE i.code = ? AND d.year = ? AND c.iso3 IN (` + placeholders + `)
      ORDER BY c.iso3
    `;
    const params = [code, year, ...list];
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

app.get("/api/country/:iso3/panel", async (req, res, next) => {
  const envMap = {
    co2: "EN.ATM.CO2E.PC",
    pm25: "EN.ATM.PM25.MC.M3",
    forest: "AG.LND.FRST.ZS",
  };
  const envCode = envMap[(req.query.env || "co2").toLowerCase()];

  try {
    const rows = await db.all(
      `
      SELECT d.year,
        MAX(CASE WHEN i.code = 'NY.GDP.MKTP.CD' THEN d.value END) AS gdp,
        MAX(CASE WHEN i.code = ? THEN d.value END) AS env,
        MAX(CASE WHEN i.code = 'POL.EPS' THEN d.value END) AS policy_eps
      FROM datapoint d
      JOIN indicator i ON i.id = d.indicator_id
      JOIN country  c ON c.id = d.country_id
      WHERE c.iso3 = ? AND i.code IN ('NY.GDP.MKTP.CD', 'POL.EPS', ?)
      GROUP BY d.year
      ORDER BY d.year
      `,
      [envCode, req.params.iso3, envCode]
    );
    res.json(rows);
  } catch (err) { next(err); }
});


app.get("/api/country/:iso3/gdp", async (req, res, next) => {
  try {
    const rows = await db.all(
      `
      SELECT c.name, d.year, d.value AS gdp
      FROM datapoint d
      JOIN indicator i ON i.id = d.indicator_id
      JOIN country  c ON c.id = d.country_id
      WHERE c.iso3 = ? AND i.code = 'NY.GDP.MKTP.CD'
      ORDER BY d.year
      `,
      [req.params.iso3]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

app.get("/api/country/:iso3/policies", async (req, res, next) => {
  try {
    const rows = await db.all(
      `
      SELECT DISTINCT i.code, i.name AS indicator_name, d.year AS start_year
      FROM datapoint d
      JOIN indicator i ON i.id = d.indicator_id
      JOIN country  c ON c.id = d.country_id
      WHERE c.iso3 = ? AND i.igroup = 'POL' AND d.value > 0
      ORDER BY d.year
      `,
      [req.params.iso3]
    );
    res.json(rows);
  } catch (err) { next(err); }
});


app.use(express.static(CLIENT_DIR)); 


app.get("/", (req, res) => {
  res.sendFile(path.resolve(CLIENT_DIR, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error", detail: err.message });
});

// ✅ serve vendor libs from node_modules
app.use(
  "/vendor",
  express.static(path.join(__dirname, "..", "..", "node_modules"))
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ SQLite API running at http://localhost:${PORT}`);
  console.log(`📡 Access from other devices: http://[YOUR_PI_IP]:${PORT}`);
  console.log(`💡 Test API health: http://localhost:${PORT}/api/health`);
  console.log(`📂 Serving frontend from: ${CLIENT_DIR}`);
});
