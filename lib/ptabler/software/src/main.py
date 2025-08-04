import argparse
import pathlib
import sys
import traceback
import msgspec.msgpack
import msgspec.json
import msgspec.yaml

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings


def main():
    parser = argparse.ArgumentParser(
        description="Process a PTabler workflow file.")
    parser.add_argument(
        "workflow_file",
        type=pathlib.Path,
        help="Path to the PTabler workflow file (JSON or YAML).",
    )
    parser.add_argument(
        "--root-dir",
        type=pathlib.Path,
        default=pathlib.Path.cwd(),
        help="Root directory for resolving relative paths in the workflow. Defaults to the current working directory.",
    )

    args = parser.parse_args()

    workflow_file_path = args.workflow_file.resolve()
    root_directory = args.root_dir.resolve()

    if not workflow_file_path.is_file():
        print(
            f"Error: Workflow file not found at {workflow_file_path}", file=sys.stderr)
        sys.exit(1)

    if not root_directory.is_dir():
        print(
            f"Error: Root directory not found at {root_directory}", file=sys.stderr)
        sys.exit(1)

    print(f"Workflow file: {workflow_file_path}")
    print(f"Root directory: {root_directory}")

    try:
        workflow_content = workflow_file_path.read_text()
    except Exception as e:
        print(
            f"Error reading workflow file {workflow_file_path}: {e}", file=sys.stderr)
        sys.exit(1)

    # 2. Deserialize the workflow structure using msgspec
    ptw: PWorkflow
    try:
        file_extension = workflow_file_path.suffix.lower()
        if file_extension == ".json":
            ptw = msgspec.json.decode(workflow_content, type=PWorkflow)
        elif file_extension in [".yaml", ".yml"]:
            ptw = msgspec.yaml.decode(workflow_content, type=PWorkflow)
        else:
            print(
                f"Error: Unsupported file extension '{file_extension}'. Please use .json or .yaml/.yml.", file=sys.stderr)
            sys.exit(1)

    except (msgspec.DecodeError, msgspec.ValidationError) as e:
        print(
            f"Error parsing workflow file {workflow_file_path}: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:  # Catch other potential errors during conversion/parsing
        print(
            f"An unexpected error occurred during workflow parsing: {e}", file=sys.stderr)
        sys.exit(1)

    # 3. Process the steps in the workflow
    try:
        print("Executing workflow...")
        global_settings = GlobalSettings(root_folder=root_directory)
        ptw.execute(global_settings=global_settings)
        print("Workflow execution finished.")
    except Exception as e:
        print(f"Error during workflow execution: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
