import os


def normalize_path(path_str: str) -> str:
    """Converts a path string using '/' as a delimiter to a system-specific path."""
    components = [comp for comp in path_str.split('/') if comp]
    return os.path.join(*components)
