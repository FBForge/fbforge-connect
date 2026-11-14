// Destination API reply standards and public services are membership lists.
// Preserve duplicates and every other field so readback cannot hide content changes.
import { isDeepStrictEqual } from 'node:util';
function stable(value) {
  return Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, stable(value[key])]),
        )
      : value;
}
function normalized(value) {
  const copy = structuredClone(value);
  if (!Array.isArray(copy?.publicServices)) return copy;
  for (const service of copy.publicServices) {
    const standards = service?.replyChannels?.fitConnect?.processStandards;
    if (Array.isArray(standards)) standards.sort();
  }
  copy.publicServices.sort((a, b) => JSON.stringify(stable(a)).localeCompare(JSON.stringify(stable(b))));
  return copy;
}
export function sameDestinationOffers(left, right) {
  return isDeepStrictEqual(normalized(left), normalized(right));
}
