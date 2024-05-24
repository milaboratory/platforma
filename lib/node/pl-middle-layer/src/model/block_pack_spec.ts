import { TemplateSourceAny, TemplateSourcePrepared } from './template';

export interface BlockPackSpecCustom<Tpl extends TemplateSourceAny = TemplateSourcePrepared> {
  type: 'custom';
  template: Tpl;
}

export type BlockPackSpec = BlockPackSpecCustom;
export type BlockPackSpecNotPrepared = BlockPackSpecCustom<TemplateSourceAny>;
