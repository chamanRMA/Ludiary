/** ADR 89 point 4: the date a copy was made, from its file name (the id). null if the name has no date. */
export function backupDate(id: string): number | null {
  const user = /^ludiary-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-/.exec(id);
  if (user) {
    const [y, mo, d, h, mi, s, ms] = user.slice(1, 8).map(Number) as [number, number, number, number, number, number, number];
    return Date.UTC(y, mo - 1, d, h, mi, s, ms);
  }
  const internal = /^pre-(?:migration|restore)-(\d{15})/.exec(id);
  return internal ? Number(internal[1]) : null;
}
