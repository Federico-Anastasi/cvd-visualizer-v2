import asyncio, websockets, json, threading, time, os
import pandas as pd, numpy as np
import streamlit as st
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from datetime import datetime, timedelta

# ════════════ CONFIGURAZIONE ════════════
COIN, WS_URL       = "BTC", "wss://api.hyperliquid.xyz/ws"
INTERVAL, SHIFT_SEC = "3min", 30
EPS, CVD_EPS, CLIP = 1e-8, 1e-1, 20
RATIO_STRONG_DEFAULT = 1.5
RATIO_WEAK_DEFAULT = 0.5

# Colors
COLOR_BUY = "#00ff41"
COLOR_SELL = "#ff0051"
COLOR_NEUTRAL = "#00d4ff"
COLOR_ORANGE = "#ff7f0e"

# ════════════ SESSION MANAGEMENT ════════════
def find_latest_session():
    """Find the most recent session (always resume)"""
    if not os.path.exists("data"):
        return None

    sessions = [d for d in os.listdir("data") if d.startswith("session_")]
    if not sessions:
        return None

    # Sort by timestamp (newest first) and return the latest
    sessions.sort(reverse=True)
    return sessions[0]

def load_session_data(session_dir):
    """Load trades from previous session"""
    trades_file = f"{session_dir}/trades_raw.csv"
    if os.path.exists(trades_file):
        try:
            df = pd.read_csv(trades_file)
            if len(df) > 0:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
                trades_list = []
                for _, row in df.iterrows():
                    trades_list.append({
                        "ts": row['timestamp'],
                        "price": row['price'],
                        "vol": row['volume'],
                        "side": row['side']
                    })
                return trades_list
        except Exception as e:
            print(f"Error loading session data: {e}")
    return []

# ════════════ STATO GLOBALE ════════════
trades, lock = [], threading.Lock()

# Try to resume latest session
latest_session = find_latest_session()
resumed_trades_count = 0  # Track how many trades were loaded from previous session

if latest_session:
    print(f"[RESUME] Resuming session: {latest_session}")
    session_id = latest_session
    session_dir = f"data/{session_id}"
    # Load previous trades
    with lock:
        trades = load_session_data(session_dir)
        resumed_trades_count = len(trades)
    print(f"[RESUME] Loaded {resumed_trades_count} trades from previous session")
    session_start = int(session_id.split("_")[1])
else:
    print("[NEW] Starting new session")
    session_start = time.time()
    session_id = f"session_{int(session_start)}"
    session_dir = f"data/{session_id}"
    os.makedirs(session_dir, exist_ok=True)

# File paths
trades_raw_file = f"{session_dir}/trades_raw.csv"
candles_file = f"{session_dir}/candles_3m.csv"
cvd_file = f"{session_dir}/cvd_timeseries.csv"
signals_file = f"{session_dir}/signals.csv"
kpi_file = f"{session_dir}/kpi_snapshots.csv"

# Initialize CSV files with headers (only if new session)
if not latest_session:
    for file, header in [
        (trades_raw_file, "timestamp,price,volume,side\n"),
        (candles_file, "timestamp,open,high,low,close,volume_buy,volume_sell,trade_count\n"),
        (cvd_file, "timestamp,cvd_open,cvd_high,cvd_low,cvd_close,cvd_cumsum\n"),
        (signals_file, "timestamp,price,ratio,signal,cumulative\n"),
        (kpi_file, "timestamp,volume_24h,trades_per_min,cvd_net,last_signal\n")
    ]:
        if not os.path.exists(file):
            with open(file, 'w') as f:
                f.write(header)

# ════════════ WebSocket ════════════
async def on_msg(msg):
    data = json.loads(msg)["data"]
    if isinstance(data, list):
        with lock:
            trades.extend({
                "ts":   pd.to_datetime(t["time"], unit="ms"),
                "price":float(t["px"]),
                "vol":  float(t["sz"]),
                "side": t["side"]
            } for t in data)

async def ws_loop():
    while True:
        try:
            async with websockets.connect(WS_URL) as ws:
                await ws.send(json.dumps({
                    "method":"subscribe",
                    "subscription":{"type":"trades","coin":COIN}
                }))
                while True:
                    await on_msg(await ws.recv())
        except Exception as e:
            print("WS error:", e, "reconnect...")
            await asyncio.sleep(5)

threading.Thread(target=lambda: asyncio.run(ws_loop()), daemon=True).start()

# ════════════ DATA PROCESSING (same as v1) ════════════
def classify(delta_p, delta_cvd, ratio, ratio_strong, ratio_weak):
    if abs(delta_cvd) < CVD_EPS:
        return 0
    if ratio > ratio_strong:
        return +3 if delta_p > 0 else -3
    elif ratio < 0:
        return -2 if delta_p > 0 else +2
    elif ratio >= 0 and ratio < ratio_weak:
        return -1 if delta_p > 0 else +1
    else:
        return 0

def build_frames(raw, interval, ratio_strong, ratio_weak):
    if not raw:
        return None, None, None, None, None, None

    df = pd.DataFrame(raw).set_index("ts").sort_index()

    # Price candles
    price = df["price"].resample(interval).ohlc()

    # CVD calculation
    df["delta"] = np.where(df["side"] == "B", df["vol"], -df["vol"])
    cvd_tick = df["delta"].cumsum()
    cvd = cvd_tick.resample(interval).ohlc()

    # Volume breakdown
    vol_buy = df[df["side"] == "B"]["vol"].resample(interval).sum()
    vol_sell = df[df["side"] == "A"]["vol"].resample(interval).sum()
    trade_count = df.resample(interval).size()

    # Ratios and signals
    delta_price = price["close"] - price["open"]
    delta_cvd   = cvd["close"]   - cvd["open"]
    avg_abs_price = delta_price.abs().rolling(window=10, min_periods=1).mean()
    avg_abs_cvd   = delta_cvd.abs().rolling(window=10, min_periods=1).mean()

    norm_dp   = delta_price / (avg_abs_price + EPS)
    norm_dcvd = delta_cvd   / (avg_abs_cvd + EPS)
    ratio = (norm_dp / (norm_dcvd + EPS)).clip(-CLIP, CLIP).rename("ratio")

    signals = pd.Series(index=ratio.index, dtype="float")
    for t in ratio.index:
        signals[t] = classify(delta_price.loc[t], delta_cvd.loc[t], ratio.loc[t], ratio_strong, ratio_weak)

    cvd_shifted = cvd.copy()
    cvd_shifted.index = cvd_shifted.index - pd.Timedelta(seconds=SHIFT_SEC)

    return (price.dropna(), cvd_shifted.dropna(), ratio.dropna(), signals.dropna(),
            vol_buy.reindex(price.index).fillna(0), vol_sell.reindex(price.index).fillna(0))

def calculate_cumulative(sig_ser):
    """Calculate cumulative signal with reset logic"""
    segments = []
    current_segment = []
    cumulative = 0
    last_extreme = None

    sig_array = sig_ser.astype(float).copy()
    sig_array.iloc[:2] = 0

    for i, val in enumerate(sig_array):
        cumulative += val
        current_segment.append((sig_array.index[i], cumulative))

        if cumulative >= 4:
            if last_extreme in [-4, None]:
                seg_index, seg_vals = zip(*current_segment)
                segments.append(pd.Series(data=seg_vals, index=seg_index))
                cumulative = 0
                last_extreme = 4
                current_segment = [(sig_array.index[i], 0)]
        elif cumulative <= -4:
            if last_extreme in [4, None]:
                seg_index, seg_vals = zip(*current_segment)
                segments.append(pd.Series(data=seg_vals, index=seg_index))
                cumulative = 0
                last_extreme = -4
                current_segment = [(sig_array.index[i], 0)]

    if current_segment:
        seg_index, seg_vals = zip(*current_segment)
        segments.append(pd.Series(data=seg_vals, index=seg_index))

    return segments

def save_data(price_ohlc, cvd_ohlc, ratio_ser, sig_ser, vol_buy, vol_sell, trades_raw, kpi_data):
    """Save all data to CSV files"""
    try:
        # Save raw trades (last batch only)
        if trades_raw:
            df_trades = pd.DataFrame(trades_raw)
            df_trades.to_csv(trades_raw_file, mode='a', header=False, index=False)

        # Save candles
        if price_ohlc is not None:
            df_candles = pd.DataFrame({
                'timestamp': price_ohlc.index,
                'open': price_ohlc['open'],
                'high': price_ohlc['high'],
                'low': price_ohlc['low'],
                'close': price_ohlc['close'],
                'volume_buy': vol_buy,
                'volume_sell': vol_sell,
                'trade_count': len(trades_raw)
            })
            df_candles.to_csv(candles_file, mode='a', header=False, index=False)

        # Save CVD timeseries
        if cvd_ohlc is not None:
            df_cvd = pd.DataFrame({
                'timestamp': cvd_ohlc.index,
                'cvd_open': cvd_ohlc['open'],
                'cvd_high': cvd_ohlc['high'],
                'cvd_low': cvd_ohlc['low'],
                'cvd_close': cvd_ohlc['close'],
                'cvd_cumsum': cvd_ohlc['close']
            })
            df_cvd.to_csv(cvd_file, mode='a', header=False, index=False)

        # Save signals
        if ratio_ser is not None and sig_ser is not None:
            df_signals = pd.DataFrame({
                'timestamp': price_ohlc.index,
                'price': price_ohlc['close'],
                'ratio': ratio_ser.reindex(price_ohlc.index).round(2),
                'signal': sig_ser.reindex(price_ohlc.index),
                'cumulative': 0  # Will be calculated from segments
            })
            df_signals.to_csv(signals_file, mode='a', header=False, index=False)

        # Save KPI snapshot
        if kpi_data:
            df_kpi = pd.DataFrame([kpi_data])
            df_kpi.to_csv(kpi_file, mode='a', header=False, index=False)

    except Exception as e:
        print(f"Error saving data: {e}")

# ════════════ STREAMLIT UI ════════════
st.set_page_config(layout="wide", page_title="CVD Visualizer V2.1")

# Sidebar KPI
with st.sidebar:
    st.title("📊 CVD Visualizer V2.1")

    # Session info
    if latest_session:
        st.success(f"📂 Resumed: {session_id}")
        st.caption(f"Loaded {len(trades)} previous trades")
    else:
        st.info(f"🆕 New Session: {session_id}")

    st.markdown("---")

    # Controls
    st.subheader("⚙️ Controls")
    ratio_strong = st.slider("RATIO_STRONG", 1.0, 3.0, RATIO_STRONG_DEFAULT, 0.1,
                             help="Soglia per segnale ±3 (movimento coerente forte)")
    ratio_weak = st.slider("RATIO_WEAK", 0.1, 1.0, RATIO_WEAK_DEFAULT, 0.1,
                           help="Soglia per segnale ±1 (assorbimento)")

    # KPI placeholders
    st.markdown("---")
    st.subheader("📈 KPI")
    kpi_vol24h = st.empty()
    kpi_trades_min = st.empty()
    kpi_cvd_net = st.empty()
    kpi_last_signal = st.empty()
    kpi_uptime = st.empty()
    kpi_next_update = st.empty()

    # Signal Legend
    st.markdown("---")
    st.subheader("📖 Signal Legend")
    st.markdown("""
    **Signals -3 to +3**:

    **+3 / -3**: **Strong Coherent Move**
    - Ratio > RATIO_STRONG
    - Price and CVD move together
    - +3 = strong rally, -3 = strong drop

    **+2 / -2**: **Divergence** (reversal)
    - Ratio < 0 (negative)
    - Price and CVD move opposite
    - +2 = price ↑ but CVD ↓ (potential reversal)
    - -2 = price ↓ but CVD ↑ (potential reversal)

    **+1 / -1**: **Absorption** (ranging)
    - 0 < Ratio < RATIO_WEAK
    - Price moves little vs CVD
    - +1 = sell absorption (accumulation)
    - -1 = buy absorption (distribution)

    **0**: Neutral or negligible CVD
    """)
    st.caption("Ratio = Δprice_norm / ΔCVD_norm")

# Main area
placeholder = st.empty()

# Main loop
update_counter = 0
while True:
    update_counter += 1
    start_time = time.time()

    with lock:
        price_ohlc, cvd_ohlc, ratio_ser, sig_ser, vol_buy, vol_sell = build_frames(
            trades, INTERVAL, ratio_strong, ratio_weak
        )

    if price_ohlc is not None and len(price_ohlc) > 0:
        # Calculate KPI
        total_vol_24h = vol_buy.sum() + vol_sell.sum()
        uptime_sec = time.time() - session_start

        # Trades/min: only count NEW trades received after resume (not loaded ones)
        new_trades_count = len(trades) - resumed_trades_count
        trades_per_min = new_trades_count / (uptime_sec / 60) if uptime_sec > 0 else 0

        cvd_net = cvd_ohlc['close'].iloc[-1] if len(cvd_ohlc) > 0 else 0
        last_signal = int(sig_ser.iloc[-1]) if len(sig_ser) > 0 else 0

        # Update sidebar KPI
        kpi_vol24h.metric("Volume 24h", f"{total_vol_24h:.2f} BTC")
        kpi_trades_min.metric("Trades/min", f"{trades_per_min:.1f}")
        kpi_cvd_net.metric("CVD Net", f"{cvd_net:.2f}")

        signal_color = {-3: "🔴", -2: "🔴", -1: "🔴", 0: "⚪", 1: "🟢", 2: "🟢", 3: "🟢"}.get(last_signal, "⚪")
        kpi_last_signal.metric("Last Signal", f"{signal_color} {last_signal:+d}")
        kpi_uptime.metric("Uptime", f"{int(uptime_sec//60)}m {int(uptime_sec%60)}s")

        # Calculate cumulative segments
        segments = calculate_cumulative(sig_ser)
        current_cumulative = segments[-1].iloc[-1] if segments else 0

        # Alert flash
        alert_state = abs(current_cumulative) >= 4.5

        # Create figure
        fig = make_subplots(
            rows=4, cols=1, shared_xaxes=True,
            specs=[[{"secondary_y": True}], [{}], [{}], [{}]],
            row_heights=[0.5, 0.15, 0.2, 0.15],
            vertical_spacing=0.03,
            subplot_titles=("Price + CVD", "Volume Profile", "Efficiency + Signals", "Cumulative Signal")
        )

        # ROW 1: Price Candlestick + CVD Candlestick (V2.1)
        fig.add_trace(go.Candlestick(
            name="Price",
            x=price_ohlc.index,
            open=price_ohlc["open"], high=price_ohlc["high"],
            low=price_ohlc["low"], close=price_ohlc["close"],
            increasing_line_color="#26a69a", decreasing_line_color="#ef5350",
            increasing_fillcolor="#26a69a", decreasing_fillcolor="#ef5350",
            opacity=0.9),
            row=1, col=1, secondary_y=False
        )

        # CVD as candlestick (transparent for info preservation)
        fig.add_trace(go.Candlestick(
            name="CVD",
            x=cvd_ohlc.index,
            open=cvd_ohlc["open"], high=cvd_ohlc["high"],
            low=cvd_ohlc["low"], close=cvd_ohlc["close"],
            increasing_line_color=COLOR_NEUTRAL, decreasing_line_color="#f9c74f",
            increasing_fillcolor=COLOR_NEUTRAL, decreasing_fillcolor="#f9c74f",
            opacity=0.35,
            showlegend=True),
            row=1, col=1, secondary_y=True
        )

        # No overlays on Price+CVD panel (cleaner view)

        # ROW 2: Volume Profile (Buy vs Sell)
        fig.add_trace(go.Bar(
            name="Buy Volume",
            x=price_ohlc.index,
            y=vol_buy,
            marker_color=COLOR_BUY,
            opacity=0.7),
            row=2, col=1
        )
        fig.add_trace(go.Bar(
            name="Sell Volume",
            x=price_ohlc.index,
            y=-vol_sell,
            marker_color=COLOR_SELL,
            opacity=0.7),
            row=2, col=1
        )

        # ROW 3: Efficiency Ratio with threshold bands (V2.1)
        # Background bands for thresholds
        x_range_eff = ratio_ser.index
        if len(x_range_eff) > 0:
            # RATIO_STRONG band (green zone)
            fig.add_trace(go.Scatter(
                x=list(x_range_eff) + list(x_range_eff[::-1]),
                y=[ratio_strong]*len(x_range_eff) + [20]*len(x_range_eff),
                fill='toself',
                fillcolor='rgba(0, 255, 65, 0.08)',
                line=dict(width=0),
                showlegend=False,
                hoverinfo='skip'),
                row=3, col=1
            )
            fig.add_trace(go.Scatter(
                x=list(x_range_eff) + list(x_range_eff[::-1]),
                y=[-ratio_strong]*len(x_range_eff) + [-20]*len(x_range_eff),
                fill='toself',
                fillcolor='rgba(255, 0, 81, 0.08)',
                line=dict(width=0),
                showlegend=False,
                hoverinfo='skip'),
                row=3, col=1
            )
            # RATIO_WEAK band (yellow zone)
            fig.add_trace(go.Scatter(
                x=list(x_range_eff) + list(x_range_eff[::-1]),
                y=[ratio_weak]*len(x_range_eff) + [ratio_strong]*len(x_range_eff),
                fill='toself',
                fillcolor='rgba(255, 200, 0, 0.05)',
                line=dict(width=0),
                showlegend=False,
                hoverinfo='skip'),
                row=3, col=1
            )
            fig.add_trace(go.Scatter(
                x=list(x_range_eff) + list(x_range_eff[::-1]),
                y=[-ratio_weak]*len(x_range_eff) + [-ratio_strong]*len(x_range_eff),
                fill='toself',
                fillcolor='rgba(255, 200, 0, 0.05)',
                line=dict(width=0),
                showlegend=False,
                hoverinfo='skip'),
                row=3, col=1
            )

        # Threshold lines
        fig.add_hline(y=ratio_strong, line_dash="dash", line_color="rgba(0, 255, 65, 0.5)",
                     line_width=1, row=3, col=1)
        fig.add_hline(y=-ratio_strong, line_dash="dash", line_color="rgba(255, 0, 81, 0.5)",
                     line_width=1, row=3, col=1)
        fig.add_hline(y=0, line_dash="solid", line_color="rgba(255, 255, 255, 0.3)",
                     line_width=1, row=3, col=1)

        # Efficiency line
        fig.add_trace(go.Scatter(
            name="Efficiency",
            x=ratio_ser.index,
            y=ratio_ser.values,
            mode="lines",
            line=dict(color=COLOR_NEUTRAL, width=2),
            fill='tozeroy',
            fillcolor='rgba(0, 212, 255, 0.15)',
            opacity=0.85),
            row=3, col=1
        )

        # Signal badges (circular markers) - ALL signals including ±1
        for i, (t, sig) in enumerate(sig_ser.items()):
            # Show ALL signals (removed sig != 0 filter)
            color = COLOR_BUY if sig > 0 else (COLOR_SELL if sig < 0 else "#888888")
            fig.add_trace(go.Scatter(
                x=[t],
                y=[ratio_ser.loc[t] if t in ratio_ser.index else 0],
                mode='markers+text',
                marker=dict(size=20, color=color, line=dict(width=2, color='white')),
                text=[f"{int(sig):+d}" if sig != 0 else "0"],
                textfont=dict(color='white', size=10),
                textposition="middle center",
                showlegend=False,
                hoverinfo='skip'),
                row=3, col=1
            )

        # ROW 4: Cumulative Signal with zones
        for i, seg in enumerate(segments):
            fig.add_trace(go.Scatter(
                name="Cumulative" if i == 0 else None,
                x=seg.index,
                y=seg.values,
                mode="lines+markers",
                line=dict(color=COLOR_ORANGE, width=2),
                marker=dict(size=4),
                opacity=0.85,
                showlegend=(i == 0)),
                row=4, col=1
            )

        # Zone shading
        x_range = price_ohlc.index
        if len(x_range) > 0:
            fig.add_trace(go.Scatter(
                x=list(x_range) + list(x_range[::-1]),
                y=[3]*len(x_range) + [10]*len(x_range),
                fill='toself',
                fillcolor='rgba(0, 255, 65, 0.1)',
                line=dict(width=0),
                showlegend=False,
                hoverinfo='skip'),
                row=4, col=1
            )
            fig.add_trace(go.Scatter(
                x=list(x_range) + list(x_range[::-1]),
                y=[-3]*len(x_range) + [-10]*len(x_range),
                fill='toself',
                fillcolor='rgba(255, 0, 81, 0.1)',
                line=dict(width=0),
                showlegend=False,
                hoverinfo='skip'),
                row=4, col=1
            )

        # Threshold lines
        fig.add_hline(y=4.5, line_dash="dot", line_color="green", row=4, col=1)
        fig.add_hline(y=-4.5, line_dash="dot", line_color="red", row=4, col=1)

        # Layout
        fig.update_layout(
            template="plotly_dark",
            height=900,
            xaxis_rangeslider_visible=False,
            hovermode='x unified',
            showlegend=True,
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
        )

        fig.update_yaxes(title_text="Price", row=1, col=1, secondary_y=False)
        fig.update_yaxes(title_text="CVD", row=1, col=1, secondary_y=True)
        fig.update_yaxes(title_text="Volume", row=2, col=1)

        # Auto-range for Efficiency (panel 3)
        if len(ratio_ser) > 0:
            ratio_min, ratio_max = ratio_ser.min(), ratio_ser.max()
            ratio_padding = (ratio_max - ratio_min) * 0.1
            fig.update_yaxes(
                title_text="Efficiency",
                row=3, col=1,
                range=[ratio_min - ratio_padding, ratio_max + ratio_padding]
            )
        else:
            fig.update_yaxes(title_text="Efficiency", row=3, col=1)

        # Auto-range for Cumulative (panel 4)
        if segments:
            all_cumulative_values = []
            for seg in segments:
                all_cumulative_values.extend(seg.values)
            if all_cumulative_values:
                cum_min, cum_max = min(all_cumulative_values), max(all_cumulative_values)
                cum_padding = max(1, (cum_max - cum_min) * 0.1)
                fig.update_yaxes(
                    title_text="Cumulative",
                    row=4, col=1,
                    range=[cum_min - cum_padding, cum_max + cum_padding]
                )
        else:
            fig.update_yaxes(title_text="Cumulative", row=4, col=1)

        # Add border flash if alert
        if alert_state:
            fig.update_layout(
                paper_bgcolor='rgba(255,0,0,0.1)' if current_cumulative < 0 else 'rgba(0,255,0,0.1)'
            )

        placeholder.plotly_chart(fig, use_container_width=True, key=f"plot_{update_counter}")

        # Save data in background
        kpi_data = {
            'timestamp': datetime.now(),
            'volume_24h': total_vol_24h,
            'trades_per_min': trades_per_min,
            'cvd_net': cvd_net,
            'last_signal': last_signal
        }

        with lock:
            trades_snapshot = trades.copy()

        threading.Thread(target=save_data, args=(
            price_ohlc, cvd_ohlc, ratio_ser, sig_ser, vol_buy, vol_sell,
            [{"timestamp": t["ts"], "price": t["price"], "volume": t["vol"], "side": t["side"]}
             for t in trades_snapshot[-100:]], kpi_data
        ), daemon=True).start()

    # Progress bar for next update
    elapsed = time.time() - start_time
    sleep_time = max(0, 5 - elapsed)
    for i in range(int(sleep_time * 10)):
        kpi_next_update.progress((i / (sleep_time * 10)), text=f"Next update in {sleep_time - i/10:.1f}s")
        time.sleep(0.1)
