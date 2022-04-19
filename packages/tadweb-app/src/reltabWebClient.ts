import log from "loglevel";
import * as reltab from "reltab";
import { TransportClient } from "reltab";

async function request(baseUrl: string, path: string, args: any): Promise<any> {
  const url = baseUrl + path;
  const response = await fetch(url, {
    method: "post",
    body: JSON.stringify(args),
    headers: { "Content-Type": "application/json" },
  });
  return response.json();
}

const INVOKE_PATH = "/tadweb/invoke";

export class WebTransportClient implements TransportClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async invoke(functionName: string, encodedReq: string): Promise<string> {
    const invokeArgs = { functionName, encodedReq };
    const resStr = request(this.baseUrl, INVOKE_PATH, invokeArgs);
    return resStr;
  }
}
