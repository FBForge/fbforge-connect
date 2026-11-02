/** Runtime narrowing for untrusted native/file data. Types never replace validation. */
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function exactKeys<K extends string>(
  value: unknown,
  fields: readonly K[],
): value is Record<K, unknown> {
  return (
    record(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}
export function uuid(value: unknown, ignoreCase = true): value is string {
  return (
    typeof value === 'string' &&
    (ignoreCase
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    ).test(value)
  );
}
export function text(value: unknown, max: number, min = 1): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}
export function protocolError(): never {
  throw new Error('engine_protocol_error');
}
