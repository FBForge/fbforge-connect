// Unknown schema annotations are allowed. Recognizable API errors are not schemas.
const constraints = new Set([
  'type',
  '$ref',
  '$dynamicRef',
  '$recursiveRef',
  'properties',
  'patternProperties',
  'additionalProperties',
  'unevaluatedProperties',
  'propertyNames',
  'required',
  'dependencies',
  'dependentRequired',
  'dependentSchemas',
  'items',
  'prefixItems',
  'additionalItems',
  'unevaluatedItems',
  'contains',
  'minContains',
  'maxContains',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'enum',
  'const',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
]);
export function assertSchemaAvailable(schema) {
  if (typeof schema === 'boolean') return;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('schema_unavailable');
  if (
    Object.keys(schema).some(
      (key) =>
        constraints.has(key) &&
        (key !== 'type' ||
          (Array.isArray(schema.type) ? schema.type : [schema.type]).every((type) =>
            ['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'].includes(type),
          )),
    )
  )
    return;
  const error = schema.error;
  const httpError = (value) => /^([45]\d{2})$/.test(String(value));
  if (
    (schema.result === 'error' && error !== undefined && error !== null) ||
    (httpError(schema.status) &&
      (typeof schema.title === 'string' || typeof schema.message === 'string' || error)) ||
    (error &&
      typeof error === 'object' &&
      httpError(error.code) &&
      (typeof error.msg === 'string' || typeof error.message === 'string'))
  )
    throw new Error('schema_unavailable');
}
