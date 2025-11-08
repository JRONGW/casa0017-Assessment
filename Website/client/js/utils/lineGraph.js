let chart
var canvas, ctx, flag = false,
    prevX = 0,
    prevY = 0;
currX = 0,
    currY = 0;
dot_flag = false;
var show_flag = false;
const dpr = window.devicePixelRatio || 1;

var x = "blue",
    y = 3;
var w, h;

var maxDrawnX = 0;          // Track the maximum X coordinate drawn so far
var drawnSegments = [];           // Store all drawn line segments
var allLabels = [];
var allValues = [];
var policyData = [];


var COUNTRIES = ["Brazil", "Poland", "South Korea"];
var ISO3_BY_NAME = { "Brazil":"BRA", "Poland":"POL", "South Korea":"KOR" };


function init() {
    canvas = document.getElementById('canvasChart')
    ctx = canvas.getContext('2d');
    w = canvas.width;
    h = canvas.height
    console.log("w", w, "h", h)

        if (window['chartjs-plugin-annotation']) {
  Chart.register(window['chartjs-plugin-annotation']);
}


    canvas.addEventListener("mousemove", function (e) {
        findxy('move', e)
    }, false)

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

 // load data from API and process into DATA
async function loadDATAFromAPI(){
  for (var i=0;i<COUNTRIES.length;i++){
    var name = COUNTRIES[1];
    var iso3 = ISO3_BY_NAME[name];
    await fetchCountryGDP(iso3);}
}

async function fetchCountryGDP(iso3) {
  try {
    const response = await fetch(`http://localhost:3000/api/country/${iso3}/gdp`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();


    allLabels = data.map(item => item.year);
    allValues = data.map(item => item.gdp);

    console.log(`Fetched ${data.length} GDP entries for ${iso3}`);

    // Fetch policy start years
    policyData = await fetchPolicyStartYears(iso3);
    // const policyYears = policyData.map(p => p.start_year);
    // console.log(`Policy start years for`, policyYears);

    graphUpdate(allLabels, allValues, policyData);
  } catch (err) {
    console.error('Error fetching GDP data:', err);
    alert('Failed to load GDP data from API.');
  }
}


async function fetchPolicyStartYears(iso3) {
  try {
    const response = await fetch(`http://localhost:3000/api/country/${iso3}/policies`);
    if (!response.ok) throw new Error('Failed to fetch policy start years');
    const data = await response.json();
    // data = [{ indicator_code, indicator_name, start_year }, ...]
    return data;
  } catch (err) {
    console.error('Error fetching policy start years:', err);
    return [];
  }
}


async function fetchPolicyData(iso3, indicatorCode) {
  try {
    const response = await fetch(`http://localhost:3000/api/country/${iso3}/series?codes=${indicatorCode}`);
    if (!response.ok) throw new Error('Failed to fetch policy data');
    const data = await response.json();
    
    return data;
  } catch (err) {
    console.error('Error fetching policy data:', err);
    return [];
  }
}


function erase() {
    var m = confirm("Redo Line?")
    if (m) {
        drawnSegments = [];
        maxDrawnX = window.lastPoint ? window.lastPoint.x : 0;
        show_flag = false;
        graphUpdate(allLabels, allValues, policyData); // Pass policyData
    }
}

function showAllData() {
    show_flag = true
    graphUpdate(allLabels, allValues, policyData); // Pass policyData
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
        const quarterLength = Math.floor(values.length / 4);
        displayValues = values.slice(0, quarterLength).concat(
            new Array(values.length - quarterLength).fill(null)
        );
    }
    
    const yMin = Math.min(...values);
    const yMax = Math.max(...values);

    // Create annotations - with detailed logging
    const annotations = {};
    if (policies && policies.length > 0) {
        policies.forEach((policy, idx) => {
            const yearString = String(policy.start_year);
          
            annotations[`policy${idx}`] = {
                type: 'line',
                xMin: yearString,
                xMax: yearString,
                borderColor: 'rgb(255, 0, 0)',
                borderWidth: 4,
                borderDash: [8, 4],
                label: {
                    display: true,
                    enabled: true,
                    content: policy.indicator_name,
                    position: 'start',
                    yAdjust: -10,
                    color: 'rgb(255, 0, 0)',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    font: { 
                        size: 11, 
                        weight: 'bold',
                        family: 'Arial'
                    },
                    padding: 8,
                    borderRadius: 4
                }
            };
        });
    }
    
    // console.log("Final annotations object:", JSON.stringify(annotations, null, 2));
    // console.log("Number of annotations:", Object.keys(annotations).length);

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: "Brazil Excel Data",
                data: displayValues,
                fill: false,
                borderColor: "rgba(23,99,86,0.9)",
                tension: 0.1,
                spanGaps: false
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
                    title: { display: true, text: 'Value' }, 
                    beginAtZero: true, 
                    min: yMin, 
                    max: yMax 
                }
            },
            elements: {
                point: {
                    radius: (ctx) => {
                        const lastVisibleIdx = displayValues.findLastIndex(v => v !== null);
                        return ctx.index === lastVisibleIdx ? 8 : 2;
                    },
                    backgroundColor: (ctx) => {
                        const lastVisibleIdx = displayValues.findLastIndex(v => v !== null);
                        return ctx.index === lastVisibleIdx ? "rgba(23,99,86,0.9)" : "rgba(52, 53, 53, 0.5)";
                    }
                }
            },
            animation: false,
            interaction: {
                mode: 'nearest',
                intersect: true
            },
            plugins: {
                tooltip: {
                    enabled: true
                },
                annotation: {
                    annotations: annotations
                },
                legend: { display: false }
            }
        }
    });

    // Check if annotations are registered after chart creation
 
    setTimeout(() => {
    console.log("Chart plugins:", chart.config.options.plugins);
    console.log("Chart.registry.plugins:", Chart.registry.plugins);
    console.log("Annotation plugin:", Chart.registry.getPlugin('annotation'));
}, 100);

    Chart.register({
        id: 'preservedDrawingsAndDeviation',
        afterDraw: (chart) => {
            if (show_flag && drawnSegments.length > 0) {
                drawDeviation(chart);
            }
            redrawUserLines();
        }
    });

    
    chart.update();

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

    // Overlapping x-ranges
    const drawnMinX = Math.min(...drawnPoints.map(p => p.x))
    const drawnMaxX = Math.max(...drawnPoints.map(p => p.x))

    // Fill area between drawn lines and actual line
    for (let i = 0; i < actualPoints.length - 1; i++) {
        const actualPoint = actualPoints[i];
        const nextActualPoint = actualPoints[i + 1];
        
        // Check if this segment overlaps with drawn area
        if (actualPoint.x >= drawnMinX && actualPoint.x <= drawnMaxX) {
            // Find closest drawn points for this x position
            const drawnY = interpolateDrawnY(actualPoint.x, drawnPoints);
            const nextDrawnY = interpolateDrawnY(nextActualPoint.x, drawnPoints);
            
            if (drawnY !== null && nextDrawnY !== null) {
                // Draw filled polygon for this segment
                ctx.beginPath();
                ctx.moveTo(actualPoint.x, actualPoint.y);
                ctx.lineTo(nextActualPoint.x, nextActualPoint.y);
                ctx.lineTo(nextActualPoint.x, nextDrawnY);
                ctx.lineTo(actualPoint.x, drawnY);
                ctx.closePath();
                
                // Color based on whether prediction is above or below actual
                const avgDrawn = (drawnY + nextDrawnY) / 2;
                const avgActual = (actualPoint.y + nextActualPoint.y) / 2;
                
                if (avgDrawn < avgActual) {
                    // Predicted higher (y axis is inverted)
                    ctx.fillStyle = "rgba(255, 0, 0, 0.2)"; // Red for over-prediction
                } else {
                    // Predicted lower
                    ctx.fillStyle = "rgba(0, 255, 0, 0.2)"; // Green for under-prediction
                }
                ctx.fill();
            }
        }
    }

}

function interpolateDrawnY(x, drawnPoints) {
    // Find the two drawn points that bracket this x value
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
    
    // Linear interpolation
    const t = (x - before.x) / (after.x - before.x);
    return before.y + t * (after.y - before.y);
}

function redrawUserLines() {
    if (drawnSegments.length < 2) return
    // {
    //     drawnSegments.push({ x: window.lastPoint.x, y: window.lastPoint.y })
    // } 
    ctx.beginPath()
    ctx.moveTo(window.lastPoint.x, window.lastPoint.y)

    for(let i = 0; i< drawnSegments.length; i++){
        ctx.lineTo(drawnSegments[i].x, drawnSegments[i].y)
    }
    ctx.strokeStyle = "blue"
    ctx.lineWidth = 3
    ctx.stroke()
    
    // Starting point
    ctx.beginPath()
    ctx.arc(window.lastPoint.x, window.lastPoint.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "blue";
    ctx.fill();

    // Ending point
    if(drawnSegments.length>0){
        const lastSeg = drawnSegments[drawnSegments.length -1]
        ctx.beginPath()
        ctx.arc(lastSeg.x, lastSeg.y, 5, 0, 2 * Math.PI)
        ctx.fillStyle = "blue";
        ctx.fill();
    }

}

function draw() {
    ctx.beginPath()
    ctx.moveTo(prevX, prevY)
    ctx.lineTo(currX, currY)        // To (x, y) point  
    ctx.strokeStyle = x
    ctx.lineWidth = y
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(window.lastPoint.x, window.lastPoint.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "blue";
    ctx.fill();

    ctx.closePath()

    maxDrawnX = Math.max(maxDrawnX, currX);            // Update the maximum X position that has been drawn
    drawnSegments.push({ x: currX, y: currY });
}


function findxy(res, e) {
     if (show_flag) return;

    if (res == 'down') {
        // Mouse position
        currX = e.clientX - canvas.getBoundingClientRect().left
        currY = e.clientY - canvas.getBoundingClientRect().top

        if (currX >= maxDrawnX) {
            // flag = true
            // prevX = drawnSegments.length > 0 ? drawnSegments[drawnSegments.length - 1].x : window.lastPoint.x;
            // prevY = drawnSegments.length > 0 ? drawnSegments[drawnSegments.length - 1].y : window.lastPoint.y;

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
        dot_flag = false
        // prevX = window.lastPoint.x > currX ? window.lastPoint.x : currX;
        // prevY = window.lastPoint.y > currY ? window.lastPoint.y : currY;
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

window.onload = async function() {
  init();
  await fetchCountryGDP('POL');
};
