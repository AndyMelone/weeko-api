// Formats de dates et d'heures (français), portés de l'app mobile
// (../weeko/lib/core/utils/formats.dart). Les semaines sont des décalages par rapport
// à la semaine 0 : lundi 5 octobre 2026.

export const dayNamesShort = [
  'Lun.',
  'Mar.',
  'Mer.',
  'Jeu.',
  'Ven.',
  'Sam.',
  'Dim.',
];
export const dayNamesLong = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];
export const dayNamesLower = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
];
export const monthNames = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
export const monthShort = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

export function dateOf(week: number, day: number): Date {
  return new Date(Date.UTC(2026, 9, 5 + week * 7 + day));
}

/** 930 → « 15h30 », 900 → « 15h ». */
export function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m === 0 ? '' : String(m).padStart(2, '0')}`;
}

export const range = (a: number, b: number) => `${fmt(a)}–${fmt(b)}`;

/** « lun. 5 oct. » */
export function dayShort(week: number, day: number): string {
  const t = dateOf(week, day);
  return `${dayNamesShort[day].toLowerCase()} ${t.getUTCDate()} ${monthShort[t.getUTCMonth()]}`;
}

/** « Lundi 5 octobre » */
export function dayLong(week: number, day: number): string {
  const t = dateOf(week, day);
  return `${dayNamesLong[day]} ${t.getUTCDate()} ${monthNames[t.getUTCMonth()]}`;
}

/** « 5 – 11 octobre » ou « 26 oct. – 1 nov. » */
export function weekRange(week: number): string {
  const a = dateOf(week, 0);
  const b = dateOf(week, 6);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()} – ${b.getUTCDate()} ${monthNames[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${monthShort[a.getUTCMonth()]} – ${b.getUTCDate()} ${monthShort[b.getUTCMonth()]}`;
}

export function weekNum(week: number): number {
  const d = dateOf(week, 0);
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.round((d.getTime() - jan1.getTime()) / 86_400_000);
  // Dart : weekday 1 = lundi … 7 = dimanche.
  const jan1Weekday = jan1.getUTCDay() === 0 ? 7 : jan1.getUTCDay();
  return Math.ceil((days + (jan1Weekday % 7) + 1) / 7);
}

/** « 15:30 » → 930 ; vide → null. */
export function parseTime(v: string | null | undefined): number | null {
  if (!v) return null;
  const [h, m] = v.split(':');
  return Number(h) * 60 + Number(m);
}

/** 930 → « 15:30 » */
export function toHhMm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export const plural = (n: number, word: string) =>
  `${n} ${word}${n > 1 ? 's' : ''}`;
