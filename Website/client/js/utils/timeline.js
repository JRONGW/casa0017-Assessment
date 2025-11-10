// ==============================
// Timeline Feature — Clean & Sorted
// ==============================

/* 0) Globals & Config ------------------------------- */
const COUNTRIES = ["Brazil", "Poland", "South Korea"];
const WORLD_GEOJSON_URL = "./src/map.geojson";
const API_BASE = "/api";

// GDP range (computed after data load)
let GDP_MIN = Infinity;
let GDP_MAX = -Infinity;

// Per-country max zoom to balance visual scale
const MAX_ZOOM_MAP = { Brazil: 5.5, Poland: 5.0, "South Korea": 5.5 };

// Per-country visual tweaks to equalize perceived size
const ZOOM_TWEAK = { Brazil: 0.0, Poland: 0.25, "South Korea": 0.75 };
const PAD_TWEAK  = { Brazil: 0,   Poland: -4,   "South Korea": -8 }; // px

// Known country name → ISO3
const ISO3_BY_NAME = { Brazil: "BRA", Poland: "POL", "South Korea": "KOR" };

// Data cache: DATA[country][year] = { air, forest, co2, gdp }
let DATA = {};

// Leaflet maps/layers caches
const mapsByName = {};    // { "Brazil": L.Map, ... }
const layersByName = {};  // { "Brazil": L.GeoJSON, ... }
let WORLD_GEOJSON = null;


/* 1) String & name helpers -------------------------- */
function normName(s) {
  let x = String(s || "");
  x = x.toLowerCase()
       .replace(/[,]/g, "")
       .replace(/[_\-]+/g, " ")
       .replace(/\s+/g, " ")
       .trim();
  return x;
}

const NAME_SYNONYMS = new Map([
  ["brazil", "Brazil"],
  ["poland", "Poland"],
  ["south korea", "South Korea"],
  ["korea south", "South Korea"],
  ["korea republic of", "South Korea"],
  ["republic of korea", "South Korea"],
  ["korea_south", "South Korea"]
]);

function unifyToDisplayName(raw) {
  const key = normName(raw);
  return NAME_SYNONYMS.get(key) || raw;
}

function idFromName(name) {
  return name.replace(/\s+/g, "-");
}


/* 2) Math & color helpers --------------------------- */
function _minmax(arr) {
  let min = Infinity, max = -Infinity;
  arr.forEach(v => {
    if (v == null || !isFinite(v)) return;
    if (v < min) min = v;
    if (v > max) max = v;
  });
  if (!isFinite(min) || !isFinite(max) || min === max) {
    min = 0; max = 1;
  }
  return { min, max };
}

function _norm01(v, min, max) {
  if (v == null || !isFinite(v)) return null;
  if (max === min) return 0;
  const x = (v - min) / (max - min);
  return Math.max(0, Math.min(1, x));
}

function scale01(v, vmin, vmax) {
  if (v == null || !isFinite(v)) return 0;
  if (v <= vmin) return 0;
  if (v >= vmax) return 1;
  return (v - vmin) / (vmax - vmin);
}

const COLOR_RAMP = [
  "rgba(205, 180, 219, 1)", // low (v=0)
  "rgba(195, 207, 109, 1)"  // high (v=1)
];

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function parseRGBA(str) {
  const nums = str.replace(/[^\d.,]/g, "").split(",").map(Number);
  const [r, g, b, a = 1] = nums;
  return { r, g, b, a };
}

function mix(a, b, t) { return a + (b - a) * t; }

function mixRGBA(c1, c2, t) {
  const a = parseRGBA(c1), b = parseRGBA(c2);
  const r = Math.round(mix(a.r, b.r, t));
  const g = Math.round(mix(a.g, b.g, t));
  const bb = Math.round(mix(a.b, b.b, t));
  const alpha = mix(a.a, b.a, t);
  return `rgba(${r}, ${g}, ${bb}, ${alpha})`;
}

function colorFromValue01(v) {
  const t = clamp01(Number.isFinite(v) ? v : 0);
  return mixRGBA(COLOR_RAMP[0], COLOR_RAMP[1], t);
}


/* 3) Legend helpers -------------------------------- */
function updateLegend() {
  const top = colorFromValue01(1);
  const bottom = colorFromValue01(0);
  const el = document.getElementById("legendBar");
  if (el) {
    el.style.background = `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`;
  }
}


/* 4) GeoJSON & map utilities ------------------------ */
function featureMatchesName(props, displayName) {
  const list = [];
  if (props && props.shapeName) list.push(props.shapeName);
  if (props && props.ADMIN)     list.push(props.ADMIN);
  if (props && props.NAME_EN)   list.push(props.NAME_EN);
  if (props && props.NAME)      list.push(props.NAME);

  const u = list.map(s => normName(unifyToDisplayName(s)));
  return u.indexOf(normName(displayName)) !== -1;
}

function loadWorld() {
  if (WORLD_GEOJSON) return Promise.resolve(WORLD_GEOJSON);
  return fetch(WORLD_GEOJSON_URL)
    .then(res => {
      if (!res.ok) throw new Error("Failed to load " + WORLD_GEOJSON_URL);
      return res.json();
    })
    .then(json => (WORLD_GEOJSON = json));
}

function calcPaddingPx(containerEl) {
  const rect = containerEl?.getBoundingClientRect
    ? containerEl.getBoundingClientRect()
    : { width: 420, height: 420 };
  const base = Math.min(rect.width, rect.height);
  let p = Math.round(base * 0.04); // 4% padding
  if (p < 16) p = 16;
  if (p > 80) p = 80;
  return p;
}


/* 5) Build one country map -------------------------- */
function buildCountry(elId, countryName) {
  const map = L.map(elId, {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false,
    attributionControl: false
  });

  return loadWorld()
    .then(world => {
      const feats = world.features.filter(f =>
        featureMatchesName(f?.properties || {}, countryName)
      );

      if (feats.length === 0) {
        const host = document.getElementById(elId);
        if (host) {
          host.innerHTML = `<div style="padding:8px;color:#c00;font-size:12px;">
            No feature for ${countryName}
          </div>`;
        }
        return;
      }

      const layer = L.geoJSON(
        { type: "FeatureCollection", features: feats },
        { style: { color: "#778899", weight: 1.2, opacity: 0.9, fillColor: "#ffffff", fillOpacity: 1 } }
      ).addTo(map);

      const maxZ = MAX_ZOOM_MAP[countryName] || 6;
      const b1 = layer.getBounds();
      if (b1?.isValid && b1.isValid()) {
        const pad1 = calcPaddingPx(document.getElementById(elId)) + (PAD_TWEAK[countryName] || 0);
        map.fitBounds(b1, { padding: [pad1, pad1], maxZoom: maxZ });
        map.setZoom(map.getZoom() + (ZOOM_TWEAK[countryName] || 0));
      }

      // Fit again after layout stabilizes
      requestAnimationFrame(() => {
        map.invalidateSize();
        const b2 = layer.getBounds();
        if (b2?.isValid && b2.isValid()) {
          const pad2 = calcPaddingPx(document.getElementById(elId)) + (PAD_TWEAK[countryName] || 0);
          map.fitBounds(b2, { padding: [pad2, pad2], maxZoom: maxZ });
          map.setZoom(map.getZoom() + (ZOOM_TWEAK[countryName] || 0));
        }
      });

      mapsByName[countryName] = map;
      layersByName[countryName] = layer;
    })
    .catch(err => {
      const host = document.getElementById(elId);
      if (host) {
        host.innerHTML = `<div style="padding:8px;color:#c00;font-size:12px;">
          ${String(err.message || err)}
        </div>`;
      }
    });
}


/* 6) Data: fetch & transform ------------------------ */
async function _fetchCountrySeries(iso3) {
  const codes = [
    "NY.GDP.MKTP.CD",     // GDP
    "EN.ATM.PM25.MC.M3",  // PM2.5 => air (lower better)
    "AG.LND.FRST.ZS",     // forest (higher better)
    "EN.ATM.CO2E.PC"      // CO2 => co2 (lower better)
  ].join(",");

  const url = `${API_BASE}/country/${iso3}/series?codes=${encodeURIComponent(codes)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("API error: " + url);
  return res.json();
}

function _pivotSeries(rows) {
  const byYear = {};
  rows.forEach(r => {
    const y = Number(r.year);
    if (!byYear[y]) byYear[y] = {};
    if (r.code === "NY.GDP.MKTP.CD")    byYear[y].gdp    = r.value;
    if (r.code === "EN.ATM.PM25.MC.M3") byYear[y].pm25   = r.value;
    if (r.code === "AG.LND.FRST.ZS")    byYear[y].forest = r.value;
    if (r.code === "EN.ATM.CO2E.PC")    byYear[y].co2raw = r.value;
  });
  return byYear;
}

async function loadDATAFromAPI() {
  const rawByCountry = {};
  for (let i = 0; i < COUNTRIES.length; i++) {
    const name = COUNTRIES[i];
    const iso3 = ISO3_BY_NAME[name];
    const rows = await _fetchCountrySeries(iso3);
    rawByCountry[name] = _pivotSeries(rows);
  }

  // Min/max per metric (raw)
  const allPM25 = [], allForest = [], allCO2 = [];
  Object.values(rawByCountry).forEach(byYear => {
    Object.values(byYear).forEach(rec => {
      if (rec.pm25   != null) allPM25.push(rec.pm25);
      if (rec.forest != null) allForest.push(rec.forest);
      if (rec.co2raw != null) allCO2.push(rec.co2raw);
    });
  });
  const Rpm  = _minmax(allPM25);
  const Rfor = _minmax(allForest);
  const Rco2 = _minmax(allCO2);

  // Normalize to 0..1, invert where lower-is-better
  DATA = {};
  Object.entries(rawByCountry).forEach(([name, byYear]) => {
    DATA[name] = {};
    Object.entries(byYear).forEach(([yStr, rec]) => {
      const y = Number(yStr);
      const air01    = rec.pm25   == null ? null : (1 - _norm01(rec.pm25,   Rpm.min,  Rpm.max));
      const forest01 = rec.forest == null ? null :      _norm01(rec.forest, Rfor.min, Rfor.max);
      const co201    = rec.co2raw == null ? null : (1 - _norm01(rec.co2raw, Rco2.min, Rco2.max));
      DATA[name][y]  = { air: air01, forest: forest01, co2: co201, gdp: rec.gdp };
    });
  });

  // GDP range for money stacks
  computeGdpRange();
  updateLegend();
  redrawAll?.();
}


/* 7) GDP range + Money stacks ----------------------- */
function computeGdpRange() {
  GDP_MIN = Infinity;
  GDP_MAX = -Infinity;

  COUNTRIES.forEach(name => {
    const years = DATA[name] || {};
    Object.keys(years).forEach(y => {
      const g = years[y].gdp;
      if (g == null) return;
      if (g < GDP_MIN) GDP_MIN = g;
      if (g > GDP_MAX) GDP_MAX = g;
    });
  });

  if (!isFinite(GDP_MIN) || !isFinite(GDP_MAX) || GDP_MIN === GDP_MAX) {
    GDP_MIN = 0;
    GDP_MAX = 1;
  }
}

// Money stacks layout constants
const CASH_PER_ROW   = 12; // notes per row
const NOTE_SPACING_X = 20; // px
const NOTE_SPACING_Y = 50; // px
const NOTE_WIDTH_PX  = 40; // px
const MAX_NOTES      = 50; // for scaling visual range

function updateCash(countryName, val01) {
  const id = idFromName(countryName);
  const el = document.getElementById("stack-" + id);
  if (!el) return;

  const count = Math.round((val01 || 0) * MAX_NOTES);
  el.innerHTML = "";

  const rows = Math.max(1, Math.ceil(count / CASH_PER_ROW));
  const neededHeight = rows * NOTE_SPACING_Y + 20;
  el.style.height = Math.max(neededHeight, 60) + "px";

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / CASH_PER_ROW);
    const col = i % CASH_PER_ROW;

    const img = document.createElement("img");
    img.src = "./img/money.png";
    img.className = "cash-note";
    img.style.left = (col * NOTE_SPACING_X) + "px";
    img.style.top  = (rows - 1 - row) * NOTE_SPACING_Y + "px";
    img.style.width = NOTE_WIDTH_PX + "px";
    el.appendChild(img);
  }
}


/* 8) Redraw on metric/year change ------------------- */
function redrawAll() {
  const metricSel = document.getElementById("metricSel");
  const yearInput = document.getElementById("yearInput");
  const yearValEl = document.getElementById("yearVal");
  if (!metricSel || !yearInput) return;

  const metric = metricSel.value; // 'air' | 'forest' | 'co2'
  const year = Number(yearInput.value);
  if (yearValEl) yearValEl.textContent = year;

  COUNTRIES.forEach(name => {
    const layer = layersByName[name];
    const rec = DATA[name]?.[year] || null;

    // Map fill by metric
    const envVal = rec ? rec[metric] : null;
    const fill = (envVal == null) ? "#eeeeee" : colorFromValue01(envVal);

    if (layer) {
      layer.setStyle({ fillColor: fill, fillOpacity: 1 });
      layer.eachLayer(shape => {
        shape.unbindTooltip();
        const txt = `${name} • ${metric}: ${envVal == null ? "n/a" : envVal.toFixed(2)}`;
        shape.bindTooltip(txt, { sticky: true });
      });
    }

    // Money stacks by GDP
    const gdpRaw = rec ? rec.gdp : null;
    const gdp01 = scale01(gdpRaw, GDP_MIN, GDP_MAX);
    updateCash(name, gdp01);
  });

  updateLegend();
}


/* 9) Init ------------------------------------------- */
(async function init() {
  try {
    await Promise.all([
      buildCountry("map-brazil", "Brazil"),
      buildCountry("map-poland", "Poland"),
      buildCountry("map-korea", "South Korea")
    ]);

    // Bind UI
    const metricSel = document.getElementById("metricSel");
    const yearInput = document.getElementById("yearInput");
    if (metricSel) metricSel.addEventListener("change", redrawAll);
    if (yearInput) yearInput.addEventListener("input", redrawAll);

    // Data
    await loadDATAFromAPI();

    // Final size refresh (after layout stabilizes)
    function refreshAllMaps() {
      COUNTRIES.forEach(name => {
        const m = mapsByName[name];
        const layer = layersByName[name];
        if (!m || !layer) return;
        m.invalidateSize();
        const b = layer.getBounds();
        if (b?.isValid && b.isValid()) {
          const pad = calcPaddingPx(m.getContainer());
          const maxZ = MAX_ZOOM_MAP[name] || 6;
          m.fitBounds(b, { padding: [pad, pad], maxZoom: maxZ });
        }
      });
    }
    requestAnimationFrame(refreshAllMaps);
    window.addEventListener("resize", refreshAllMaps);
  } catch (e) {
    console.error(e);
    alert("data loading failed " + (e.message || e));
  }
})();
