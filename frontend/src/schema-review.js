// Read native validation locations separately from schema annotations and field values.
export function readSchemaReview(document) {
  if (typeof document !== 'string' || document.length > 8 * 1024 * 1024) return null;
  try {
    const review = JSON.parse(document)?.validation;
    if (
      !review ||
      !['valid', 'invalid'].includes(review.status) ||
      !Array.isArray(review.errors) ||
      review.errors.length > 128
    )
      return null;
    if (
      review.errors.some(
        (error) =>
          !error ||
          typeof error.path !== 'string' ||
          error.path.length > 2048 ||
          typeof error.keyword !== 'string' ||
          error.keyword.length > 128 ||
          typeof error.message !== 'string' ||
          error.message.length > 1024 ||
          !Number.isSafeInteger(error.line) ||
          error.line < 0 ||
          !Number.isSafeInteger(error.column) ||
          error.column < 0,
      )
    )
      return null;
    if ((review.status === 'valid') !== (review.errors.length === 0)) return null;
    return review;
  } catch {
    return null;
  }
}

export function schemaSources(document) {
  try {
    const packet = JSON.parse(document);
    if (Array.isArray(packet.schemas))
      return packet.schemas.map((file) => `${file.name}\n${file.text}`).join('\n\n');
    if (packet.documents) return JSON.stringify(packet.documents, null, 2);
  } catch {
    /* No schema snapshot is available. */
  }
  return '';
}
