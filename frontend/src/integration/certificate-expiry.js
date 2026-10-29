export function certificateExpiry(keys, now = Date.now()) {
  return keys
    .flatMap((key) => {
      const time = typeof key.expiresAt === 'string' ? Date.parse(key.expiresAt) : NaN;
      if (!Number.isFinite(time)) return [];
      const days = Math.ceil((time - now) / 86400000);
      return days <= 90
        ? [
            {
              kid: key.kid,
              expiresAt: key.expiresAt,
              days,
              urgency: time <= now ? 'expired' : days <= 30 ? 'urgent' : 'attention',
            },
          ]
        : [];
    })
    .sort((a, b) => a.days - b.days);
}
