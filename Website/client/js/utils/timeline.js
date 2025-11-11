// Timeline feature code goes here/* ===================== 1) Data (by country name) ===================== */
/* DATA[country][year][metric] is a number from 0 to 1 */
// 改这个part就好中间的数据处理逻辑我都写好了 你写好导入到这几个数列里就行
/* var DATA = {
  "Brazil": {
    2000: { air: 0.35, forest: 0.82, water: 0.40, gdp: 655 }, 
    2005: { air: 0.42, forest: 0.79, water: 0.46, gdp: 884 },
    2010: { air: 0.55, forest: 0.75, water: 0.53, gdp: 2200 },
    2015: { air: 0.60, forest: 0.71, water: 0.58, gdp: 1800 },
    2020: { air: 0.65, forest: 0.69, water: 0.62, gdp: 1445 }
  },

  "Poland": {
    2000: { air: 0.30, forest: 0.47, water: 0.35, gdp: 172 },
    2005: { air: 0.45, forest: 0.50, water: 0.40, gdp: 306 }, 
    2010: { air: 0.58, forest: 0.53, water: 0.48, gdp: 480 },
    2015: { air: 0.66, forest: 0.56, water: 0.55, gdp: 545 },
    2020: { air: 0.72, forest: 0.59, water: 0.60, gdp: 595 }
  },

  "South Korea": {
    2000: { air: 0.28, forest: 0.63, water: 0.38, gdp: 576 },
    2005: { air: 0.36, forest: 0.65, water: 0.44, gdp: 934 },
    2010: { air: 0.50, forest: 0.66, water: 0.52, gdp: 1200 },
    2015: { air: 0.61, forest: 0.67, water: 0.59, gdp: 1410 },
    2020: { air: 0.68, forest: 0.68, water: 0.66, gdp: 1630 }
  }
};*/

var COUNTRIES = ["Brazil", "Poland", "South Korea"];
var WORLD_GEOJSON_URL = "/src/map.geojson";
var GDP_MIN = Infinity;
var GDP_MAX = -Infinity;

// api data fetch + process -> fill DATA
var DATA = {}; 
var ISO3_BY_NAME = { "Brazil":"BRA", "Poland":"POL", "South Korea":"KOR" };

// tools: min/max + normalize 0~1
function _minmax(arr){
  var min=Infinity,max=-Infinity;
  arr.forEach(v=>{
    if(v==null || !isFinite(v)) return;
    if(v<min) min=v; if(v>max) max=v;
  });
  if(!isFinite(min)||!isFinite(max)||min===max){min=0;max=1;}
  return {min,max};
}
function _norm01(v,min,max){
  if(v==null || !isFinite(v)) return null;
  if(max===min) return 0;
  var x=(v-min)/(max-min);
  return Math.max(0,Math.min(1,x));
}

const API_BASE = "";

// backend API fetch for a country's series data
async function _fetchCountrySeries(iso3){
  var codes = [
    'NY.GDP.MKTP.CD',     // GDP
    'EN.ATM.PM25.MC.M3',  // PM2.5 -> air (lower is better)
    'AG.LND.FRST.ZS',     // forest (higher is better)
    'EN.ATM.CO2E.PC'      // CO2 -> co2 (lower is better)
  ].join(',');

  var url = `${API_BASE}/api/country/${iso3}/series?codes=${encodeURIComponent(codes)}`;
  var res = await fetch(url);
  if(!res.ok) throw new Error('API error: '+url);
  return await res.json();
}

// pivot fetched rows into per-year records
function _pivotSeries(rows){
  var byYear = {};
  rows.forEach(r=>{
    var y = Number(r.year);
    if(!byYear[y]) byYear[y] = {};
    if (r.code === 'NY.GDP.MKTP.CD')    byYear[y].gdp    = r.value;
    if (r.code === 'EN.ATM.PM25.MC.M3') byYear[y].pm25  = r.value;
    if (r.code === 'AG.LND.FRST.ZS')    byYear[y].forest= r.value;
    if (r.code === 'EN.ATM.CO2E.PC')    byYear[y].co2raw= r.value; // raw CO2 value
  });
  return byYear;
}

// load data from API and process into DATA
async function loadDATAFromAPI(){
  var rawByCountry = {};
  for (var i=0;i<COUNTRIES.length;i++){
    var name = COUNTRIES[i];
    var iso3 = ISO3_BY_NAME[name];
    var rows = await _fetchCountrySeries(iso3);
    rawByCountry[name] = _pivotSeries(rows);
  }

  // compute min/max for each metric
  var allPM25=[], allForest=[], allCO2=[];
  Object.values(rawByCountry).forEach(byYear=>{
    Object.values(byYear).forEach(rec=>{
      if(rec.pm25   != null) allPM25.push(rec.pm25);
      if(rec.forest != null) allForest.push(rec.forest);
      if(rec.co2raw != null) allCO2.push(rec.co2raw);
    });
  });
  var Rpm   = _minmax(allPM25);
  var Rfor  = _minmax(allForest);
  var Rco2  = _minmax(allCO2);

  // normalize into 0~1 and invert where needed
  DATA = {};
  Object.entries(rawByCountry).forEach(([name, byYear])=>{
    DATA[name] = {};
    Object.entries(byYear).forEach(([yStr, rec])=>{
      var y = Number(yStr);
      // air: PM2.5 lower is better -> 1 - normalized value
      var air01    = rec.pm25   == null ? null : (1 - _norm01(rec.pm25,   Rpm.min,  Rpm.max));
      // forest: higher is better -> normalized value
      var forest01 = rec.forest == null ? null :      _norm01(rec.forest, Rfor.min, Rfor.max);
      // co2: lower is better -> 1 - normalized value
      var co201    = rec.co2raw == null ? null : (1 - _norm01(rec.co2raw, Rco2.min, Rco2.max));

      DATA[name][y] = { air: air01, forest: forest01, co2: co201, gdp: rec.gdp };
    });
  });

  // compute GDP range for money stacks
  if (typeof computeGdpRange === 'function') computeGdpRange();
  if (typeof updateLegend === 'function')    updateLegend();
  if (typeof redrawAll === 'function')       redrawAll();
}

// immediate load
(async function(){
  try {
    await loadDATAFromAPI();
  } catch (e) {
    console.error(e);
    alert('data loading failed' + (e.message || e));
  }
})();

/* ===================== 2) Constants and helpers ===================== 
var COUNTRIES = ["Brazil", "Poland", "South Korea"];
var WORLD_GEOJSON_URL = "./src/map.geojson";
var GDP_MIN = Infinity;
var GDP_MAX = -Infinity; */


// Per-country max zoom to balance visual scale
const MAX_ZOOM_MAP = { Brazil: 5.5, Poland: 5.0, "South Korea": 4.5 };

// Per-country visual tweaks to equalize perceived size
const ZOOM_TWEAK = { Brazil: 0.0, Poland: 0.25, "South Korea": 0.55 }; // was 0.55
const PAD_TWEAK  = { Brazil: 0,   Poland: -4,   "South Korea": -8 };  // was -8


/* Make names comparable: lower case, remove extra chars */
function normName(s) {
  var x = String(s || "");
  x = x.toLowerCase();
  x = x.replace(/[,]/g, "");
  x = x.replace(/[_\-]+/g, " ");
  x = x.replace(/\s+/g, " ");
  x = x.trim();
  return x;
}

/* Map different spellings to the same display name */
var NAME_SYNONYMS = new Map([
  ["brazil", "Brazil"],
  ["poland", "Poland"],
  ["south korea", "South Korea"],
  ["korea south", "South Korea"],
  ["korea republic of", "South Korea"],
  ["republic of korea", "South Korea"],
  ["korea_south", "South Korea"]
]);

function unifyToDisplayName(raw) {
  var key = normName(raw);
  return NAME_SYNONYMS.get(key) || raw;
}

/* Check if a geojson feature matches a display name */
function featureMatchesName(props, displayName) {
  var list = [];
  if (props && props.shapeName) list.push(props.shapeName);
  if (props && props.ADMIN) list.push(props.ADMIN);
  if (props && props.NAME_EN) list.push(props.NAME_EN);
  if (props && props.NAME) list.push(props.NAME);

  var i, u = [];
  for (i = 0; i < list.length; i++) {
    u.push(normName(unifyToDisplayName(list[i])));
  }
  return u.indexOf(normName(displayName)) !== -1;
}

/* Safe id for DOM: spaces -> hyphens */
function idFromName(name) {
  return name.replace(/\s+/g, "-");
}

/* ===================== 3) Color and legend ===================== */
const COLOR_RAMP = [
  "rgba(205, 180, 219, 1)", // low (v=0)
  "rgba(195, 207, 109, 1)"  // high (v=1)
];

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function parseRGBA(str){
  // accepts "rgba(r,g,b,a)" or "rgb(r,g,b)"
  const nums = str.replace(/[^\d.,]/g, "").split(",").map(Number);
  const [r,g,b,a=1] = nums;
  return { r, g, b, a };
}

function mix(a, b, t){ return a + (b - a) * t; }

function mixRGBA(c1, c2, t){
  const a = parseRGBA(c1), b = parseRGBA(c2);
  const r = Math.round(mix(a.r, b.r, t));
  const g = Math.round(mix(a.g, b.g, t));
  const bch = Math.round(mix(a.b, b.b, t));
  const alpha = mix(a.a, b.a, t);
  return `rgba(${r}, ${g}, ${bch}, ${alpha})`;
}


function colorFromValue01(v){
  const t = clamp01(Number.isFinite(v) ? v : 0);
  return mixRGBA(COLOR_RAMP[0], COLOR_RAMP[1], t);
}

function updateLegend() {
  const left  = colorFromValue01(0);  // low
  const right = colorFromValue01(1);  // high

  const elH = document.getElementById("legendBarH");
  if (elH) elH.style.background = `linear-gradient(90deg, ${left} 0%, ${right} 100%)`;
}


/* ===================== 4) Map caches ===================== */
var mapsByName = {};   // { "Brazil": LeafletMap, ... }
var layersByName = {}; // { "Brazil": GeoJSON layer, ... }

var WORLD_GEOJSON = null;
/* Load world geojson only once */
function loadWorld() {
  if (WORLD_GEOJSON) return Promise.resolve(WORLD_GEOJSON);
  return fetch(WORLD_GEOJSON_URL).then(function (res) {
    if (!res.ok) throw new Error("Failed to load " + WORLD_GEOJSON_URL);
    return res.json();
  }).then(function (json) {
    WORLD_GEOJSON = json;
    return json;
  });
}

/* Compute padding (in pixels) based on container size */
function calcPaddingPx(containerEl) {
  var rect = containerEl && containerEl.getBoundingClientRect
    ? containerEl.getBoundingClientRect()
    : { width: 420, height: 420 };
  var base = Math.min(rect.width, rect.height);
  var p = Math.round(base * 0.04);  // 4% padding
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



/* ===================== 6) Redraw on metric/year change ===================== */
// Update maps and money when metric or year changes
function redrawAll() {
  var metricSel = document.getElementById("metricSel");
  var yearInput = document.getElementById("yearInput");
  var yearValEl = document.getElementById("yearVal");
  if (!metricSel || !yearInput) return;

  var metric = metricSel.value;
  var year = Number(yearInput.value);
  if (yearValEl) yearValEl.textContent = year;

  // Update each country
  for (var i = 0; i < COUNTRIES.length; i++) {
    var name = COUNTRIES[i];
    var layer = layersByName[name];

    // Data for this country
    var rec = (DATA[name] && DATA[name][year]) ? DATA[name][year] : null;

    // Map color uses the selected metric
    var envVal = rec ? rec[metric] : null;
    var fill = (envVal == null) ? "#eeeeee" : colorFromValue01(envVal);

    if (layer) {
      layer.setStyle({ fillColor: fill, fillOpacity: 1 });
      layer.eachLayer(function (shape) {
        shape.unbindTooltip();
        var txt = name + " • " + metric + ": " + (envVal == null ? "n/a" : envVal.toFixed(2));
        shape.bindTooltip(txt, { sticky: true });
      });
    }

    // Money uses GDP only
    var gdpRaw = rec ? rec.gdp : null;
    var gdp01 = scale01(gdpRaw, GDP_MIN, GDP_MAX);
    updateCash(name, gdp01);
  }

  // Update legend
  updateLegend();
}


/* ===================== 7) Money stacks (horizontal) ===================== */
// function cashScale(v01) {
//   var v = Number(v01);
//   if (!isFinite(v)) v = 0;
//   if (v < 0) v = 0;
//   if (v > 1) v = 1;
//   return Math.pow(v, 0.85);  // slightly more sensitive for small values
// }


function computeGdpRange() {
  GDP_MIN = Infinity;
  GDP_MAX = -Infinity;
  COUNTRIES.forEach(function(name){
    var years = DATA[name] || {};
    Object.keys(years).forEach(function(y){
      var g = years[y].gdp;
      if (g == null) return;
      if (g < GDP_MIN) GDP_MIN = g;
      if (g > GDP_MAX) GDP_MAX = g;
    });
  });
  if (!isFinite(GDP_MIN) || !isFinite(GDP_MAX) || GDP_MIN === GDP_MAX) {
    GDP_MIN = 0; GDP_MAX = 1; // 防御
  }
}

function scale01(v, vmin, vmax){
  if (v == null || !isFinite(v)) return 0;
  if (v <= vmin) return 0;
  if (v >= vmax) return 1;
  return (v - vmin) / (vmax - vmin);
}

// ----- Money stacks (multi-line) -----
const CASH_PER_ROW   = 12;    // how many notes per row
const NOTE_SPACING_X = 20;   // horizontal overlap/spacing (px)
const NOTE_SPACING_Y = 38;   // vertical spacing between rows (px)
const NOTE_WIDTH_PX  = 30;   // image width (you can match your CSS)


function updateCash(countryName, val01) {
  const id = idFromName(countryName);
  const el = document.getElementById("stack-" + id);
  if (!el) return;

  // how many notes from 0..10 (or tweak maxNotes)
  const maxNotes = 50; // allow more notes so rows appear
  const count = Math.round((val01 || 0) * maxNotes);

  // clear old
  el.innerHTML = "";

  // calculate rows/cols
  const rows = Math.max(1, Math.ceil(count / CASH_PER_ROW));
  const cols = Math.min(count, CASH_PER_ROW);

  // resize the container to fit rows (and keep it compact)
  const neededHeight = rows * NOTE_SPACING_Y + 20;
  el.style.height = Math.max(neededHeight, 60) + "px";

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / CASH_PER_ROW);      // 0..rows-1
    const col = i % CASH_PER_ROW;                  // 0..CASH_PER_ROW-1

    const img = document.createElement("img");
    img.src = "/img/money.png";
    img.className = "cash-note";
    // position: left-to-right, build upward
    img.style.left = (col * NOTE_SPACING_X) + "px";
    img.style.top  = (rows - 1 - row) * NOTE_SPACING_Y + "px"; // higher rows appear behind
    img.style.width = NOTE_WIDTH_PX + "px";
    el.appendChild(img);
  }
}


/* ===================== 8) Init ===================== */
(function init() {
  Promise.all([
    buildCountry("map-brazil", "Brazil"),
    buildCountry("map-poland", "Poland"),
    buildCountry("map-korea", "South Korea")
  ]).then(function () {
    /* bind events */
    var metricSel = document.getElementById("metricSel");
    var yearInput = document.getElementById("yearInput");
    if (metricSel) metricSel.addEventListener("change", redrawAll);
    if (yearInput) yearInput.addEventListener("input", redrawAll);

    computeGdpRange();
    updateLegend();
    redrawAll();

    /* On resize, refresh sizes and fit again using country max zoom */
    function refreshAllMaps() {
      for (var i = 0; i < COUNTRIES.length; i++) {
        var name = COUNTRIES[i];
        var m = mapsByName[name];
        var layer = layersByName[name];
        if (!m || !layer) continue;
        m.invalidateSize();
        var b = layer.getBounds();
        if (b && b.isValid && b.isValid()) {
          var pad = calcPaddingPx(m.getContainer());
          var maxZ = MAX_ZOOM_MAP[name] || 6;
          m.fitBounds(b, { padding: [pad, pad], maxZoom: maxZ });
        }
      }
    }

    requestAnimationFrame(refreshAllMaps);
    window.addEventListener("resize", refreshAllMaps);
  });
})();