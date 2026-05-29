// Software-scope rules. One scope body, N modules — the engine fans out
// once per discovered software module (dsl-example.md § "Multi-module
// fan-out"). Zero software modules → entire scope body no-ops.
//
// Seeds (`software/src/main.py` + `requirements.txt`) are written once by
// `init` and never touched again — the block author owns them
// (templates-strategy.md § "Software Module Scaffold").

import { scope, managed, seed, generate, text, blockVars } from "../engine/api";
import { softwarePackageJsonInitial } from "../templates/generated/software-package-json";
import { softwarePackageJsonRules } from "./software-package-json";

const MAIN_PY_SEED = `import sys

print("Hello from Python, " + sys.argv[1] + "!")
`;

const REQUIREMENTS_SEED = `# No dependencies specified for this script
`;

export function softwareRules(): void {
  scope("software", () => {
    seed("src/main.py", text(MAIN_PY_SEED));
    seed("src/requirements.txt", text(REQUIREMENTS_SEED));

    managed(
      "package.json",
      generate(() => softwarePackageJsonInitial(blockVars())),
      () => {
        softwarePackageJsonRules();
      },
    );
  });
}
