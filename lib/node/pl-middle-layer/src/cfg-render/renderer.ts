import { Cfg } from '@milaboratory/sdk-block-config';
import { Operation, OperationAction, Subroutine } from './operation';
import { PlTreeEntry } from '@milaboratory/pl-tree';
import { mapRecord } from './util';

function res(result: unknown): OperationAction {
  return {
    type: 'ReturnResult',
    result: result
  };
}

export function resOp(result: unknown): Operation {
  return () => res(result);
}

const SRMakeObject: Subroutine = args => {
  const result: Record<string | symbol, any> = {};
  for (const [k, v] of Object.entries(args))
    result[k] = v;
  return resOp(result);
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

//| CfgGetFromCtx
//
//   | CfgIsolate
//
//   | CfgImmediate
//   | CfgGetJsonField
//   | CfgMakeObject
//   | CfgMapRecordValues
//   | CfgMapArrayValues
//
//   | CfgIsEmpty
//   | CfgNot
//
//   | CfgMapResourceFields
//   | CfgGetResourceField
//   | CfgResourceValueAsJson;

export function renderCfg(ctx: Record<string, unknown>, cfg: Cfg): Operation {
  switch (cfg.type) {

    case 'GetFromCtx':
      return resOp(ctx[cfg.variable]);

    case 'Immediate':
      return resOp(cfg.value);

    case 'GetJsonField':
      return () => ({
        type: 'CallSubroutine',
        subroutine: SRGetJsonField,
        args: {
          source: renderCfg(ctx, cfg.source),
          field: renderCfg(ctx, cfg.field)
        }
      });

    case 'MakeObject':
      return () => ({
        type: 'CallSubroutine',
        subroutine: SRMakeObject,
        args: mapRecord(cfg.template, c => renderCfg(ctx, c))
      });

    case 'GetResourceValueAsJson':
      return () => ({
        type: 'CallSubroutine',
        subroutine: SRResourceValueAsJson,
        args: {
          source: renderCfg(ctx, cfg.source)
        }
      });

    default:
      throw new Error(`Unsupported configuration type: ${cfg.type}`);
  }
}
