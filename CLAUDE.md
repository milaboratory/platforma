# CLAUDE.md

## Workflow: Continuous Review and Instruction Improvement

After making ANY changes to project files (code edits, new files, refactors, etc.), you MUST follow this workflow before considering the task complete.

> **What hooks handle (do NOT duplicate here):**
>
> - Static analysis (TypeScript type checking, Oxlint) — enforced by `PostToolUse` hook (**TS/Vue files only**; Tengo, Python, and shell files are not covered)
> - Code formatting (Oxfmt) — enforced by `PostToolUse` hook (**TS/Vue files only**)
> - Workflow completion gate — enforced by `Stop` hook (blocks stopping until required phases are done)
> - Subagent output structure validation — enforced by `SubagentStop` hook
>
> See `.claude/settings.json` for hook configuration.

---

## Phase 1: Code Review Loop

1. **Stage your changes.** After completing the initial implementation, identify all files you have added or modified.

2. **Invoke the diff reviewer.** Run the diff review agent defined in `.claude/agents/diff-reviewer.md`, passing it the full set of changed files and their diffs relative to the last clean state (e.g., `git diff` output or equivalent).

3. **Evaluate the verdict.**
   - **✅ Approve** — Phase 1 is complete. Evaluate whether Phase 2 is needed (see criteria below).
   - **⚠️ Approve with suggestions** — Apply any improvements you agree with, then re-run the reviewer ONE more time to confirm. If the second pass is ✅ or ⚠️, Phase 1 is complete.
   - **🔄 Request changes** — Fix all Critical Issues. Apply Improvements where feasible. Re-run the reviewer with the updated diff.

4. **Repeat until approved.** Maximum **5 iterations**. If after 5 rounds the verdict is still 🔄, stop and present the remaining issues to the user for guidance.

5. **Save the review log.** Before moving to Phase 2, record:
   - All issues found during Phase 1 (critical, improvements, nits)
   - Which issues were caught on the first review pass vs. subsequent passes
   - Issues that required multiple attempts to fix

   This log is the input to Phase 2.

---

## Phase 2: Instruction Improvement Loop

Phase 2 uses the review log from Phase 1 to improve agent instructions so future reviews catch problems earlier.

**When to run Phase 2:**

- Phase 1 required **2+ iterations** (the first review pass missed issues or flagged problems that took multiple attempts to fix).
- Phase 1 revealed issues that existing agent instructions _should_ have prevented but didn't.

**When to skip Phase 2:**

- Phase 1 passed on the **first iteration** (✅ or ⚠️ with only minor suggestions).
- All issues found were things only a human reviewer or linter could catch — no agent instruction gap.

If skipping, state why in the Final Report and move on.

### Step 1: Reflect

Invoke the reflect skill (`.claude/skills/reflect/SKILL.md`). Pass it:

- The full conversation history
- All agent files in `.claude/agents/` and `CLAUDE.md`
- The review log from Phase 1, highlighting issues missed on the first pass or requiring multiple fix attempts

### Step 2: Review Suggestions

Invoke the agent instruction reviewer (`.claude/agents/agent-instruction-reviewer.md`). Pass it:

- The reflect skill's full output
- The current agent files for cross-reference

Collect accepted and revised suggestions only.

### Step 3: Verify Before Applying

**Do NOT apply instruction changes yet.** First, verify they would actually help.

For each accepted/revised suggestion:

1. **Simulate** — Would the updated instruction have caught the problem during Phase 1's first pass?
2. **Test against the review log** — Temporarily apply instruction changes. Re-run the diff reviewer on the ORIGINAL code (before Phase 1 fixes) with updated instructions. Check whether previously-missed issues are now caught.
3. **Check for regressions** — Verify updated instructions don't reject correctly-approved code or conflict with existing instructions.

### Step 4: Evaluate Verification Results

- **Instructions caught previously-missed problems** → Proceed to Step 5.
- **Instructions did NOT catch the problems** → Return to Step 1 with verification failure context.

Maximum **3 iterations** of the Step 1–4 loop. If still failing after 3 rounds, present the situation to the user with what you tried and why it didn't work.

### Step 5: Apply Changes

Once verification passes:

1. Apply the verified instruction changes to agent files.
2. Re-run the diff reviewer on current (already-fixed) code to confirm no regressions.
3. Apply any remaining code fixes the improved instructions now flag.

---

## Rules

- **Never skip Phase 1.** Every code change goes through review.
- **Phase 2 is conditional.** Run it when Phase 1 needed multiple iterations or revealed agent instruction gaps. Skip it (with justification) when Phase 1 passed cleanly on the first try.
- **Phase 2 can still be a no-op.** Even when triggered, if reflect finds no meaningful suggestions (or all are rejected), report it and move on.
- **Do not apply unverified instruction changes.** Step 3 is mandatory. Unverified instructions add bloat without value.
- **Do not add rules that hooks enforce.** Static analysis, formatting, and type checking are handled by `PostToolUse` hooks. Agent instructions should focus on design, architecture, patterns, and judgment — things no linter can check.
- **Track everything.** Keep a running log for the final report.
- **Be surgical.** When fixing review feedback or updating instructions, avoid large refactors that destabilize unrelated code or agent behavior.
- **Tests count as code.** Modified tests go through Phase 1.
- **Instruction changes do NOT re-trigger the full workflow.** They are verified within Phase 2 itself.
- **Smoke-test hook changes.** When modifying scripts in `.claude/hooks/`, manually verify they work end-to-end with a representative file before committing. Hook failures often fail silently and affect every subsequent operation in every conversation.

## Final Report

When all required phases are complete, provide:

1. **Implementation summary** — What was built or changed.
2. **Phase 1 results** — Review rounds, what was found and fixed.
3. **Phase 2 results** — Instruction improvements (if any), verification results, impact.
4. **Unresolved items** — Declined suggestions with reasoning.

---

## Project Stack

- **Monorepo** — pnpm workspaces + Turborepo. ~100 packages across `lib/`, `sdk/`, `tools/`, `etc/blocks/`, `tests/`.
- **TypeScript** — Strict mode. Shared base configs in `@milaboratories/ts-configs`.
- **Vue** — Vue 3, Composition API, `<script setup>`.
- **Tengo** — Go-based scripting DSL for workflow definitions. ~333 files in `sdk/workflow-tengo/`, `etc/blocks/*/workflow/`, `tests/workflow-tengo/`. Built via `tengo-builder`.
- **Python** — Data processing libraries in `lib/ptabler/` and `lib/ptexter/`.
- **Protocol Buffers** — gRPC API definitions in `lib/node/pl-client/proto/` and `lib/node/pl-drivers/proto/`.
- **Build** — `@milaboratories/ts-builder` (custom CLI wrapping Vite/Rollup/tsc/vue-tsc).
- **Linting** — Oxlint (not ESLint). Config: `.oxlintrc.json` per package.
- **Formatting** — Oxfmt (not Prettier). Config: `.oxfmtrc.json` per package.
- **Testing** — Vitest.
- **Package manager** — pnpm only (never npm/npx). Always invoke tooling through defined package scripts (`pnpm run <script>`), not directly via `pnpm exec <binary>`.

## Coding Conventions

- **Avoid explicit type casts (`as`).** Types should be derived correctly in the first place. Casts are only acceptable as a last-resort escape hatch. Prefer explicit generic type arguments (e.g., `new Foo<T>()`) over casts (e.g., `new Foo() as Foo<T>`). Branded types (e.g., `Branded<string, "Tag">`) are an accepted exception since they require casts by design.

## Block Architecture

Blocks follow a **Workflow + Model + UI** paradigm. Each block in `etc/blocks/` typically contains:

- `workflow/` — Data processing logic (Tengo scripts)
- `model/` — Data structures and interfaces (TypeScript)
- `ui/` — Visualization and interaction (Vue components)
- `block/` — Block package definition

## Versioning & Changesets

- Uses **changesets** for version management. Do **not** run `pnpm changeset` — manually create files in `.changeset/`.
- Name changeset files descriptively: `fix-xsv-library-parsing.md`, not random words.
- Format: YAML frontmatter with affected packages and version bump type (`patch`/`minor`/`major`), followed by a description.
- SDK re-export packages (`@platforma-sdk/ui-vue`, `@platforma-sdk/model`, `@platforma-sdk/workflow-tengo`, `@platforma-sdk/test`) may need a bump when their underlying packages change.

## Branch & PR Conventions

- Branch naming: `MILAB-XXXX-brief-description` (Notion ticket ID prefix).
- PR title: `MILAB-XXXX: Brief description of changes`.
