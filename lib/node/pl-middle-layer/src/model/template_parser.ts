import YAML from "yaml";
import type { ProjectTemplateV1, TemplateParseIssue } from "@milaboratories/pl-model-common";
import {
  PROJECT_TEMPLATE_SCHEMA_V1,
  formatTemplateParseIssue,
  readProjectTemplateV1,
} from "@milaboratories/pl-model-common";

/**
 * A template file read, or why it could not be.
 *
 * A single message rather than a list of per-entry problems: until the document
 * parses there are no entries to attach anything to, and a file that does not parse
 * has one problem — it is not a template. Per-entry reporting starts at the stage
 * after this one. The message may span several lines when the file has several
 * fixable issues, so that fixing it takes one pass.
 */
export type TemplateParseOutcome =
  | { readonly ok: true; readonly document: ProjectTemplateV1 }
  | { readonly ok: false; readonly error: string };

/**
 * Read `template-v1` YAML text into a document.
 *
 * The text half of the import direction, mirroring `stringifyProjectTemplateV1` on the
 * export side — and, like it, living here rather than in `pl-model-common`, which ships
 * in every block-model and UI bundle and takes no `yaml` dependency. The document half
 * is `parseProjectTemplateV1`, shared with export so that what export writes is by
 * construction what import reads.
 *
 * JSON is accepted for free: every JSON document is also YAML.
 *
 * **Read as YAML 1.2**, while the emitter quotes as if for 1.1. That asymmetry is
 * deliberate on both ends: quoting against the stricter ruleset makes a file we write
 * mean the same thing to any reader, and reading with the looser one means a bare
 * `yes` or `1:30` in a hand-written file stays the string it looks like instead of
 * silently becoming `true` or `90`.
 *
 * Nothing here checks that references point anywhere or that a kind can be resolved —
 * those are later stages, and both need more than the file to answer.
 */
export function parseProjectTemplateV1Yaml(text: string): TemplateParseOutcome {
  let value: unknown;
  try {
    value = YAML.parse(text);
  } catch (e) {
    // The library's message already carries "at line L, column C"; what follows it is
    // a code frame of the offending lines, dropped here because whoever is fixing the
    // file has it open and the position is what they need.
    const first = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return { ok: false, error: `The file is not valid YAML: ${first}` };
  }

  // Empty input, blank lines and a file of nothing but comments all parse to null.
  // Left to the schema, this reads as "expected object, received null", which says
  // nothing about the actual mistake.
  if (value === null || value === undefined) {
    return { ok: false, error: "The file is empty." };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error:
        "The file does not describe a template: expected a mapping with 'schema' and " +
        "'blocks' at the top level.",
    };
  }

  // Checked ahead of the document reader because it is the likeliest mistake by far — the
  // wrong file was picked — and deserves a sentence about that rather than one about a field
  // whose value is not what was expected.
  const marker = (value as { schema?: unknown }).schema;
  if (marker !== PROJECT_TEMPLATE_SCHEMA_V1) {
    return {
      ok: false,
      error:
        marker === undefined
          ? `This file has no 'schema' field, so it is not a ${PROJECT_TEMPLATE_SCHEMA_V1} template.`
          : `This file says it is '${String(marker)}', not ${PROJECT_TEMPLATE_SCHEMA_V1}.`,
    };
  }

  const outcome = readProjectTemplateV1(value);
  return outcome.ok
    ? { ok: true, document: outcome.document }
    : { ok: false, error: describeIssues(outcome.issues) };
}

/**
 * Turn the reader's issues into something a person can act on, all of them at once.
 *
 * The per-issue line comes from `formatTemplateParseIssue`, shared with the error the reader
 * throws, so a problem reads the same whether it reached a person through this outcome or
 * through a log. What is added here is the headline, which is the one part that belongs to
 * this stage: it says the FILE is at fault, which a caller that has one can say and the
 * document reader cannot.
 */
function describeIssues(issues: readonly TemplateParseIssue[]): string {
  const lines = issues.map((issue) => `- ${formatTemplateParseIssue(issue)}`);

  const headline =
    lines.length === 1
      ? "The template file has a problem:"
      : `The template file has ${lines.length} problems:`;

  return [headline, ...lines].join("\n");
}
