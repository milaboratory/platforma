import PlNumberField from '../PlNumberField.vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

describe('NumberInput.vue', () => {
  it('renders correctly with default props', () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
      },
    });
    expect(wrapper.find('input').element.value).toBe('10');
  });

  it('displays the label when provided', () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
        label: 'Test Label',
      },
    });
    expect(wrapper.find('label').text()).toBe('Test Label');
  });

  it('increments the value when increment button is clicked', async () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
        step: 2,
      },
    });
    const incrementButton = wrapper.find('.mi-number-field__icons div:first-child');
    await incrementButton.trigger('click');
    console.log(incrementButton, wrapper.vm.modelValue)
    expect(wrapper.vm.modelValue).toEqual(12);
  });

  it('decrements the value when decrement button is clicked', async () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
        step: 1,
      },
    });
    const decrementButton = wrapper.find('.mi-number-field__icons div:last-child');
    await decrementButton.trigger('click');
    expect(wrapper.vm.modelValue).toEqual(9);
  });

  it('disables increment button when value exceeds maxValue', () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
        maxValue: 10,
      },
    });
    const incrementButton = wrapper.find('.mi-number-field__icons div:first-child');
    expect(incrementButton.classes()).toContain('disabled');
  });

  it('disables decrement button when value is below minValue', () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 1,
        minValue: 1,
      },
    });
    const decrementButton = wrapper.find('.mi-number-field__icons div:last-child');
    expect(decrementButton.classes()).toContain('disabled');
  });

  it('renders error messages when there are validation errors', () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 5,
        minValue: 10,
        errorMessage: 'Custom error message',
      },
    });
    expect(wrapper.find('.mi-number-field__hint').text()).toContain('Custom error message');
    expect(wrapper.find('.mi-number-field__hint').text()).toContain('Value must be higher than 10');
  });

  it('validates and updates the computedValue when the user types in the input field', async () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 5,
      },
    });
    const input = wrapper.find('input');
    await input.setValue('1.1.1');
    await input.trigger('focusout');
    expect(wrapper.vm.modelValue).toEqual(5);

    await input.setValue('15');
    await input.trigger('focusout');
    expect(wrapper.vm.modelValue).toEqual(15);

    await input.setValue('.');
    await input.trigger('focusout');
    expect(wrapper.vm.modelValue).toEqual(0);

    await input.setValue(',');
    await input.trigger('focusout');
    expect(wrapper.vm.modelValue).toEqual(0);

    await input.setValue('1,1');
    await input.trigger('focusout');
    expect(wrapper.vm.modelValue).toEqual(1.1);
    expect(input.element.value).toEqual('1.1');
  });

  it('update model with undefined when input is cleared', async () => {
    const wrapper = mount(PlNumberField, {
      props: {
        modelValue: 10,
      },
    });
    const input = wrapper.find('input');
    await input.setValue('');
    await input.trigger('focusout');
    expect(wrapper.vm.modelValue).toEqual(undefined);
  });
});
