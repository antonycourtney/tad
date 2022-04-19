import log from "loglevel";
import * as reltab from "reltab";
import * as electron from "electron";
import { ipcRenderer } from "electron";
import { TransportClient } from "reltab";

// TODO: Exception handling!
export class ElectronTransportClient implements TransportClient {
  invoke(functionName: string, req: any): Promise<any> {
    return ipcRenderer.invoke(functionName, req);
  }
}
