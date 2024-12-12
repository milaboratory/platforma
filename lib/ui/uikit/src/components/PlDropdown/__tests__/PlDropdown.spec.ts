import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import PlDropdown from '../PlDropdown.vue';
import { delay } from '@milaboratories/helpers';

describe('PlDropdown', () => {
  it('modelValue', async () => {
    const wrapper = mount(PlDropdown, {
      props: {
        'modelValue': 1,
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }),
        'options': [
          { text: 'Option 1', value: 1 },
          { text: 'Option 2', value: 2 },
        ],
      },
    });

    await wrapper.find('input').trigger('focus');

    const options = [...document.body.querySelectorAll('.dropdown-list-item')] as HTMLElement[];

    expect(options.length).toBe(2);

    options[1].click();

    await delay(20);

    expect(wrapper.props('modelValue')).toBe(2);

    expect(await wrapper.findAll('.dropdown-list-item').length).toBe(0); // options are closed after click
  });
});
