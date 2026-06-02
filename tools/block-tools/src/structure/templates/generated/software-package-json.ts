// Initial software `package.json` — full canonical content.
// Body rules in rules/software-package-json.ts re-assert the same
// fields as drift-correctors. Matches the Path A contract per
// templates-strategy.md § "Generator Form In Use" — generator carries
// canonical content, body rules guard against block-author drift.
//
// init creates at most one software module (BlockVars.softwarePlatform
// is single-valued). For refresh on existing multi-software blocks
// the file already exists, so this generator is not invoked — the
// canonical name we compute here is the init-time name and would not
// collide with any other software module on refresh.

import type { BlockVars } from "../../engine/api";

export function softwarePackageJsonInitial(v: BlockVars): Record<string, unknown> {
  const slug = (v.softwarePlatform ?? "").toLowerCase();
  const suffix = slug ? `software-${slug}` : "software";
  return {
    name: `${v.facadeName}.${suffix}`,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      build: "block-tools build-software",
    },
    devDependencies: {
      "@milaboratories/ts-builder": "catalog:",
      "@platforma-sdk/block-tools": "catalog:",
      "@platforma-sdk/package-builder": "catalog:",
    },
  };
}
