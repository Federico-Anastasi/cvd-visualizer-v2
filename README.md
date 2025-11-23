# CVD Visualizer V2 🚀

Real-time Bitcoin order flow analysis with Cumulative Volume Delta (CVD) and mean-reversion signals.

## What it does

Connects to Hyperliquid WebSocket and visualizes:
- **Price vs CVD**: Candlestick chart with transparent CVD overlay (independent Y-axes)
- **Volume Profile**: Buy/sell volume breakdown per candle
- **Efficiency Ratio**: Price movement vs CVD movement (normalized)
- **Cumulative Signals**: Mean-reversion indicator for oversold/overbought conditions

## Architecture

- **Backend**: FastAPI (Python) - WebSocket connection to Hyperliquid, data processing, SSE streaming
- **Frontend**: Vanilla JS + Plotly.js - High-performance client-side rendering with independent axes
- **Real-time**: Server-Sent Events (SSE) for push updates every 5 seconds
- **Memory**: Sliding window (24h data retention, automatic cleanup)

## Quick Start

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run backend
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Open browser
http://localhost:8000
```

### Deploy to Railway

1. **Push to GitHub**:
```bash
git add .
git commit -m "Deploy CVD Visualizer v2"
git push origin main
```

2. **Connect GitHub repo to Railway**
3. Railway auto-detects `Procfile` and deploys
4. Generate public domain in Railway dashboard

## Features

- ✅ **Real-time data**: WebSocket connection to Hyperliquid (BTC perpetual futures)
- ✅ **Sliding window**: 24-hour data retention with automatic cleanup every 10 minutes
- ✅ **Independent axes**: Price and CVD can be zoomed/panned separately
- ✅ **Server-Sent Events**: Efficient real-time updates every 5 seconds
- ✅ **Dark theme**: Professional UI with responsive design
- ✅ **Mean-reversion signals**: Cumulative signal with contrarian logic
- ✅ **Zero persistence**: Fully in-memory for Railway ephemeral storage
- ✅ **Fixed memory**: ~5MB footprint with sliding window cleanup

## How to read the signals

### Efficiency Ratio
Shows how "efficient" price movement is relative to order flow:
- **High ratio (>1.5)**: Strong directional move, price and CVD aligned
- **Low ratio (<0.5)**: Absorption/ranging, price barely moves despite CVD
- **Negative ratio (<0)**: Divergence, price and CVD move opposite (reversal signal)

### Signal Badges (-3 to +3)
- **+3 / -3**: Strong coherent move (ratio > 1.5)
- **+2 / -2**: Divergence (ratio < 0) → potential reversal
- **+1 / -1**: Absorption (0 < ratio < 0.5) → ranging/accumulation
- **0**: Neutral

### Cumulative Signal (Mean-Reversion Strategy)

**⚠️ CONTRARIAN LOGIC**: This is NOT trend-following!

The cumulative signal measures **market exhaustion**, not direction to follow.

| Cumulative | Market Condition | Trading Action |
|------------|-----------------|----------------|
| **> +4** (green zone) | Overbought | **SELL** (contrarian) |
| **< -4** (red zone) | Oversold | **BUY** (contrarian) |
| Between -3 and +3 | Neutral | Wait |

**Example**:
- Cumulative reaches +5 → many bullish signals → market "exhausted" → **sell** (don't buy!)
- Cumulative reaches -5 → many bearish signals → market "exhausted" → **buy** (don't sell!)

**Philosophy**: The more the market moves in one direction (signal accumulation), the higher the probability of reversal.

## Technical Details

- **Data source**: Hyperliquid WebSocket (`wss://api.hyperliquid.xyz/ws`)
- **Asset**: BTC perpetual futures
- **Candle interval**: 3 minutes
- **Update frequency**: 5 seconds
- **Data retention**: Sliding window (last 24 hours, ~480 candles)
- **Memory management**: Automatic cleanup every 10 minutes
- **Backend**: FastAPI + Uvicorn
- **Frontend**: HTML + Plotly.js + EventSource (SSE)
- **Chart features**: Independent Y-axis scaling for Price and CVD

## API Endpoints

- `GET /`: Serves frontend HTML
- `GET /api/data`: JSON snapshot of current data
- `GET /api/stream`: Server-Sent Events (SSE) for real-time updates
- `GET /api/health`: Health check
- `GET /static/*`: Static files (CSS, JS)

## Project Structure

```
cvd_visualizer_v2/
├── backend/
│   ├── __init__.py
│   ├── main.py           # FastAPI app + WebSocket logic + SSE streaming
│   └── cvd_engine.py     # CVD calculation logic
├── frontend/
│   ├── index.html        # Single-page app (sidebar + chart)
│   ├── app.js            # Plotly rendering + SSE client + independent axes
│   └── styles.css        # Dark theme styling
├── Procfile              # Railway: uvicorn backend.main:app
├── requirements.txt      # Python dependencies
├── .gitignore            # Git ignore (Python, IDE, OS files)
└── README.md
```

## Railway Deployment Notes

- **Ephemeral storage**: Data is not persisted across restarts (in-memory only)
- **Free tier**: 500h/month free (~20 days 24/7)
- **Cost**: ~$5/month for hobby plan
- **Performance**: Client-side chart rendering (no Python overhead)
- **Memory usage**: Fixed footprint (~5MB) with sliding window cleanup
- **Auto-restart**: Railway auto-restarts on crashes (WebSocket reconnects automatically)

## Analytics

The app includes Google Analytics tracking (optional):
- Page views
- Session duration
- Traffic sources

To enable: Replace `G-XXXXXXXXXX` in `frontend/index.html:15` with your Google Analytics tracking ID.

## Example Use Cases

### 1. Real-time Mean-Reversion Trading
Monitor cumulative signal. When it reaches extremes (>+4 or <-4), take contrarian position:
- Cumulative < -4 + high sell volume → **BUY** (oversold)
- Cumulative > +4 + high buy volume → **SELL** (overbought)

### 2. Divergence Detection
Watch for negative efficiency ratios (price and CVD move opposite):
- Price ↑ but CVD ↓ → signal +2 → potential bearish reversal
- Price ↓ but CVD ↑ → signal -2 → potential bullish reversal

### 3. Volume Analysis
Use volume profile to confirm signals:
- Heavy sell volume + cumulative < -4 → strong oversold condition
- Heavy buy volume + cumulative > +4 → strong overbought condition

---

## License

MIT License - See [LICENSE](LICENSE) file

---

## Contact

- **GitHub**: [@Federico-Anastasi](https://github.com/Federico-Anastasi)
- **Twitter**: [@FedeAnastasi](https://twitter.com/FedeAnastasi)
- **Email**: federico_anastasi@outlook.com

---

**Version**: 3.0 (FastAPI + HTML/JS + Independent Axes + Sliding Window)
**Date**: 2025-11-23
