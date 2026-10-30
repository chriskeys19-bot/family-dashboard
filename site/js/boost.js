/** Deterministic daily picks. Same Pacific date + person always returns the same row. */
export const BOOST_EPOCH = '2026-01-01';

/** Shifted so two people never share an index on the same day while a list has more than one row. */
export const PERSON_SALT = {
  yuvan: 0,
  varun: 1,
  ben: 2,
  sangeetha: 3,
};

export function dayNumberFromISO(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [ey, em, ed] = BOOST_EPOCH.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ey, em - 1, ed)) / 86400000);
}

export function pickFromList(list, isoDate, salt) {
  const length = list?.length || 0;
  if (!length) return null;
  const index = ((dayNumberFromISO(isoDate) + salt) % length + length) % length;
  return { ...list[index], index };
}

export function boostForPerson(lists, person, isoDate) {
  const salt = PERSON_SALT[person.id] ?? 0;
  if (person.role === 'kid') {
    return {
      audience: 'kid',
      quote: pickFromList(lists.kid_quotes, isoDate, salt),
      joke: pickFromList(lists.jokes, isoDate, salt),
    };
  }
  return {
    audience: 'parent',
    quote: pickFromList(lists.parent_quotes, isoDate, salt),
    calm: pickFromList(lists.calm, isoDate, salt),
    tip: pickFromList(lists.tips, isoDate, salt),
  };
}
