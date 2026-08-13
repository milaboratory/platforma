import { createRolldownNodeConfig } from "@milaboratories/ts-builder/configs/utils/createRolldownNodeConfig.js";
import { execFileSync } from "node:child_process";

/**
 * Identifies this build for the persisted-tree cache key, see `src/middle_layer/build_stamp.ts`.
 *
 * A clean worktree stamps its commit, so every build of a given release shares a stamp and a
 * reopen stays warm across restarts. A dirty worktree stamps the build time too, so editing
 * the tree pruning or finality rules locally cannot hit a snapshot written under the old
 * ones. `git status` covers the whole repo, which over-invalidates rather than under-.
 */
function buildStamp() {
  const git = (args) =>
    execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  try {
    const sha = git(["rev-parse", "--short=12", "HEAD"]);
    const dirty = git(["status", "--porcelain"]).length > 0;
    return dirty ? `${sha}-dirty-${Date.now()}` : sha;
  } catch {
    // No git available (a published tarball being rebuilt, for instance). Falling back to the
    // build time keeps the stamp honest: it cannot claim to be a commit it does not know.
    return `nogit-${Date.now()}`;
  }
}

export default createRolldownNodeConfig({
  entry: ["./src/index.ts", "./src/worker/worker.ts"],
}).map((config) => ({
  ...config,
  // Note `transform.define`, not a top-level `define`: rolldown ignores the latter without
  // complaining, which leaves the identifier in the output and the cache permanently cold.
  // The spread preserves `transform.target` from the shared config.
  transform: {
    ...config.transform,
    define: {
      ...config.transform?.define,
      __PL_ML_BUILD_STAMP__: JSON.stringify(buildStamp()),
    },
  },
}));
