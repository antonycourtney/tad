export interface OkResult<T> {
  status: "Ok";
  value: T;
}

export interface ErrResult {
  status: "Err";
  errVal: Error;
}

export type Result<T> = OkResult<T> | ErrResult;
