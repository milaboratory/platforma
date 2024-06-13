import { Cfg, CfgMapArrayValues, CfgMapRecordValues, CfgMapResourceFields } from '@milaboratory/sdk-block-config';
import { ArgumentRequests, Operation, OperationAction, Subroutine } from './operation';
import { PlTreeEntry } from '@milaboratory/pl-tree';
import { mapRecord } from './util';
import { computableFromCfg } from './executor';
import { assertNever } from '@milaboratory/ts-helpers';
import { rawComputableWithPostprocess } from '@milaboratory/computable';

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

const SRMakeObject: Subroutine = args => {
  const result: Record<string | symbol, any> = {};
  for (const [k, v] of Object.entries(args))
    result[k] = v;
  return resOp(result);
};

const SRGetResourceField: Subroutine = args => {
  const source = args.source as PlTreeEntry | undefined;
  const field = args.field as string | undefined;
  if (source === undefined || field === undefined)
    return resOp(undefined);
  return env => res(env.accessor(source).node().traverse(field)?.persist());
};

function SRMapArrayValues1(ctx: Record<string, unknown>, ops: Pick<CfgMapArrayValues, 'itVar' | 'mapping'>): Subroutine {
  return args => {
    const source = args.source as unknown[] | undefined;
    if (source === undefined)
      return resOp(undefined);
    const nextArgs: ArgumentRequests = {};
    const length = source.length;
    for (let i = 0; i < length; i++) {
      const newCtx = { ...ctx, [ops.itVar]: source[i] };
      nextArgs[String(i)] = renderCfg(newCtx, ops.mapping);
    }
    return () => ({
      type: 'ScheduleSubroutine',
      subroutine: SRMapArrayValues2(length),
      args: nextArgs
    });
  };
}

function SRMapArrayValues2(length: number): Subroutine {
  return args => {
    const result: unknown[] = [];
    for (let i = 0; i < length; i++)
      result.push(args[String(i)]);
    return resOp(result);
  };
}

function SRMapRecordValues1(ctx: Record<string, unknown>, ops: Pick<CfgMapRecordValues, 'itVar' | 'mapping'>): Subroutine {
  return args => {
    const source = args.source as Record<string, unknown> | undefined;
    if (source === undefined)
      return resOp(undefined);
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

const SRMapRecordValues2: Subroutine = args => {
  return resOp(args);
};

const SRIsEmpty: Subroutine = args => {
  const arg = args.arg as unknown[] | undefined;
  if (arg === undefined)
    return resOp(undefined);
  return resOp(arg.length === 0);
};

const SRNot: Subroutine = args => {
  const operand = args.operand as boolean | undefined;
  if (operand === undefined)
    return resOp(undefined);
  return resOp(!operand);
};

const SRResourceValueAsJson: Subroutine = args => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined)
    return resOp(undefined);
  return env => res(env.accessor(source).node()?.getDataAsJson());
};

const SRGetJsonField: Subroutine = args => {
  const source = args.source as Record<string, unknown> | undefined;
  const field = args.field as string | undefined;
  if (source === undefined || field === undefined)
    return resOp(undefined);
  return resOp(source[field]);
};

function SRMapResourceFields1(ctx: Record<string, unknown>, ops: Pick<CfgMapResourceFields, 'itVar' | 'mapping'>): Subroutine {
  return args => {
    const source = args.source as PlTreeEntry | undefined;
    if (source === undefined)
      return resOp(undefined);

    return env => {
      const accessor = env.accessor(source);

      const node = accessor.node();

      const nextArgs: ArgumentRequests = {};
      for (const fieldName of node.listInputFields()) {
        const res = node.traverse(fieldName);
        if (res === undefined)
          nextArgs[fieldName] = resOp(undefined);
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

const SRMapResourceFields2: Subroutine = args => {
  return resOp(args);
};

const SRGetBlobContent: Subroutine = args => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined)
    return resOp(undefined);

  return env => {
    const node = env.accessor(source).node();
    const driver = env.downloadDriver;
    if (driver == undefined)
      return res(undefined);

    return {
      type: 'ScheduleComputable',
      computable: rawComputableWithPostprocess(
        () => driver.getDownloadedBlob({
          id: node.id,
          type: node.resourceType,
        }), {},
        async (val) => {
          if (val == undefined)
            return undefined;
          return await driver.getContent(val);
        }
      )
    }
  };
};

const SRGetBlobContentAsString: Subroutine = args => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined)
    return resOp(undefined);

  return env => {
    const node = env.accessor(source).node();
    const driver = env.downloadDriver;
    if (driver == undefined)
      return res(undefined);

    return {
      type: 'ScheduleComputable',
      computable: rawComputableWithPostprocess(
        () => driver.getDownloadedBlob({
          id: node.id,
          type: node.resourceType,
        }), {},
        async (val) => {
          if (val == undefined)
            return undefined;
          return (await driver.getContent(val)).toString();
        }
      )
    }
  };
};

const SRGetBlobContentAsJson: Subroutine = args => {
  const source = args.source as PlTreeEntry | undefined;
  if (source === undefined)
    return resOp(undefined);

  return env => {
    const node = env.accessor(source).node();
    const driver = env.downloadDriver;
    if (driver == undefined)
      return res(undefined);

    return {
      type: 'ScheduleComputable',
      computable: rawComputableWithPostprocess(
        () => driver.getDownloadedBlob({
          id: node.id,
          type: node.resourceType,
        }), {},
        async (val) => {
          if (val == undefined)
            return undefined;
          return JSON.parse((await driver.getContent(val)).toString());
        }
      )
    }
  };
};

/** Renders configuration into executor's Operation */
export function renderCfg(ctx: Record<string, unknown>, cfg: Cfg): Operation {
  switch (cfg.type) {

    case 'GetFromCtx':
      return resOp(ctx[cfg.variable]);

    case 'Isolate':
      return () => ({
        type: 'ScheduleComputable',
        computable: computableFromCfg(ctx, cfg.cfg)
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
        args: mapRecord(cfg.template, c => renderCfg(ctx, c))
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

    default:
      return assertNever(cfg);
  }
}
