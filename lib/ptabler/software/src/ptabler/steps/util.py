import os


def normalize_path(path_str: str) -> str:
    """Converts a path string using '/' as a delimiter to a system-specific path."""
    components = [comp for comp in path_str.split('/') if comp]
    return os.path.join(*components)


def step_file_path(root_folder, file: str) -> str:
    """Returns the path on disk a step's `file` field names."""
    return os.path.join(root_folder, normalize_path(file))


def physical_file(file_path: str) -> str:
    """
    Returns the file a path ends at, following every symlink along the way.

    Two steps name one file when this matches. 'a.tsv', './a.tsv' and a symlink pointing
    at it are one file, and comparing the paths as written would miss two of the three.

    A rewrite also has to land its bytes here rather than on the path it was given.
    os.replace does not follow a symlink: handed the alias it would drop a regular file
    in the alias's place and leave the file it pointed at holding the old rows.
    """
    return os.path.realpath(file_path)


def step_file_identity(root_folder, file: str) -> str:
    """Returns the file a step's `file` field ends at. A direct sink still uses the path
    the workflow asked for; polars follows the symlink on its own."""
    return physical_file(step_file_path(root_folder, file))
