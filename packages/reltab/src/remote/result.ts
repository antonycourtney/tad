export interface OkResult<T> {
  status: "Ok";
  value: T;
}

export interface ErrResult<T> {
  status: "Err";
  errVal: T;
}

export type Result<T> = OkResult<T> | ErrResult<T>;
