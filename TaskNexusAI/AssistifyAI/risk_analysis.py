import math
from typing import Optional

def calculate_risk_score(
    price_change_pct: float,
    liquidity_usd: float,
    flags_mask: int,
    *,
    max_score: float = 100.0,
    weights: Optional[dict] = None
) -> float:
    """
    Compute a 0–100 risk score.

    Components:
      • Volatility: larger % swings = higher risk (default weight 50).
      • Liquidity: deeper liquidity = lower risk (default weight 30).
      • Flags: each risk flag bit adds penalty (default 5 each).

    Args:
        price_change_pct: Percent change over period (e.g. +5.0 for +5%).
        liquidity_usd: Liquidity in USD.
        flags_mask: Integer bitmask of risk flags; each set bit adds a penalty.
        max_score: Maximum cap for final risk score.
        weights: Override weights with dict keys {"volatility","liquidity","flag"}.

    Returns:
        Risk score clamped to [0, max_score].
    """
    w = {"volatility": 50.0, "liquidity": 30.0, "flag": 5.0}
    if weights:
        w.update(weights)

    # Volatility: 0–w["volatility"]
    vol_factor = min(abs(price_change_pct) / 10.0, 1.0)
    vol_score = vol_factor * w["volatility"]

    # Liquidity: high liquidity reduces score, clamp at 0
    if liquidity_usd > 0:
        liq_penalty = w["liquidity"] - (math.log10(liquidity_usd) * (w["liquidity"] / 6))
        liq_score = max(0.0, liq_penalty)
    else:
        liq_score = w["liquidity"]

    # Flags: each bit set adds penalty
    flag_count = bin(flags_mask).count("1")
    flag_score = flag_count * w["flag"]

    raw_score = vol_score + liq_score + flag_score
    return float(min(round(raw_score, 2), max_score))
