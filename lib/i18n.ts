import en from '@/i18n/en.json';
import ru from '@/i18n/ru.json';
import pl from '@/i18n/pl.json';
import de from '@/i18n/de.json';
import es from '@/i18n/es.json';
import pt from '@/i18n/pt.json';

export type Language = 'en' | 'ru' | 'pl' | 'de' | 'es' | 'pt';

const translations: Record<Language, Record<string, string>> = { en, ru, pl, de, es, pt };

/** All supported language codes (used for device locale matching). */
export const SUPPORTED_LANGUAGES = new Set<string>(Object.keys(translations));

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'pl', label: 'Polski' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
];

/**
 * Translate a key with optional interpolation.
 * Falls back to English if key is missing in current language.
 */
export function translate(
  language: Language,
  key: string,
  params?: Record<string, string | number>,
): string {
  const str = translations[language]?.[key] ?? translations.en[key] ?? key;
  if (!params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    params[k] != null ? String(params[k]) : `{{${k}}}`,
  );
}
