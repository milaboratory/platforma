import { describe, it, expect } from 'vitest';
import { RuntimeCapabilities, IncompatibleFlagsError } from './flag_utils';
import type { BlockCodeFeatureFlags } from './block_flags';

describe('RuntimeCapabilities', () => {
  describe('addSupportedRequirement', () => {
    it('should add a supported requirement with default value true', () => {
      const capabilities = new RuntimeCapabilities();
      capabilities.addSupportedRequirement('requiresModelAPIVersion');
      const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: true };
      expect(capabilities.checkCompatibility(blockFlags)).toBe(true);
    });

    it('should add a supported requirement with a specific boolean value', () => {
        const capabilities = new RuntimeCapabilities();
        capabilities.addSupportedRequirement('requiresModelAPIVersion', false);
        const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: false };
        expect(capabilities.checkCompatibility(blockFlags)).toBe(true);
        const blockFlags2: BlockCodeFeatureFlags = { requiresModelAPIVersion: true };
        expect(capabilities.checkCompatibility(blockFlags2)).toBe(false);
    });

    it('should add a supported requirement with a specific number value', () => {
        const capabilities = new RuntimeCapabilities();
        capabilities.addSupportedRequirement('requiresModelAPIVersion', 2);
        const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: 2 };
        expect(capabilities.checkCompatibility(blockFlags)).toBe(true);
        const blockFlags2: BlockCodeFeatureFlags = { requiresModelAPIVersion: 3 };
        expect(capabilities.checkCompatibility(blockFlags2)).toBe(false);
    });

    it('should allow chaining', () => {
        const capabilities = new RuntimeCapabilities();
        capabilities.addSupportedRequirement('requiresModelAPIVersion').addSupportedRequirement('requiresUIAPIVersion');
        const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: true, requiresUIAPIVersion: true };
        expect(capabilities.checkCompatibility(blockFlags)).toBe(true);
    });

    it('should support multiple values for the same requirement', () => {
      const capabilities = new RuntimeCapabilities();
      capabilities.addSupportedRequirement('requiresModelAPIVersion', 2);
      capabilities.addSupportedRequirement('requiresModelAPIVersion', 3);
      const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: 2 };
      expect(capabilities.checkCompatibility(blockFlags)).toBe(true);
      const blockFlags2: BlockCodeFeatureFlags = { requiresModelAPIVersion: 3 };
      expect(capabilities.checkCompatibility(blockFlags2)).toBe(true);
      const blockFlags3: BlockCodeFeatureFlags = { requiresModelAPIVersion: 4 };
      expect(capabilities.checkCompatibility(blockFlags3)).toBe(false);
    });
  });

  describe('checkCompatibility and getIncompatibleFlags', () => {
    it('should return compatible for undefined flags', () => {
      const capabilities = new RuntimeCapabilities();
      expect(capabilities.checkCompatibility(undefined)).toBe(true);
      expect(capabilities.getIncompatibleFlags(undefined)).toBeUndefined();
    });

    it('should return compatible for empty flags object', () => {
      const capabilities = new RuntimeCapabilities();
      expect(capabilities.checkCompatibility({})).toBe(true);
      expect(capabilities.getIncompatibleFlags({})).toBeUndefined();
    });

    it('should be compatible if requirements are met', () => {
      const capabilities = new RuntimeCapabilities()
        .addSupportedRequirement('requiresModelAPIVersion')
        .addSupportedRequirement('requiresUIAPIVersion', 2);
      const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: true, requiresUIAPIVersion: 2, supportsSomething: true };
      expect(capabilities.checkCompatibility(blockFlags)).toBe(true);
      expect(capabilities.getIncompatibleFlags(blockFlags)).toBeUndefined();
    });

    it('should be incompatible if a requirement value is not met', () => {
        const capabilities = new RuntimeCapabilities().addSupportedRequirement('requiresModelAPIVersion', 2);
        const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: 3 };
        expect(capabilities.checkCompatibility(blockFlags)).toBe(false);
        const incompatible = capabilities.getIncompatibleFlags(blockFlags);
        expect(incompatible).toEqual(new Map([['requiresModelAPIVersion', 3]]));
    });

    it('should be incompatible if a requirement is not specified in runtime capabilities', () => {
      const capabilities = new RuntimeCapabilities();
      const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: true };
      expect(capabilities.checkCompatibility(blockFlags)).toBe(false);
      const incompatible = capabilities.getIncompatibleFlags(blockFlags);
      expect(incompatible).toEqual(new Map([['requiresModelAPIVersion', true]]));
    });

    it('should correctly identify multiple incompatible flags', () => {
      const capabilities = new RuntimeCapabilities()
        .addSupportedRequirement('requiresModelAPIVersion', true)
        .addSupportedRequirement('requiresUIAPIVersion', 2);

      const blockFlags: BlockCodeFeatureFlags = {
        requiresModelAPIVersion: false,
        requiresUIAPIVersion: 3,
        requiresSomethingElse: true,
      };

      expect(capabilities.checkCompatibility(blockFlags)).toBe(false);
      const incompatible = capabilities.getIncompatibleFlags(blockFlags);
      expect(incompatible).toEqual(new Map<string, number | boolean>([
        ['requiresModelAPIVersion', false],
        ['requiresUIAPIVersion', 3],
        ['requiresSomethingElse', true],
      ]));
    });

    it('should ignore non-requirement flags', () => {
        const capabilities = new RuntimeCapabilities();
        const blockFlags: BlockCodeFeatureFlags = { supportsSomething: true };
        expect(capabilities.checkCompatibility(blockFlags)).toBe(true);
        expect(capabilities.getIncompatibleFlags(blockFlags)).toBeUndefined();
    });

    it('should ignore undefined requirement flags in block', () => {
        const capabilities = new RuntimeCapabilities();
        const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: undefined };
        expect(capabilities.checkCompatibility(blockFlags)).toBe(true);
        expect(capabilities.getIncompatibleFlags(blockFlags)).toBeUndefined();
    });

    it('should be incompatible if a requirement is not defined in capabilities', () => {
      const capabilities = new RuntimeCapabilities(); // No requirements added.
      const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: 1 };
      expect(capabilities.checkCompatibility(blockFlags)).toBe(false);
      const incompatible = capabilities.getIncompatibleFlags(blockFlags);
      expect(incompatible).toEqual(new Map([['requiresModelAPIVersion', 1]]));
    });
  });

  describe('throwIfIncompatible', () => {
    it('should not throw if flags are compatible', () => {
      const capabilities = new RuntimeCapabilities().addSupportedRequirement('requiresModelAPIVersion');
      const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: true };
      expect(() => capabilities.throwIfIncompatible(blockFlags)).not.toThrow();
    });

    it('should throw IncompatibleFlagsError if flags are incompatible', () => {
      const capabilities = new RuntimeCapabilities().addSupportedRequirement('requiresModelAPIVersion');
      const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: false };
      expect(() => capabilities.throwIfIncompatible(blockFlags)).toThrow(IncompatibleFlagsError);
    });

    it('should throw with an error containing incompatible flags', () => {
      const capabilities = new RuntimeCapabilities().addSupportedRequirement('requiresModelAPIVersion', 1);
      const blockFlags: BlockCodeFeatureFlags = { requiresModelAPIVersion: 2 };
      try {
        capabilities.throwIfIncompatible(blockFlags);
        // fail test if it doesn't throw
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(IncompatibleFlagsError);
        if (e instanceof IncompatibleFlagsError) {
          expect(e.incompatibleFlags).toEqual(new Map([['requiresModelAPIVersion', 2]]));
          expect(e.message).toContain('requiresModelAPIVersion: 2');
        }
      }
    });
  });
});
