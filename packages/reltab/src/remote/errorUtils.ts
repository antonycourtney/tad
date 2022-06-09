export function serializeError(err: Error): Error {
  const { name, message, stack } = err;
  const rep = { name, message, stack };
  return rep;
}

export function deserializeError(errObj: Error): Error {
  const { name, message, stack } = errObj;
  const ret = new Error(message);
  ret.name = name;
  ret.stack = stack;
  return ret;
}
