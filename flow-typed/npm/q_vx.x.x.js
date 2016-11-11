// flow-typed signature: a5a365fe441d6c18d2d6ca609351b19f
// flow-typed version: <<STUB>>/q_v^1.4.1/flow_v0.33.0

declare module 'q' {
  declare class Promise<T> {
    then(f: (v: T) => any): Promise<T>;
  }

  declare class Deferred<T> {
    promise: Promise<T>;
    reject(errInfo: any): void;
    resolve(v: T): void;
  }

  declare class QLib {
    all<T>(promises: Array<Promise<T>>): Promise<Array<T>>;
    defer<T>(): Deferred<T>;
    nfcall<T>(f: any, ...rest: Array<any>): Promise<T>;
  }

  declare module.exports: QLib;
}

/**
 * We include stubs for each file inside this npm package in case you need to
 * require those files directly. Feel free to delete any files that aren't
 * needed.
 */
declare module 'q/q' {
  declare module.exports: any;
}

declare module 'q/queue' {
  declare module.exports: any;
}

// Filename aliases
declare module 'q/q.js' {
  declare module.exports: $Exports<'q/q'>;
}
declare module 'q/queue.js' {
  declare module.exports: $Exports<'q/queue'>;
}
