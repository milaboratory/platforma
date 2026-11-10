# Split an installed tree into a fixed number of directories, so the Dockerfile can
# COPY each one as its own image layer.
#
# Registries finalize an uploaded layer in one request; a multi-GB layer can outlast the
# client's wait for that request (containerd >= 2.3 gives up after 30 s). Keeping every
# layer around TARGET bytes avoids that whatever the registry or client.
#
# Usage: python3 - <root> <out> <bins> <min_target_bytes> [<keep> [<inside_keep>...]]
#   Moves everything under <root> into <out>/<i><root>/..., i in [0, bins), except <keep>:
#   it stays where it is, apart from the <inside_keep> paths, which are moved like the rest.
#   Defaults: <keep> = this interpreter's stdlib, <inside_keep> = its purelib and platlib
#   (site-packages). The stdlib is already in the base image and is never changed by pip,
#   and the script must not move modules it may still import.
#   All <out>/<i> directories exist afterwards, even when empty.
#
# Layout rules (stable: an unchanged package lands in a byte-identical layer):
#   TARGET = min_target_bytes, fixed, so the unit split never depends on the total size.
#   A directory larger than TARGET is split into its children; anything else
#   (file, symlink, small directory) is one unit.
#   Each unit has a home bin chosen by hashing its path with the version removed
#   ("numpy-2.0.2.dist-info" -> "numpy"), so a package and its metadata share a home and
#   a version bump does not move it. Units are placed in path order; when the home bin is
#   full, the next bin with room is used; a directory that fits no bin is placed child by
#   child; a file that fits no bin goes to the least-filled one.
#   Every moved entry gets mtime SOURCE_DATE_EPOCH (default 0), so layer contents depend
#   only on file contents. The Dockerfile compiles .pyc files hash-based for the same reason.
import hashlib
import os
import re
import shutil
import stat
import sys
import sysconfig


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


def units(path, target, keep, inside_keep):
    if path == keep:
        result = []
        for inner in inside_keep:
            if os.path.lexists(inner):
                result.extend(units(inner, target, keep, inside_keep))
        return result
    is_dir = os.path.isdir(path) and not os.path.islink(path)
    contains_keep = is_dir and keep.startswith(path + os.sep)
    size = 0 if contains_keep else tree_size(path)
    if not contains_keep and (size <= target or not is_dir):
        return [(size, path)]
    children = sorted(os.listdir(path)) if is_dir else []
    if not children:
        return [(size, path)]
    result = []
    for name in children:
        result.extend(units(os.path.join(path, name), target, keep, inside_keep))
    return result


def unit_key(path, root):
    """Path relative to root, with distribution versions dropped and names normalized."""
    head, name = os.path.split(os.path.relpath(path, root))
    match = re.match(r"^(.+?)-[0-9][^/]*\.(dist-info|egg-info|data)$", name)
    if match:
        name = match.group(1)
    return os.path.join(head, re.sub(r"[-_.]+", "_", name).lower())


def home_bin(key, bins):
    return int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "big") % bins


def set_epoch(top, epoch):
    """Set mtime/atime of top and everything below it, without following symlinks."""
    for dirpath, dirnames, filenames in os.walk(top, topdown=False):
        for name in filenames + dirnames:
            os.utime(os.path.join(dirpath, name), (epoch, epoch), follow_symlinks=False)
    os.utime(top, (epoch, epoch), follow_symlinks=False)


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
    if len(sys.argv) > 5:
        keep = os.path.abspath(sys.argv[5])
        inside_keep = [os.path.abspath(p) for p in sys.argv[6:]]
    else:
        paths = sysconfig.get_paths()
        keep = os.path.abspath(paths["stdlib"])
        inside_keep = sorted({os.path.abspath(paths["purelib"]), os.path.abspath(paths["platlib"])})
    inside_keep = [p for p in inside_keep if p.startswith(keep + os.sep)]

    target = min_target
    placed = units(root, target, keep, inside_keep)
    total = sum(size for size, _ in placed)
    placed.sort(key=lambda u: unit_key(u[1], root))

    loads = [0] * bins
    assignment = []

    def place(size, path):
        home = home_bin(unit_key(path, root), bins)
        probe = [(home + k) % bins for k in range(bins)]
        fits = [i for i in probe if loads[i] + size <= target]
        if fits:
            i = fits[0]
        elif os.path.isdir(path) and not os.path.islink(path) and os.listdir(path):
            # No room for the whole directory: place its children one by one instead.
            for name in sorted(os.listdir(path)):
                child = os.path.join(path, name)
                place(tree_size(child), child)
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
        shutil.move(path, dst)  # a rename when the file was written in the same RUN step

    epoch = int(os.environ.get("SOURCE_DATE_EPOCH", "0"))
    for i in range(bins):
        set_epoch(os.path.join(out, str(i)), epoch)

    gib = 1024 ** 3
    print(f"layer split: {total / gib:.2f} GiB under {root} (kept in place: {keep}), target {target / gib:.2f} GiB")
    for i in range(bins):
        print(f"  layer {i}: {loads[i] / gib:.2f} GiB")


main()
