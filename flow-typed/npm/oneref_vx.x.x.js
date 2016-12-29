// flow-typed signature: d4453e0ed538df680434853e4dccb10f
// flow-typed version: <<STUB>>/oneref_v0.2.1/flow_v0.36.0

declare module 'oneref' {
  declare class Ref<T> extends EventEmitter {
    constructor(v: T): void;  // eslint-disable-line
    getValue(): T;
    setValue(v: T): void;
  }
  declare function refUpdater<A>(r: Ref<A>): (uf: (a: A) => A) => void
}

/**
 * We include stubs for each file inside this npm package in case you need to
 * require those files directly. Feel free to delete any files that aren't
 * needed.
 */
declare module 'oneref/lib/AppContainer' {
  declare module.exports: any;
}

declare module 'oneref/lib/index' {
  declare module.exports: any;
}

declare module 'oneref/lib/oneRef' {
  declare module.exports: any;
}

declare module 'oneref/src/AppContainer' {
  declare module.exports: any;
}

declare module 'oneref/src/index' {
  declare module.exports: any;
}

declare module 'oneref/src/oneRef' {
  declare module.exports: any;
}

// Filename aliases
declare module 'oneref/lib/AppContainer.js' {
  declare module.exports: $Exports<'oneref/lib/AppContainer'>;
}
declare module 'oneref/lib/index.js' {
  declare module.exports: $Exports<'oneref/lib/index'>;
}
declare module 'oneref/lib/oneRef.js' {
  declare module.exports: $Exports<'oneref/lib/oneRef'>;
}
declare module 'oneref/src/AppContainer.js' {
  declare module.exports: $Exports<'oneref/src/AppContainer'>;
}
declare module 'oneref/src/index.js' {
  declare module.exports: $Exports<'oneref/src/index'>;
}
declare module 'oneref/src/oneRef.js' {
  declare module.exports: $Exports<'oneref/src/oneRef'>;
}
