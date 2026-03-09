from typing import List, Union

def generate_activity_heatmap(
    timestamps: List[int],
    counts: List[int],
    buckets: int = 10,
    normalize: bool = True,
    precision: int = 4,
    fill_empty: Union[int, float] = 0,
) -> List[float]:
    """
    Bucket activity counts into `buckets` time intervals.

    Args:
        timestamps: List of epoch ms timestamps.
        counts: Parallel list of counts for each timestamp.
        buckets: Number of output buckets (default: 10).
        normalize: If True, values scaled to [0.0–1.0].
        precision: Decimal places to round normalized values.
        fill_empty: Value to fill if no data is present (default 0).

    Returns:
        List of bucketed counts (raw or normalized).
    """
    if not timestamps or not counts or len(timestamps) != len(counts):
        return [fill_empty] * buckets

    t_min, t_max = min(timestamps), max(timestamps)
    span = max(t_max - t_min, 1)  # avoid zero division
    bucket_size = span / buckets

    agg = [0] * buckets
    for t, c in zip(timestamps, counts):
        idx = min(buckets - 1, int((t - t_min) / bucket_size))
        agg[idx] += c

    if normalize:
        max_val = max(agg)
        if max_val == 0:
            return [fill_empty] * buckets
        return [round(val / max_val, precision) for val in agg]

    return agg
