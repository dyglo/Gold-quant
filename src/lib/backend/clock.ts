export function dateOnly(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('INVALID_DATE');
  return value;
}
export const addDays = (day: string, n: number) => new Date(Date.parse(dateOnly(day)) + n * 86400000).toISOString().slice(0, 10);
export function nyDate(time: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
}
// Offset iteration handles DST without fixed UTC assumptions. Hours used here
// (00:00, 17:00) are never in the spring/fall ambiguous interval.
export function nyTime(day: string, hour = 17): string {
  const target = Date.parse(`${dateOnly(day)}T${String(hour).padStart(2, '0')}:00:00Z`);
  let utc = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' }).formatToParts(utc);
    const offset = parts.find(p => p.type === 'timeZoneName')!.value.match(/GMT([+-])(\d{2}):(\d{2})/)!;
    const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1);
    utc = target - minutes * 60000;
  }
  return new Date(utc).toISOString();
}
export function parseAsOf(value: string | null, now = new Date()): string {
  if (value === null || value === '') return new Date(Math.floor(+now / 60000) * 60000).toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('INVALID_AS_OF');
  dateOnly(value.slice(0, 10));
  if (Date.parse(value) > +now || Date.parse(value) < Date.parse('2000-01-01')) throw new Error('INVALID_AS_OF');
  return new Date(value).toISOString();
}
