type PlaytimeTranslationKey = 'lastPlayed.never' | 'time.minutes' | 'time.hoursMinutes' | 'time.hours';

export function formatPlaytime(minutes: number, translate: (key: PlaytimeTranslationKey, params?: Record<string, any>) => string): string {
  const total = Math.max(0, Math.round(minutes || 0));
  if (total <= 0) return translate('lastPlayed.never');
  if (total < 60) return translate('time.minutes', { minutes: total });

  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0
    ? translate('time.hoursMinutes', { hours: h, minutes: m })
    : translate('time.hours', { hours: h });
}
