/** Ages as people say them: infants are "a few months old", everyone else whole years. */
export function isInfant(years: number): boolean {
  return years < 1
}

/** "age 6", or "a few months old" under one */
export function ageLabel(years: number): string {
  return isInfant(years) ? 'a few months old' : `age ${Math.floor(years)}`
}

/** the bare number for compact rows ("Kaya · Sister · 10"), or "a few months" under one */
export function ageShort(years: number): string {
  return isInfant(years) ? 'a few months' : String(Math.floor(years))
}
