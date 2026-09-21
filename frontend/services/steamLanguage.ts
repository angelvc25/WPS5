import type { Language } from '@/i18n/translations';

/** Parámetro `l=` de la Store API de Steam */
export const STEAM_API_LANG: Record<Language, string> = {
    es: 'spanish',
    en: 'english',
    pt: 'brazilian',
};

/** ID numérico de idioma de Steam (`lang_list` en eventos/noticias) */
export const STEAM_LANG_ID: Record<Language, number> = {
    es: 5,   // 27 = español latinoamericano, si prefieres ese
    en: 0,
    pt: 23,  // portugués de Brasil
};

/** Locale para Intl (fechas relativas) */
export const STEAM_LOCALE: Record<Language, string> = {
    es: 'es',
    en: 'en',
    pt: 'pt-BR',
};