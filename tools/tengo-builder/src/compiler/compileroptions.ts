import type { TemplateDataV3, TemplateLibDataV3 } from '@milaboratories/pl-model-backend';
import type { CompilerOption } from './package';
import * as util from './util';

export function applyTemplateCompilerOptions(opts: CompilerOption[], tpl: TemplateDataV3) {
  for (const opt of opts) {
    switch (opt.name) {
      case 'hash_override': {
        tpl.hashOverride = hashOverride(opt.args);
        break;
      }
    }
  }
}

export function applyLibraryCompilerOptions(opts: CompilerOption[], lib: TemplateLibDataV3) {
  for (const opt of opts) {
    switch (opt.name) {
      case 'hash_override': {
        throw new Error(
          `hash_override compiler option can be used ONLY on template level. Even in templates it is already dangerous enough`
          + ` to potentially break everything in Platforma Backend. In libraries with the transitive dependencies`
          + ` resolution and flattening of libraries list on template level, it becomes so unpredictibally disasterous, that`
          + ` we are doomed to never find the ends of a knot if anything goes wrong.`,
        );
      }
    }
  }
}

export function hashOverride(args: string[]): string {
  if (args.length != 1) {
    throw new Error(
      'hash_override compiler option expects exactly one argument: hash_override <some string>. Note, you can use only UUID as a value.',
    );
  }

  const override = args[0].toLowerCase();

  if (!util.isUUID(override)) {
    throw new Error(
      'hash_override must contain valid UUID as an override. As hash_override affects deduplication,'
      + ' it becomes completely not possible to distinguish several different templates from each other on backend\'s side.'
      + ' This means, if you set hash_override to a simple value (say, letter "a") on two completely different templates,'
      + ' they will be marked as interchangeable on backend\'s side with unpredictable consequences.'
      + ' UUID looks like a safe enough tradeoff between the feature usage simplicity and duplication safety',
    );
  }

  return override;
}
