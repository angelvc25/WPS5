import type { Language } from '@/i18n/translations';
import { STEAM_API_LANG } from './steamLanguage';

const ratingCache = new Map<number, number | null>();
const stripHtml = (s: string) =>
    s
        .replace(/<[^>]*>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

export async function resolveAppId(name: string, language: Language): Promise<number | null> {
    try {
        const res = await fetch(
            `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=${STEAM_API_LANG[language]}&cc=US`
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data?.items?.[0]?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * Descripción corta del juego en el idioma del usuario.
 * Acepta un appid (juegos de Steam) o un nombre (juegos manuales).
 */
const descriptionCache = new Map<string, string | null>();

export async function fetchSteamDescription(
    appIdOrName: number | string | null,
    language: Language
): Promise<string | null> {
    if (!appIdOrName) return null;
    const cacheKey = `${appIdOrName}_${language}`;
    if (descriptionCache.has(cacheKey)) return descriptionCache.get(cacheKey) ?? null;

    try {
        const appid =
            typeof appIdOrName === 'number' || /^\d+$/.test(appIdOrName)
                ? Number(appIdOrName)
                : await resolveAppId(appIdOrName, language);
        if (!appid) return null;

        const res = await fetch(
            `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic&l=${STEAM_API_LANG[language]}`
        );
        if (!res.ok) return null;
        const json = await res.json();
        const desc: string | undefined = json?.[String(appid)]?.data?.short_description;
        const clean = desc ? stripHtml(desc) : null;
        descriptionCache.set(cacheKey, clean);
        return clean;
    } catch (e) {
        console.warn('[SteamDescription] Error:', e);
        return null;
    }
}

/** true si el texto está vacío o es el placeholder "Tiempo jugado: X horas" que se guardó como descripción */
export const isPlaytimePlaceholder = (text?: string | null): boolean => {
    if (!text || !text.trim()) return true;
    return /^(tiempo jugado|time played|tempo jogado)\s*:/i.test(text.trim());
};

/** Rating 0-5 según % de reseñas positivas de Steam (null si hay < 10 reseñas) */
export async function fetchSteamRating(appid: number): Promise<number | null> {
    if (ratingCache.has(appid)) return ratingCache.get(appid) ?? null;
    try {
        const res = await fetch(
            `https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`
        );
        if (!res.ok) return null;
        const q = (await res.json())?.query_summary;
        const pos = Number(q?.total_positive ?? 0);
        const neg = Number(q?.total_negative ?? 0);
        const total = pos + neg;
        const rating = total >= 10 ? Math.round((pos / total) * 5 * 10) / 10 : null;
        ratingCache.set(appid, rating);
        return rating;
    } catch {
        return null;
    }
}

/** Descripción localizada + rating de Steam, por appid o por nombre */
export async function fetchSteamInfo(
    appIdOrName: number | string | null,
    language: Language
): Promise<{ appid: number | null; description: string | null; rating: number | null }> {
    if (!appIdOrName) return { appid: null, description: null, rating: null };
    const appid =
        typeof appIdOrName === 'number' || /^\d+$/.test(appIdOrName)
            ? Number(appIdOrName)
            : await resolveAppId(appIdOrName, language);
    if (!appid) return { appid: null, description: null, rating: null };
    const [description, rating] = await Promise.all([
        fetchSteamDescription(appid, language),
        fetchSteamRating(appid),
    ]);
    return { appid, description, rating };
}

/**
 * Al añadir un juego: si la preferencia "Resumen y Rating" es Steam,
 * completa descripción y rating desde Steam. Si falla, devuelve el juego intacto.
 */
export async function enrichAppWithSteamInfo<T extends { title?: string; type?: string; description?: string; rating?: number }>(
    app: T,
    syncPreferences: { ratingAndSummary?: string } | undefined,
    language: Language
): Promise<T> {
    if (syncPreferences?.ratingAndSummary !== 'steam') return app;
    if (app.type && app.type !== 'game') return app;
    if (!app.title) return app;
    const info = await fetchSteamInfo(app.title, language);
    return {
        ...app,
        description: info.description ?? app.description,
        rating: info.rating ?? app.rating,
    };
}