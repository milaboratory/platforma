---
name: reflect
description: Review the current chat history and the project's agent/prompt files, then produce actionable suggestions for improving agent instructions. Use when the user wants to audit, refine, or evolve their agent prompts based on how well they performed in practice.
---

# Reflect

A skill that reviews the current conversation history alongside the project's agent definitions and prompt files, identifies gaps, friction, and missed opportunities, and produces concrete suggestions for improving agent instructions.

## When to Use

- After a multi-step coding session to check if agents behaved as intended
- When the user says "reflect", "review prompts", "improve agents", "what went wrong", or similar
- Periodically as a hygiene step after significant project work
- When agent behavior was surprising, repetitive, or unhelpful

## Process

### Step 1: Discover Agent Files

Scan the project for all agent and prompt definitions. Common locations:

```
.claude/agents/*.md
.claude/CLAUDE.md
CLAUDE.md
```

Read every file found. Build an inventory:

| File                                     | Purpose                 | Key behaviors defined       |
| ---------------------------------------- | ----------------------- | --------------------------- |
| `CLAUDE.md`                              | Top-level orchestration | Review loop, stack rules    |
| `.claude/agents/diff-reviewer.md`        | Review orchestrator     | File filtering, synthesis   |
| `.claude/agents/single-file-reviewer.md` | Per-file code review    | TS/Vue/Tengo/Python/Shell review criteria |

Present this inventory before continuing.

### Step 2: Analyze Conversation History

Review the full chat history in the current conversation. For each exchange, note:

1. **What was the user trying to accomplish?**
2. **Which agent instructions were relevant?**
3. **Did the agent behave as the instructions intended?**
4. **Where did friction occur?** — Misunderstandings, repeated corrections, wasted steps, missing context, wrong assumptions.
5. **Where did the agent exceed expectations?** — Identify what's working well so it isn't lost in revisions.

### Step 3: Identify Patterns

Group observations into categories:

- **Gaps** — Situations the instructions don't cover at all. The agent had to improvise or the user had to manually intervene.
- **Ambiguity** — Instructions that could be interpreted multiple ways, leading to inconsistent behavior.
- **Conflicts** — Two instructions that contradict each other or create competing priorities.
- **Overspecification** — Instructions so rigid they prevent the agent from handling reasonable edge cases.
- **Underspecification** — Instructions too vague to produce consistent results.
- **Missing context** — The agent lacked project-specific knowledge it needed (stack details, conventions, directory structure, naming patterns).
- **Redundancy** — The same instruction repeated across files, risking drift.
- **Ordering issues** — Steps that should happen in a different sequence.

### Step 4: Generate Suggestions

For each identified issue, produce a suggestion with this structure:

```
### [Category]: Brief title

**File:** `path/to/agent.md`
**Section:** (which part of the file)
**Problem:** What went wrong or what's missing, with a concrete example from the conversation.
**Suggestion:** What to change, add, or remove.
**Proposed edit:**
(A specific diff or rewritten section — not just "consider adding X")
```

Prioritize suggestions by impact:

1. 🔴 **Critical** — Agent produced wrong/harmful output or skipped essential steps
2. 🟡 **Important** — Agent was inefficient, confusing, or inconsistent
3. 🟢 **Nice to have** — Polish, clarity, or resilience improvements

### Step 5: Check for Cross-File Consistency

After individual file suggestions, review the agent system as a whole:

- Are terms used consistently across files? (e.g., does one file say "critical issues" and another say "blockers"?)
- Is the division of responsibility between agents clear and non-overlapping?
- Are there assumptions in one agent that depend on behavior defined in another? Are those dependencies explicit?
- Does the top-level `CLAUDE.md` accurately reflect the current set of agents?

### Step 6: Produce the Report

Output a structured report:

---

## Agent Inventory

(Table from Step 1)

## Conversation Summary

A 3–5 sentence summary of what happened in this conversation and which agents were exercised.

## What's Working Well

2–4 things the current instructions handle effectively. Be specific — reference moments in the conversation.

## Suggestions

(All suggestions from Step 4, grouped by priority, then by file)

## Cross-File Issues

(Findings from Step 5)

## Recommended Next Steps

A prioritized list of 3–5 concrete actions the user should take, ordered by impact.

---

## Rules

- **Be concrete.** Every suggestion must include a proposed edit, not just a description of the problem.
- **Reference the conversation.** Vague suggestions are useless. Point to specific moments where the issue manifested.
- **Preserve what works.** Don't suggest rewriting things that are functioning well. Call them out positively.
- **Don't over-suggest.** Aim for 5–15 actionable suggestions, not an exhaustive audit of every possible improvement. Focus on what will make the biggest difference.
- **Respect intent.** The user designed these agents for a reason. Suggest improvements that align with their goals, not a different architecture.
- **Consider the feedback loop.** If suggesting changes to the review agents, think about whether those changes could create infinite loops or conflicting feedback cycles.
- **Be honest about uncertainty.** If you can only see one conversation, say so. Some issues may be one-offs; others may be systemic. Distinguish between them.

## Applying Suggestions

After presenting the report, ask the user which suggestions they'd like to apply. For approved suggestions:

1. Make the edits to the agent files directly.
2. Show the user a summary of what changed.
3. If the changes affect the review loop or other automated workflows, flag any new interactions that should be tested.
