const BASE = 'https://api.rawg.io/api';

export interface RawgPlatform {
    id: number;
    name: string;
    slug: string;
}

export interface RawgGameSummary {
    id: number;
    slug: string;
    name: string;
    released: string | null;
    background_image: string | null;
    rating: number;
    metacritic: number | null;
    platforms?: {
        platform: RawgPlatform;
    }[];
}

export interface RawgGameDetails extends RawgGameSummary {
    description?: string;
    description_raw?: string;
    background_image_additional?: string | null;
    website?: string | null;
    genres?: {
        id: number;
        name: string;
        slug: string;
    }[];
    developers?: {
        id: number;
        name: string;
        slug: string;
    }[];
    publishers?: {
        id: number;
        name: string;
        slug: string;
    }[];
}

interface RawgListResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface RawgResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * El proceso principal de Electron proporciona los datos.
 * El servicio no contiene la API Key.
 */
export async function fetchRawgGameData(
    title: string
): Promise<RawgResult<RawgGameDetails>> {
    if (!title?.trim()) {
        return {
            success: false,
            error: 'Título no proporcionado',
        };
    }

    try {
        if (
            typeof window !== 'undefined' &&
            (window as any).electronAPI?.fetchRawgGameData
        ) {
            return await (window as any).electronAPI.fetchRawgGameData(title);
        }

        return {
            success: false,
            error: 'API de RAWG no disponible',
        };
    } catch (error: any) {
        console.error('[RAWG] Error:', error);

        return {
            success: false,
            error: error?.message || 'Error al obtener datos de RAWG',
        };
    }
}

export interface RawgScreenshot {
    id: number;
    image: string;
    width: number;
    height: number;
    is_deleted: boolean;
}

export interface RawgScreenshotsResult {
    count: number;
    next: string | null;
    previous: string | null;
    results: RawgScreenshot[];
}

/**
 * Obtiene las capturas de pantalla de un juego desde RAWG.
 * La API Key se mantiene en el proceso principal de Electron.
 */
export async function fetchRawgMediaByName(
    title: string
): Promise<RawgResult<RawgScreenshot[]>> {
    if (!title?.trim()) {
        return {
            success: false,
            error: 'Título no proporcionado',
        };
    }

    try {
        if (
            typeof window !== 'undefined' &&
            (window as any).electronAPI?.fetchRawgScreenshots
        ) {
            return await (window as any).electronAPI.fetchRawgScreenshots(title);
        }

        return {
            success: false,
            error: 'API de capturas RAWG no disponible',
        };
    } catch (error: any) {
        console.error('[RAWG Screenshots] Error:', error);

        return {
            success: false,
            error:
                error?.message ||
                'Error al obtener capturas desde RAWG',
        };
    }
}

export function mapRawgScreenshotsToMedia(
    screenshots: RawgScreenshot[]
) {
    return screenshots.map((screenshot) => ({
        id: `rawg_screenshot_${screenshot.id}`,
        type: 'screenshot' as const,
        thumbnail: screenshot.image,
        full: screenshot.image,
        source: 'rawg',
    }));
}