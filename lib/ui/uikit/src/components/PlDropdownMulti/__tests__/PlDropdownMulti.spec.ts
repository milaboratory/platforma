import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import PlDropdown from '../PlDropdownMulti.vue';
import { delay } from '@milaboratories/helpers';

describe('PlDropdownMulti', () => {
  it('modelValue', async () => {
    const wrapper = mount(PlDropdown, {
      props: {
        'modelValue': [1],
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }),
        'options': [
          { text: 'Option 1', value: 1 },
          { text: 'Option 2', value: 2 },
        ],
      },
    });

    await wrapper.find('input').trigger('focus');

    const getOptions = () => [...document.body.querySelectorAll('.dropdown-list-item')] as HTMLElement[];

    const options = getOptions();

    console.log('options', options);

    expect(options.length).toBe(2);

    options[1].click();

    await delay(20);

    expect(wrapper.props('modelValue')).toEqual([1, 2]);

    expect(getOptions().length).toBe(2); // options are not closed after click
  });
});
