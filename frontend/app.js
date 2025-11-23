// CVD Visualizer - Frontend Application

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CONFIG = {
    API_STREAM_URL: '/api/stream',
    API_DATA_URL: '/api/data',
    CHART_HEIGHT: 900,
    COLORS: {
        BUY: '#00ff41',
        SELL: '#ff0051',
        NEUTRAL: '#00d4ff',
        ORANGE: '#ff7f0e',
        PRICE_UP: '#26a69a',
        PRICE_DOWN: '#ef5350'
    }
};

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

let eventSource = null;
let currentData = null;
let chartInitialized = false;

// ═══════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════

const elements = {
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    kpiVolume: document.getElementById('kpi-volume'),
    kpiTradesMin: document.getElementById('kpi-trades-min'),
    kpiCvdNet: document.getElementById('kpi-cvd-net'),
    kpiLastSignal: document.getElementById('kpi-last-signal'),
    kpiUptime: document.getElementById('kpi-uptime'),
    chart: document.getElementById('chart')
};

// ═══════════════════════════════════════════════════════════
// EVENT SOURCE (SSE)
// ═══════════════════════════════════════════════════════════

function connectEventSource() {
    console.log('[SSE] Connecting to stream...');
    updateStatus('connecting');

    eventSource = new EventSource(CONFIG.API_STREAM_URL);

    eventSource.onopen = () => {
        console.log('[SSE] Connected');
        updateStatus('connected');
    };

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            currentData = data;
            updateUI(data);
        } catch (error) {
            console.error('[SSE] Parse error:', error);
        }
    };

    eventSource.onerror = (error) => {
        console.error('[SSE] Error:', error);
        updateStatus('error');

        // Reconnect after 5 seconds
        eventSource.close();
        setTimeout(connectEventSource, 5000);
    };
}

// ═══════════════════════════════════════════════════════════
// UI UPDATES
// ═══════════════════════════════════════════════════════════

function updateStatus(status) {
    elements.statusDot.className = 'dot';

    switch(status) {
        case 'connected':
            elements.statusDot.classList.add('connected');
            elements.statusText.textContent = 'Live';
            break;
        case 'error':
            elements.statusDot.classList.add('error');
            elements.statusText.textContent = 'Reconnecting...';
            break;
        default:
            elements.statusText.textContent = 'Connecting...';
    }
}

function updateUI(data) {
    if (!data || !data.kpi) return;

    // Update KPI
    elements.kpiVolume.textContent = data.kpi.volume_24h.toFixed(2);
    elements.kpiTradesMin.textContent = data.kpi.trades_per_min.toFixed(1);
    elements.kpiCvdNet.textContent = data.kpi.cvd_net.toFixed(2);

    // Update last signal badge
    const signal = data.kpi.last_signal;
    let badgeClass = 'signal-badge';

    if (signal === 3) badgeClass += ' badge-strong-bull';
    else if (signal === 2) badgeClass += ' badge-divergence-bull';
    else if (signal === 1) badgeClass += ' badge-absorption-bull';
    else if (signal === -1) badgeClass += ' badge-absorption-bear';
    else if (signal === -2) badgeClass += ' badge-divergence-bear';
    else if (signal === -3) badgeClass += ' badge-strong-bear';
    else badgeClass += ' badge-neutral';

    elements.kpiLastSignal.className = badgeClass;
    elements.kpiLastSignal.textContent = signal >= 0 ? `+${signal}` : signal;

    // Update uptime
    const uptime = data.kpi.uptime_sec;
    const minutes = Math.floor(uptime / 60);
    const seconds = uptime % 60;
    elements.kpiUptime.textContent = `${minutes}m ${seconds}s`;

    // Update chart
    updateChart(data);
}

// ═══════════════════════════════════════════════════════════
// CHART RENDERING
// ═══════════════════════════════════════════════════════════

function updateChart(data) {
    if (!data.price_ohlc || !data.price_ohlc.index || data.price_ohlc.index.length === 0) {
        console.log('[CHART] Waiting for data...');
        return;
    }

    const traces = buildChartTraces(data);
    const layout = buildChartLayout();

    // Plotly config with better UX
    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        modeBarButtonsToAdd: [
            {
                name: 'Reset Axes',
                icon: Plotly.Icons.home,
                click: function(gd) {
                    Plotly.relayout(gd, {
                        'xaxis.autorange': true,
                        'xaxis2.autorange': true,
                        'xaxis3.autorange': true,
                        'xaxis4.autorange': true,
                        'yaxis.autorange': true,
                        'yaxis2.autorange': true,
                        'yaxis3.autorange': true,
                        'yaxis4.autorange': true,
                        'yaxis5.autorange': true
                    });
                }
            }
        ],
        toImageButtonOptions: {
            format: 'png',
            filename: `cvd_snapshot_${new Date().toISOString().slice(0,10)}`,
            height: 900,
            width: 1600,
            scale: 2
        }
    };

    if (!chartInitialized) {
        Plotly.newPlot('chart', traces, layout, config);
        chartInitialized = true;
        console.log('[CHART] Initialized with', data.price_ohlc.index.length, 'candles');
    } else {
        // Smooth update with transition
        Plotly.react('chart', traces, layout, config);
    }
}

function buildChartTraces(data) {
    const traces = [];

    // Parse timestamps
    const priceTimestamps = data.price_ohlc.index;
    const cvdTimestamps = data.cvd_ohlc.index;
    const ratioTimestamps = data.ratio.index;
    const signalTimestamps = data.signals.index;

    // ───────────────────────────────────────────────────────
    // ROW 1: Price Candlestick + CVD Candlestick
    // ───────────────────────────────────────────────────────

    // Price candlestick
    traces.push({
        type: 'candlestick',
        name: 'Price',
        x: priceTimestamps,
        open: data.price_ohlc.data.open,
        high: data.price_ohlc.data.high,
        low: data.price_ohlc.data.low,
        close: data.price_ohlc.data.close,
        increasing: {line: {color: CONFIG.COLORS.PRICE_UP}, fillcolor: CONFIG.COLORS.PRICE_UP},
        decreasing: {line: {color: CONFIG.COLORS.PRICE_DOWN}, fillcolor: CONFIG.COLORS.PRICE_DOWN},
        opacity: 0.9,
        xaxis: 'x',
        yaxis: 'y'
    });

    // CVD candlestick (transparent overlay)
    traces.push({
        type: 'candlestick',
        name: 'CVD',
        x: cvdTimestamps,
        open: data.cvd_ohlc.data.open,
        high: data.cvd_ohlc.data.high,
        low: data.cvd_ohlc.data.low,
        close: data.cvd_ohlc.data.close,
        increasing: {line: {color: CONFIG.COLORS.NEUTRAL}, fillcolor: CONFIG.COLORS.NEUTRAL},
        decreasing: {line: {color: '#f9c74f'}, fillcolor: '#f9c74f'},
        opacity: 0.35,
        xaxis: 'x',
        yaxis: 'y2'
    });

    // ───────────────────────────────────────────────────────
    // ROW 2: Volume Profile (Buy vs Sell)
    // ───────────────────────────────────────────────────────

    traces.push({
        type: 'bar',
        name: 'Buy Volume',
        x: data.vol_buy.index,
        y: data.vol_buy.values,
        marker: {color: CONFIG.COLORS.BUY},
        opacity: 0.7,
        xaxis: 'x2',
        yaxis: 'y3'
    });

    traces.push({
        type: 'bar',
        name: 'Sell Volume',
        x: data.vol_sell.index,
        y: data.vol_sell.values.map(v => -v),
        marker: {color: CONFIG.COLORS.SELL},
        opacity: 0.7,
        xaxis: 'x2',
        yaxis: 'y3'
    });

    // ───────────────────────────────────────────────────────
    // ROW 3: Efficiency Ratio Line + Signal Badges
    // ───────────────────────────────────────────────────────

    // Efficiency line
    traces.push({
        type: 'scatter',
        mode: 'lines',
        name: 'Efficiency',
        x: ratioTimestamps,
        y: data.ratio.values,
        line: {color: CONFIG.COLORS.NEUTRAL, width: 2},
        fill: 'tozeroy',
        fillcolor: 'rgba(0, 212, 255, 0.15)',
        xaxis: 'x3',
        yaxis: 'y4'
    });

    // Signal badges (scatter with text)
    if (data.signals && data.signals.values) {
        const signalColors = data.signals.values.map(sig => {
            if (sig > 0) return CONFIG.COLORS.BUY;
            if (sig < 0) return CONFIG.COLORS.SELL;
            return '#888888';
        });

        const signalTexts = data.signals.values.map(sig => {
            return sig >= 0 ? `+${sig}` : `${sig}`;
        });

        traces.push({
            type: 'scatter',
            mode: 'markers+text',
            name: 'Signals',
            x: signalTimestamps,
            y: signalTimestamps.map((t, i) => {
                const idx = ratioTimestamps.indexOf(t);
                return idx >= 0 ? data.ratio.values[idx] : 0;
            }),
            marker: {
                size: 20,
                color: signalColors,
                line: {width: 2, color: 'white'}
            },
            text: signalTexts,
            textfont: {color: 'white', size: 10},
            textposition: 'middle center',
            showlegend: false,
            xaxis: 'x3',
            yaxis: 'y4'
        });
    }

    // ───────────────────────────────────────────────────────
    // ROW 4: Cumulative Signal (segments)
    // ───────────────────────────────────────────────────────

    if (data.cumulative_segments && data.cumulative_segments.length > 0) {
        data.cumulative_segments.forEach((segment, i) => {
            traces.push({
                type: 'scatter',
                mode: 'lines+markers',
                name: i === 0 ? 'Cumulative' : null,
                x: segment.index,
                y: segment.values,
                line: {color: CONFIG.COLORS.ORANGE, width: 2},
                marker: {size: 4},
                opacity: 0.85,
                showlegend: i === 0,
                xaxis: 'x4',
                yaxis: 'y5'
            });
        });
    }

    return traces;
}

function buildChartLayout() {
    return {
        template: 'plotly_dark',
        height: CONFIG.CHART_HEIGHT,
        paper_bgcolor: '#1a1d24',
        plot_bgcolor: '#1a1d24',
        hovermode: 'x unified',
        showlegend: true,
        legend: {
            orientation: 'h',
            yanchor: 'bottom',
            y: 1.02,
            xanchor: 'right',
            x: 1,
            bgcolor: 'rgba(26, 29, 36, 0.8)',
            bordercolor: '#2d3139',
            borderwidth: 1
        },

        // Grid layout (4 rows)
        grid: {rows: 4, columns: 1, pattern: 'independent', roworder: 'top to bottom'},

        // X-axes (shared drag for all panels)
        xaxis: {
            domain: [0, 1],
            anchor: 'y',
            showticklabels: false,
            rangeslider: {visible: false},
            type: 'date'
        },
        xaxis2: {
            domain: [0, 1],
            anchor: 'y3',
            showticklabels: false,
            rangeslider: {visible: false},
            type: 'date'
        },
        xaxis3: {
            domain: [0, 1],
            anchor: 'y4',
            showticklabels: false,
            rangeslider: {visible: false},
            type: 'date'
        },
        xaxis4: {
            domain: [0, 1],
            anchor: 'y5',
            rangeslider: {visible: false},
            type: 'date'
        },

        // Y-axes (ROW 1: Price + CVD dual axis - INDEPENDENT scaling)
        yaxis: {
            title: {text: 'Price (USD)', font: {size: 12, color: '#26a69a'}},
            side: 'left',
            domain: [0.65, 1],
            fixedrange: false,  // Allow independent zoom
            gridcolor: '#2d3139',
            showgrid: true
        },
        yaxis2: {
            title: {text: 'CVD', font: {size: 12, color: '#00d4ff'}},
            side: 'right',
            overlaying: 'y',
            domain: [0.65, 1],
            fixedrange: false,  // Allow independent zoom
            showgrid: false
        },

        // Y-axis (ROW 2: Volume)
        yaxis3: {
            title: {text: 'Volume (BTC)', font: {size: 12}},
            domain: [0.48, 0.62],
            fixedrange: false,
            gridcolor: '#2d3139',
            showgrid: true
        },

        // Y-axis (ROW 3: Efficiency)
        yaxis4: {
            title: {text: 'Efficiency Ratio', font: {size: 12}},
            domain: [0.25, 0.45],
            fixedrange: false,
            gridcolor: '#2d3139',
            showgrid: true,
            zeroline: true,
            zerolinecolor: '#ff0051',
            zerolinewidth: 2
        },

        // Y-axis (ROW 4: Cumulative)
        yaxis5: {
            title: {text: 'Cumulative Signal', font: {size: 12}},
            domain: [0, 0.22],
            fixedrange: false,
            gridcolor: '#2d3139',
            showgrid: true,
            zeroline: true,
            zerolinecolor: '#888',
            zerolinewidth: 1
        },

        margin: {l: 60, r: 60, t: 40, b: 50},

        // Enable drag modes
        dragmode: 'zoom',

        // Annotations for instructions (shown on first load)
        annotations: currentData === null ? [{
            text: 'Loading data...',
            xref: 'paper',
            yref: 'paper',
            x: 0.5,
            y: 0.5,
            showarrow: false,
            font: {size: 20, color: '#888'}
        }] : []
    };
}

// ═══════════════════════════════════════════════════════════
// CHART CONTROLS
// ═══════════════════════════════════════════════════════════

function setupChartControls() {
    // Reset zoom button
    document.getElementById('reset-zoom')?.addEventListener('click', () => {
        if (!chartInitialized) return;

        Plotly.relayout('chart', {
            'xaxis.autorange': true,
            'xaxis2.autorange': true,
            'xaxis3.autorange': true,
            'xaxis4.autorange': true,
            'yaxis.autorange': true,
            'yaxis2.autorange': true,
            'yaxis3.autorange': true,
            'yaxis4.autorange': true,
            'yaxis5.autorange': true
        });
        console.log('[CONTROLS] Reset all axes');
    });

    // Auto-scale Y-axes button
    document.getElementById('auto-scale')?.addEventListener('click', () => {
        if (!chartInitialized) return;

        Plotly.relayout('chart', {
            'yaxis.autorange': true,
            'yaxis2.autorange': true,
            'yaxis3.autorange': true,
            'yaxis4.autorange': true,
            'yaxis5.autorange': true
        });
        console.log('[CONTROLS] Auto-scaled Y-axes');
    });

    // Screenshot button
    document.getElementById('screenshot')?.addEventListener('click', () => {
        if (!chartInitialized) return;

        Plotly.downloadImage('chart', {
            format: 'png',
            filename: `cvd_snapshot_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}`,
            height: 900,
            width: 1600,
            scale: 2
        });
        console.log('[CONTROLS] Screenshot downloaded');
    });

    // Sync axes checkbox
    document.getElementById('sync-axes')?.addEventListener('change', (e) => {
        if (!chartInitialized) return;

        const synced = e.target.checked;

        if (synced) {
            // Link all x-axes together
            Plotly.relayout('chart', {
                'xaxis2.matches': 'x',
                'xaxis3.matches': 'x',
                'xaxis4.matches': 'x'
            });
            console.log('[CONTROLS] X-axes synced');
        } else {
            // Unlink x-axes
            Plotly.relayout('chart', {
                'xaxis2.matches': null,
                'xaxis3.matches': null,
                'xaxis4.matches': null
            });
            console.log('[CONTROLS] X-axes unsynced');
        }
    });
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

function init() {
    console.log('[APP] Initializing CVD Visualizer');
    setupChartControls();
    connectEventSource();
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
