import { useValidation } from '@/composition/useValidation';
import { describe } from 'node:test';
import { expect, test } from 'vitest';
import { ref } from 'vue';

describe('Test useValidation', () => {
  test('Empty rules', () => {
    const model = ref('12345');
    const rules: ((v: string) => boolean | string)[] = [];

    const validationData = useValidation(model, rules);

    expect(validationData.value).to.have.property('isValid');
    expect(validationData.value.isValid).to.equal(true);
  });

  test('Check correct', () => {
    const model = ref('12345');
    const rules: ((v: string) => boolean | string)[] = [
      (v: string) => v.length === 5 || 'Length must be 5',
    ];

    const validationData = useValidation(model, rules);

    expect(validationData.value).to.have.property('isValid');
    expect(validationData.value.isValid).to.equal(true);

    expect(validationData.value).to.have.property('errors');
    expect(validationData.value.errors.length).to.equal(0);
  });

  test('Check errors', () => {
    const model = ref('12345');
    const rules: ((v: string) => boolean | string)[] = [
      (v: string) => v.length > 5 || 'Length must be 5',
      (v: string) => v.length > 5 || 'Length must be 5 second message',
    ];

    const validationData = useValidation(model, rules);

    expect(validationData.value).to.have.property('isValid');
    expect(validationData.value.isValid).to.equal(false);

    expect(validationData.value.errors).toEqual([
      'Length must be 5',
      'Length must be 5 second message',
    ]);
  });

  test('Check value changes', () => {
    const model = ref('12345');
    const rules: ((v: string) => boolean | string)[] = [
      (v: string) => v.length === 5 || 'Length must be 5!!!',
    ];

    const validationData = useValidation(model, rules);

    expect(validationData.value).to.have.property('isValid');
    expect(validationData.value.isValid).to.equal(true);

    model.value = '098';
    expect(validationData.value.isValid).to.equal(false);
    expect(validationData.value.errors).toEqual(['Length must be 5!!!']);
  });

  test('should return multiple error messages', () => {
    const value = ref('no');
    const rules = [
      (v: string) => v.length > 3 || 'Must be longer than 3 characters',
      (v: string) => v.includes('@') || 'Must include "@" symbol',
    ];
    const validation = useValidation(value, rules);

    expect(validation.value.isValid).toBe(false);
    expect(validation.value.errors).toEqual([
      'Must be longer than 3 characters',
      'Must include "@" symbol',
    ]);
  });
});
