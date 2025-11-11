let chart
var canvas, ctx, flag = false,
    prevX = 0,
    prevY = 0;
currX = 0,
    currY = 0;
dot_flag = false;
var show_flag = false;

const dpr = window.devicePixelRatio || 1;
const API_BASE = "";

var x = "rgba(248, 123, 231, 1)",
    y = 3;
var w, h;

var maxDrawnX = 0;
var drawnSegments = [];
var allLabels = [];
var allValues = [];
var policyData = [];


// Register plugins ONCE at module level
if (window['chartjs-plugin-annotation']) {
  const annotationPlugin = window['chartjs-plugin-annotation'];
  
  Chart.register(
    annotationPlugin,
    {
      id: 'preservedDrawingsAndDeviation',
      afterDraw: (chart) => {
        if (show_flag && drawnSegments.length > 0) {
          drawDeviation(chart);
        }
       
       redrawUserLines();
        
      }
    }
  );
  
} else {
  console.error('Annotation plugin not found');
}

function init() {
    canvas = document.getElementById('canvasChart')
    ctx = canvas.getContext('2d');
    w = canvas.width;
    h = canvas.height
    console.log("w", w, "h", h)

    canvas.addEventListener("mousemove", function (e) {
        findxy('move', e)
    }, false)
    canvas.addEventListener('mousedown', function (e) {
        findxy('down', e)
    }, false)
    canvas.addEventListener('mouseup', function (e) {
        findxy('up', e)
    }, false)
    canvas.addEventListener('mouseout', function (e) {
        findxy('out', e)
    }, false)
}

async function fetchCountryGDP(iso3) {
  try {
    const response = await fetch(`${API_BASE}/api/country/${iso3}/gdp`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();

    // Fetch policy start years first
    policyData = await fetchPolicyStartYears(iso3);
    
    // Get all unique years from both GDP data and policies
    const gdpYears = data.map(item => String(item.year));
    const policyYears = policyData.map(p => String(p.start_year));
    const allYears = [...new Set([...gdpYears, ...policyYears])].sort((a, b) => Number(a) - Number(b));
    
    // Create a map of year -> GDP value
    const gdpByYear = {};
    data.forEach(item => {
      gdpByYear[String(item.year)] = item.gdp;
    });
    
    // Build labels and values arrays including all years
    allLabels = allYears;
    allValues = allYears.map(year => gdpByYear[year] !== undefined ? gdpByYear[year] : null);

    console.log(`Fetched ${data.length} GDP entries for ${iso3}`);
    console.log(`Added ${policyYears.length} policy years to labels`);
    console.log('Total labels:', allLabels.length);
    
    graphUpdate(allLabels, allValues, policyData);
  } catch (err) {
    console.error('Error fetching GDP data:', err);
    alert('Failed to load GDP data from API.');
  }
}


window.init = init;
window.fetchCountryGDP = fetchCountryGDP;

async function fetchPolicyStartYears(iso3) {
  try {
    const response = await fetch(`${API_BASE}/api/country/${iso3}/policies`);
    if (!response.ok) throw new Error('Failed to fetch policy start years');
    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Error fetching policy start years:', err);
    return [];
  }
}

async function fetchPolicyData(iso3, indicatorCode) {
  try {
    const response = await fetch(`${API_BASE}/api/country/${iso3}/series?codes=${indicatorCode}`);
    if (!response.ok) throw new Error('Failed to fetch policy data');
    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Error fetching policy data:', err);
    return [];
  }
}

function erase() {
 
    drawnSegments = [];
    maxDrawnX = window.lastPoint ? window.lastPoint.x : 0;
    show_flag = false;
    graphUpdate(allLabels, allValues, policyData);
}


function showAllData() {
    show_flag = true
    graphUpdate(allLabels, allValues, policyData);
}

function graphUpdate(labels, values, policies = []) {
    if (chart) {
        chart.destroy()
    }

    // Create array with nulls for hidden data points
    let displayValues;
    if (show_flag) {
        displayValues = values;
    } else {
        displayValues = values.map((v, i) =>
          i < values.length / 4 ? v : null
        );
    }
    
    const yMin = Math.min(...values);
    const yMax = Math.max(...values);

    // Group policies by year
    const policiesByYear = {};
    if (policies && policies.length > 0) {
        policies.forEach(policy => {
            if (policy && policy.start_year !== undefined && policy.start_year !== null) {
                const yearString = String(policy.start_year);
                if (!policiesByYear[yearString]) {
                    policiesByYear[yearString] = [];
                }
                policiesByYear[yearString].push(policy.indicator_name || 'Policy');
            }
        });
    }
    // Create annotations object
    const policy_annotations = {};

    // Create one annotation per unique year
    Object.keys(policiesByYear).forEach((yearString, idx) => {
        const policyNames = policiesByYear[yearString];
        
        policy_annotations[`policy${idx}`] = {
            type: 'line',
            xMin: yearString,
            xMax: yearString,
            borderColor: '#da79ceff',
            borderWidth: 1,
            borderDash: [8, 4],
            label: {
                display: false, // Hidden by default
                content: policyNames, // Array of all policy names for this year
                position: 'start',
                yAdjust: -150,
                z: 100,
                color: 'rgba(32, 101, 19, 1)',
                backgroundColor: 'rgba(184, 201, 107, 1)',
                font: { 
                    size: 15, 
                    weight: 'light',
                    family: 'Poppins'
                },
                showBlur: 15,
                padding: 6,
                borderRadius: 4
            },
            enter({element}) {
                element.label.options.display = true;
                return true;
            },
            leave({element}) {
                element.label.options.display = false;
                return true;
            }
        };
    });
        
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: "GDP Data",
                data: displayValues,
                fill: false,
                borderColor: "rgba(52, 23, 99, 0.56)",
                tension: 0.1,
                spanGaps: true
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    title: { display: true, text: 'Year' },
                    type: 'category'
                },
                y: { 
                    title: { display: true, text: 'GDP' }, 
                    beginAtZero: true, 
                    min: yMin, 
                    max: yMax 
                }
            },
            elements: {
                point: {
                    radius: (ctx) => {
                        const lastVisibleIdx = displayValues.findLastIndex(v => v !== null);
                        return ctx.index === lastVisibleIdx ? 8 : 4
                    },
                    backgroundColor: (ctx) => {
                        const lastVisibleIdx = displayValues.findLastIndex(v => v !== null);
                        return ctx.index === lastVisibleIdx ? "rgba(176, 138, 219, 0.9)" : "rgba(222, 198, 246, 0.5)";
                    }
                }
            },
            animation: false,
            interaction: {
                mode: 'nearest',
                intersect: false
            },
            plugins: {
                tooltip: {
                    enabled: true
                },
                annotation: {
                    annotations: policy_annotations
                },
                legend: { display: false }
            }
        }
    });

    const meta = chart.getDatasetMeta(0);
    const lastVisibleIdx = displayValues.findLastIndex(v => v !== null);
    const points = meta.data[lastVisibleIdx];
    const lastPoint = points.getProps(['x', 'y']);

    window.lastPoint = lastPoint;
    maxDrawnX = lastPoint.x;
    if (!show_flag) {
        maxDrawnX = lastPoint.x;
    }
}

function drawDeviation(chart) {
    if(!chart || !drawnSegments.length) return

    const meta = chart.getDatasetMeta(0)
    const ctx = chart.ctx

    const drawnPoints = drawnSegments.map(seg => ({x: seg.x, y: seg.y}))
    const actualPoints  = meta.data.map(point => point.getProps(['x', 'y']))

    const drawnMinX = Math.min(...drawnPoints.map(p => p.x))
    const drawnMaxX = Math.max(...drawnPoints.map(p => p.x))

    for (let i = 0; i < actualPoints.length - 1; i++) {
        const actualPoint = actualPoints[i];
        const nextActualPoint = actualPoints[i + 1];
        
        if (actualPoint.x >= drawnMinX && actualPoint.x <= drawnMaxX) {
            const drawnY = interpolateDrawnY(actualPoint.x, drawnPoints);
            const nextDrawnY = interpolateDrawnY(nextActualPoint.x, drawnPoints);
            
            if (drawnY !== null && nextDrawnY !== null) {
                ctx.beginPath();
                ctx.moveTo(actualPoint.x, actualPoint.y);
                ctx.lineTo(nextActualPoint.x, nextActualPoint.y);
                ctx.lineTo(nextActualPoint.x, nextDrawnY);
                ctx.lineTo(actualPoint.x, drawnY);
                ctx.closePath();
                
                const avgDrawn = (drawnY + nextDrawnY) / 2;
                const avgActual = (actualPoint.y + nextActualPoint.y) / 2;
                
                if (avgDrawn < avgActual) {
                    ctx.fillStyle = "rgba(255, 0, 247, 0.21)";
                } else {
                    ctx.fillStyle = "rgba(195, 255, 0, 0.2)";
                }
                ctx.fill();
            }
        }
    }
}

function interpolateDrawnY(x, drawnPoints) {
    let before = null, after = null;
    
    for (let i = 0; i < drawnPoints.length; i++) {
        if (drawnPoints[i].x <= x) {
            before = drawnPoints[i];
        }
        if (drawnPoints[i].x >= x && after === null) {
            after = drawnPoints[i];
            break;
        }
    }
    
    if (!before && !after) return null;
    if (!before) return after.y;
    if (!after) return before.y;
    if (before.x === after.x) return before.y;
    
    const t = (x - before.x) / (after.x - before.x);
    return before.y + t * (after.y - before.y);
}

function redrawUserLines() {
    if (drawnSegments.length < 2) return
    
    ctx.beginPath()
    ctx.moveTo(window.lastPoint.x, window.lastPoint.y)

    for(let i = 0; i< drawnSegments.length; i++){
        ctx.lineTo(drawnSegments[i].x, drawnSegments[i].y)
    }
    ctx.strokeStyle = "rgba(255, 217, 0, 1)"
    ctx.lineWidth = 3
    ctx.stroke()
    
    ctx.beginPath()
    ctx.arc(window.lastPoint.x, window.lastPoint.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255, 217, 0, 1)";
    ctx.fill();

    if(drawnSegments.length>0){
        const lastSeg = drawnSegments[drawnSegments.length -1]
        ctx.beginPath()
        ctx.arc(lastSeg.x, lastSeg.y, 5, 0, 2 * Math.PI)
        ctx.fillStyle = "rgba(255, 217, 0, 1)";
        ctx.fill();
    }
   
}

function draw() {
    ctx.beginPath()
    ctx.moveTo(prevX, prevY)
    ctx.lineTo(currX, currY)
    ctx.strokeStyle = x
    ctx.lineWidth = y
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(window.lastPoint.x, window.lastPoint.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255, 217, 0, 1)";
    ctx.fill();

    ctx.closePath()

    maxDrawnX = Math.max(maxDrawnX, currX);
    drawnSegments.push({ x: currX, y: currY });
}

function findxy(res, e) {
     if (show_flag) return;

    if (res == 'down') {
        currX = e.clientX - canvas.getBoundingClientRect().left
        currY = e.clientY - canvas.getBoundingClientRect().top

        if (currX >= maxDrawnX) {
            prevX = drawnSegments.length ? drawnSegments[drawnSegments.length - 1].x : window.lastPoint.x;
            prevY = drawnSegments.length ? drawnSegments[drawnSegments.length - 1].y : window.lastPoint.y;

            flag = currX >= window.lastPoint.x;
            
            dot_flag = true
            if (dot_flag) {
                draw()
                dot_flag = false
            }
            else {
                flag = false
            }
        }
    }

    if (res == 'up' || res == 'out') {
        flag = false
    }

    if (res == 'move' && flag) {
        if (show_flag) return;
        dot_flag = false
        currX = e.clientX - canvas.getBoundingClientRect().left
        currY = e.clientY - canvas.getBoundingClientRect().top

        if (currX >= maxDrawnX && currX >= prevX) {
            draw()
            prevX = currX
            prevY = currY   
        } else {
            return
        }
    }
}
