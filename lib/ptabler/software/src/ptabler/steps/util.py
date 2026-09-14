import os


def normalize_path(path_str: str) -> str:
    """Converts a path string using '/' as a delimiter to a system-specific path."""
    components = [comp for comp in path_str.split('/') if comp]
    return os.path.join(*components)


def step_file_path(root_folder, file: str) -> str:
    """Returns the path on disk a step's `file` field names."""
    return os.path.join(root_folder, normalize_path(file))


def step_file_identity(root_folder, file: str) -> str:
    """
    Returns the key two steps share when their `file` fields name one file.

    'a.tsv', './a.tsv' and a symlink pointing at it are the same file, so comparing the
    paths as they were written would miss two of the three. Only for comparison — the
    read and the write still use the path the workflow asked for.
    """
    return os.path.realpath(step_file_path(root_folder, file))
