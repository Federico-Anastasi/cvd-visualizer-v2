# CVD Visualizer 🚀

Real-time Bitcoin order flow analysis with Cumulative Volume Delta (CVD) and mean-reversion signals.

## What it does

Connects to Hyperliquid WebSocket and visualizes:
- **Price vs CVD**: Candlestick chart with transparent CVD overlay
- **Volume Profile**: Buy/sell volume breakdown per candle
- **Efficiency Ratio**: Price movement vs CVD movement (normalized)
- **Cumulative Signals**: Mean-reversion indicator for oversold/overbought conditions

## Quick Start

```bash
pip install streamlit plotly pandas numpy websockets
streamlit run main.py
```

The app will:
1. Connect to Hyperliquid WebSocket (BTC perpetual)
2. Start collecting trades in real-time
3. Update dashboard every 5 seconds
4. Auto-save session data to `data/session_[timestamp]/`

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

## Interactive Controls

**Sidebar sliders**:
- **RATIO_STRONG** (1.0-3.0, default 1.5): Threshold for ±3 signals
- **RATIO_WEAK** (0.1-1.0, default 0.5): Threshold for ±1 signals

Adjust these to tune signal sensitivity. Changes recalculate signals in real-time.

## Session Management

The app **always auto-resumes** the latest session on restart:
- ✅ Loads all previous trades from `trades_raw.csv`
- ✅ Rebuilds charts with historical data
- ✅ Continues saving to the same folder

**To start fresh**: Delete or rename folders in `data/` that start with "session_"

## Data Files

Each session saves 5 CSV files in `data/session_[timestamp]/`:
1. `trades_raw.csv`: All raw trades (timestamp, price, volume, side)
2. `candles_3m.csv`: OHLC candles (3-minute intervals)
3. `cvd_timeseries.csv`: CVD OHLC per candle
4. `signals.csv`: Efficiency ratio and signals per candle
5. `kpi_snapshots.csv`: KPI history (volume, trades/min, CVD net, last signal)

## Technical Details

- **Data source**: Hyperliquid WebSocket (`wss://api.hyperliq.xyz/ws`)
- **Asset**: BTC perpetual futures
- **Candle interval**: 3 minutes
- **Update frequency**: 5 seconds
- **Framework**: Streamlit + Plotly
- **Session persistence**: Auto-resume with CSV storage

## Example Use Cases

### 1. Real-time Mean-Reversion Trading
Monitor cumulative signal in panel 4. When it reaches extremes (>+4 or <-4), take contrarian position:
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

## Deploy

For Railway.app deployment, the `Procfile` is already configured:
```
web: streamlit run main.py --server.port=$PORT --server.address=0.0.0.0
```

Just connect your GitHub repo to Railway and deploy.

## Notes

- **Filesystem**: Railway uses ephemeral storage. Session data is lost on restart (acceptable for a playground).
- **Free tier**: Railway offers 500h/month free (~20 days 24/7).
- **Cost**: ~$5/month for persistent hobby plan.

---

**Version**: 2.1
**Author**: MangoLabs
**Date**: 2025-11-22
