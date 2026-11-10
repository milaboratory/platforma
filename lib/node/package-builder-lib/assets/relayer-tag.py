# Assigns every file of an exported image root filesystem to a component, and writes the
# component name to the file's user.component xattr. chunkah then makes image layers from
# components, so files that change together land in the same layer, and an unchanged
# component gives a byte-identical layer on the next build.
#
# Usage: python3 - <rootfs> <app_dir> <max_component_bytes> [--dry-run]
#   app_dir              the image's own code (WORKDIR), its own component; "" to skip
#   max_component_bytes  a component bigger than this is split into several, by path order
#   --dry-run            print "<path>\t<component>" lines instead of writing xattrs
#
# Owners, later ones win: Debian packages (dpkg lists), conda packages (conda-meta),
# pip packages (dist-info RECORD), then app_dir. Files that no package owns are grouped by
# directory, unless the image has an RPM or pacman database: chunkah reads those itself.
import json
import os
import re
import sys
from collections import defaultdict

FALLBACK_DEPTH = 3  # /usr/share/doc -> "dir/usr/share/doc"


def norm_pip(name):
    return re.sub(r"[-_.]+", "_", name).lower()


def scan(root):
    """All regular files under root, as {"/abs/path": size}, plus package database locations."""
    files = {}
    dist_infos, conda_metas = [], []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = "/" + os.path.relpath(dirpath, root) if dirpath != root else ""
        for d in dirnames:
            if d.endswith(".dist-info"):
                dist_infos.append(os.path.join(dirpath, d))
            elif d == "conda-meta":
                conda_metas.append(os.path.join(dirpath, d))
        for f in filenames:
            p = os.path.join(dirpath, f)
            st = os.lstat(p)
            if os.path.stat.S_ISREG(st.st_mode):
                files[rel_dir + "/" + f] = st.st_size
    return files, dist_infos, conda_metas


def in_root(root, path):
    """Absolute image path of a host path under root, or None if it points outside."""
    path = os.path.normpath(path)
    if path != root and not path.startswith(root + os.sep):
        return None
    return "/" + os.path.relpath(path, root)


def dpkg_owners(root, owner):
    info = os.path.join(root, "var/lib/dpkg/info")
    if not os.path.isdir(info):
        return
    for name in sorted(os.listdir(info)):
        if not name.endswith(".list"):
            continue
        pkg = name[: -len(".list")].split(":")[0]
        with open(os.path.join(info, name), errors="replace") as fh:
            for line in fh:
                p = line.strip()
                if p.startswith("/"):
                    owner[p] = "deb/" + pkg
    # the database itself changes with every apt install: one component for it
    owner.setdefault("/var/lib/dpkg/status", "deb/.db")


def conda_owners(root, conda_metas, owner):
    for meta in sorted(conda_metas):
        prefix = os.path.dirname(meta)
        for name in sorted(os.listdir(meta)):
            if not name.endswith(".json"):
                continue
            try:
                with open(os.path.join(meta, name)) as fh:
                    rec = json.load(fh)
            except (OSError, ValueError):
                continue
            comp = "conda/" + rec.get("name", name[: -len(".json")])
            for rel in rec.get("files", []):
                p = in_root(root, os.path.join(prefix, rel))
                if p:
                    owner[p] = comp
            p = in_root(root, os.path.join(meta, name))
            if p:
                owner[p] = comp


def pip_owners(root, dist_infos, files, owner):
    for info in sorted(dist_infos):
        site = os.path.dirname(info)
        comp = "pypi/" + norm_pip(re.sub(r"-[^-]+\.dist-info$", "", os.path.basename(info)))
        record = os.path.join(info, "RECORD")
        tops = set()
        if os.path.isfile(record):
            with open(record, errors="replace") as fh:
                for line in fh:
                    rel = line.rstrip("\n").rsplit(",", 2)[0]
                    if not rel:
                        continue
                    p = in_root(root, os.path.join(site, rel))
                    if p:
                        owner[p] = comp
                    first = rel.split("/")[0]
                    if first not in ("..", "."):
                        tops.add(first)
        # files pip does not list: .pyc compiled after the install, caches inside the package
        dirs = [info]
        for top in tops:
            q = os.path.join(site, top)
            if top == "__pycache__" or os.path.islink(q):
                continue
            if os.path.isdir(q):
                dirs.append(q)
            elif top.endswith(".py"):
                cache = os.path.join(site, "__pycache__")
                if os.path.isdir(cache):
                    for f in os.listdir(cache):
                        if f.startswith(top[:-3] + ".") and f.endswith(".pyc"):
                            owner[in_root(root, os.path.join(cache, f))] = comp
        for d in dirs:
            for dirpath, _, filenames in os.walk(d):
                for f in filenames:
                    p = in_root(root, os.path.join(dirpath, f))
                    if p in files:
                        owner[p] = comp


def has_native_db(root):
    return any(
        os.path.exists(os.path.join(root, d))
        for d in ("var/lib/rpm", "usr/lib/sysimage/rpm", "var/lib/pacman/local")
    )


def split_big(files, assigned, max_bytes):
    """Splits components above max_bytes into "<name>/part-<i>", files kept in path order."""
    by_comp = defaultdict(list)
    for p, comp in assigned.items():
        by_comp[comp].append(p)
    out = {}
    for comp, paths in by_comp.items():
        total = sum(files[p] for p in paths)
        if total <= max_bytes:
            for p in paths:
                out[p] = comp
            continue
        part, size = 0, 0
        for p in sorted(paths):
            if size > 0 and size + files[p] > max_bytes:
                part, size = part + 1, 0
            out[p] = f"{comp}/part-{part}"
            size += files[p]
    return out


def assign(root, app_dir, max_bytes):
    root = os.path.normpath(root)
    files, dist_infos, conda_metas = scan(root)
    owner = {}
    dpkg_owners(root, owner)
    conda_owners(root, conda_metas, owner)
    pip_owners(root, dist_infos, files, owner)
    if app_dir and app_dir != "/":
        app = app_dir.rstrip("/") + "/"
        for p in files:
            if p.startswith(app):
                owner[p] = "app"

    native = has_native_db(root)
    assigned = {}
    for p in files:
        comp = owner.get(p)
        if comp is None:
            if native:
                continue  # left for chunkah's own rpm/pacman database
            parts = p.strip("/").split("/")[:-1][:FALLBACK_DEPTH]
            comp = "dir/" + "/".join(parts) if parts else "dir/"
        assigned[p] = comp
    return files, split_big(files, assigned, max_bytes)


def main():
    root, app_dir, max_bytes = sys.argv[1], sys.argv[2], int(sys.argv[3])
    dry_run = "--dry-run" in sys.argv[4:]
    files, assigned = assign(root, app_dir, max_bytes)
    sizes = defaultdict(int)
    for p, comp in assigned.items():
        sizes[comp] += files[p]
    if dry_run:
        for p in sorted(assigned):
            print(f"{p}\t{assigned[p]}")
    else:
        for p, comp in assigned.items():
            os.setxattr(os.path.join(root, p.lstrip("/")), "user.component", comp.encode())
    biggest = sorted(sizes.items(), key=lambda kv: -kv[1])[:5]
    print(
        f"relayer: {len(assigned)} of {len(files)} files in {len(sizes)} components; biggest: "
        + ", ".join(f"{c} {s / 1024**3:.2f} GiB" for c, s in biggest),
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
