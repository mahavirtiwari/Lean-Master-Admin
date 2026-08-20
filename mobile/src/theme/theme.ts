/**
 * The scheme's palette, taken from the web portal so the two read as one
 * product. Green is chrome — the rail, the step marks, headings; blue is what
 * you press.
 */
export const colour = {
  green: '#0F7B45',
  greenDark: '#0C6839',
  greenTint: '#F0F8F3',
  greenLine: '#D9EBE1',

  blue: '#1B4F8A',
  blueDark: '#163F6F',
  blueTint: '#EFF4FA',
  blueLine: '#C3D8EE',

  text: '#16211A',
  body: '#47554C',
  muted: '#5D6B62',
  placeholder: '#93A29A',

  surface: '#FFFFFF',
  surfaceQuiet: '#FAFCFB',
  page: '#F4F7F5',
  line: '#DEE7E1',
  input: '#C6D3CB',

  danger: '#B91C1C',
  dangerTint: '#FDF1F1',

  bronze: '#C2410C',
  silver: '#5D6B62',
  gold: '#A16207',
} as const;

/**
 * A phone is held further from the eye than a monitor is, and these screens are
 * filled in by people who do not use the portal daily, so the scale sits above
 * the web's rather than matching it point for point.
 */
export const type = {
  hero: 26,
  title: 20,
  section: 17,
  body: 15,
  small: 13,
  label: 12,
  tiny: 11,
} as const;

/** Four-point grid, as the web uses. */
export const space = (n: number): number => n * 4;

export const radius = { sm: 6, md: 8, lg: 10, pill: 999 } as const;
