import { TemplateSourcePrepared } from '../model/template';
import { ExplicitTemplateEnterNumbers, ExplicitTemplateSumNumbers } from './explicit_templates';

export const TplSpecEnterExplicit: TemplateSourcePrepared = {
  type: 'explicit',
  content: ExplicitTemplateEnterNumbers
};

export const TplSpecEnterFromRegistry: TemplateSourcePrepared = {
  type: 'from-registry',
  registry: 'milaboratories',
  path: 'releases/v1/milaboratory/enter-numbers/0.0.2/template.plj.gz'
};

export const TplSpecSumExplicit: TemplateSourcePrepared = {
  type: 'explicit',
  content: ExplicitTemplateSumNumbers
};

export const TplSpecSumFromRegistry: TemplateSourcePrepared = {
  type: 'from-registry',
  registry: 'milaboratories',
  path: 'releases/v1/milaboratory/sum-numbers/0.0.2/template.plj.gz'
};
