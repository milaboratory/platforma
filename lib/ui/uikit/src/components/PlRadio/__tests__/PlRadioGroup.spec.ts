import { describe, it, expect } from 'vitest';
import type { VueWrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import PlRadio from '../PlRadio.vue';
import PlRadioGroup from '../PlRadioGroup.vue';
import { h } from 'vue';

// --- Use objects as values ---
const VALUE_1 = { id: 1, name: 'one' };
const VALUE_2 = { id: 2, name: 'two' };
const VALUE_3 = { id: 3, name: 'three' };
const VALUE_A = { id: 'a', name: 'A' };
const VALUE_B = { id: 'b', name: 'B' };
const VALUE_4 = { id: 4, name: 'four' };

const OPTIONS = [
  { label: 'Option 1', value: VALUE_1 },
  { label: 'Option 2', value: VALUE_2 },
  { label: 'Option 3', value: VALUE_3, disabled: true },
];
// --- ---

describe('PlRadioGroup', () => {
  it('renders options correctly', () => {
    const wrapper = mount(PlRadioGroup, {
      props: {
        options: OPTIONS,
      },
    });

    // Simplify type casting for now, as InstanceType was problematic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const radios = wrapper.findAllComponents(PlRadio) as unknown as VueWrapper<any>[];

    expect(radios.length).toBe(OPTIONS.length);

    radios.forEach((radioWrapper, index) => {
      expect(radioWrapper.text()).toBe(OPTIONS[index].label);
      // Use toEqual for object comparison
      expect(radioWrapper.props('value')).toEqual(OPTIONS[index].value);
      expect(radioWrapper.props('disabled') ?? false).toBe(OPTIONS[index].disabled ?? false);
    });
  });

  it('handles v-model with options prop', async () => {
    const wrapper = mount(PlRadioGroup, {
      props: {
        'modelValue': VALUE_1, // Initial value is an object
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }),
        'options': OPTIONS,
      },
    });

    const radioInputs = wrapper.findAll('input[type="radio"]');
    expect(radioInputs.length).toBe(OPTIONS.length);

    // Check initial state
    expect((radioInputs[0].element as HTMLInputElement).checked).toBe(true);
    expect((radioInputs[1].element as HTMLInputElement).checked).toBe(false);

    // Click the second option
    await radioInputs[1].setValue(true); // Use setValue for radio inputs

    // Check updated state - use toEqual for objects
    expect(wrapper.props('modelValue')).toEqual(VALUE_2);
    expect((radioInputs[0].element as HTMLInputElement).checked).toBe(false);
    expect((radioInputs[1].element as HTMLInputElement).checked).toBe(true);
  });

  // TODO: fix this test
  it.skip('respects disabled options', async () => {
    const wrapper = mount(PlRadioGroup, {
      props: {
        'modelValue': VALUE_1, // Initial value is an object
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }),
        'options': OPTIONS,
      },
    });

    const radioInputs = wrapper.findAll<HTMLInputElement>('input[type="radio"]');
    expect((radioInputs[2].element as HTMLInputElement).disabled).toBe(true);

    // Try clicking the disabled option
    await radioInputs[2].setValue(true);

    // Model value should not change - use toEqual
    expect(wrapper.props('modelValue')).toEqual(VALUE_1);
    expect((radioInputs[0].element).checked ?? false).toBe(true);
    expect((radioInputs[2].element).checked ?? false).toBe(false);
  });

  it('assigns the name attribute correctly', () => {
    const groupName = 'test-group';
    const wrapper = mount(PlRadioGroup, {
      props: {
        name: groupName,
        options: OPTIONS,
      },
    });

    const radioInputs = wrapper.findAll('input[type="radio"]');
    radioInputs.forEach((input) => {
      expect(input.attributes('name')).toBe(groupName);
    });
  });

  it('renders default slot content', async () => {
    const wrapper = mount(PlRadioGroup, {
      props: {
        'modelValue': VALUE_A, // Initial value is an object
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }),
      },
      slots: {
        default: () => [
          // Use object values in slots
          h(PlRadio, { value: VALUE_A }, { default: () => 'Slot Option A' }),
          h(PlRadio, { value: VALUE_B }, { default: () => 'Slot Option B' }),
        ],
      },
    });

    const radios = wrapper.findAllComponents(PlRadio);
    expect(radios.length).toBe(2);
    expect(radios[0].text()).toBe('Slot Option A');
    expect(radios[1].text()).toBe('Slot Option B');

    const radioInputs = wrapper.findAll('input[type="radio"]');
    expect((radioInputs[0].element as HTMLInputElement).checked).toBe(true);

    await radioInputs[1].setValue(true);
    // Use toEqual for object comparison
    expect(wrapper.props('modelValue')).toEqual(VALUE_B);
    expect((radioInputs[1].element as HTMLInputElement).checked).toBe(true);
  });

  it('renders label slot content', () => {
    const labelText = 'My Radio Group Label';
    const wrapper = mount(PlRadioGroup, {
      slots: {
        label: () => labelText,
      },
    });

    const legend = wrapper.find('legend');
    expect(legend.exists()).toBe(true);
    expect(legend.text()).toBe(labelText);
  });

  it('combines options prop and default slot', () => {
    const wrapper = mount(PlRadioGroup, {
      props: {
        options: OPTIONS,
      },
      slots: {
        // Use object value in slot
        default: () => h(PlRadio, { value: VALUE_4 }, { default: () => 'Slot Option 4' }),
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const radiosCombined = wrapper.findAllComponents(PlRadio) as unknown as VueWrapper<any>[];
    expect(radiosCombined.length).toBe(OPTIONS.length + 1);
    // Use toEqual for object comparison
    expect(radiosCombined[0].props('value')).toEqual(OPTIONS[0].value);
    expect(radiosCombined[OPTIONS.length].props('value')).toEqual(VALUE_4);
    expect(radiosCombined[OPTIONS.length].text()).toBe('Slot Option 4');
  });
});
