import { TestEnvironment } from 'jest-environment-node';

class Env extends TestEnvironment {
  async setup() {
    await super.setup();
  }

  handleTestEvent(event: any) {
    // These events are emitted by jest-circus when something escapes the test
    if (event.name === 'unhandled_error' || event.name === 'error' || event.name === 'test_fn_failure') {
      const err = event.error;
      const msg = err && err.stack ? err.stack : String(err);
      // Bypass Jest's console patching:
      process.stderr.write(`\n=== JEST UNHANDLED ERROR ===\n${msg}\n`);
    }
  }
}

module.exports = Env;
