/**
 * Generic interface for simple, reliable remote function and method invocation.
 */

export interface TransportClient {
  invoke(functionName: string, encodedReq: string): Promise<string>;
}

export type EncodedRequestHandler = (encodedReq: string) => Promise<string>;

export interface TransportServer {
  registerInvokeHandler(
    functionName: string,
    handler: EncodedRequestHandler
  ): void;
}
