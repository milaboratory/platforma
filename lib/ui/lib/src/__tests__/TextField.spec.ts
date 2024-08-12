import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import TextField from '../components/TextField.vue';

describe('TextField', () => {
  it('renders properly', () => {
    const wrapper = mount(TextField, {
      props: {
        label: 'TextField Label',
      },
      slots: {
        default: 'Button text',
      },
    });
    expect(wrapper.text()).toContain('TextField Label');
  });

  it('modelValue', async () => {
    const wrapper = mount(TextField, {
      props: {
        modelValue: 'initialText',
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }),
      },
    });

    await wrapper.find('input').setValue('test');
    expect(wrapper.props('modelValue')).toBe('test');
  });
});
