// Presets of 6 complementary card accent colors. Selected in Settings and
// applied as CSS custom properties (--accent-0..--accent-5) on the .app
// wrapper in App.jsx; TaskCard picks one deterministically per project via
// hashString (same pattern as AVATAR_COLORS).
export const COLOR_SCHEMES = {
  default: ['#e07a5f', '#3d5a80', '#81b29a', '#f2cc8f', '#9d8dc9', '#588157'],
  sunset: ['#f94144', '#f3722c', '#f8961e', '#f9c74f', '#f9844a', '#e07a5f'],
  ocean: ['#264653', '#2a9d8f', '#8ecae6', '#219ebc', '#023047', '#8ab17d'],
}

export const DEFAULT_COLOR_SCHEME = 'default'

export function colorsForScheme(name) {
  return COLOR_SCHEMES[name] || COLOR_SCHEMES[DEFAULT_COLOR_SCHEME]
}
