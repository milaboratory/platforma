// Canonical block structure — composes every scope's `*Rules()` function
// inside a single `defineStructure(() => { ... })`. Re-evaluated by the
// engine on every run; rule modules are imported by name so the
// structure stays inspectable and the dep graph is explicit.

import { defineStructure } from "./engine/api";
import { rootRules } from "./rules/root";
import { blockRules } from "./rules/block";
import { modelRules } from "./rules/model";
import { uiRules } from "./rules/ui";
import { workflowRules } from "./rules/workflow";
import { testRules } from "./rules/test";
import { softwareRules } from "./rules/software";
import { testFrameworkMigration, legacyCleanup } from "./rules/migrations";

export const STRUCTURE = defineStructure(() => {
  rootRules();
  blockRules();
  modelRules();
  uiRules();
  workflowRules();
  testRules();
  softwareRules();
  testFrameworkMigration();
  legacyCleanup();
});
