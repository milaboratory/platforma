import duckdb

PROC_STATUS = "/proc/self/status"

# DuckDB sets the default `memory_limit` to 80% of the memory it detects: the cgroup limit or the RAM.
DUCKDB_DEFAULT_SHARE = 0.8
FREE_MEMORY_SHARE = 0.7
# Only guards against a budget of zero or less; a larger floor could exceed the free memory.
MIN_LIMIT_BYTES = 16 * 1024 * 1024


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
