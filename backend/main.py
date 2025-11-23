"""
CVD Visualizer - FastAPI Backend
Connects to Hyperliquid WebSocket, calculates CVD, serves data to frontend
"""

import asyncio
import json
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, Any

import pandas as pd
import websockets
from fastapi import FastAPI
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.cvd_engine import (
    build_frames,
    calculate_cumulative,
    serialize_dataframe,
    serialize_series,
    serialize_cumulative_segments
)

# Configuration
COIN = "BTC"
WS_URL = "wss://api.hyperliquid.xyz/ws"
INTERVAL = "3min"
SHIFT_SEC = 30
RATIO_STRONG = 1.5
RATIO_WEAK = 0.5
UPDATE_INTERVAL = 5  # seconds

# Data retention settings (sliding window)
MAX_CANDLES = 480  # 1 day of 3-minute candles (24h * 60min / 3min)
MAX_TRADES_AGE_SEC = 86400  # 1 day in seconds
CLEANUP_INTERVAL = 120  # Cleanup every 120 updates (10 minutes)

# Global state
trades = []
trades_lock = threading.Lock()
data_snapshot = {
    "timestamp": None,
    "price_ohlc": None,
    "cvd_ohlc": None,
    "ratio": None,
    "signals": None,
    "vol_buy": None,
    "vol_sell": None,
    "cumulative_segments": None,
    "kpi": {
        "volume_24h": 0,
        "trades_per_min": 0,
        "cvd_net": 0,
        "last_signal": 0,
        "uptime_sec": 0
    }
}
session_start = time.time()

# FastAPI app
app = FastAPI(title="CVD Visualizer API", version="3.0")

# CORS middleware (allow frontend on same domain)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════
# HYPERLIQUID WEBSOCKET
# ═══════════════════════════════════════════════════════════

async def on_message(msg):
    """Handle incoming WebSocket message from Hyperliquid"""
    data = json.loads(msg)["data"]
    if isinstance(data, list):
        with trades_lock:
            trades.extend({
                "ts": pd.to_datetime(t["time"], unit="ms"),
                "price": float(t["px"]),
                "vol": float(t["sz"]),
                "side": t["side"]
            } for t in data)


async def websocket_loop():
    """Main WebSocket loop - connects to Hyperliquid and receives trades"""
    while True:
        try:
            async with websockets.connect(WS_URL) as ws:
                await ws.send(json.dumps({
                    "method": "subscribe",
                    "subscription": {"type": "trades", "coin": COIN}
                }))
                print(f"[WS] Connected to Hyperliquid - {COIN}", flush=True)
                while True:
                    await on_message(await ws.recv())
        except Exception as e:
            print(f"[WS] Error: {e}, reconnecting in 5s...", flush=True)
            await asyncio.sleep(5)


def start_websocket():
    """Start WebSocket in background thread"""
    asyncio.run(websocket_loop())


# ═══════════════════════════════════════════════════════════
# DATA AGGREGATION
# ═══════════════════════════════════════════════════════════

def cleanup_old_trades():
    """
    Remove trades older than MAX_TRADES_AGE_SEC (sliding window)
    Keeps only last 1 day of data to maintain fixed memory footprint
    """
    cutoff = datetime.now() - timedelta(seconds=MAX_TRADES_AGE_SEC)

    with trades_lock:
        initial_count = len(trades)
        # Filter trades, keep only those newer than cutoff
        trades[:] = [t for t in trades if t["ts"] >= cutoff]
        removed_count = initial_count - len(trades)

        if removed_count > 0:
            print(f"[CLEANUP] Removed {removed_count} old trades, kept {len(trades)} (last {MAX_TRADES_AGE_SEC}s)", flush=True)


def update_snapshot():
    """Calculate CVD and update global snapshot"""
    global data_snapshot

    with trades_lock:
        trades_copy = trades.copy()

    if not trades_copy:
        return

    # Build frames
    price_ohlc, cvd_ohlc, ratio_ser, sig_ser, vol_buy, vol_sell = build_frames(
        trades_copy, INTERVAL, RATIO_STRONG, RATIO_WEAK, SHIFT_SEC
    )

    if price_ohlc is None or len(price_ohlc) == 0:
        return

    # Calculate cumulative segments
    segments = calculate_cumulative(sig_ser)

    # Calculate KPI
    total_vol_24h = vol_buy.sum() + vol_sell.sum()
    uptime_sec = time.time() - session_start
    trades_per_min = len(trades_copy) / (uptime_sec / 60) if uptime_sec > 0 else 0
    cvd_net = cvd_ohlc['close'].iloc[-1] if len(cvd_ohlc) > 0 else 0
    last_signal = int(sig_ser.iloc[-1]) if len(sig_ser) > 0 else 0

    # Update snapshot
    data_snapshot.update({
        "timestamp": datetime.now().isoformat(),
        "price_ohlc": serialize_dataframe(price_ohlc, ["open", "high", "low", "close"]),
        "cvd_ohlc": serialize_dataframe(cvd_ohlc, ["open", "high", "low", "close"]),
        "ratio": serialize_series(ratio_ser),
        "signals": serialize_series(sig_ser),
        "vol_buy": serialize_series(vol_buy),
        "vol_sell": serialize_series(vol_sell),
        "cumulative_segments": serialize_cumulative_segments(segments),
        "kpi": {
            "volume_24h": round(total_vol_24h, 2),
            "trades_per_min": round(trades_per_min, 1),
            "cvd_net": round(cvd_net, 2),
            "last_signal": last_signal,
            "uptime_sec": int(uptime_sec)
        }
    })


async def aggregator_loop():
    """Background task to update data snapshot every UPDATE_INTERVAL seconds"""
    update_counter = 0

    while True:
        try:
            update_snapshot()
            print(f"[AGG] Updated snapshot - {len(trades)} trades", flush=True)

            # Periodic cleanup: every CLEANUP_INTERVAL updates (default: 10 minutes)
            update_counter += 1
            if update_counter % CLEANUP_INTERVAL == 0:
                cleanup_old_trades()

        except Exception as e:
            print(f"[AGG] Error: {e}", flush=True)
        await asyncio.sleep(UPDATE_INTERVAL)


# ═══════════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════════

@app.get("/api/data")
async def get_data() -> Dict[str, Any]:
    """
    Get current CVD data snapshot (JSON)

    Returns:
        dict: Full data snapshot with price, CVD, signals, KPI
    """
    return data_snapshot


@app.get("/api/stream")
async def stream_data():
    """
    Server-Sent Events (SSE) stream for real-time updates

    Sends data snapshot every UPDATE_INTERVAL seconds
    """
    async def event_generator():
        while True:
            yield f"data: {json.dumps(data_snapshot)}\n\n"
            await asyncio.sleep(UPDATE_INTERVAL)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "uptime_sec": int(time.time() - session_start),
        "trades_count": len(trades)
    }


@app.get("/")
async def serve_frontend():
    """Serve frontend HTML"""
    return FileResponse("frontend/index.html")


# ═══════════════════════════════════════════════════════════
# STARTUP / SHUTDOWN
# ═══════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup_event():
    """Start background tasks on app startup"""
    print("[APP] Starting CVD Visualizer Backend", flush=True)

    # Start WebSocket in background thread
    ws_thread = threading.Thread(target=start_websocket, daemon=True)
    ws_thread.start()

    # Start aggregator loop
    asyncio.create_task(aggregator_loop())

    print("[APP] Background tasks started", flush=True)


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("[APP] Shutting down", flush=True)


# Mount static files (CSS, JS)
app.mount("/static", StaticFiles(directory="frontend"), name="static")
