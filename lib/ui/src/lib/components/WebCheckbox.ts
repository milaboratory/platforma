export default class WebCheckbox extends HTMLElement {
  constructor() {
    super();
    this.onCheck = this.onCheck.bind(this);
  }

  onCheck() {
    this.toggleAttribute('checked');
    this.dispatchEvent(new CustomEvent('change', {
      bubbles: true,
      detail: this.hasAttribute('checked')
    }));
  }

  static define(tag = 'web-checkbox') {
    if (!customElements.get(tag)) {
      customElements.define(tag, this)
    } else {
      console.log(`${tag} already defined`);
    }
  }

  shadowRoot = this.attachShadow({mode: 'open'})

  connectedCallback() {
    this.classList.add('ui-checkbox');
    this.addEventListener('click', this.onCheck);
    this.setAttribute('tabindex', '0');
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onCheck);
  }

  static get observedAttributes() {
    return ['checked', 'disabled'];
  }

  attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
    if (name === 'checked' && newValue === 'false') {
      this.removeAttribute('checked');
    }

    if (name === 'disabled') {
      this.classList.toggle('disabled', newValue === 'true')
    }
  }
}
