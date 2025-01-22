import {
  ArchiveFormat,
  Cfg,
  CfgMapArrayValues,
  CfgMapRecordValues,
  CfgMapResourceFields
} from '@platforma-sdk/model';
import { ArgumentRequests, Operation, OperationAction, Subroutine } from './operation';
import { PlTreeEntry } from '@milaboratories/pl-tree';
import { mapRecord } from './util';
import { computableFromCfgUnsafe } from './executor';
import { assertNever } from '@milaboratories/ts-helpers';
import { Computable } from '@milaboratories/computable';

function res(result: unknown): OperationAction {
  return {
    type: 'ReturnResult',
    result: result
  };
}

export function resOp(result: unknown): Operation {
  return () => res(result);
}

//
// Subroutines
//

const SRMakeObject: Subroutine = (args) => {
  const result: Record<string | symbol, any> = {};
  for (const [k, v] of Object.entries(args)) result[k] = v;
  return resOp(result);
};

const SRFlatten: Subroutine = (args) => {
  const source = args.source as unknown[] | undefined;
  if (source === undefined) return resOp(undefined);
  const result: unknown[] = [];
  for (const nested of source) {
    if (nested instanceof Array) result.push(...nested);
    else result.push(nested);
  }
  return resOp(result);
};

const SRGetResourceField: Subroutine = (args) => {
  const source = args.source as PlTreeEntry | undefined;
  const field = args.field as string | undefined;
  if (source === undefined || field === undefined) return resOp(undefined);
  return ({ cCtx }) => {
    return res(cCtx.accessor(source).node().traverse(field)?.persist());
  };
};

function mapArrayToRecord<T, R>(elements: T[], cb: (e: T) => R): Record<string, R> {
  const result: Record<string, R> = {};
  const length = elements.length;
  for (let i = 0; i < length; i++) result[String(i)] = cb(elements[i]);
  return result;
}

function SRMapArrayValues1(
  ctx: Record<string, unknown>,
  ops: Pick<CfgMapArrayValues, 'itVar' | 'mapping'>
): Subroutine {
  return (args) => {
    const source = args.source as unknown[] | undefined;
    if (source === undefined) return resOp(undefined);
    return () => ({
      type: 'ScheduleSubroutine',
      subroutine: SRCollectArrayFromArgs(source.length),
      args: mapArrayToRecord(source, (e) => renderCfg({ ...ctx, [ops.itVar]: e }, ops.mapping))
    });
  };
}

function SRCollectArrayFromArgs(length: number): Subroutine {
  return (args) => {
    const result: unknown[] = [];
    for (let i = 0; i < length; i++) result.push(args[String(i)]);
    return resOp(result);
  };
}

function SRMapRecordValues1(
  ctx: Record<string, unknown>,
  ops: Pick<CfgMapRecordValues, 'itVar' | 'mapping'>
): Subroutine {
  return (args) => {
    const source = args.source as Record<string, unknown> | undefined;
    if (source === undefined) return resOp(undefined);
    const nextArgs: ArgumentRequests = {};
    for (const [k, v] of Object.entries(source)) {
      const newCtx = { ...ctx, [ops.itVar]: v };
      nextArgs[k] = renderCfg(newCtx, ops.mapping);
    }
    return () => ({
      type: 'ScheduleSubroutine',
      subroutine: SRMapRecordValues2,
      args: nextArgs
    });
  };
}

const SRMapRecordValues2: Subroutine = (args) => {
  return resOp(args);
};

const SRIsEmpty: Subroutine = (args) => {
  const arg = args.arg as unknown[] | string | undefined;
  if (arg === undefined) return resOp(undefined);
  return resOp(arg.length === 0);
};

const SRNot: Subroutine = (args) => {
  const operand = args.operand as boolean | undefined;
  if (operand === undefined) return resOp(undefined);
  return resOp(!operand);
};

const SRAnd: Subroutine = (args) => {
  const operand1 = args.operand1 as boolean | undefined;
  const operand2 = args.operand2 as boolean | undefined;
  if (operand1 === undefined || operand2 === undefined) return resOp(undefined);
  return resOp(operand1 && operand2);
};

const SROr: Subroutine = (args) => {
  const operand1 = args.operand1 as boolean | undefined;
  const operand2 = args.operand2 as boolean | undefined;
  if (operand1 === undefined || operand2 === undefined) return resOp(undefined);
  return resOp(operand1 || operand2);
};

const SRResourceValueAsJson: Subroutine = (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);
  return ({ cCtx }) => res(cCtx.accessor(source).node()?.getDataAsJson());
};

const SRGetJsonField: Subroutine = (args) => {
  const source = args.source as Record<string, unknown> | undefined;
  const field = args.field as string | undefined;
  if (source === undefined || field === undefined) return resOp(undefined);
  return resOp(source[field]);
};

function SRMapResourceFields1(
  ctx: Record<string, unknown>,
  ops: Pick<CfgMapResourceFields, 'itVar' | 'mapping'>
): Subroutine {
  return (args) => {
    const source = args.source as PlTreeEntry | undefined;
    if (source === undefined) return resOp(undefined);

    return ({ cCtx }) => {
      const node = cCtx.accessor(source).node();

      const nextArgs: ArgumentRequests = {};
      for (const fieldName of node.listInputFields()) {
        const res = node.traverse(fieldName);
        if (res === undefined) nextArgs[fieldName] = resOp(undefined);
        else {
          const newCtx = { ...ctx, [ops.itVar]: res.persist() };
          nextArgs[fieldName] = renderCfg(newCtx, ops.mapping);
        }
      }

      return {
        type: 'ScheduleSubroutine',
        subroutine: SRMapResourceFields2,
        args: nextArgs
      };
    };
  };
}

const SRMapResourceFields2: Subroutine = (args) => {
  return resOp(args);
};

const SRGetBlobContent: Subroutine = (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);

  return ({ drivers }) => {
    return {
      type: 'ScheduleComputable',
      computable: Computable.make(
        (ctx) => {
          return drivers.blobDriver.getDownloadedBlob(ctx.accessor(source).node().resourceInfo);
        },
        {
          postprocessValue: async (value) => {
            if (value === undefined) return undefined;
            return await drivers.blobDriver.getContent(value.handle);
          }
        }
      )
    };
  };
};

const SRGetBlobContentAsString: Subroutine = (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);

  return ({ cCtx, drivers }) => {
    // getting target resource id and type
    const resourceInfo = cCtx.accessor(source).node().resourceInfo;

    return {
      type: 'ScheduleComputable',
      computable: Computable.make(() => drivers.blobDriver.getDownloadedBlob(resourceInfo), {
        postprocessValue: async (value) => {
          if (value === undefined) return undefined;
          const content = await drivers.blobDriver.getContent(value.handle);
          return content.toString();
        }
      })
    };
  };
};

const SRGetBlobContentAsJson: Subroutine = (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);

  return ({ drivers }) => {
    return {
      type: 'ScheduleComputable',
      computable: Computable.make(
        (c) => drivers.blobDriver.getDownloadedBlob(c.accessor(source).node().resourceInfo),
        {
          postprocessValue: async (value) => {
            if (value == undefined) return undefined;
            const content = await drivers.blobDriver.getContent(value.handle);
            if (content == undefined) return undefined;
            return JSON.parse(Buffer.from(content).toString());
          }
        }
      )
    };
  };
};

const SRGetDownloadedBlobContent: Subroutine = (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);

  return ({ drivers }) => {
    return {
      type: 'ScheduleComputable',
      computable: drivers.blobDriver.getDownloadedBlob(source)
    };
  };
};

const SRGetOnDemandBlobContent: Subroutine = (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);

  return ({ drivers }) => {
    return {
      type: 'ScheduleComputable',
      computable: drivers.blobDriver.getOnDemandBlob(source)
    };
  };
};

const SRExtractArchiveAndGetURL: (format: ArchiveFormat) => Subroutine = (format) => (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);

  return ({ drivers }) => {
    return {
      type: 'ScheduleComputable',
      computable: drivers.blobToURLDriver.extractArchiveAndGetURL(source, format)
    };
  };
};

const SRGetImportProgress: Subroutine = (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);

  return ({ drivers }) => {
    return {
      type: 'ScheduleComputable',
      computable: drivers.uploadDriver.getProgressId(source)
    };
  };
};

const SRGetLastLogs: (lines: number) => Subroutine = (lines) => (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);

  return ({ drivers }) => {
    return {
      type: 'ScheduleComputable',
      computable: drivers.logDriver.getLastLogs(source, lines)
    };
  };
};

const SRGetProgressLog: (patternToSearch: string) => Subroutine = (patternToSearch) => (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);

  return ({ drivers }) => {
    return {
      type: 'ScheduleComputable',
      computable: drivers.logDriver.getProgressLog(source, patternToSearch)
    };
  };
};

const SRGetLogHandle: Subroutine = (args) => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined) return resOp(undefined);

  return ({ drivers }) => {
    return {
      type: 'ScheduleComputable',
      computable: drivers.logDriver.getLogHandle(source)
    };
  };
};

/** Renders configuration into executor's Operation */
export function renderCfg(ctx: Record<string, unknown>, cfg: Cfg): Operation {
  switch (cfg.type) {
    case 'GetFromCtx':
      const ctxValue = ctx[cfg.variable];
      if (typeof ctxValue === 'function') return (e) => res(ctxValue(e.cCtx));
      else return resOp(ctxValue);

    case 'Isolate':
      return ({ drivers }) => ({
        type: 'ScheduleComputable',
        computable: computableFromCfgUnsafe(drivers, ctx, cfg.cfg)
      });

    case 'Immediate':
      return resOp(cfg.value);

    case 'GetJsonField':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetJsonField,
        args: {
          source: renderCfg(ctx, cfg.source),
          field: renderCfg(ctx, cfg.field)
        }
      });

    case 'MapArrayValues':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRMapArrayValues1(ctx, cfg),
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'MapRecordValues':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRMapRecordValues1(ctx, cfg),
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'MakeObject':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRMakeObject,
        args: mapRecord(cfg.template, (c) => renderCfg(ctx, c))
      });

    case 'MakeArray':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRCollectArrayFromArgs(cfg.template.length),
        args: mapArrayToRecord(cfg.template, (e) => renderCfg(ctx, e))
      });

    case 'Flatten':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRFlatten,
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'IsEmpty':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRIsEmpty,
        args: {
          arg: renderCfg(ctx, cfg.arg)
        }
      });

    case 'Not':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRNot,
        args: {
          operand: renderCfg(ctx, cfg.operand)
        }
      });

    case 'And':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRAnd,
        args: {
          operand1: renderCfg(ctx, cfg.operand1),
          operand2: renderCfg(ctx, cfg.operand2)
        }
      });

    case 'Or':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SROr,
        args: {
          operand1: renderCfg(ctx, cfg.operand1),
          operand2: renderCfg(ctx, cfg.operand2)
        }
      });

    case 'MapResourceFields':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRMapResourceFields1(ctx, cfg),
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'GetResourceField':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetResourceField,
        args: {
          source: renderCfg(ctx, cfg.source),
          field: renderCfg(ctx, cfg.field)
        }
      });

    case 'GetResourceValueAsJson':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRResourceValueAsJson,
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'GetBlobContent':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetBlobContent,
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'GetBlobContentAsString':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetBlobContentAsString,
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'GetBlobContentAsJson':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetBlobContentAsJson,
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'GetDownloadedBlobContent':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetDownloadedBlobContent,
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'GetOnDemandBlobContent':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetOnDemandBlobContent,
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'ExtractArchiveAndGetURL':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRExtractArchiveAndGetURL(cfg.format),
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'GetImportProgress':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetImportProgress,
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'GetLastLogs':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetLastLogs(cfg.lines),
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'GetProgressLog':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetProgressLog(cfg.patternToSearch),
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    case 'GetLogHandle':
      return () => ({
        type: 'ScheduleSubroutine',
        subroutine: SRGetLogHandle,
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    default:
      return assertNever(cfg);
  }
}
