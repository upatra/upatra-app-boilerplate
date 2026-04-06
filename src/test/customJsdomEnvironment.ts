import { TestEnvironment } from "jest-environment-jsdom";

/**
 * Custom jsdom environment that copies Node 18+ fetch globals into
 * the jsdom window. Required for MSW v2 which uses Response at module
 * load time.
 */
export default class CustomJsdomEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    // Copy Node's native fetch globals into the jsdom window global
    // "this.global" is the jsdom window; "globalThis" here is Node's globalThis
    const nodeFetch = globalThis.fetch;
    const nodeResponse = globalThis.Response;
    const nodeRequest = globalThis.Request;
    const nodeHeaders = globalThis.Headers;
    if (nodeResponse && !this.global.Response) {
      this.global.fetch = nodeFetch;
      this.global.Response = nodeResponse;
      this.global.Request = nodeRequest;
      this.global.Headers = nodeHeaders;
    }
  }
}
