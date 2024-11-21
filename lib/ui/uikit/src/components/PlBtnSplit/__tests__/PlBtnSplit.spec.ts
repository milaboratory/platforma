import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import PlBtnSplit from '../PlBtnSplit.vue';

describe('PlBtnSplit.vue', () => {
  it('Renders correctly with options', () => {
    const wrapper = mount(PlBtnSplit, {
      props: {
        options: [
          { label: 'Option 1', value: 'opt1' },
          { label: 'Option 2', value: 'opt2' },
        ],
        disabled: false,
        modelValue: 'opt1',
      },
    });

    expect(wrapper.text()).toContain('Option 1');
  });

  it('Toggles dropdown on menu activator click', async () => {
    const wrapper = mount(PlBtnSplit, {
      props: {
        modelValue: 'opt1',
        options: [
          { label: 'Option 1', value: 'opt1' },
          { label: 'Option 2', value: 'opt2' },
        ],
      },
    });

    const menuActivator = wrapper.find('.pl-btn-split__icon-container');

    console.log(menuActivator);
    await menuActivator.trigger('click');

    const dropdown = document.body.querySelector('.pl-dropdown__options');
    expect(dropdown).toBeTruthy();
    expect(dropdown?.textContent).toContain('Option 1');
    expect(dropdown?.textContent).not.toContain('Option 3');

    //Hide dropdown on focusout
    wrapper.trigger('focusout');
    await wrapper.vm.$nextTick();

    // Убедимся, что dropdown закрылся
    expect(document.body.querySelector('.pl-dropdown__options')).toBeFalsy();
  });

  it('Emits click event when button is clicked', async () => {
    const clickHandler = vi.fn();

    const wrapper = mount(PlBtnSplit, {
      props: {
        modelValue: undefined,
        options: [],
      },
      attrs: {
        onclick: clickHandler,
      },
    });

    const button = wrapper.find('.pl-btn-split__title');
    await button.trigger('click');
    expect(wrapper.emitted('click')).toBeTruthy();
    expect(clickHandler).toHaveBeenCalled();
  });

  it('Updates modelValue on option select', async () => {
    const wrapper = mount(PlBtnSplit, {
      props: {
        modelValue: 'opt1',
        options: [
          { label: 'Option 1', value: 'opt1' },
          { label: 'Option 2', value: 'opt2' },
        ],
      },
    });

    await wrapper.setProps({ modelValue: 'opt2' });
    expect(wrapper.text()).toContain('Option 2');

    await wrapper.setProps({ modelValue: undefined });
    expect(wrapper.text()).toContain('');
  });

  it('Handles keyboard navigation correctly', async () => {
    const wrapper = mount(PlBtnSplit, {
      props: {
        modelValue: 'opt1',
        options: [
          { label: 'Option 1', value: 'opt1' },
          { label: 'Option 2', value: 'opt2' },
        ],
      },
    });

    const root = wrapper.find('.pl-btn-split');
    await root.trigger('keydown', { code: 'ArrowDown' });

    expect(wrapper.vm.data.activeIndex).toBe(0);

    await root.trigger('keydown', { code: 'ArrowDown' });

    expect(wrapper.vm.data.activeIndex).toBe(1);

    await root.trigger('keydown', { code: 'Enter' });
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['opt2']);
  });

  it('Loading status by empty options and display dots "..."', async () => {
    const wrapper = mount(PlBtnSplit, {
      props: {
        modelValue: 'opt1',
        options: undefined,
      },
    });

    expect(wrapper.classes().includes('loading')).toBe(true);
    const button = wrapper.find('.pl-btn-split__title');
    expect(button.text()).toBe('...');
  });

  it('Loading status by empty options and empty model display dots "..."', async () => {
    const wrapper = mount(PlBtnSplit, {
      props: {
        modelValue: undefined,
        options: undefined,
      },
    });

    expect(wrapper.classes().includes('loading')).toBe(true);
    expect(wrapper.classes().includes('disabled')).toBe(true);
    const button = wrapper.find('.pl-btn-split__title');
    expect(button.text()).toBe('...');
  });

  it('No dots with undefined model', async () => {
    const wrapper = mount(PlBtnSplit, {
      props: {
        modelValue: undefined,
        options: [
          { label: 'Option 1', value: 'opt1' },
          { label: 'Option 2', value: 'opt2' },
        ],
      },
    });

    expect(wrapper.classes().includes('loading')).toBe(false);
    expect(wrapper.classes().includes('disabled')).toBe(false);
    const button = wrapper.find('.pl-btn-split__title');
    expect(button.text()).toBe('');
  });

  it('Loading props', async () => {
    const wrapper = mount(PlBtnSplit, {
      props: {
        modelValue: 'opt1',
        loading: true,
        options: [
          { label: 'Option 1', value: 'opt1' },
          { label: 'Option 2', value: 'opt2' },
        ],
      },
    });

    expect(wrapper.classes().includes('loading')).toBe(true);
    expect(wrapper.classes().includes('disabled')).toBe(true);
    const button = wrapper.find('.pl-btn-split__title');
    expect(button.text()).toBe('Option 1');

    wrapper.setProps({ loading: false });
    await wrapper.vm.$nextTick();

    expect(wrapper.classes().includes('loading')).toBe(false);
    expect(wrapper.classes().includes('disabled')).toBe(false);
    expect(button.text()).toBe('Option 1');
  });
});
