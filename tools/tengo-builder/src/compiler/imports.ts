// Unused import detection for Tengo sources.
//
// The check runs on the parser's own line results, not on the raw text: a
// comment line comes back empty, so an alias that appears only in a comment
// correctly counts as unused.

import type { MiLogger } from "@milaboratories/ts-helpers";
import type { ImportInfo, sourceParserContext } from "./source";
import { parseSingleSourceLine } from "./source";

/** A module import statement and the line it is on. */
export type TengoImport = ImportInfo & {
  /** Line index in the source, counted from 0. */
  lineNo: number;
};

function newParserContext(): sourceParserContext {
  return {
    isInCommentBlock: false,
    canDetectOptions: true,
    artifactImportREs: new Map(),
    importLikeREs: new Map(),
    multilineStatement: "",
    lineNo: 0,
  };
}

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find imports the source does not use.
 *
 * An import is used when its alias appears with a dot somewhere else in the
 * code: 'text.split(...)'. A module passed around as a value, say
 * 'myFunc(text)', counts as unused. This is deliberate: the cost of keeping an
 * import the source no longer needs is nothing, while the cost of dropping one
 * it does need is a broken build.
 *
 * Throws when the source does not parse, with the same line context the
 * compiler reports.
 */
export function findUnusedImports(
  logger: MiLogger,
  src: string,
  localPackageName: string,
  srcName: string,
): TengoImport[] {
  const imports: TengoImport[] = [];

  // Lines as the parser sees them: comments are empty, code is untouched.
  const codeLines: string[] = [];

  let context = newParserContext();

  const lines = src.split("\n");
  for (const line of lines) {
    context.lineNo++;

    try {
      const result = parseSingleSourceLine(logger, line, context, localPackageName, false);
      context = result.context;
      codeLines.push(result.line);

      if (result.moduleImport) {
        imports.push({ ...result.moduleImport, lineNo: context.lineNo - 1 });
      }
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`[line ${context.lineNo} in ${srcName}]: ${err.message}\n\t${line}`, {
        cause: err,
      });
    }
  }

  return imports.filter((im) => {
    const usageRE = new RegExp(`\\b${escapeForRegExp(im.alias)}\\s*\\.`);
    return !codeLines.some((code, lineNo) => lineNo !== im.lineNo && usageRE.test(code));
  });
}

/**
 * Drop the given lines from the source.
 *
 * The source is cut as it was written: comments, blank lines and formatting
 * outside the dropped lines stay byte for byte the same. An import is always a
 * single line, as the parser accepts it only as an assignment.
 */
export function dropImportLines(src: string, lineNos: number[]): string {
  const drop = new Set(lineNos);
  return src
    .split("\n")
    .filter((_, lineNo) => !drop.has(lineNo))
    .join("\n");
}
