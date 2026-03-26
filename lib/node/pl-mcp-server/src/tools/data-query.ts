import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  PFrameHandle,
  PTableHandle,
  PTableColumnSpec,
  PTableVector,
} from "@milaboratories/pl-middle-layer";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult, safeEval, textResult } from "./types";

/**
 * Extracts PFrame and PTable handles from block outputs by scanning for
 * string values matching the handle pattern (64-char hex hash).
 */
function extractHandles(outputs: Record<string, unknown>): {
  pFrames: { path: string; handle: string }[];
  pTables: { path: string; handle: string }[];
} {
  const pFrames: { path: string; handle: string }[] = [];
  const pTables: { path: string; handle: string }[] = [];
  const hexHashPattern = /^[a-f0-9]{64}$/;

  function walk(obj: unknown, path: string) {
    if (obj === null || obj === undefined) return;
    if (typeof obj === "string" && hexHashPattern.test(obj)) {
      const lowerPath = path.toLowerCase();
      if (lowerPath.includes("pframe")) {
        pFrames.push({ path, handle: obj });
      } else if (lowerPath.includes("table") && lowerPath.includes("handle")) {
        pTables.push({ path, handle: obj });
      }
    }
    if (typeof obj === "object" && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    }
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${path}[${i}]`));
    }
  }

  for (const [key, output] of Object.entries(outputs)) {
    const out = output as { ok?: boolean; value?: unknown };
    if (out?.ok && out.value !== undefined && out.value !== null) {
      walk(out.value, key);
    }
  }

  return { pFrames, pTables };
}

/**
 * Converts PTableVector data to JSON-serializable arrays.
 * Handles typed arrays (Int32Array, Float64Array, BigInt64Array, etc.)
 * and marks NA/absent values.
 */
function vectorToJson(vector: PTableVector, rows: number): (string | number | null | "ABSENT")[] {
  const result: (string | number | null | "ABSENT")[] = [];
  for (let i = 0; i < rows; i++) {
    // Check absent
    const absentByteIndex = Math.floor(i / 8);
    const absentBitMask = 1 << (7 - (i % 8));
    if (vector.absent.length > 0 && (vector.absent[absentByteIndex] & absentBitMask) > 0) {
      result.push("ABSENT");
      continue;
    }
    // Check NA
    if (vector.isNA) {
      const naByteIndex = Math.floor(i / 8);
      const naBitMask = 1 << (7 - (i % 8));
      if ((vector.isNA[naByteIndex] & naBitMask) > 0) {
        result.push(null);
        continue;
      }
    }
    const value = vector.data[i];
    if (value === null || value === undefined) {
      result.push(null);
    } else if (typeof value === "bigint") {
      result.push(Number(value));
    } else if (value instanceof Uint8Array) {
      result.push("[bytes]");
    } else {
      result.push(value as string | number);
    }
  }
  return result;
}

export function registerDataQueryTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_block_outputs",
    {
      description:
        "Get block outputs with PFrame/PTable handles and column summaries. Use this to discover available data before querying tables.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID"),
        maxColumns: z
          .number()
          .optional()
          .default(30)
          .describe("Max columns to return per PFrame/PTable summary (default 30)."),
      },
    },
    async ({ projectId, blockId, maxColumns }) => {
      const project = await ctx.getOpenedProject(projectId);
      const state = await project.getBlockState(blockId).awaitStableValue();
      if (!state.outputs)
        return errorResult(
          "Block has no outputs yet.",
          "The block may not have been run. Use get_project_overview to check its calculationStatus, then run_block if needed.",
        );

      const outputs = state.outputs as Record<string, unknown>;
      const { pFrames, pTables } = extractHandles(outputs);

      // Deduplicate by handle, collecting all paths
      const pFramesByHandle = new Map<string, string[]>();
      for (const pf of pFrames) {
        const paths = pFramesByHandle.get(pf.handle) ?? [];
        paths.push(pf.path);
        pFramesByHandle.set(pf.handle, paths);
      }
      const pTablesByHandle = new Map<string, string[]>();
      for (const pt of pTables) {
        const paths = pTablesByHandle.get(pt.handle) ?? [];
        paths.push(pt.path);
        pTablesByHandle.set(pt.handle, paths);
      }

      const MAX_COLUMNS = maxColumns;

      // For each unique PFrame, list columns (summary only)
      const pFrameDriver = ctx.requireMl().internalDriverKit.pFrameDriver;
      const pFrameSummaries = [];
      for (const [handle, paths] of pFramesByHandle) {
        try {
          const columns = await pFrameDriver.listColumns(handle as PFrameHandle);
          const mapped = columns.slice(0, MAX_COLUMNS).map((c) => ({
            name: c.spec.name,
            valueType: c.spec.valueType,
            label: c.spec.annotations?.["pl7.app/label"],
          }));
          pFrameSummaries.push({
            paths,
            handle,
            columnCount: columns.length,
            columns: mapped,
            ...(columns.length > MAX_COLUMNS ? { truncated: true, showing: MAX_COLUMNS } : {}),
          });
        } catch (err) {
          pFrameSummaries.push({
            paths,
            handle,
            error: String(err),
          });
        }
      }

      // For each unique PTable, get shape and spec (summary only)
      const pTableSummaries = [];
      for (const [handle, paths] of pTablesByHandle) {
        try {
          const shape = await pFrameDriver.getShape(handle as PTableHandle);
          const spec = await pFrameDriver.getSpec(handle as PTableHandle);
          const mapped = spec.slice(0, MAX_COLUMNS).map((s: PTableColumnSpec, idx: number) => ({
            index: idx,
            type: s.type,
            name: s.type === "column" ? s.spec.name : s.spec.name,
            valueType: s.type === "column" ? s.spec.valueType : s.spec.type,
            label: s.spec.annotations?.["pl7.app/label"],
          }));
          pTableSummaries.push({
            paths,
            handle,
            rows: shape.rows,
            columnCount: spec.length,
            columns: mapped,
            ...(spec.length > MAX_COLUMNS ? { truncated: true, showing: MAX_COLUMNS } : {}),
          });
        } catch (err) {
          pTableSummaries.push({
            paths,
            handle,
            error: String(err),
          });
        }
      }

      return textResult({
        pFrames: pFrameSummaries,
        pTables: pTableSummaries,
      });
    },
  );

  server.registerTool(
    "list_columns",
    {
      description:
        "List all columns in a PFrame with their specs. Use get_block_outputs first to find the PFrame handle.",
      inputSchema: {
        pFrameHandle: z
          .string()
          .describe("PFrame handle (64-char hex hash from get_block_outputs)"),
      },
    },
    async ({ pFrameHandle }) => {
      const pFrameDriver = ctx.requireMl().internalDriverKit.pFrameDriver;
      const columns = await pFrameDriver.listColumns(pFrameHandle as PFrameHandle);
      return textResult(
        columns.map((c) => ({
          columnId: c.columnId,
          name: c.spec.name,
          valueType: c.spec.valueType,
          label: c.spec.annotations?.["pl7.app/label"],
          visibility: c.spec.annotations?.["pl7.app/table/visibility"],
          axes: c.spec.axesSpec.map((a) => ({
            name: a.name,
            type: a.type,
            label: a.annotations?.["pl7.app/label"],
          })),
        })),
      );
    },
  );

  server.registerTool(
    "query_table",
    {
      description:
        "Query data from a PTable. Returns rows as arrays of values. Use get_block_outputs first to find the PTable handle. " +
        "Use `transform` to process results server-side and return only what you need.",
      inputSchema: {
        pTableHandle: z
          .string()
          .describe("PTable handle (64-char hex hash from get_block_outputs)"),
        columns: z
          .array(z.number())
          .optional()
          .describe(
            "Column indices to retrieve (default: all). Use get_block_outputs to see column indices.",
          ),
        offset: z.number().optional().default(0).describe("Row offset (default 0)"),
        limit: z.number().optional().default(50).describe("Number of rows to return (default 50)."),
        maxLimit: z
          .number()
          .optional()
          .default(1000)
          .describe("Upper bound for limit (default 1000). Increase for large exports."),
        transform: z
          .string()
          .optional()
          .describe(
            "JS expression evaluated server-side against query results. " +
              "Available variables: `rows` (array of row arrays), `columns` (column headers), `totalRows`, `offset`, `rowCount`. " +
              "Example: `rows.map(r => r[0])` — extract first column only.",
          ),
        transformTimeout: z
          .number()
          .optional()
          .default(5000)
          .describe("Timeout in ms for transform evaluation (default 5000)."),
      },
    },
    async ({ pTableHandle, columns, offset, limit, maxLimit, transform, transformTimeout }) => {
      const pFrameDriver = ctx.requireMl().internalDriverKit.pFrameDriver;
      const handle = pTableHandle as PTableHandle;

      let shape;
      try {
        shape = await pFrameDriver.getShape(handle);
      } catch (err) {
        return textResult({ error: `getShape failed: ${err}` });
      }

      let spec;
      try {
        spec = await pFrameDriver.getSpec(handle);
      } catch (err) {
        return textResult({ error: `getSpec failed: ${err}` });
      }

      const effectiveLimit = Math.min(limit, maxLimit);
      const range = { offset, length: effectiveLimit };

      // If no columns specified, get all
      const columnIndices = columns ?? spec.map((_: PTableColumnSpec, i: number) => i);

      let vectors: PTableVector[];
      try {
        vectors = await pFrameDriver.getData(handle, columnIndices, range);
      } catch (err) {
        return textResult({
          error: `getData failed: ${err}`,
          shape,
          columnIndices,
          range,
        });
      }

      const actualRows = vectors.length > 0 ? vectors[0].data.length : 0;
      const columnVectors = vectors.map((v) => vectorToJson(v, actualRows));
      const rows: unknown[][] = [];
      for (let r = 0; r < actualRows; r++) {
        rows.push(columnVectors.map((col) => col[r]));
      }

      const columnHeaders = columnIndices.map((idx: number) => {
        const s = spec[idx];
        return {
          index: idx,
          type: s.type,
          name: s.type === "column" ? s.spec.name : s.spec.name,
          label: s.spec.annotations?.["pl7.app/label"],
        };
      });

      if (transform) {
        try {
          const result = safeEval(
            transform,
            {
              rows,
              columns: columnHeaders,
              totalRows: shape.rows,
              offset,
              rowCount: actualRows,
            },
            transformTimeout,
          );
          return textResult(result);
        } catch (e: unknown) {
          return errorResult(
            `Transform failed: ${e instanceof Error ? e.message : String(e)}`,
            "Check your JS expression syntax. Available variables: rows, columns, totalRows, offset, rowCount.",
          );
        }
      }

      return textResult({
        totalRows: shape.rows,
        offset,
        rowCount: actualRows,
        columns: columnHeaders,
        rows,
      });
    },
  );
}
