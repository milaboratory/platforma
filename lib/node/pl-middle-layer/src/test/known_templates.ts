import { TemplateSpecPrepared } from '../model/template_spec';
import { ExplicitTemplateEnterNumbers, ExplicitTemplateSumNumbers } from './explicit_templates';

export const TplSpecEnterExplicit: TemplateSpecPrepared = {
  type: 'explicit',
  content: ExplicitTemplateEnterNumbers
};

export const TplSpecEnterFromRegistry: TemplateSpecPrepared = {
  type: 'from-registry',
  registry: 'milaboratories',
  path: 'v1/milaboratory/enter-numbers/0.4.1/template.plj.gz'
};

export const TplSpecSumExplicit: TemplateSpecPrepared = {
  type: 'explicit',
  content: ExplicitTemplateSumNumbers
};

export const TplSpecSumFromRegistry: TemplateSpecPrepared = {
  type: 'from-registry',
  registry: 'milaboratories',
  path: 'v1/milaboratory/sum-numbers/0.4.2/template.plj.gz'
};
