"""
CVD Engine - Core calculation logic for CVD analysis
Extracted from Streamlit app for use with FastAPI backend
"""

import pandas as pd
import numpy as np

# Constants
EPS = 1e-8
CVD_EPS = 1e-1
CLIP = 20

def classify(delta_p, delta_cvd, ratio, ratio_strong, ratio_weak):
    """
    Classify signal based on price/CVD movement and efficiency ratio

    Returns:
        int: Signal value from -3 to +3
            +3/-3: Strong coherent move (ratio > ratio_strong)
            +2/-2: Divergence (ratio < 0)
            +1/-1: Absorption (0 < ratio < ratio_weak)
            0: Neutral
    """
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


def build_frames(raw_trades, interval="3min", ratio_strong=1.5, ratio_weak=0.5, shift_sec=30):
    """
    Build OHLC candles, CVD, efficiency ratio, and signals from raw trades

    Args:
        raw_trades: List of dicts with keys: ts, price, vol, side
        interval: Candle interval (default "3min")
        ratio_strong: Threshold for ±3 signals
        ratio_weak: Threshold for ±1 signals
        shift_sec: CVD shift in seconds (default 30)

    Returns:
        tuple: (price_ohlc, cvd_ohlc, ratio_ser, signals, vol_buy, vol_sell)
    """
    if not raw_trades:
        return None, None, None, None, None, None

    df = pd.DataFrame(raw_trades).set_index("ts").sort_index()

    # Price candles
    price = df["price"].resample(interval).ohlc()

    # CVD calculation
    df["delta"] = np.where(df["side"] == "B", df["vol"], -df["vol"])
    cvd_tick = df["delta"].cumsum()
    cvd = cvd_tick.resample(interval).ohlc()

    # Volume breakdown
    vol_buy = df[df["side"] == "B"]["vol"].resample(interval).sum()
    vol_sell = df[df["side"] == "A"]["vol"].resample(interval).sum()

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

    # Shift CVD back in time
    cvd_shifted = cvd.copy()
    cvd_shifted.index = cvd_shifted.index - pd.Timedelta(seconds=shift_sec)

    return (price.dropna(), cvd_shifted.dropna(), ratio.dropna(), signals.dropna(),
            vol_buy.reindex(price.index).fillna(0), vol_sell.reindex(price.index).fillna(0))


def calculate_cumulative(sig_ser):
    """
    Calculate cumulative signal with reset logic at ±4

    Args:
        sig_ser: Pandas Series of signals

    Returns:
        list: List of Pandas Series segments (reset at extremes)
    """
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


def serialize_dataframe(df, columns=None):
    """
    Convert pandas DataFrame to JSON-serializable dict

    Args:
        df: Pandas DataFrame
        columns: List of column names to include (default: all)

    Returns:
        dict: {"index": [...], "data": {...}}
    """
    if df is None or len(df) == 0:
        return {"index": [], "data": {}}

    if columns is None:
        columns = df.columns.tolist()

    return {
        "index": df.index.strftime("%Y-%m-%d %H:%M:%S").tolist(),
        "data": {col: df[col].tolist() for col in columns if col in df.columns}
    }


def serialize_series(series):
    """
    Convert pandas Series to JSON-serializable dict

    Returns:
        dict: {"index": [...], "values": [...]}
    """
    if series is None or len(series) == 0:
        return {"index": [], "values": []}

    return {
        "index": series.index.strftime("%Y-%m-%d %H:%M:%S").tolist(),
        "values": series.tolist()
    }


def serialize_cumulative_segments(segments):
    """
    Convert cumulative segments to JSON-serializable list

    Returns:
        list: [{"index": [...], "values": [...]}, ...]
    """
    if not segments:
        return []

    return [serialize_series(seg) for seg in segments]
