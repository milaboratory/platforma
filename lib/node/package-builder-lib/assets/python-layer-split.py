# Split an installed tree into a fixed number of directories, so the Dockerfile can
# COPY each one as its own image layer.
#
# Registries finalize an uploaded layer in one request; a multi-GB layer can outlast the
# client's wait for that request (containerd >= 2.3 gives up after 30 s). Keeping every
# layer around TARGET bytes avoids that whatever the registry or client.
#
# Usage: python3 - <root> <out> <bins> <min_target_bytes>
#   Moves everything under <root> into <out>/<i><root>/..., i in [0, bins).
#   All <out>/<i> directories exist afterwards, even when empty.
#
# Layout rules:
#   TARGET = max(min_target_bytes, ceil(total / bins)).
#   A directory larger than TARGET is split into its children; anything else
#   (file, symlink, small directory) is moved whole. A single file larger than
#   TARGET cannot be split and stays one unit.
#   Units are placed largest-first into the first bin that still fits under TARGET.
#   A directory that fits no bin is placed child by child instead; a file that fits no
#   bin goes to the least-filled one. So a layer exceeds TARGET only by less than one
#   file. A tree smaller than TARGET ends up entirely in bin 0, i.e. one layer as before.
#   Order is deterministic (sorted names), so identical installs give identical layers.
import os
import shutil
import stat
import sys


def tree_size(path):
    st = os.lstat(path)
    if not os.path.isdir(path) or os.path.islink(path):
        return st.st_size
    total = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for name in filenames:
            total += os.lstat(os.path.join(dirpath, name)).st_size
        for name in dirnames:
            full = os.path.join(dirpath, name)
            if os.path.islink(full):  # os.walk does not descend into symlinked dirs
                total += os.lstat(full).st_size
    return total


def units(path, target):
    size = tree_size(path)
    if size <= target or os.path.islink(path) or not os.path.isdir(path):
        return [(size, path)]
    children = sorted(os.listdir(path))
    if not children:
        return [(size, path)]
    result = []
    for name in children:
        result.extend(units(os.path.join(path, name), target))
    return result


def ensure_parents(src_path, dst_path):
    """Create dst_path's parents with the permission bits of the matching source dirs."""
    missing = []
    src_dir, dst_dir = os.path.dirname(src_path), os.path.dirname(dst_path)
    while not os.path.exists(dst_dir):
        missing.append((src_dir, dst_dir))
        src_dir, dst_dir = os.path.dirname(src_dir), os.path.dirname(dst_dir)
    for src_dir, dst_dir in reversed(missing):
        os.mkdir(dst_dir)
        os.chmod(dst_dir, stat.S_IMODE(os.stat(src_dir).st_mode))


def main():
    root, out, bins, min_target = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    root = os.path.abspath(root)
    total = tree_size(root)
    target = max(min_target, -(-total // bins))

    placed = []  # list of (size, path), largest first, stable by name
    for name in sorted(os.listdir(root)):
        placed.extend(units(os.path.join(root, name), target))
    placed.sort(key=lambda u: (-u[0], u[1]))

    loads = [0] * bins
    assignment = []

    def place(size, path):
        fits = [i for i in range(bins) if loads[i] + size <= target]
        if fits:
            i = fits[0]
        elif os.path.isdir(path) and not os.path.islink(path) and os.listdir(path):
            # No room for the whole directory: place its children one by one instead.
            children = [(tree_size(os.path.join(path, n)), os.path.join(path, n))
                        for n in sorted(os.listdir(path))]
            for child in sorted(children, key=lambda u: (-u[0], u[1])):
                place(*child)
            return
        else:
            i = min(range(bins), key=lambda b: (loads[b], b))
        loads[i] += size
        assignment.append((i, path))

    for size, path in placed:
        place(size, path)

    for i in range(bins):
        os.makedirs(os.path.join(out, str(i)), exist_ok=True)
    for i, path in assignment:
        dst = os.path.join(out, str(i)) + path
        ensure_parents(path, dst)
        shutil.move(path, dst)  # falls back to copy+delete across overlay layers

    gib = 1024 ** 3
    print(f"layer split: {total / gib:.2f} GiB under {root}, target {target / gib:.2f} GiB")
    for i in range(bins):
        print(f"  layer {i}: {loads[i] / gib:.2f} GiB")


main()
