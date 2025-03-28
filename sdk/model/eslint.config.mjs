import { common } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['**/*.test.ts'], // TODO: these files are excluded from tsconfig for some reason
  },
  ...common,
  {
    rules: {
      /**
       * IMPORTANCE: HIGH
       * Prevents using the 'any' type which defeats TypeScript's type checking.
       * 'any' undermines type safety, can hide bugs, and makes refactoring more difficult.
       * Currently disabled due to legacy code, but should be addressed as part of improving type safety.
       */
      '@typescript-eslint/no-explicit-any': 'off',

      /**
       * IMPORTANCE: HIGH
       * Prevents assigning values from 'any' type to more specific types without proper type checking.
       * Unsafe assignments can introduce runtime errors that TypeScript wouldn't catch.
       * Disabled to support legacy patterns, but should be fixed to ensure type safety.
       */
      '@typescript-eslint/no-unsafe-assignment': 'off',

      /**
       * IMPORTANCE: CRITICAL
       * Prevents calling functions or methods that are typed as 'any'.
       * This rule stops potential runtime errors from calling methods that don't exist.
       * Currently disabled to accommodate existing code patterns, but fixing these issues is critical.
       */
      '@typescript-eslint/no-unsafe-call': 'off',

      /**
       * IMPORTANCE: HIGH
       * Prevents accessing properties on values typed as 'any'.
       * Without this rule, you can access properties that might not exist at runtime.
       * Temporarily disabled to support legacy code, but should be addressed systematically.
       */
      '@typescript-eslint/no-unsafe-member-access': 'off',

      /**
       * IMPORTANCE: MEDIUM
       * Prevents passing values typed as 'any' to functions expecting specific types.
       * This can lead to unexpected behavior when functions receive incorrectly typed arguments.
       * Currently disabled but should be enabled after proper typing is implemented.
       */
      '@typescript-eslint/no-unsafe-argument': 'off',

      /**
       * IMPORTANCE: HIGH
       * Prevents returning 'any' typed values from functions with specific return types.
       * This ensures that functions return properly typed data as expected by consumers.
       * Disabled temporarily but should be addressed to maintain type integrity across boundaries.
       */
      '@typescript-eslint/no-unsafe-return': 'off',

      /**
       * IMPORTANCE: LOW
       * Prevents declaring empty object types ({}) which are often misused.
       * Empty object types don't behave as many developers expect and can be replaced with Record<string, unknown>.
       * Lower priority than the 'any'-related rules but should still be addressed for type clarity.
       */
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
];
