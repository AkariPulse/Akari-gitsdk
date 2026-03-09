from typing import List, Dict
import math

def detect_volume_bursts(
    volumes: List[float],
    threshold_ratio: float = 1.5,
    min_interval: int = 1,
    *,
    baseline_window: int = 1,
    min_abs_volume: float = 0.0,
    precision: int = 4,
) -> List[Dict[str, float]]:
    """
    Identify indices where volume jumps relative to a baseline.

    Default behavior matches the original (baseline = previous point),
    but you can set `baseline_window > 1` to use a rolling mean of the
    previous N points as the baseline.

    Args:
        volumes: sequence of volumes
        threshold_ratio: curr / baseline must be >= this value
        min_interval: minimum index distance between successive events (cooldown)
        baseline_window: number of prior points to average for baseline (>=1)
        min_abs_volume: require curr >= this value to qualify
        precision: rounding for ratio & pct_change

    Returns:
        List of dicts with keys:
        - index (float): index of the burst (kept as float for backward type compatibility)
        - previous (float): baseline value used
        - current (float): current volume
        - ratio (float): current / baseline
        - delta (float): current - baseline
        - pct_change (float): percent change from baseline
    """
    n = len(volumes)
    if n < 2 or threshold_ratio <= 0:
      return []

    baseline_window = max(1, int(baseline_window))
    min_interval = max(1, int(min_interval))

    # sanitize inputs: keep only finite numbers; non-finite -> skip by mirroring previous or zero
    clean: List[float] = []
    for i, v in enumerate(volumes):
        if isinstance(v, (int, float)) and math.isfinite(v):
            clean.append(float(v))
        else:
            clean.append(0.0 if i == 0 else clean[-1])

    events: List[Dict[str, float]] = []
    last_idx = -min_interval

    # Precompute rolling sum for baseline means when baseline_window > 1
    roll_sum = 0.0
    q = []  # simple queue of last baseline_window values

    def push_baseline(val: float) -> None:
        nonlocal roll_sum
        q.append(val)
        roll_sum += val
        if len(q) > baseline_window:
            roll_sum -= q.pop(0)

    # seed with the first point
    push_baseline(clean[0])

    for i in range(1, n):
        # baseline is either previous value (window=1)
        # or mean of up to baseline_window prior points (excluding current)
        if baseline_window == 1:
            baseline = clean[i - 1]
        else:
            # ensure queue holds previous points only
            baseline = (roll_sum / len(q)) if q else clean[i - 1]

        curr = clean[i]

        # compute ratio safely
        if baseline > 0:
            ratio = curr / baseline
        else:
            ratio = math.inf if curr > 0 else 1.0  # 0->0 == no burst; 0->positive => treat as infinite jump

        qualifies = (
            ratio >= threshold_ratio and
            curr >= min_abs_volume and
            (i - last_idx) >= min_interval
        )

        if qualifies:
            delta = curr - baseline
            pct = (delta / baseline * 100.0) if baseline > 0 else (math.inf if curr > 0 else 0.0)
            events.append({
                "index": float(i),
                "previous": float(baseline),
                "current": float(curr),
                "ratio": round(ratio, precision),
                "delta": round(delta, precision),
                "pct_change": round(pct, precision),
            })
            last_idx = i

        # advance rolling window with previous point (so baseline excludes current)
        push_baseline(clean[i])

    return events
