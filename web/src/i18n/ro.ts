/* Romanian is the source language: every key starts here, and en.ts must
   provide the same keys (the type checker enforces it). `{name}` marks a value
   filled in by t(key, { name }). */

export const ro = {
  // Language and theme controls
  'language.switch': 'Switch to English',
  'language.short': 'EN',
  'theme.toDark': 'Comută pe tema închisă',
  'theme.toLight': 'Comută pe tema deschisă',

  // Shell
  'brand.home': 'adun — pagina principală',
  'brand.mottoPrefix': 'adun',
  'nav.sections': 'Secțiuni',
  'nav.budget': 'Buget',
  'nav.food': 'Mâncare',
  'nav.reminders': 'Scadențe',
  'footer.copyright': '© {year} adun',

  // Sections
  'budget.subtitle': 'Ce intră, ce iese și ce rămâne în fiecare lună.',
  'food.subtitle': 'Cât ai, cât de repede cheltui și ce ai cumpărat.',
  'reminders.subtitle': 'ITP, RCA, rovinietă și verificări, în ordinea în care vin.',

  // Pages
  'page.notFoundTitle': 'Pagina nu există',
  'page.notFoundText': 'Adresa aceasta nu duce nicăieri în aplicație.',
  'page.backToBudget': 'Înapoi la buget',
}

export type MessageKey = keyof typeof ro

export const roMottos = ['banii familiei', 'liniștea lunară', 'ce contează', 'bani, nu griji', 'azi pentru mâine']
