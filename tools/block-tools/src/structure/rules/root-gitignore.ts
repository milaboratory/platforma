// Root `.gitignore` content rules.
// The static template under templates/static/root/.gitignore carries the
// canonical line set; the body re-asserts the same set via
// `ensureGitignoreEntries` so any future edit that drops a required line
// is restored.

import { ensureGitignoreEntries } from "../engine/api";

export const GITIGNORE_REQUIRED_LINES = [
  ".test_auth.json",
  "node_modules/",
  "dist/",
  "block-pack/",
  "dev/",
  "work/",
  "log/",
  ".turbo",
  "vite.config.*.timestamp-*",
  "software/**/*.tgz",
  ".DS_Store",
  ".vscode/sftp.json",
  "test-dry-run.json",
];

export function rootGitignoreRules(): void {
  ensureGitignoreEntries(GITIGNORE_REQUIRED_LINES);
}
