// ═══════════════════════════════════════════════════════════
// CVD PRO TERMINAL - ECharts Edition (Zero-Friction UX)
// ═══════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────

const CONFIG = {
    API_STREAM_URL: '/api/stream',
    COLORS: {
        BG: '#0b0e11',
        GRID: '#1e232b',
        TEXT: '#8b93a0',
        PRICE_UP: '#00ff00',
        PRICE_DOWN: '#ff0000',
        CVD_UP: 'rgba(0, 240, 255, 0.3)',
        CVD_DOWN: 'rgba(255, 204, 0, 0.3)',
        EFF: '#00f0ff',
        CUM: '#ffcc00',
        VOL_UP: '#00f0ff',
        VOL_DOWN: '#ffcc00',
        SIGNAL_UP: '#00f0ff',
        SIGNAL_DOWN: '#ff0055'
    },
    // Grid Layout Configuration (Percentages)
    GRIDS: [
        { id: 'price', top: 2, height: 45, axisIndex: [0, 1] }, // 0=Price, 1=CVD
        { id: 'vol', top: 50, height: 12, axisIndex: [2] },
        { id: 'eff', top: 65, height: 15, axisIndex: [3] },
        { id: 'cum', top: 83, height: 10, axisIndex: [4] }
    ],
    AXIS_WIDTH: 60
};

// ────────────────────────────────────────────────────────────
// STATE MANAGEMENT
// ────────────────────────────────────────────────────────────

const State = {
    chart: null,
    lastData: null,
    rawData: null,
    eventSource: null,

    // Axis State (Min/Max for manual control)
    // 0: Price, 1: CVD, 2: Vol, 3: Eff, 4: Cum
    yAxisState: {
        0: { min: null, max: null, auto: true },
        1: { min: null, max: null, auto: true },
        2: { min: null, max: null, auto: true },
        3: { min: null, max: null, auto: true },
        4: { min: null, max: null, auto: true }
    },

    // Drag Interaction State
    drag: {
        active: false,
        axisIndex: null, // The axis being dragged
        startY: 0,
        startMin: 0,
        startMax: 0,
        gridHeight: 0 // Height of the grid being dragged (for sensitivity)
    },

    // View State
    viewState: {
        isFirstLoad: true,
        dataZoom: null
    },

    metrics: {
        updateCount: 0,
        lastUpdateTime: null
    },

    elements: null
};

// ────────────────────────────────────────────────────────────
// DOM UTILITIES
// ────────────────────────────────────────────────────────────

function cacheDOMElements() {
    State.elements = {
        statusDot: document.getElementById('status-dot'),
        statusText: document.getElementById('status-text'),
        kpiVolume: document.getElementById('kpi-volume'),
        kpiTradesMin: document.getElementById('kpi-trades-min'),
        kpiCvdNet: document.getElementById('kpi-cvd-net'),
        kpiLastSignal: document.getElementById('kpi-last-signal'),
        kpiUptime: document.getElementById('kpi-uptime'),
        lastSignalCard: document.getElementById('last-signal-card'),
        loadingOverlay: document.getElementById('loading-overlay'),
        debugCandles: document.getElementById('debug-candles'),
        debugTimeframe: document.getElementById('debug-timeframe'),
        debugLastUpdate: document.getElementById('debug-last-update'),
        chartContainer: document.getElementById('main-chart'),
        resetViewBtn: document.getElementById('reset-view')
    };
}

// ────────────────────────────────────────────────────────────
// ECHARTS INITIALIZATION
// ────────────────────────────────────────────────────────────

function initializeChart() {
    console.log('[APP] Initializing ECharts (Zero-Friction Mode)');

    State.chart = echarts.init(State.elements.chartContainer, null, {
        renderer: 'canvas',
        useDirtyRect: false
    });

    const option = {
        backgroundColor: CONFIG.COLORS.BG,
        animation: false, // Disable animation for performance during drag

        axisPointer: {
            link: [{ xAxisIndex: 'all' }],
            label: { backgroundColor: '#777' }
        },

        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            formatter: () => ''  // Empty formatter hides the tooltip box
        },

        title: [
            {
                text: 'Price and CVD',
                left: 70,
                top: '2%',
                textStyle: { color: '#8b93a0', fontSize: 11, fontWeight: 'normal' }
            },
            {
                text: 'Order Flow',
                left: 70,
                top: '50%',
                textStyle: { color: '#8b93a0', fontSize: 11, fontWeight: 'normal' }
            },
            {
                text: 'Efficency',
                left: 70,
                top: '65%',
                textStyle: { color: '#8b93a0', fontSize: 11, fontWeight: 'normal' }
            },
            {
                text: 'Cumulative signal',
                left: 70,
                top: '83%',
                textStyle: { color: '#8b93a0', fontSize: 11, fontWeight: 'normal' }
            }
        ],

        dataZoom: [
            {
                type: 'inside',
                xAxisIndex: [0, 1, 2, 3],
                start: 95, // Start closer to recent data
                end: 100,
                minValueSpan: 5, // Allow zooming in to 5 candles
                zoomOnMouseWheel: true,
                // moveOnMouseMove: true, // Enable Panning - REMOVED
                moveOnMouseWheel: true, // Enable Zoom on Wheel
                preventDefaultMouseMove: false // Allow default behavior (pan)
            },
            {
                type: 'slider',
                xAxisIndex: [0, 1, 2, 3],
                bottom: 15,
                height: 18,
                borderColor: '#454d5f',
                fillerColor: 'rgba(0, 240, 255, 0.1)',
                handleStyle: { color: '#00f0ff', borderColor: '#00f0ff' },
                textStyle: { color: '#8b93a0' }
            }
        ],

        grid: CONFIG.GRIDS.map(g => ({
            left: 60, right: 60,
            top: g.top + '%',
            height: g.height + '%',
            show: true,
            borderColor: '#2a2e39',
            backgroundColor: CONFIG.COLORS.BG,
            containLabel: false
        })),

        xAxis: [0, 1, 2, 3].map(i => ({
            type: 'category', gridIndex: i, data: [],
            axisLine: { lineStyle: { color: '#454d5f' } },
            axisLabel: { show: i === 3, color: '#8b93a0', fontSize: 10, formatter: (v) => v.split(' ')[1] || v },
            axisTick: { show: i === 3, lineStyle: { color: '#454d5f' } },
            splitLine: { show: false },
            axisPointer: { label: { show: i === 3 } }
        })),

        yAxis: [
            // 0: Price (Left)
            { type: 'value', gridIndex: 0, scale: true, position: 'left', axisLine: { lineStyle: { color: '#454d5f' } }, axisLabel: { color: '#8b93a0', fontSize: 10, formatter: (v) => v.toFixed(0) }, splitLine: { lineStyle: { color: '#1e232b' } } },
            // 1: CVD (Right)
            { type: 'value', gridIndex: 0, scale: true, position: 'right', axisLine: { show: false }, axisLabel: { show: true, color: CONFIG.COLORS.CVD_UP, fontSize: 10, formatter: (v) => v.toFixed(0) }, splitLine: { show: false } },
            // 2: Volume
            { type: 'value', gridIndex: 1, axisLine: { lineStyle: { color: '#454d5f' } }, axisLabel: { color: '#8b93a0', fontSize: 10, formatter: (v) => v.toFixed(0) }, splitLine: { lineStyle: { color: '#1e232b' } } },
            // 3: Efficiency
            { type: 'value', gridIndex: 2, axisLine: { lineStyle: { color: '#454d5f' } }, axisLabel: { color: '#8b93a0', fontSize: 10, formatter: (v) => v.toFixed(2) }, splitLine: { lineStyle: { color: '#1e232b' } } },
            // 4: Cumulative
            { type: 'value', gridIndex: 3, axisLine: { lineStyle: { color: '#454d5f' } }, axisLabel: { color: '#8b93a0', fontSize: 10, formatter: (v) => v.toFixed(1) }, splitLine: { lineStyle: { color: '#1e232b' } } }
        ],

        series: [
            { name: 'Price', type: 'candlestick', data: [], xAxisIndex: 0, yAxisIndex: 0, clip: true, itemStyle: { color: CONFIG.COLORS.PRICE_UP, color0: CONFIG.COLORS.PRICE_DOWN, borderColor: CONFIG.COLORS.PRICE_UP, borderColor0: CONFIG.COLORS.PRICE_DOWN } },
            { name: 'CVD', type: 'candlestick', data: [], xAxisIndex: 0, yAxisIndex: 1, clip: true, itemStyle: { color: CONFIG.COLORS.CVD_UP, color0: CONFIG.COLORS.CVD_DOWN, borderColor: 'rgba(255, 255, 255, 0.2)', borderColor0: 'rgba(255, 255, 255, 0.2)' } },
            { name: 'Volume Buy', type: 'bar', data: [], xAxisIndex: 1, yAxisIndex: 2, stack: 'volume', clip: true, itemStyle: { color: CONFIG.COLORS.VOL_UP }, barMaxWidth: 20 },
            { name: 'Volume Sell', type: 'bar', data: [], xAxisIndex: 1, yAxisIndex: 2, stack: 'volume', clip: true, itemStyle: { color: CONFIG.COLORS.VOL_DOWN }, barMaxWidth: 20 },
            { name: 'Efficiency', type: 'line', data: [], xAxisIndex: 2, yAxisIndex: 3, clip: true, lineStyle: { color: CONFIG.COLORS.EFF, width: 2 }, showSymbol: false, smooth: false },
            { name: 'Zero', type: 'line', data: [], xAxisIndex: 2, yAxisIndex: 3, clip: true, lineStyle: { color: '#555', width: 1, type: 'dashed' }, showSymbol: false, silent: true },
            { name: 'Cumulative', type: 'line', data: [], xAxisIndex: 3, yAxisIndex: 4, clip: true, lineStyle: { color: CONFIG.COLORS.CUM, width: 2 }, showSymbol: false, smooth: false, z: 10 },
            // Cumulative threshold lines
            { name: '+5 Line', type: 'line', data: [], xAxisIndex: 3, yAxisIndex: 4, clip: true, lineStyle: { width: 0 }, showSymbol: false, silent: true, z: 1, markLine: { symbol: 'none', data: [{ yAxis: 5 }], lineStyle: { color: 'rgba(0, 255, 0, 0.5)', width: 1, type: 'dashed' }, silent: true, z: 5 } },
            { name: '-5 Line', type: 'line', data: [], xAxisIndex: 3, yAxisIndex: 4, clip: true, lineStyle: { width: 0 }, showSymbol: false, silent: true, z: 1, markLine: { symbol: 'none', data: [{ yAxis: -5 }], lineStyle: { color: 'rgba(255, 0, 0, 0.5)', width: 1, type: 'dashed' }, silent: true, z: 5 } },
            // Base line at +5 for bull zone stacking
            { name: 'Bull Base', type: 'line', data: [], xAxisIndex: 3, yAxisIndex: 4, clip: true, stack: 'bull', lineStyle: { width: 0 }, showSymbol: false, silent: true, z: 1 },
            // Bull zone area (stacked above +5)
            { name: 'Bull Zone', type: 'line', data: [], xAxisIndex: 3, yAxisIndex: 4, clip: true, stack: 'bull', areaStyle: { color: 'rgba(0, 255, 0, 0.08)' }, lineStyle: { width: 0 }, showSymbol: false, silent: true, z: 2 },
            // Base line at -5 for bear zone stacking
            { name: 'Bear Base', type: 'line', data: [], xAxisIndex: 3, yAxisIndex: 4, clip: true, stack: 'bear', lineStyle: { width: 0 }, showSymbol: false, silent: true, z: 1 },
            // Bear zone area (stacked below -5)
            { name: 'Bear Zone', type: 'line', data: [], xAxisIndex: 3, yAxisIndex: 4, clip: true, stack: 'bear', areaStyle: { color: 'rgba(255, 0, 0, 0.08)' }, lineStyle: { width: 0 }, showSymbol: false, silent: true, z: 2 }
        ]
    };

    State.chart.setOption(option);

    // Smart Scaling on Zoom
    State.chart.on('dataZoom', () => {
        handleSmartScaling();
    });

    window.addEventListener('resize', () => State.chart.resize());
}

// ────────────────────────────────────────────────────────────
// SMART SCALING (TradingView-like)
// ────────────────────────────────────────────────────────────

function handleSmartScaling() {
    if (!State.lastData) return;

    // Only scale axes in auto mode
    if (!State.yAxisState[0].auto && !State.yAxisState[1].auto) return;

    // Get current zoom range (percentage)
    const model = State.chart.getModel().getComponent('dataZoom', 0);
    const start = model.option.start;
    const end = model.option.end;

    // Calculate indices
    const total = State.lastData.timestamps.length;
    const startIdx = Math.floor((start / 100) * total);
    const endIdx = Math.ceil((end / 100) * total);

    let minPrice = Infinity, maxPrice = -Infinity;
    let minCvd = Infinity, maxCvd = -Infinity;
    let hasData = false;

    // Iterate visible range
    for (let i = startIdx; i < endIdx; i++) {
        if (i >= State.lastData.candles.length) break;

        const candle = State.lastData.candles[i];
        if (candle) {
            if (candle[2] < minPrice) minPrice = candle[2];
            if (candle[3] > maxPrice) maxPrice = candle[3];
            hasData = true;
        }

        const cvd = State.lastData.cvdCandles[i];
        if (cvd) {
            if (cvd[2] < minCvd) minCvd = cvd[2];
            if (cvd[3] > maxCvd) maxCvd = cvd[3];
        }
    }

    if (!hasData) return;

    // Add padding (5%)
    const priceRange = maxPrice - minPrice;
    const cvdRange = maxCvd - minCvd;
    const pricePad = priceRange * 0.05;
    const cvdPad = cvdRange * 0.05;

    // Update only axes in auto mode
    const yAxisUpdates = [{}, {}, {}, {}, {}];

    if (State.yAxisState[0].auto) {
        yAxisUpdates[0] = { min: minPrice - pricePad, max: maxPrice + pricePad };
    }

    if (State.yAxisState[1].auto) {
        yAxisUpdates[1] = { min: minCvd - cvdPad, max: maxCvd + cvdPad };
    }

    State.chart.setOption({ yAxis: yAxisUpdates });
}

// ────────────────────────────────────────────────────────────
// INTERACTION LOGIC (GRID-AWARE)
// ────────────────────────────────────────────────────────────

function setupInteractions() {
    const zr = State.chart.getZr();

    // Helper: Find which grid the Y-coordinate belongs to
    function getGridIndex(y) {
        const height = State.chart.getHeight();
        // Convert percentages to pixels
        // Grid 0: top 2%, height 48%
        // Grid 1: top 54%, height 13%
        // Grid 2: top 71%, height 20%
        // Grid 3: top 93%, height 13%

        // We use a small buffer for gaps
        for (let i = 0; i < CONFIG.GRIDS.length; i++) {
            const g = CONFIG.GRIDS[i];
            const topPx = (g.top / 100) * height;
            const bottomPx = ((g.top + g.height) / 100) * height;
            if (y >= topPx && y <= bottomPx) return i;
        }
        return -1;
    }

    // 1. MOUSE DOWN
    zr.on('mousedown', (e) => {
        const x = e.offsetX;
        const y = e.offsetY;
        const width = zr.getWidth();
        const isShift = e.event.shiftKey;

        State.drag.active = false;
        State.drag.axisIndex = null;

        // 1. Identify Grid
        const gridIdx = getGridIndex(y);
        if (gridIdx === -1) return; // Clicked in gap

        // 2. Identify Zone (Left/Right Gutter)
        let axisIndex = null;

        if (gridIdx === 0) {
            // Main Chart (Price/CVD)
            if (x < 60) axisIndex = 0; // Price
            else if (x > width - 60 || isShift) axisIndex = 1; // CVD
        } else {
            // Sub Charts (Vol/Eff/Cum)
            // Allow dragging from either side for convenience
            if (x < 60 || x > width - 60) {
                axisIndex = CONFIG.GRIDS[gridIdx].axisIndex[0];
            }
        }

        if (axisIndex === null) return; // Clicked in center (pan time)

        // 3. Init Drag
        State.drag.active = true;
        State.drag.axisIndex = axisIndex;
        State.drag.startY = y;
        State.drag.gridHeight = (CONFIG.GRIDS[gridIdx].height / 100) * State.chart.getHeight();

        const model = State.chart.getModel().getComponent('yAxis', axisIndex);
        const extent = model.axis.scale.getExtent();
        State.drag.startMin = extent[0];
        State.drag.startMax = extent[1];

        State.yAxisState[axisIndex].auto = false;
        zr.setCursorStyle('ns-resize');

        // Stop propagation ONLY if we are dragging an axis
        e.stop();
    });

    // 2. MOUSE MOVE
    zr.on('mousemove', (e) => {
        const x = e.offsetX;
        const y = e.offsetY;
        const width = zr.getWidth();
        const isShift = e.event.shiftKey;

        // Cursor Feedback
        if (!State.drag.active) {
            const gridIdx = getGridIndex(y);
            if (gridIdx !== -1 && (x < 60 || x > width - 60 || isShift)) {
                zr.setCursorStyle('ns-resize');
            } else {
                zr.setCursorStyle('default');
            }
            return;
        }

        // Execute Drag
        const deltaY = e.offsetY - State.drag.startY;
        const range = State.drag.startMax - State.drag.startMin;

        // Sensitivity: 1 full grid height drag = 1 full range shift
        const shift = (range / State.drag.gridHeight) * deltaY;

        // Invert because screen Y is down
        const newMin = State.drag.startMin + shift;
        const newMax = State.drag.startMax + shift;

        const idx = State.drag.axisIndex;
        State.yAxisState[idx].min = newMin;
        State.yAxisState[idx].max = newMax;

        // Apply
        State.chart.setOption({
            yAxis: [
                { min: State.yAxisState[0].min, max: State.yAxisState[0].max },
                { min: State.yAxisState[1].min, max: State.yAxisState[1].max },
                { min: State.yAxisState[2].min, max: State.yAxisState[2].max },
                { min: State.yAxisState[3].min, max: State.yAxisState[3].max },
                { min: State.yAxisState[4].min, max: State.yAxisState[4].max }
            ]
        });
    });

    // 3. MOUSE UP
    zr.on('mouseup', () => {
        State.drag.active = false;
        zr.setCursorStyle('default');
    });

    // 4. DOUBLE CLICK (Reset)
    zr.on('dblclick', (e) => {
        const x = e.offsetX;
        const y = e.offsetY;
        const width = zr.getWidth();

        const gridIdx = getGridIndex(y);
        if (gridIdx === -1) return;

        let axisIndex = null;
        if (gridIdx === 0) {
            if (x < 60) axisIndex = 0;
            else if (x > width - 60) axisIndex = 1;
        } else {
            if (x < 60 || x > width - 60) axisIndex = CONFIG.GRIDS[gridIdx].axisIndex[0];
        }

        if (axisIndex !== null) {
            State.yAxisState[axisIndex].auto = true;
            State.yAxisState[axisIndex].min = null;
            State.yAxisState[axisIndex].max = null;
            console.log(`[AXIS] Reset Axis ${axisIndex}`);
            if (State.rawData) {
                updateChart(State.rawData);
                handleSmartScaling(); // Re-apply smart scaling immediately
            }
        }
    });
}

// ────────────────────────────────────────────────────────────
// DATA PROCESSING
// ────────────────────────────────────────────────────────────

function processData(data) {
    if (!data.price_ohlc || !data.price_ohlc.index) return null;

    const timestamps = [...data.price_ohlc.index]; // Clone
    const count = timestamps.length;

    const processed = {
        timestamps: timestamps,
        candles: [],
        cvdCandles: [],
        volumeBuy: [],
        volumeSell: [],
        efficiency: [],
        efficiencyZero: [],
        cumulative: [],
        cumulativeBullBase: [],
        cumulativeBullZone: [],
        cumulativeBearBase: [],
        cumulativeBearZone: [],
        markers: []
    };

    for (let i = 0; i < count; i++) {
        // Price (Raw - no filtering)
        if (data.price_ohlc.data?.open) {
            processed.candles.push([
                data.price_ohlc.data.open[i],
                data.price_ohlc.data.close[i],
                data.price_ohlc.data.low[i],
                data.price_ohlc.data.high[i]
            ]);
        }
        // CVD (Raw - no filtering)
        if (data.cvd_ohlc?.data?.open) {
            processed.cvdCandles.push([
                data.cvd_ohlc.data.open[i],
                data.cvd_ohlc.data.close[i],
                data.cvd_ohlc.data.low[i],
                data.cvd_ohlc.data.high[i]
            ]);
        }
        // Volume (separate buy and sell)
        const volBuy = data.vol_buy?.values?.[i] || 0;
        const volSell = data.vol_sell?.values?.[i] || 0;
        processed.volumeBuy.push(volBuy);
        processed.volumeSell.push(-volSell); // Negative for visual stacking

        // Efficiency
        if (data.ratio?.values?.[i] !== undefined) {
            processed.efficiency.push(data.ratio.values[i]);
            processed.efficiencyZero.push(0);
        }
    }

    // Cumulative
    if (data.cumulative_segments && Array.isArray(data.cumulative_segments)) {
        const cumMap = new Map();
        data.cumulative_segments.forEach(seg => {
            if (!seg.index || !seg.values) return;
            for (let j = 0; j < seg.index.length; j++) cumMap.set(seg.index[j], seg.values[j]);
        });
        timestamps.forEach(ts => {
            const cumValue = cumMap.get(ts) || 0;
            processed.cumulative.push(cumValue);

            // Bull zone stacking: base at +5, then area goes from +5 to cumValue
            processed.cumulativeBullBase.push(5); // Always 5
            processed.cumulativeBullZone.push(cumValue > 5 ? (cumValue - 5) : 0); // Stack on top of 5

            // Bear zone stacking: base at -5, then area goes from -5 to cumValue
            processed.cumulativeBearBase.push(-5); // Always -5
            processed.cumulativeBearZone.push(cumValue < -5 ? (cumValue - (-5)) : 0); // Stack on top of -5 (negative value)
        });
    }

    // Markers
    if (data.signals?.values) {
        // Fixed offset in price units (adjust based on your asset's typical price range)
        const fixedOffset = 10; // Fixed distance from candle

        for (let i = 0; i < data.signals.values.length; i++) {
            const sig = data.signals.values[i];
            if (sig === 0) continue;
            const candle = processed.candles[i];
            if (!candle) continue;

            // Positive signals: position below candle low
            // Negative signals: position above candle high
            const yPosition = sig > 0 ? candle[2] - fixedOffset : candle[3] + fixedOffset;

            processed.markers.push({
                coord: [i, yPosition],
                value: Math.abs(sig).toString(),
                itemStyle: { color: sig > 0 ? CONFIG.COLORS.SIGNAL_UP : CONFIG.COLORS.SIGNAL_DOWN },
                symbol: sig > 0 ? 'arrow' : 'arrow',
                symbolRotate: sig > 0 ? 0 : 180,
                symbolSize: 12
            });
        }
    }

    return processed;
}

// ────────────────────────────────────────────────────────────
// CHART UPDATE
// ────────────────────────────────────────────────────────────

function updateChart(data) {
    State.rawData = data;
    const processed = processData(data);
    if (!processed) return;

    // Save Zoom
    let currentZoom = null;
    if (!State.viewState.isFirstLoad) {
        currentZoom = State.chart.getOption().dataZoom?.[0];
    }

    // Prepare Options
    const option = {
        xAxis: [
            { data: processed.timestamps },
            { data: processed.timestamps },
            { data: processed.timestamps },
            { data: processed.timestamps }
        ],
        yAxis: [
            { min: State.yAxisState[0].auto ? null : State.yAxisState[0].min, max: State.yAxisState[0].auto ? null : State.yAxisState[0].max },
            { min: State.yAxisState[1].auto ? null : State.yAxisState[1].min, max: State.yAxisState[1].auto ? null : State.yAxisState[1].max },
            { min: State.yAxisState[2].auto ? null : State.yAxisState[2].min, max: State.yAxisState[2].auto ? null : State.yAxisState[2].max },
            { min: State.yAxisState[3].auto ? null : State.yAxisState[3].min, max: State.yAxisState[3].auto ? null : State.yAxisState[3].max },
            { min: State.yAxisState[4].auto ? null : State.yAxisState[4].min, max: State.yAxisState[4].auto ? null : State.yAxisState[4].max }
        ],
        series: [
            { data: processed.candles, markPoint: { data: processed.markers } },
            { data: processed.cvdCandles },
            { data: processed.volumeBuy },
            { data: processed.volumeSell },
            { data: processed.efficiency },
            { data: processed.efficiencyZero },
            { data: processed.cumulative },
            { data: [] }, // +5 line (uses markLine)
            { data: [] }, // -5 line (uses markLine)
            { data: processed.cumulativeBullBase }, // Bull base at +5
            { data: processed.cumulativeBullZone }, // Bull zone area (stacked)
            { data: processed.cumulativeBearBase }, // Bear base at -5
            { data: processed.cumulativeBearZone }  // Bear zone area (stacked)
        ]
    };

    State.chart.setOption(option, false);

    // Restore or Init Zoom
    if (currentZoom) {
        // Keep existing zoom window (start/end percentages)
        State.chart.setOption({ dataZoom: [{ start: currentZoom.start, end: currentZoom.end }] });
    } else if (State.viewState.isFirstLoad) {
        State.viewState.isFirstLoad = false;
        // Initial view: show last 5% of data (recent candles)
        // No need for manual index calculation, let dataZoom handle it
    }

    State.metrics.dataPoints = processed.candles.length;
    State.lastData = processed;

    // Trigger Smart Scaling
    handleSmartScaling();
}

// ────────────────────────────────────────────────────────────
// UI UPDATES & SSE (Standard)
// ────────────────────────────────────────────────────────────

function updateStatus(status) {
    const dot = State.elements.statusDot;
    const text = State.elements.statusText;
    dot.className = 'w-1.5 h-1.5 rounded-full';
    if (status === 'connected') {
        dot.classList.add('bg-neon-cyan', 'animate-pulse-glow');
        text.textContent = 'Live';
    } else if (status === 'error') {
        dot.classList.add('bg-neon-red');
        text.textContent = 'Disconnected';
    } else {
        dot.classList.add('bg-gray-500');
        text.textContent = 'Connecting...';
    }
}

function updateKPIs(data) {
    if (!data.kpi) return;
    const kpi = data.kpi;
    State.elements.kpiVolume.textContent = kpi.volume_24h.toFixed(2);
    State.elements.kpiTradesMin.textContent = kpi.trades_per_min.toFixed(1);
    State.elements.kpiCvdNet.textContent = kpi.cvd_net.toFixed(2);
    State.elements.kpiCvdNet.className = 'text-lg font-semibold font-mono ' + (kpi.cvd_net > 0 ? 'text-neon-cyan' : 'text-neon-red');

    const sig = kpi.last_signal;
    let text = "NEUTRAL", color = "text-gray-400", border = "border-l-void-500";
    if (Math.abs(sig) >= 3) { text = `STRONG ${sig > 0 ? 'BULL' : 'BEAR'}`; color = sig > 0 ? 'text-neon-cyan' : 'text-neon-red'; border = sig > 0 ? 'border-l-neon-cyan' : 'border-l-neon-red'; }
    else if (Math.abs(sig) == 2) { text = `${sig > 0 ? 'BULL' : 'BEAR'} DIV`; color = sig > 0 ? 'text-neon-cyan' : 'text-neon-red'; border = sig > 0 ? 'border-l-neon-cyan' : 'border-l-neon-red'; }
    else if (Math.abs(sig) == 1) { text = "ABSORPTION"; color = sig > 0 ? 'text-neon-cyan' : 'text-neon-red'; border = sig > 0 ? 'border-l-neon-cyan' : 'border-l-neon-red'; }

    State.elements.kpiLastSignal.textContent = `${text} (${sig})`;
    State.elements.kpiLastSignal.className = 'text-lg font-semibold font-mono ' + color;
    State.elements.lastSignalCard.className = 'bg-void-800 border border-void-600 border-l-2 rounded-md p-3 ' + border;

    const h = Math.floor(kpi.uptime_sec / 3600);
    const m = Math.floor((kpi.uptime_sec % 3600) / 60);
    State.elements.kpiUptime.textContent = `${h}h ${m}m`;
}

function updateDebugInfo() {
    // Update total candles count from raw data
    if (State.rawData && State.rawData.price_ohlc && State.rawData.price_ohlc.index) {
        State.elements.debugCandles.textContent = State.rawData.price_ohlc.index.length;
    }

    // Update last update time
    if (State.metrics.lastUpdateTime) {
        const diff = Math.floor((new Date() - State.metrics.lastUpdateTime) / 1000);
        State.elements.debugLastUpdate.textContent = `${diff}s ago`;
    }
}

function connectEventSource() {
    updateStatus('connecting');
    State.eventSource = new EventSource(CONFIG.API_STREAM_URL);
    State.eventSource.onopen = () => { console.log('[SSE] Connected'); updateStatus('connected'); };
    State.eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            State.metrics.updateCount++;
            State.metrics.lastUpdateTime = new Date();
            // Immediately update "Last Update" to show 0s (prevents showing 0s for 2 seconds)
            State.elements.debugLastUpdate.textContent = '0s ago';
            updateKPIs(data);
            updateChart(data);
            updateDebugInfo();
        } catch (e) { console.error('[SSE] Parse error:', e); }
    };
    State.eventSource.onerror = () => {
        console.error('[SSE] Error, reconnecting...');
        updateStatus('error');
        State.eventSource.close();
        setTimeout(connectEventSource, 5000);
    };
}

function setupControls() {
    State.elements.resetViewBtn.addEventListener('click', () => {
        // Reset Zoom
        State.chart.dispatchAction({ type: 'dataZoom', start: 80, end: 100 });
        // Reset All Axes
        for (let i = 0; i <= 4; i++) {
            State.yAxisState[i].auto = true;
            State.yAxisState[i].min = null;
            State.yAxisState[i].max = null;
        }
        if (State.rawData) {
            updateChart(State.rawData);
            handleSmartScaling();
        }
        console.log('[CONTROL] View Reset');
    });

    document.getElementById('screenshot').addEventListener('click', () => {
        const url = State.chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: CONFIG.COLORS.BG });
        const link = document.createElement('a');
        link.download = `cvd-terminal-${Date.now()}.png`;
        link.href = url;
        link.click();
    });
}

// ────────────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────────────

function init() {
    console.log('[APP] CVD Pro Terminal - Zero Friction Edition');
    cacheDOMElements();
    initializeChart();
    setupInteractions();
    setupControls();
    connectEventSource();

    // Real-time "Last Update" counter (updates every second)
    setInterval(() => {
        if (State.metrics.lastUpdateTime) {
            const diff = Math.floor((new Date() - State.metrics.lastUpdateTime) / 1000);
            State.elements.debugLastUpdate.textContent = `${diff}s ago`;
        }
    }, 1000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
