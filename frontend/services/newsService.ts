const WORKER_API_BASE = 'https://wps5-api.wps5-api.workers.dev';

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  source: {
    name: string;
  };
}

export const fetchGamingNews = async (): Promise<NewsArticle[]> => {
  try {
    // Si estamos en Electron, preferimos usar el proceso principal para evitar bloqueos de red/CORS
    if ((window as any).electronAPI && (window as any).electronAPI.fetchNews) {
      const data = await (window as any).electronAPI.fetchNews();
      if (data.status === 'ok' && Array.isArray(data.articles)) {
        return data.articles.filter((article: NewsArticle) => article.urlToImage && article.title);
      }
      console.error('Error fetching news from Electron Main:', data.message);
    }

    // Fallback o modo web: fetch directo al Worker
    const response = await fetch(`${WORKER_API_BASE}/api/news`);
    const data = await response.json();

    if (data.status === 'ok' && Array.isArray(data.articles)) {
      return data.articles.filter((article: NewsArticle) => article.urlToImage && article.title);
    }

    console.error('Error fetching news:', data.message);
    return [];
  } catch (error) {
    console.error('Error in news service:', error);
    return [];
  }
};
