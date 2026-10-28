export function fictionalValues(schema, field = '') {
  const normalize = (text) =>
    String(text || '')
      .slice(0, 512)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .toLowerCase();
  const label = normalize(`${schema.title || ''} ${field}`);
  const hint = label.trim() || normalize(schema.description);
  const timestamp = schema.format === 'datetime' || schema.format === 'date-time';
  if (/geburtsdatum|birth.?date|date.?of.?birth|\bdob\b/.test(hint))
    return timestamp ? ['1985-04-12T00:00:00Z'] : ['1985-04-12', '12.04.1985'];
  if (/geburtsname|maiden.?name/.test(hint)) return ['Beispiel'];
  if (/vorname|first.?name|given.?name/.test(hint)) return ['Erika', 'Anna', 'Li'];
  if (/familienname|nachname|surname|last.?name/.test(hint)) return ['Mustermann'];
  if (/e.?mail/.test(hint)) return ['erika.mustermann@example.invalid'];
  if (/dateiname|file.?name/.test(hint)) return ['testanlage.pdf', 'beispiel.xml'];
  if (/telefon|phone|mobile|mobilnummer|fax/.test(hint))
    return ['+49 30 00000000', '+493000000000', '03000000000'];
  if (/postleitzahl|\bplz\b|postal.?code|post.?code|zip.?code/.test(hint)) return ['12345'];
  if (/hausnummerzusatz|house.?number.?suffix/.test(hint)) return ['a'];
  if (/hausnummer|house.?number/.test(hint)) return ['12'];
  if (/strasse|street/.test(hint)) return ['Musterstraße'];
  if (/geburtsort|wohnort|stadt|city|\bort\b|place.?of.?birth/.test(hint)) return ['Musterstadt'];
  if (/bundesland|federal.?state/.test(hint)) return ['Berlin'];
  if (/staatsangehorigkeit|nationality/.test(hint)) return ['deutsch', 'DE'];
  if (/\bland\b|country/.test(hint)) return ['Deutschland', 'DE'];
  if (/firma|unternehmen|organisation|organization|einrichtung|company/.test(hint))
    return ['Musterorganisation'];
  if (/\btitel\b|salutation/.test(hint)) return ['Dr.'];
  if (/\bname\b|full.?name/.test(hint)) return ['Erika Mustermann'];
  if (/datum|\bdate\b|zeitpunkt/.test(hint))
    return timestamp ? ['2025-06-18T10:30:00Z'] : ['2025-06-18', '18.06.2025'];
  if (/uhrzeit|\btime\b/.test(hint)) return ['10:30'];
  return schema.description ? fictionalValues({ title: schema.description, format: schema.format }) : [];
}
