"""
Reads a PTabler workflow file from disk.

A workflow file is JSON or YAML. A ".gz" suffix after the format suffix marks a
gzip-compressed file, for example "workflow.json.gz". The SDK compresses large
workflows, because one resource body in the platform cannot be larger than the
gRPC message limit.
"""
import gzip
from pathlib import Path

import msgspec.json
import msgspec.yaml

from .workflow import PWorkflow

GZIP_SUFFIX = ".gz"


class UnsupportedWorkflowFormat(ValueError):
    """The workflow file name has no suffix that PTabler can decode."""


def is_compressed(path: Path) -> bool:
    """Returns True when the file name marks a gzip-compressed workflow."""
    return path.name.lower().endswith(GZIP_SUFFIX)


def workflow_format(path: Path) -> str:
    """
    Returns the format of the workflow file: "json" or "yaml".

    The format comes from the suffix before ".gz" when the file is compressed,
    and from the last suffix when it is not.
    """
    name = path.name.lower()
    if is_compressed(path):
        name = name[:-len(GZIP_SUFFIX)]

    suffix = Path(name).suffix
    if suffix == ".json":
        return "json"
    if suffix in (".yaml", ".yml"):
        return "yaml"

    raise UnsupportedWorkflowFormat(
        f"Unsupported file extension '{suffix}'. "
        f"Please use .json or .yaml/.yml, optionally followed by {GZIP_SUFFIX}.")


def read_workflow_text(path: Path) -> str:
    """Reads the workflow file and decompresses it when its name ends with ".gz"."""
    data = path.read_bytes()
    if is_compressed(path):
        data = gzip.decompress(data)
    return data.decode("utf-8")


def decode_workflow(content: str, path: Path) -> PWorkflow:
    """Decodes the workflow text in the format that the file name sets."""
    if workflow_format(path) == "json":
        return msgspec.json.decode(content, type=PWorkflow)
    return msgspec.yaml.decode(content, type=PWorkflow)
