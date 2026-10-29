import duckdb

PROC_STATUS = "/proc/self/status"

# DuckDB sets the default `memory_limit` to 80% of the memory it detects: the cgroup limit or the RAM.
DUCKDB_DEFAULT_SHARE = 0.8
FREE_MEMORY_SHARE = 0.7
# Only guards against a budget of zero or less; a larger floor could exceed the free memory.
MIN_LIMIT_BYTES = 16 * 1024 * 1024
# Memory budget each external-sort thread is assumed to need; the thread cap derives from it.
# Measured against 4.3e9 rows on an 11.8 GiB budget: 5 threads was killed, 4 completed.
# 3 GiB keeps that case at 3 and leaves margin, since DuckDB's sort overshoots its own limit.
SORT_BYTES_PER_THREAD = 3 * 1024 * 1024 * 1024


def duckdb_memory_limit_bytes(conn: duckdb.DuckDBPyConnection) -> int | None:
    row = conn.execute("SELECT parse_formatted_bytes(current_setting('memory_limit'))").fetchone()
    return None if row is None else row[0]


def resident_bytes() -> int | None:
    try:
        with open(PROC_STATUS) as f:
            lines = f.read().splitlines()
    except OSError:
        return None
    for line in lines:
        parts = line.split()
        if len(parts) >= 2 and parts[0] == "VmRSS:" and parts[1].isdigit():
            return int(parts[1]) * 1024
    return None


def tune_duckdb_for_sort(conn: duckdb.DuckDBPyConnection) -> list[str]:
    """Settings a large external sort needs to spill instead of dying. Returns log lines.

    Apply only on a path that actually sorts: it drops insertion-order preservation,
    which anything relying on file order (an order check, or a PRESERVE_ORDER copy of
    already-ordered rows) needs kept.

    DuckDB's sort keeps per-thread buffers, so a wide thread count against a small
    budget overruns the limit before any spilling helps: 4.3e9 rows on 24 threads with
    an 11.8 GiB budget was killed, and the same sort on 4 threads completed (196 GiB
    spilled). Give each sort thread a slice of the budget and cap the count to match.
    The sort is bound by spill IO rather than cores, so the lost parallelism is cheap.
    """
    logs = []
    try:
        conn.execute("SET preserve_insertion_order=false;")
        limit = duckdb_memory_limit_bytes(conn)
        default_threads = conn.execute("SELECT current_setting('threads')").fetchone()[0]
        if limit is not None and default_threads:
            threads = max(1, min(int(default_threads), limit // SORT_BYTES_PER_THREAD))
            if threads < int(default_threads):
                conn.execute(f"SET threads={threads};")
                logs.append(f"DuckDB sort threads {threads} (default {default_threads})")
    except duckdb.Error as error:
        logs.append(f"DuckDB sort tuning skipped: {error}")
    return logs


def set_duckdb_memory_limit(conn: duckdb.DuckDBPyConnection) -> str | None:
    """Lower `memory_limit` to a share of the free memory. Returns a log line if it changes or cannot read the limit."""
    try:
        default = duckdb_memory_limit_bytes(conn)
    except duckdb.Error as error:
        return f"DuckDB memory limit unchanged: {error}"
    resident = resident_bytes()
    if default is None or resident is None:
        return None
    limit = int(default / DUCKDB_DEFAULT_SHARE)
    budget = max(int((limit - resident) * FREE_MEMORY_SHARE), MIN_LIMIT_BYTES)
    if budget >= default:
        return None
    conn.execute(f"SET memory_limit = '{budget}B';")
    return f"DuckDB memory limit {budget} bytes (default {default} bytes, resident {resident} bytes)"
