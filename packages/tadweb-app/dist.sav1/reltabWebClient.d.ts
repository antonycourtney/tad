import { TransportClient } from "reltab";
export declare class WebTransportClient implements TransportClient {
    private baseUrl;
    constructor(baseUrl: string);
    invoke(functionName: string, encodedReq: string): Promise<string>;
}
