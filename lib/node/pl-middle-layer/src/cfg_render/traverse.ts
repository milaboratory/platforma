import type { Cfg } from '@platforma-sdk/model';
import { assertNever } from '@milaboratories/ts-helpers';

export function* traverseCfg(cfg: Cfg, guide?: (cfg: Cfg) => boolean): Generator<Cfg> {
  yield cfg;
  if (guide !== undefined && !guide(cfg)) return;
  switch (cfg.type) {
    case 'GetFromCtx':
    case 'Immediate':
      return;
    case 'Isolate':
      yield * traverseCfg(cfg.cfg);
      return;
    case 'MakeObject':
      for (const [, child] of Object.entries(cfg.template)) yield * traverseCfg(child);
      return;
    case 'MakeArray':
      for (const child of cfg.template) yield * traverseCfg(child);
      return;
    case 'GetJsonField':
    case 'GetResourceField':
      yield * traverseCfg(cfg.source);
      yield * traverseCfg(cfg.field);
      return;
    case 'MapRecordValues':
    case 'MapArrayValues':
    case 'MapResourceFields':
      yield * traverseCfg(cfg.source);
      yield * traverseCfg(cfg.mapping);
      return;
    case 'Flatten':
    case 'GetResourceValueAsJson':
    case 'GetBlobContent':
    case 'ExtractArchiveAndGetURL':
    case 'GetBlobContentAsString':
    case 'GetBlobContentAsJson':
    case 'GetDownloadedBlobContent':
    case 'GetOnDemandBlobContent':
    case 'GetImportProgress':
    case 'GetLastLogs':
    case 'GetProgressLog':
    case 'GetProgressLogWithInfo':
    case 'GetLogHandle':
      yield * traverseCfg(cfg.source);
      return;
    case 'IsEmpty':
      yield * traverseCfg(cfg.arg);
      return;
    case 'Not':
      yield * traverseCfg(cfg.operand);
      return;
    case 'And':
    case 'Or':
      yield * traverseCfg(cfg.operand1);
      yield * traverseCfg(cfg.operand2);
      return;
    default:
      assertNever(cfg);
  }
}
