const styles = new CSSStyleSheet();

styles.replaceSync(`
  :host {
    font-size: var(--font-size-3);
    font-style: italic;
  }
`);

export class WebStopWatchElement extends HTMLElement {
  static define(tag = 'web-stop-watch') {
    customElements.define(tag, this);
  }

  // Give this element its own encapsulated DOM
  shadowRoot = this.attachShadow({ mode: 'open' });

  // Initialize private state
  #start = Date.now();

  connectedCallback() {
    // Add the shared styles
    this.shadowRoot.adoptedStyleSheets = [styles];

    // Start the timer
    this.#tick();
  }

  #tick() {
    const milliseconds = Date.now() - this.#start;
    const minutes = String(Math.floor(milliseconds / (1000 * 60))).padStart(2, '0');
    const seconds = String(Math.floor((milliseconds / 1000) % 60)).padStart(2, '0');
    const hundredths = String(Math.floor((milliseconds % 1000) / 10)).padStart(2, '0');

    this.shadowRoot.replaceChildren(`${minutes}:${seconds}:${hundredths}`);

    // Schedule next update
    requestAnimationFrame(() => this.#tick());
  }
}

// Register the element with the Custom Element Registry
WebStopWatchElement.define();
