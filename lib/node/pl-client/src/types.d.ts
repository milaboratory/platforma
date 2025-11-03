/* eslint-disable no-var */
declare module 'jest-environment-node' {

  export abstract class TestEnvironment {
    setup(): Promise<void>;
    handleTestEvent(event: any): void;
  }
}
