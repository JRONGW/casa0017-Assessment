// This is where your JavaScript will go

import "../css/home.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as TWEEN from "@tweenjs/tween.js";
import * as turf from "@turf/turf";

import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

/* -------- Public URLs (because files live in /public now) -------- */
const WORLD_TEXTURE_URL        = "/assets/world_white.png";
const TREECOVER_ASC_URL        = "/data/forestclipped.asc";
const GDP_ASC_URL              = "/data/2000GDPresample.asc";
const COUNTRY_BRAZIL_URL       = "/data/Brazil.geojson";
const COUNTRY_POLAND_URL       = "/data/Poland.geojson";
const COUNTRY_SOUTHKOREA_URL   = "/data/SouthKorea.geojson";
const GLOBAL_BOUNDARIES_URL    = "/data/globalboundaries_simplified.geojson";

const DEV_CACHE_BUSTER = import.meta.env.DEV ? `?v=${Date.now()}` : "";
const bust = (u) => `${u}${DEV_CACHE_BUSTER}`;

async function fetchText(u){
  const r = await fetch(bust(u));
  if (!r.ok) throw new Error(`Failed to fetch ${u}: ${r.status}`);
  return r.text();
}
async function fetchJSON(u){
  const r = await fetch(bust(u));
  if (!r.ok) throw new Error(`Failed to fetch ${u}: ${r.status}`);
  return r.json();
}


/* ---------------- Tweens ---------------- */
class TweenManager {
  constructor(){ this.numTweensRunning = 0; }
  _handleComplete(){ --this.numTweensRunning; console.assert(this.numTweensRunning >= 0); }
  createTween(targetObject){
    const self = this;
    ++this.numTweensRunning;
    let userCompleteFn = () => {};
    const tween = new TWEEN.Tween(targetObject).onComplete(function(...args){
      self._handleComplete();
      userCompleteFn.call(this, ...args);
    });
    tween.onComplete = (fn) => { userCompleteFn = fn; return tween; };
    return tween;
  }
  update(){ TWEEN.update(); return this.numTweensRunning > 0; }
}

/* ---------------- Main ---------------- */
function main() {
  const canvas = document.querySelector("#c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const tweenManager = new TweenManager();

  const fov = 60, aspect = 2, near = 0.1, far = 10;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.set(4, 0, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.5;
  controls.maxDistance = 3;
  controls.update();

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  // --- mapping fudge (must match rasters & bars) ---
  const lonFudge = Math.PI * 0.5;
  const latFudge = Math.PI * -0.135;

  // projector helpers at scene root
  const lonHelperLL = new THREE.Object3D(); scene.add(lonHelperLL);
  const latHelperLL = new THREE.Object3D(); lonHelperLL.add(latHelperLL);
  const posHelperLL = new THREE.Object3D(); posHelperLL.position.z = 1.01; // a hair above the globe
  latHelperLL.add(posHelperLL);

  function normLon(lon) {
    let L = lon;
    if (L > 180) L -= 360;
    if (L < -180) L += 360;
    return L;
  }
  function normLon360(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180; // [-180,180)
  }
  function projectLL(lat, lon) {
    lonHelperLL.rotation.y = THREE.MathUtils.degToRad(normLon(lon)) + lonFudge;
    latHelperLL.rotation.x = THREE.MathUtils.degToRad(lat) + latFudge;
    posHelperLL.updateWorldMatrix(true, false);
    return new THREE.Vector3().setFromMatrixPosition(posHelperLL.matrixWorld);
  }
  function vector3ToLatLon(v) {
    const r = v.length();
    const phi = Math.acos(v.y / r);
    const theta = Math.atan2(v.z, v.x);
    const lat = 90 - THREE.MathUtils.radToDeg(phi);
    let lon = THREE.MathUtils.radToDeg(theta);
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    return { lat, lon };
  }

  function requestRenderIfNotRequested() {
    if (!renderRequested) {
      renderRequested = true;
      requestAnimationFrame(render);
    }
  }

  /* ---------- Globe ---------- */
  let earthMesh;
  {
    const loader = new THREE.TextureLoader();
    const texture = loader.load(WORLD_TEXTURE_URL, () => requestRenderIfNotRequested());
    const geometry = new THREE.SphereGeometry(1, 64, 32);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    earthMesh = new THREE.Mesh(geometry, material);
    earthMesh.rotation.y = Math.PI * -0.5;
    scene.add(earthMesh);

    const atmosphereShader = {
      uniforms: {},
      vertexShader: `
        varying vec3 vNormal;
        void main(){
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        varying vec3 vNormal;
        void main(){
          float intensity = pow(0.8 - dot(vNormal, vec3(0,0,1.0)), 12.0);
          gl_FragColor = vec4(1.0,1.0,1.0,1.0) * intensity;
        }`
    };
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(atmosphereShader.uniforms),
      vertexShader: atmosphereShader.vertexShader,
      fragmentShader: atmosphereShader.fragmentShader,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true
    });
    const atmosphereMesh = new THREE.Mesh(new THREE.SphereGeometry(1.07, 40, 30), atmosphereMaterial);
    atmosphereMesh.scale.set(1.1, 1.1, 1.1);
    scene.add(atmosphereMesh);
  }

  /* ---------- Groups & materials ---------- */

  const LINE2_MATERIALS = [];

  function line2FromPoints(points, material) {
    // points: THREE.Vector3[]
    const positions = [];
    for (const p of points) { positions.push(p.x, p.y, p.z); }
    const geom = new LineGeometry();
    geom.setPositions(positions);
    const line = new Line2(geom, material);
    line.computeLineDistances();
    return line;
  }


  const countryOutlineGroup = new THREE.Group(); countryOutlineGroup.rotation.y = Math.PI * -0.5; scene.add(countryOutlineGroup);
  const globalBoundariesGroup = new THREE.Group(); globalBoundariesGroup.rotation.y = Math.PI * -0.5; scene.add(globalBoundariesGroup);
  const labelGroup = new THREE.Group(); labelGroup.rotation.y = Math.PI * -0.5; scene.add(labelGroup);

  const outlineMaterial = new THREE.LineBasicMaterial({
    color: 0x111111, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  });

  // NEW: a second group that’s slightly larger to fake a halo
  const countryGlowGroup = new THREE.Group();
  countryGlowGroup.rotation.y = Math.PI * -0.5;
  countryGlowGroup.scale.set(1.03, 1.03, 1.03);   // push ~2% off the globe
  countryGlowGroup.renderOrder = 999;             // draw late
  scene.add(countryGlowGroup);

  // global boundaries stay subtle

  globalBoundariesGroup.rotation.y = Math.PI * -0.5;
  scene.add(globalBoundariesGroup);

  // materials
  const selectedOutlineMaterial = new THREE.LineBasicMaterial({
    color: 0xa2a6b1,       
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  });

  const selectedGlowMaterial = new THREE.LineBasicMaterial({
    color: 0xf3edc7,       // glow color 
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false
  });

  const globalBoundariesMaterial = new THREE.LineBasicMaterial({
    color: 0xbfc5cc,       // light grey so it sits back on white
    transparent: true,
    opacity: 0.25,
    depthWrite: false
  });

  // “thin” crisp outline (in screen pixels, independent of zoom)
  const selectedOutlineMat2 = new LineMaterial({
    color: 0x0f0f0f,
    transparent: true,
    opacity: 0.9,
    linewidth: 0.6,         // <= thinner than 1px look
  });
  LINE2_MATERIALS.push(selectedOutlineMat2);

  const selectedGlowMat2 = new LineMaterial({
    color: 0xffd24d,        // yellow
    transparent: true,
    opacity: 0.9,
    linewidth: 2.0,         // thick halo line
    dashed: false
  });
  LINE2_MATERIALS.push(selectedGlowMat2);


  const geoJsonLatOffset = 25;

  /* ---------- Labels ---------- */
  const LABEL_NORMAL = { text: "rgba(132, 132, 132, 0.95)", underline: "rgba(57, 57, 57, 0.85)" };
  const LABEL_HOVER = { text: "#ffd24d", underline: "#ffd24d" };

  const LABEL_FONT_SIZE = 16;
  const LABEL_FONT_WEIGHT = 200;
  const LABEL_WORLD_HEIGHT = 0.10;
  const LABEL_UNDERLINE_THICKNESS = 1;
  const LABEL_PADDING_X = 4, LABEL_PADDING_Y = 3;

  function drawLabelTexture(text, hovered = false) {
    const colorsNormal = { text: "rgba(132,132,132,0.95)", underline: "rgba(57,57,57,0.85)" };
    const colorsHover  = { text: "#ffd24d", underline: "#ffd24d" };
    const colors = hovered ? colorsHover : colorsNormal;

    const font = `${LABEL_FONT_WEIGHT} ${LABEL_FONT_SIZE}px Georgia, serif`;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) {
      // Fallback to a tiny texture if 2D context is unavailable
      c.width = c.height = 2;
      const tex = new THREE.CanvasTexture(c);
      return { texture: tex, width: 2, height: 2 };
    }

    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width);
    const h = Math.ceil(LABEL_FONT_SIZE * 1.25);
    const cw = w + LABEL_PADDING_X * 2;
    const ch = h + LABEL_PADDING_Y * 2;

    const pot = (n) => 2 ** Math.ceil(Math.log2(n));
    c.width = pot(cw);
    c.height = pot(ch);

    // scale so drawing area is cw×ch inside the POT canvas
    ctx.setTransform(c.width / cw, 0, 0, c.height / ch, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    ctx.font = font;
    ctx.fillStyle = colors.text;
    ctx.textBaseline = "middle";
    const midY = ch / 2;
    ctx.fillText(text, LABEL_PADDING_X, midY);

    // underline
    const underlineY = midY + Math.floor(LABEL_FONT_SIZE / 2) - 4 + 5;
    ctx.beginPath();
    ctx.moveTo(LABEL_PADDING_X, underlineY);
    ctx.lineTo(LABEL_PADDING_X + w, underlineY);
    ctx.lineWidth = LABEL_UNDERLINE_THICKNESS;
    ctx.strokeStyle = colors.underline;
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return { texture: tex, width: cw, height: ch };
  }

  function makeTextSprite(text) {
    const { texture, width, height } = drawLabelTexture(text, false);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture, transparent: true, depthTest: false, depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);

    const aspect = (width / height) || 1;
    sprite.scale.set(LABEL_WORLD_HEIGHT * aspect, LABEL_WORLD_HEIGHT, 1);
    sprite.renderOrder = 1000;

    sprite.userData._hovered = false;
    sprite.userData.updateHover = (hovered) => {
      if (sprite.userData._hovered === hovered) return;
      sprite.userData._hovered = hovered;
      const r = drawLabelTexture(text, hovered);
      sprite.material.map.dispose();
      sprite.material.map = r.texture;
      const asp2 = (r.width / r.height) || 1;
      sprite.scale.set(LABEL_WORLD_HEIGHT * asp2, LABEL_WORLD_HEIGHT, 1);
      sprite.material.needsUpdate = true;
    };
    return sprite;
  }


  function addCountryLabel({ name, code, lat, lon }) {
    const pos = projectLL(-lat + geoJsonLatOffset, lon);
    const outward = pos.clone().normalize().multiplyScalar(1.02);
    const label = makeTextSprite(name);
    if (!label) return null;
    label.position.copy(outward);
    label.userData.countryCode = code;
    label.name = `label:${code}`;
    labelGroup.add(label);
    return label;
  }

  addCountryLabel({ name: "Brazil", code: "BRA", lat: -10.0, lon: -52.0 });
  addCountryLabel({ name: "Poland", code: "POL", lat: 52.0, lon: 19.0 });
  addCountryLabel({ name: "South Korea", code: "KOR", lat: 36.0, lon: 128.0 });

  /* ---------- Boundaries & helpers ---------- */
  function ringToLine(ring, material) { /* ... unchanged ... */ }
  function ringToLine2(ring, material, scale = 1.0) { /* ... unchanged ... */ }

  function addCountryOutline(feature, parentGroup, material) { /* ... unchanged ... */ }



  // ESRI ASCII parser (normalizes xllcenter/yllcenter to corners)

  function parseData(text) {
    if (!text) throw new Error("ASC text is empty");
    // strip BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    const settings = {};
    const data = [];
    let i = 0;

    // read header (first 6 lines with key value)
    while (i < lines.length && Object.keys(settings).length < 6) {
      const [k, v] = lines[i].trim().split(/\s+/);
      if (k && v !== undefined) settings[k.toLowerCase()] = isNaN(+v) ? v : +v;
      i++;
    }

    // normalize corner vs center
    const ncols = +settings.ncols;
    const nrows = +settings.nrows;
    const cellsize = +settings.cellsize;
    const nodata = settings["nodata_value"] !== undefined ? +settings["nodata_value"] : -9999;

    let xll = settings.xllcorner !== undefined ? +settings.xllcorner : undefined;
    let yll = settings.yllcorner !== undefined ? +settings.yllcorner : undefined;
    if (settings.xllcenter !== undefined) xll = +settings.xllcenter - cellsize * 0.5;
    if (settings.yllcenter !== undefined) yll = +settings.yllcenter - cellsize * 0.5;

    if (!(ncols && nrows && cellsize && xll !== undefined && yll !== undefined)) {
      console.error("Bad ASC header:", settings);
      throw new Error("Invalid ASC header");
    }

    let min, max;
    for (; i < lines.length; i++) {
      const row = lines[i].trim();
      if (!row) continue;
      const nums = row.split(/\s+/).map(s => {
        const v = Number(s);
        return Number.isFinite(v) ? v : NaN;
      });
      data.push(nums);
      for (const v of nums) {
        if (!Number.isFinite(v) || v === nodata) continue;
        min = min === undefined ? v : Math.min(min, v);
        max = max === undefined ? v : Math.max(max, v);
      }
    }

    return { ncols, nrows, xllcorner: xll, yllcorner: yll, cellsize, NODATA_value: nodata, min, max, data };
  }


  const COUNTRY_FEATURES = [];

  async function loadGlobalBoundaries() {
    try {
      const gj = await fetchJSON(GLOBAL_BOUNDARIES_URL);
      const features = gj.type === "FeatureCollection" ? gj.features : gj.type === "Feature" ? [gj] : [];
      const polys = features.filter(f => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"));
      polys.forEach(f => addCountryOutline(f, globalBoundariesGroup, globalBoundariesMaterial));
    } catch (e) { console.error("[global boundaries] Failed to load:", e); }
  }

  async function loadCountries() {
    const infos = [
      { name: "Brazil",      code: "BRA", url: COUNTRY_BRAZIL_URL },     // <-- changed
      { name: "Poland",      code: "POL", url: COUNTRY_POLAND_URL },     // <-- changed
      { name: "South Korea", code: "KOR", url: COUNTRY_SOUTHKOREA_URL }, // <-- changed
    ];
    for (const info of infos) {
      try {
        const gj = await fetchJSON(info.url);
        const features = gj.type === "FeatureCollection" ? gj.features : gj.type === "Feature" ? [gj] : [];
        const polys = features.filter(f => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"));
        polys.forEach(f => {
          const transformGeometry = (geom) => {
            const transformCoords = (coords) => {
              if (typeof coords[0] === "number") { const [lon, lat] = coords; return [lon, -lat + geoJsonLatOffset]; }
              return coords.map(transformCoords);
            };
            const newGeom = { type: geom.type };
            if (geom.type === "Polygon") newGeom.coordinates = geom.coordinates.map(r => transformCoords(r));
            else if (geom.type === "MultiPolygon") newGeom.coordinates = geom.coordinates.map(p => p.map(r => transformCoords(r)));
            return newGeom;
          };
          COUNTRY_FEATURES.push({ type: "Feature", properties: { NAME: info.name, CODE: info.code }, geometry: transformGeometry(f.geometry) });
          addCountryOutline(f, countryOutlineGroup, selectedOutlineMaterial);
          // addCountryOutline(f, countryGlowGroup, selectedGlowMaterial);
        });
      } catch (e) { console.error(`[countries] Failed to load ${info.name}:`, e); }
    }
  }

  /* ---------- Raster bars (generic) ---------- */
  function makeBoxes(file, hueRange, maxBoxes = 150_000, opts = {}) { /* ... unchanged ... */ }

  /* ---------- Layers ---------- */
  async function loadAll() {
    const rasters = [
      // Tree cover
      { key: "tree",   name: "Tree Cover in 2000", hueRange: [0, 0], url: TREECOVER_ASC_URL, opts: { colorRampColors: ["#F7FBEA", "#CBEAA6"] } }, // <-- changed
      // GDP
      { key: "gdpasc", name: "GDP 2000 (ASC)",     hueRange: [0, 0], url: GDP_ASC_URL,       opts: { colorRampColors: ["#D9BFD6", "#3A0D3E"] } }, // <-- keep
    ];
    await Promise.all(
      rasters.map(async (r) => {
        const txt = await fetchText(r.url);
        r.file = parseData(txt);
        console.log("Parsed:", r.key, r.file.nrows, r.file.ncols, r.file.min, r.file.max);
      })
    );

    const rasterMeshes = new Map();
    for (const r of rasters) {
      const geom = makeBoxes(r.file, r.hueRange, 150_000, r.opts);
      const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ vertexColors: true }));
      mesh.rotation.y = Math.PI * -0.5;
      mesh.visible = (r.key === "tree");
      scene.add(mesh);
      rasterMeshes.set(r.key, mesh);
    }

    const uiElem = document.querySelector("#list");
    const layers = [
      { kind: "asc", key: "tree",   name: "Tree Cover in 2000" },
      { kind: "asc", key: "gdpasc", name: "GDP 2000 (ASC)" }
    ];

    async function selectLayer(layer) {
      rasterMeshes.forEach(m => (m.visible = false));
      const m = rasterMeshes.get(layer.key);
      if (m) m.visible = true;

      [...uiElem.children].forEach(li => li.classList.remove("active"));
      const li = [...uiElem.children].find(el => el.textContent === layer.name);
      if (li) li.classList.add("active");
      requestRenderIfNotRequested();
    }

    layers.forEach((layer, i) => {
      const li = document.createElement("li");
      li.textContent = layer.name;
      li.classList.add("year");
      if (i === 0) li.classList.add("active");
      uiElem.appendChild(li);
      li.addEventListener("click", () => selectLayer(layer));
    });

    return () => { };
  }

  /* ---------- Navigation + interactions ---------- */
  function goToCountryDetails(countryCode) {
    const routes = {
      BRA: "../countries/brazil.html",
      POL: "../countries/poland.html",
      KOR: "../countries/south-korea.html",
    };
    window.location.href = routes[countryCode] || "/";
  }

  // ... rest unchanged ...

  async function loadGlobalBoundariesAndCountries() {
    await loadGlobalBoundaries();
    await loadCountries();
  }

  let updateMorphTargets = () => { };
  Promise.all([loadGlobalBoundariesAndCountries(), loadAll()]).then(() => {
    requestRenderIfNotRequested();
  });


  /* ---------- Render loop ---------- */

  let renderRequested = false;
  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) renderer.setSize(width, height, false);
    return needResize;
  }



  function render() {
    renderRequested = false;
    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }
    if (tweenManager.update()) requestRenderIfNotRequested();
    controls.update();
    renderer.render(scene, camera);
  }
  render();


  let lastHoverLabel = null;

  function onPointerMove(event) {
    setMouseFromEvent(mouse, event, renderer.domElement);
    raycaster.setFromCamera(mouse, camera);

    const hit = raycaster.intersectObjects(labelGroup.children, true)[0];
    const hovered = hit ? hit.object : null;

    if (hovered !== lastHoverLabel) {
      if (lastHoverLabel && lastHoverLabel.userData.updateHover) {
        lastHoverLabel.userData.updateHover(false);
      }
      if (hovered && hovered.userData.updateHover) {
        hovered.userData.updateHover(true);
      }
      lastHoverLabel = hovered;
      renderer.domElement.style.cursor = hovered ? "pointer" : "auto";
      requestRenderIfNotRequested();
    }
  }

  function onCountryClick(event) {
    setMouseFromEvent(mouse, event, renderer.domElement);
    raycaster.setFromCamera(mouse, camera);

    const labelHit = raycaster.intersectObjects(labelGroup.children, true)[0];
    if (labelHit && labelHit.object.userData.countryCode) {
      goToCountryDetails(labelHit.object.userData.countryCode);
      requestRenderIfNotRequested();
    }
  }

  function dispatchUI(e) {
    switch (e.type) {
      case "pointermove": onPointerMove(e); break;
      case "click":       onCountryClick(e); break;
      case "resize":
      case "change":      requestRenderIfNotRequested(); break;
    }
  }


  // listeners
  canvas.addEventListener("pointermove", dispatchUI, false);
  canvas.addEventListener("click", dispatchUI, false);
  window.addEventListener("resize", dispatchUI, false);
  controls.addEventListener("change", dispatchUI);

  function setMouseFromEvent(mouse, event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    mouse.x = x * 2 - 1;
    mouse.y = -y * 2 + 1;
  }

}

main();
