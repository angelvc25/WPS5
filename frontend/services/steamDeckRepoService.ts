const STEAM_DECK_REPO_BASE_URL = 'https://steamdeckrepo.com';
const STEAM_DECK_REPO_API_URL = `${STEAM_DECK_REPO_BASE_URL}/api`;

const POSTS_ENDPOINT = `${STEAM_DECK_REPO_API_URL}/posts/all`;

export type SteamDeckRepoVideoType = 'boot' | 'suspend' | 'all';

export type SteamDeckRepoSort =
    | 'newest'
    | 'oldest'
    | 'likes'
    | 'downloads'
    | 'title';

export interface SteamDeckRepoUser {
    steam_name?: string;
    [key: string]: any;
}

export interface SteamDeckRepoPost {
    id: string;
    title: string;
    thumbnail: string;
    video: string;
    content?: string;
    url: string;
    updated_at?: string;
    created_at?: string;

    likes: number;
    downloads: number;

    type: string;
    user?: SteamDeckRepoUser;

    // Campos normalizados para WConsole
    target: 'boot' | 'suspend';
    author: string;
    previewImage: string;
    previewVideo: string;
    downloadUrl: string;
    sourceUrl: string;
}

export interface SteamDeckRepoSearchOptions {
    query?: string;

    type?: SteamDeckRepoVideoType;

    sort?: SteamDeckRepoSort;

    page?: number;
    limit?: number;

    /**
     * Si se proporciona, se ignoran page/limit.
     */
    includeNonVideos?: boolean;
}

export interface SteamDeckRepoSearchResult {
    items: SteamDeckRepoPost[];

    page: number;
    limit: number;

    total: number;
    totalPages: number;

    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

interface SteamDeckRepoApiResponse {
    posts?: any[];
}

/**
 * Cache en memoria.
 *
 * Evita realizar una petición a SteamDeckRepo cada vez
 * que el usuario cambia un filtro.
 */
let postsCache: SteamDeckRepoPost[] | null = null;

let lastFetchTime = 0;

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

let fetchPromise: Promise<SteamDeckRepoPost[]> | null = null;

/**
 * Convierte un post crudo de SteamDeckRepo al formato
 * que utilizaremos dentro de WConsole.
 */
function normalizePost(post: any): SteamDeckRepoPost {
    const isSuspend = post.type === 'suspend_video';

    return {
        ...post,

        id: String(post.id),

        title: post.title || 'Untitled',

        thumbnail: post.thumbnail || '',

        video: post.video || '',

        content: post.content || '',

        url: post.url || `${STEAM_DECK_REPO_BASE_URL}/post/${post.id}`,

        likes: Number(post.likes || 0),

        downloads: Number(post.downloads || 0),

        target: isSuspend ? 'suspend' : 'boot',

        author:
            post.user?.steam_name ||
            post.user?.username ||
            'Unknown',

        previewImage: post.thumbnail || '',

        previewVideo: post.video || '',

        downloadUrl:
            `${STEAM_DECK_REPO_BASE_URL}/post/download/${post.id}`,

        sourceUrl:
            post.url ||
            `${STEAM_DECK_REPO_BASE_URL}/post/${post.id}`,
    };
}

/**
 * Obtiene todos los posts de SteamDeckRepo.
 *
 * Endpoint comprobado:
 *
 * GET https://steamdeckrepo.com/api/posts/all
 */
export async function fetchSteamDeckRepoPosts(
    forceRefresh = false
): Promise<SteamDeckRepoPost[]> {
    const now = Date.now();

    if (
        !forceRefresh &&
        postsCache &&
        now - lastFetchTime < CACHE_DURATION
    ) {
        return postsCache;
    }

    // Evita múltiples requests simultáneos.
    if (fetchPromise) {
        return fetchPromise;
    }

    fetchPromise = (async () => {
        try {
            const response = await fetch(POSTS_ENDPOINT, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'WConsole/1.0',
                },
            });

            if (response.status === 429) {
                throw new Error(
                    'SteamDeckRepo rate limit exceeded. Try again later.'
                );
            }

            if (!response.ok) {
                throw new Error(
                    `SteamDeckRepo request failed: ${response.status} ${response.statusText}`
                );
            }

            const data: SteamDeckRepoApiResponse =
                await response.json();

            const posts = Array.isArray(data.posts)
                ? data.posts
                : [];

            postsCache = posts
                .map(normalizePost)
                .filter(
                    post =>
                        post.type === 'boot_video' ||
                        post.type === 'suspend_video'
                );

            lastFetchTime = Date.now();

            return postsCache;
        } finally {
            fetchPromise = null;
        }
    })();

    return fetchPromise;
}

/**
 * Busca y filtra videos.
 *
 * La búsqueda se realiza localmente sobre los posts
 * previamente descargados.
 */
export async function searchSteamDeckRepo(
    options: SteamDeckRepoSearchOptions = {}
): Promise<SteamDeckRepoSearchResult> {
    const {
        query = '',
        type = 'all',
        sort = 'newest',
        page = 1,
        limit = 24,
    } = options;

    const posts = await fetchSteamDeckRepoPosts();

    const normalizedQuery = query
        .trim()
        .toLowerCase();

    let results = [...posts];

    /**
     * Filtrar por tipo.
     */
    if (type !== 'all') {
        results = results.filter(
            post => post.target === type
        );
    }

    /**
     * Búsqueda.
     *
     * Buscamos en:
     * - título
     * - descripción
     * - autor
     */
    if (normalizedQuery) {
        results = results.filter(post => {
            const title =
                post.title?.toLowerCase() || '';

            const content =
                post.content?.toLowerCase() || '';

            const author =
                post.author?.toLowerCase() || '';

            return (
                title.includes(normalizedQuery) ||
                content.includes(normalizedQuery) ||
                author.includes(normalizedQuery)
            );
        });
    }

    /**
     * Ordenamiento.
     */
    results.sort((a, b) => {
        switch (sort) {
            case 'likes':
                return b.likes - a.likes;

            case 'downloads':
                return b.downloads - a.downloads;

            case 'title':
                return a.title.localeCompare(
                    b.title,
                    undefined,
                    {
                        sensitivity: 'base',
                    }
                );

            case 'oldest':
                return (
                    getPostDate(a).getTime() -
                    getPostDate(b).getTime()
                );

            case 'newest':
            default:
                return (
                    getPostDate(b).getTime() -
                    getPostDate(a).getTime()
                );
        }
    });

    /**
     * Paginación local.
     */
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);

    const total = results.length;

    const totalPages =
        Math.ceil(total / safeLimit);

    const start =
        (safePage - 1) * safeLimit;

    const end =
        start + safeLimit;

    const items =
        results.slice(start, end);

    return {
        items,

        page: safePage,

        limit: safeLimit,

        total,

        totalPages,

        hasNextPage:
            safePage < totalPages,

        hasPreviousPage:
            safePage > 1,
    };
}

/**
 * Obtiene un video por ID.
 */
export async function getSteamDeckRepoVideo(
    id: string
): Promise<SteamDeckRepoPost | null> {
    const posts =
        await fetchSteamDeckRepoPosts();

    return (
        posts.find(
            post => post.id === String(id)
        ) || null
    );
}

/**
 * Obtiene únicamente videos de boot.
 */
export async function getBootVideos(
    options: Omit<
        SteamDeckRepoSearchOptions,
        'type'
    > = {}
) {
    return searchSteamDeckRepo({
        ...options,
        type: 'boot',
    });
}

/**
 * Obtiene únicamente videos de suspend.
 */
export async function getSuspendVideos(
    options: Omit<
        SteamDeckRepoSearchOptions,
        'type'
    > = {}
) {
    return searchSteamDeckRepo({
        ...options,
        type: 'suspend',
    });
}

/**
 * Obtiene la URL de descarga de un video.
 *
 * SteamDeckRepo utiliza:
 *
 * /post/download/{id}
 *
 * El servidor puede responder mediante redirect
 * al archivo final.
 */
export function getSteamDeckRepoDownloadUrl(
    id: string
): string {
    return `${STEAM_DECK_REPO_BASE_URL}/post/download/${id}`;
}

/**
 * Obtiene la URL de la página del post.
 */
export function getSteamDeckRepoPostUrl(
    id: string
): string {
    return `${STEAM_DECK_REPO_BASE_URL}/post/${id}`;
}

/**
 * Limpia la cache.
 *
 * Útil después de agregar un botón
 * "Actualizar".
 */
export function clearSteamDeckRepoCache(): void {
    postsCache = null;
    lastFetchTime = 0;
}

/**
 * Fecha utilizada para ordenar.
 */
function getPostDate(
    post: SteamDeckRepoPost
): Date {
    const date =
        post.updated_at ||
        post.created_at;

    if (!date) {
        return new Date(0);
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return new Date(0);
    }

    return parsed;
}