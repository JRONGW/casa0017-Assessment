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

function init() {
    canvas = document.getElementById('canvasChart')
    ctx = canvas.getContext('2d');
    document.getElementById('inputfile').addEventListener('change', handleFileChange, false)
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

function handleFileChange(event) {
    const file = event.target.files[0]
    const reader = new FileReader()

    reader.onload = function (e) {
        const buffer = new Uint8Array(e.target.result)
        const workbook = XLSX.read(buffer, { type: 'array' })

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const sheetData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })

        allLabels = []
        allValues = []

        for (let i = 1; i < sheetData.length; i++) {
            allLabels.push(sheetData[i][1])
            allValues.push(sheetData[i][2])
        }

        graphUpdate(allLabels, allValues)
    }
    reader.readAsArrayBuffer(file)
}

function erase() {
    var m = confirm("Redo Line?")
    if (m) {
        drawnSegments = [];
        maxDrawnX = window.lastPoint ? window.lastPoint.x : 0;
        show_flag = false;
        graphUpdate(allLabels, allValues);
    }
}

function showAllData() {
    console.log("Show all data")
    show_flag = true
    graphUpdate(allLabels, allValues)
}

function graphUpdate(labels, values) {
    console.log("Graph update called. Show flag:", show_flag)
    if (chart) {
        chart.destroy()
    }

    const displayValues = show_flag ? values : values.slice(0, values.length / 4);
    const yMin = Math.min(...values);
    const yMax = Math.max(...values);


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

            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Year' } },
                y: { title: { display: true, text: 'Value' }, beginAtZero: true , min: yMin, max: yMax}

            },
            elements: {
                point: {
                    radius: (ctx) => {
                        const lastIdx = ctx.chart.data.datasets[ctx.datasetIndex].data.length - 1;
                        return ctx.index === lastIdx ? 8 : 2;
                    },
                    backgroundColor: (ctx) => {
                        const lastIdx = ctx.chart.data.datasets[ctx.datasetIndex].data.length - 1;
                        return ctx.index === lastIdx ? "rgba(23,99,86,0.9)" : "rgba(52, 53, 53, 0.5)";
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
                    enabled: true,
                    callbacks:{
                        afterDraw: function(){
                            redrawUserLines();
                        }
                    }},
                legend: { display: false }
            }
        }
    })

    Chart.register({
        id: 'preservedDrawingsAndDeviation',
        afterDraw: (chart) =>{
            if(show_flag && drawnSegments.length>0){
                drawDeviation(chart);
            }
            redrawUserLines();
        }
    })
    chart.update()

    const meta = chart.getDatasetMeta(0);
    const points = meta.data[meta.data.length - 1];
    const lastPoint = points.getProps(['x', 'y']);

    window.lastPoint = lastPoint
    maxDrawnX = lastPoint.x;
      if (!show_flag) {
        maxDrawnX = lastPoint.x;
    }
}

function drawDeviation(chart) {
    console.log("Drawing deviation areas", drawnSegments.length)
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
    if (drawnSegments.length < 2){
        drawnSegments.push({ x: window.lastPoint.x, y: window.lastPoint.y })
    } 
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
        console.log("Drot", drawnSegments.length)

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
        console.log("moveee", drawnSegments.length)
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

window.onload = init;

