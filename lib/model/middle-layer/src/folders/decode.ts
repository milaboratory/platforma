import { FOLDERS_SCHEMA_VERSION, FoldersDocument, emptyFoldersDocument } from "./document";

/** Why a stored document could not be read as it stands. */
export type FoldersDocumentProblem =
  | {
      readonly kind: "newer-schema";
      /** Version found in the document, which is higher than this build understands. */
      readonly documentSchemaVersion: number;
      readonly message: string;
    }
  | {
      readonly kind: "unreadable";
      readonly message: string;
    };

/**
 * A stored document as this build sees it.
 *
 * A document written by a newer build, or one that cannot be parsed at all, reads as no folders
 * so that the project list still renders, and turns `writable` off: an old build that both
 * degraded the read and kept writing would silently replace a newer build's tree with its own
 * truncated view of it. Every refusal says why.
 */
export type FoldersDecoded =
  | {
      readonly document: FoldersDocument;
      readonly writable: true;
      readonly problem?: undefined;
    }
  | {
      readonly document: FoldersDocument;
      /** Every folder write must be refused. */
      readonly writable: false;
      readonly problem: FoldersDocumentProblem;
    };

/**
 * What the store holds for the folder document: nothing at all, or a stored value and its bytes
 * when they could be obtained.
 */
export type FoldersStoredDocument =
  | { readonly present: false }
  | {
      readonly present: true;
      /** The stored JSON; undefined when the value carries no bytes this build can fetch. */
      readonly raw: string | undefined;
    };

/**
 * Decode whatever the store holds for the folder document.
 *
 * An absent document is a user with no folders, and is writable. A document that is present but
 * carries no bytes, or empty ones, is not the same thing: it exists and cannot be read here — a
 * newer build keeping the tree in another shape, or a value this build cannot fetch — so it reads
 * as no folders and is **not** writable, because writing an empty tree over one that is merely
 * unreadable from this build destroys it.
 */
export function decodeStoredFoldersDocument(stored: FoldersStoredDocument): FoldersDecoded {
  if (!stored.present) return readable(emptyFoldersDocument());
  if (stored.raw === undefined || stored.raw === "")
    return unreadable("the folder document is stored in a shape this build cannot read");
  return decodeFoldersDocument(stored.raw);
}

/** Decode the stored JSON of a document that is present. */
export function decodeFoldersDocument(raw: string): FoldersDecoded {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    return unreadable(`the folder document is not valid JSON: ${errorText(error)}`);
  }

  return decodeFoldersValue(parsed);
}

/** Serialise a document for storage. */
export function encodeFoldersDocument(document: FoldersDocument): string {
  return JSON.stringify(document);
}

//
// Internals
//

function decodeFoldersValue(value: unknown): FoldersDecoded {
  if (!isMapping(value)) return unreadable("the folder document is not an object");

  const version = value.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    return unreadable("the folder document carries no usable schema version");

  if (version > FOLDERS_SCHEMA_VERSION)
    return {
      document: emptyFoldersDocument(),
      writable: false,
      problem: {
        kind: "newer-schema",
        documentSchemaVersion: version,
        message:
          `the folder document was written by a newer version of the application ` +
          `(schema ${version}, this build understands ${FOLDERS_SCHEMA_VERSION})`,
      },
    };

  const result = FoldersDocument.safeParse(value);
  if (!result.success)
    return unreadable(
      `the folder document does not match schema ${FOLDERS_SCHEMA_VERSION}: ` +
        result.error.issues.map(formatIssue).join("; "),
    );

  return readable(result.data);
}

function readable(document: FoldersDocument): FoldersDecoded {
  return { document, writable: true };
}

function unreadable(message: string): FoldersDecoded {
  return {
    document: emptyFoldersDocument(),
    writable: false,
    problem: { kind: "unreadable", message },
  };
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatIssue(issue: {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}): string {
  const path = issue.path.map((segment) => String(segment)).join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
