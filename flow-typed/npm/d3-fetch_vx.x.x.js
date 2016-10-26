// flow-typed signature: 612ca8185b8f4d6f76c986e98c908c3a
// flow-typed version: <<STUB>>/d3-fetch_v0.0.2/flow_v0.33.0

import type {Promise} from 'q'

declare module 'd3-fetch' {
  declare class D3Fetch {
    json(url: string): Promise<any>;
  }

  declare module.exports: D3Fetch;
}

/**
 * We include stubs for each file inside this npm package in case you need to
 * require those files directly. Feel free to delete any files that aren't
 * needed.
 */
declare module 'd3-fetch/dist/d3-fetch' {
  declare module.exports: any;
}

declare module 'd3-fetch/dist/d3-fetch.min' {
  declare module.exports: any;
}

declare module 'd3-fetch/src/csv' {
  declare module.exports: any;
}

declare module 'd3-fetch/src/image' {
  declare module.exports: any;
}

declare module 'd3-fetch/src/json' {
  declare module.exports: any;
}

declare module 'd3-fetch/src/text' {
  declare module.exports: any;
}

declare module 'd3-fetch/src/tsv' {
  declare module.exports: any;
}

// Filename aliases
declare module 'd3-fetch/dist/d3-fetch.js' {
  declare module.exports: $Exports<'d3-fetch/dist/d3-fetch'>;
}
declare module 'd3-fetch/dist/d3-fetch.min.js' {
  declare module.exports: $Exports<'d3-fetch/dist/d3-fetch.min'>;
}
declare module 'd3-fetch/index' {
  declare module.exports: $Exports<'d3-fetch'>;
}
declare module 'd3-fetch/index.js' {
  declare module.exports: $Exports<'d3-fetch'>;
}
declare module 'd3-fetch/src/csv.js' {
  declare module.exports: $Exports<'d3-fetch/src/csv'>;
}
declare module 'd3-fetch/src/image.js' {
  declare module.exports: $Exports<'d3-fetch/src/image'>;
}
declare module 'd3-fetch/src/json.js' {
  declare module.exports: $Exports<'d3-fetch/src/json'>;
}
declare module 'd3-fetch/src/text.js' {
  declare module.exports: $Exports<'d3-fetch/src/text'>;
}
declare module 'd3-fetch/src/tsv.js' {
  declare module.exports: $Exports<'d3-fetch/src/tsv'>;
}
