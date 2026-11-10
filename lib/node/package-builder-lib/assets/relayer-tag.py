# Prepares an exported image root filesystem for chunkah:
#   1. assigns every regular file to a component and writes the name to the file's
#      user.component xattr; chunkah makes image layers from components, so files that change
#      together land in the same layer;
#   2. sets deterministic mtimes, so an unchanged component gives a byte-identical layer on the
#      next build (see "mtimes" below).
#
# Usage: python3 - <rootfs> <app_dir> <max_component_bytes> [--dry-run] [--no-xattrs]
#   app_dir              the image's own code (WORKDIR), its own component; "" to skip
#   max_component_bytes  a component bigger than this is split into several, by path order
#   --dry-run            print "<path>\t<component>\t<mtime>" lines (component "" when the file
#                        is left to chunkah) instead of changing the filesystem
#   --no-xattrs          change mtimes and .pyc files but write no xattrs (for tests)
# Without --dry-run, stdout gets one JSON line: {"special": [paths of FIFOs, sockets and
# devices, which chunkah cannot store], "max_mtime": the highest mtime set}.
#
# Owners: Debian packages (dpkg lists), conda packages (conda-meta), pip packages (dist-info
# RECORD; pip wins over the others, since pip runs last), then app_dir for files no package
# owns. Remaining files are grouped by directory, unless the image has an RPM or pacman
# database: chunkah reads those itself. All links of a hard-linked file get one component
# (a package owner if any link has one), so chunkah keeps them as hard links.
#
# mtimes and .pyc: every file and directory gets mtime 0, so identical content gives identical
# layers. A timestamp-based .pyc (the default of pip, conda and the stdlib) records its
# source's mtime and size, so it would no longer match. Hence, for each __pycache__/*.pyc:
#   - Python >= 3.7, valid now (recorded mtime and size match the .py): its header is
#     rewritten to the unchecked-hash form (PEP 552); the bytecode is unchanged and Python
#     uses it without looking at the source mtime, as for the python template's own .pyc;
#   - Python <= 3.6, valid now: no hash form exists, so the .py keeps its mtime;
#   - stale (the .py changed after compiling): left alone; with the .py at mtime 0 it stays
#     stale, so Python recompiles it, as it would in the original image.
# Other mtime-keyed caches (fontconfig, AppCDS) are rebuilt at run time after this.
import importlib.util
import json
import os
import re
import stat
import sys
from collections import defaultdict

FALLBACK_DEPTH = 3  # /usr/share/doc/a/README -> "dir/usr/share/doc"
PYC_NAME = re.compile(r"^([^.]+)\..*\.pyc$")  # mod.cpython-312.pyc, mod.cpython-312.opt-1.pyc


def norm_pip(name):
    return re.sub(r"[-_.]+", "_", name).lower()


def img(root, host_path):
    """Image path ("/usr/bin/x") of a host path, or None if it points outside root."""
    p = os.path.normpath(host_path)
    if p != root and not p.startswith(root + os.sep):
        return None
    return "/" + os.path.relpath(p, root) if p != root else "/"


class Tree:
    def __init__(self, root):
        self.root = root
        self.files = {}  # image path -> size, regular files only
        self.dirs = []  # host paths
        self.links = []  # host paths of symlinks
        self.inodes = defaultdict(list)  # (dev, ino) -> image paths, files with nlink > 1
        self.dist_infos, self.conda_metas = [], []
        self.pyc_mtime = {}  # image path of a .py -> mtime it keeps (valid py<=3.6 .pyc)
        self.pyc_to_hash = []  # (host .pyc path, host .py path): valid timestamp .pyc, py>=3.7
        self.special = []  # image paths of FIFOs, sockets and device files
        for dirpath, dirnames, filenames in os.walk(root):
            self.dirs.append(dirpath)
            for d in dirnames:
                full = os.path.join(dirpath, d)
                if os.path.islink(full):
                    self.links.append(full)
                elif d.endswith(".dist-info"):
                    self.dist_infos.append(full)
                elif d == "conda-meta":
                    self.conda_metas.append(full)
            for f in filenames:
                full = os.path.join(dirpath, f)
                st = os.lstat(full)
                if stat.S_ISLNK(st.st_mode):
                    self.links.append(full)
                    continue
                if not stat.S_ISREG(st.st_mode):
                    self.special.append(img(root, full))
                    continue
                p = img(root, full)
                self.files[p] = st.st_size
                if st.st_nlink > 1:
                    self.inodes[(st.st_dev, st.st_ino)].append(p)
                if f.endswith(".pyc") and os.path.basename(dirpath) == "__pycache__":
                    self._read_pyc(full, f)

    def _read_pyc(self, full, name):
        m = PYC_NAME.match(name)
        if not m:
            return
        source = os.path.join(os.path.dirname(os.path.dirname(full)), m.group(1) + ".py")
        p = img(self.root, source)
        if p is None or not os.path.isfile(source) or os.path.islink(source):
            return
        try:
            with open(full, "rb") as fh:
                header = fh.read(16)
            st = os.stat(source)
        except OSError:
            return
        if len(header) < 12 or header[2:4] != b"\r\n":
            return
        magic = int.from_bytes(header[0:2], "little")
        mtime_now, size_now = int(st.st_mtime) & 0xFFFFFFFF, st.st_size & 0xFFFFFFFF
        if magic >= 3390:  # Python 3.7+: magic, flags, then mtime + size or a hash
            if len(header) < 16 or int.from_bytes(header[4:8], "little") != 0:
                return  # hash-based already: independent of the source mtime
            recorded = (int.from_bytes(header[8:12], "little"), int.from_bytes(header[12:16], "little"))
            if recorded == (mtime_now, size_now):
                self.pyc_to_hash.append((full, source))
        else:  # Python <= 3.6: magic, mtime, size
            recorded = (int.from_bytes(header[4:8], "little"), int.from_bytes(header[8:12], "little"))
            if recorded == (mtime_now, size_now):
                self.pyc_mtime.setdefault(p, recorded[0])


def pyc_to_unchecked_hash(pyc, source):
    """Rewrites a valid timestamp .pyc as an unchecked-hash .pyc; the bytecode is unchanged."""
    with open(pyc, "rb") as fh:
        data = fh.read()
    with open(source, "rb") as fh:
        digest = importlib.util.source_hash(fh.read())
    flags = (1).to_bytes(4, "little")  # bit 0: hash-based; bit 1 (check_source) unset
    with open(pyc, "wb") as fh:
        fh.write(data[0:4] + flags + digest + data[16:])


def dpkg_owners(tree, owner):
    info = os.path.join(tree.root, "var/lib/dpkg/info")
    if not os.path.isdir(info):
        return
    for name in sorted(os.listdir(info)):
        if not name.endswith(".list"):
            continue
        comp = "deb/" + name[: -len(".list")].split(":")[0]
        with open(os.path.join(info, name), errors="replace") as fh:
            for line in fh:
                p = line.strip()
                if p.startswith("/") and p in tree.files:
                    owner[p] = comp
                # usrmerge: dpkg lists /bin/x, the file is at /usr/bin/x
                elif p.startswith(("/bin/", "/sbin/", "/lib")) and "/usr" + p in tree.files:
                    owner["/usr" + p] = comp
    # the database itself changes with every apt install: one component for it
    owner.setdefault("/var/lib/dpkg/status", "deb/.db")


def conda_owners(tree, owner):
    for meta in sorted(tree.conda_metas):
        prefix = os.path.dirname(meta)
        for name in sorted(os.listdir(meta)):
            if not name.endswith(".json"):
                continue
            try:
                with open(os.path.join(meta, name)) as fh:
                    rec = json.load(fh)
            except (OSError, ValueError):
                continue
            comp = "conda/" + str(rec.get("name") or name[: -len(".json")])
            for rel in rec.get("files", []):
                p = img(tree.root, os.path.join(prefix, rel))
                if p in tree.files:
                    owner[p] = comp
            owner[img(tree.root, os.path.join(meta, name))] = comp


def pip_owners(tree, owner):
    # pass 1: what RECORD lists; pip installs last, so it wins over dpkg and conda
    tops_of = {}  # dist-info -> (site dir, component, top-level entries)
    top_count = defaultdict(int)  # (site dir, top) -> number of distributions listing it
    for info in sorted(tree.dist_infos):
        site = os.path.dirname(info)
        comp = "pypi/" + norm_pip(re.sub(r"-[^-]+\.dist-info$", "", os.path.basename(info)))
        tops = set()
        record = os.path.join(info, "RECORD")
        if os.path.isfile(record):
            with open(record, errors="replace") as fh:
                for line in fh:
                    rel = line.rstrip("\n").rsplit(",", 2)[0]
                    if not rel or rel.startswith("/"):
                        continue  # absolute entries: written outside the environment
                    p = img(tree.root, os.path.join(site, rel))
                    if p in tree.files:
                        owner[p] = comp
                    first = rel.split("/")[0]
                    if first not in ("", ".", "..", "__pycache__"):
                        tops.add(first)
        tops_of[info] = (site, comp, tops)
        for top in tops:
            top_count[(site, top)] += 1

    # pass 2: files pip does not list (.pyc compiled after the install, caches inside a
    # package). Only under top-level directories that one distribution owns: a namespace
    # directory shared by several (nvidia/, google/) keeps the RECORD owners only.
    for info, (site, comp, tops) in tops_of.items():
        dirs = [info]
        for top in tops:
            q = os.path.join(site, top)
            if os.path.islink(q):
                continue
            if os.path.isdir(q):
                if top_count[(site, top)] == 1:
                    dirs.append(q)
            elif top.endswith(".py"):
                cache = os.path.join(site, "__pycache__")
                if os.path.isdir(cache):
                    for f in os.listdir(cache):
                        if f.startswith(top[:-3] + ".") and f.endswith(".pyc"):
                            p = img(tree.root, os.path.join(cache, f))
                            if not owner.get(p, "").startswith("pypi/"):
                                owner[p] = comp
        for d in dirs:
            for dirpath, _, filenames in os.walk(d):
                for f in filenames:
                    p = img(tree.root, os.path.join(dirpath, f))
                    if p in tree.files and not owner.get(p, "").startswith("pypi/"):
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
        if sum(files[p] for p in paths) <= max_bytes:
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


def is_group(comp):
    """True for components that are not a package: directory groups, app, or none."""
    return comp is None or comp.startswith("dir/") or comp == "app"


def assign(tree, app_dir, max_bytes):
    owner = {}
    dpkg_owners(tree, owner)
    conda_owners(tree, owner)
    pip_owners(tree, owner)
    if app_dir and app_dir != "/":
        app = app_dir.rstrip("/") + "/"
        for p in tree.files:
            if p.startswith(app):
                owner.setdefault(p, "app")  # a venv or conda prefix under WORKDIR keeps its owners

    native = has_native_db(tree.root)
    assigned = {}
    for p in tree.files:
        comp = owner.get(p)
        if comp is None:
            if native:
                continue  # left for chunkah's own rpm/pacman database
            parts = p.strip("/").split("/")[:-1][:FALLBACK_DEPTH]
            comp = "dir/" + "/".join(parts) if parts else "dir/"
        assigned[p] = comp
    assigned = split_big(tree.files, assigned, max_bytes)

    # all links of one inode in one component: the first link (by path) with a package
    # owner decides, else the first link
    for paths in tree.inodes.values():
        ranked = sorted(paths, key=lambda q: (is_group(assigned.get(q)), q))
        comp = assigned.get(ranked[0])
        for p in paths:
            if comp is None:
                assigned.pop(p, None)
            else:
                assigned[p] = comp
    return assigned


def main():
    root, app_dir, max_bytes = os.path.normpath(sys.argv[1]), sys.argv[2], int(sys.argv[3])
    dry_run = "--dry-run" in sys.argv[4:]
    no_xattrs = "--no-xattrs" in sys.argv[4:]
    tree = Tree(root)
    assigned = assign(tree, app_dir, max_bytes)

    if dry_run:
        for p in sorted(tree.files):
            print(f"{p}\t{assigned.get(p, '')}\t{tree.pyc_mtime.get(p, 0)}")
    else:
        for pyc, source in tree.pyc_to_hash:
            pyc_to_unchecked_hash(pyc, source)
        if not no_xattrs:
            for p, comp in assigned.items():
                os.setxattr(os.path.join(root, p.lstrip("/")), "user.component", comp.encode())
        for p in tree.files:
            t = tree.pyc_mtime.get(p, 0)
            os.utime(os.path.join(root, p.lstrip("/")), (t, t), follow_symlinks=False)
        for host in tree.links + tree.dirs:
            os.utime(host, (0, 0), follow_symlinks=False)
        print(json.dumps({"special": sorted(tree.special), "max_mtime": max(tree.pyc_mtime.values(), default=0)}))

    sizes = defaultdict(int)
    for p, comp in assigned.items():
        sizes[comp] += tree.files[p]
    biggest = sorted(sizes.items(), key=lambda kv: -kv[1])[:5]
    print(
        f"relayer: {len(assigned)} of {len(tree.files)} files in {len(sizes)} components, "
        f"{len(tree.pyc_to_hash)} .pyc made hash-based, {len(tree.pyc_mtime)} py<=3.6 sources "
        f"kept at their .pyc mtime; biggest: "
        + ", ".join(f"{c} {s / 1024**3:.2f} GiB" for c, s in biggest),
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
