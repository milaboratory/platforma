import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import PlDropdown from '../PlDropdownMulti.vue';

describe('PlDropdownMulti', () => {
  it('modelValue', async () => {
    const wrapper = mount(PlDropdown, {
      props: {
        modelValue: [1],
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }),
        options: [
          { text: 'Option 1', value: 1 },
          { text: 'Option 2', value: 2 },
        ],
      },
    });

    await wrapper.find('input').trigger('focus');

    expect(await wrapper.findAll('.dropdown-list-item').length).toBe(2);

    await wrapper
      .findAll('.dropdown-list-item')
      .filter((node) => node.text().match(/Option 2/))
      .at(0)
      ?.trigger('click');

    expect(wrapper.props('modelValue')).toEqual([1, 2]);

    expect(await wrapper.findAll('.dropdown-list-item').length).toBe(2); // options are not closed after click
  });
});