import type { TemplateSpecPrepared } from "../model/template_spec";
import { ExplicitTemplateEnterNumbers, ExplicitTemplateSumNumbers } from "./explicit_templates";

// Base64 snapshots of packs published to the v1 registry, so gzip.
export const TplSpecEnterExplicit: TemplateSpecPrepared = {
  type: "explicit",
  content: ExplicitTemplateEnterNumbers,
  codec: "gzip",
};

export const TplSpecEnterFromRegistry: TemplateSpecPrepared = {
  type: "from-registry",
  registry: "milaboratories",
  path: "v1/milaboratory/enter-numbers/0.4.1/template.plj.gz",
};

export const TplSpecSumExplicit: TemplateSpecPrepared = {
  type: "explicit",
  content: ExplicitTemplateSumNumbers,
  codec: "gzip",
};

export const TplSpecSumFromRegistry: TemplateSpecPrepared = {
  type: "from-registry",
  registry: "milaboratories",
  path: "v1/milaboratory/sum-numbers/0.4.2/template.plj.gz",
};
