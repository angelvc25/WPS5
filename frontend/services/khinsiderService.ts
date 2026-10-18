/**
 * Servicio para buscar álbumes y pistas de audio en KHInsider (downloads.khinsider.com).
 * Utiliza Electron IPC para evitar bloqueos por CORS o Cloudflare.
 */

export interface KHInsiderAlbum {
  id: string;
  title: string;
  albumUrl: string;
  cover: string;
  platform: string;
  type: string;
  year: string;
}

export interface KHInsiderTrack {
  number: string;
  title: string;
  duration: string;
  size: string;
  trackUrl: string;
}

export interface KHInsiderAlbumDetail {
  title: string;
  cover: string;
  tracks: KHInsiderTrack[];
}

export const khinsiderService = {
  /**
   * Busca álbumes en KHInsider por término o nombre del juego.
   */
  async search(query: string): Promise<KHInsiderAlbum[]> {
    const clean = (query || '').trim();
    if (!clean) return [];

    if (typeof window !== 'undefined' && (window as any).electronAPI?.khinsiderSearch) {
      try {
        const res = await (window as any).electronAPI.khinsiderSearch(clean);
        if (res && res.success && Array.isArray(res.albums)) {
          return res.albums;
        }
      } catch (err) {
        console.warn('[khinsiderService] Error en búsqueda Electron:', err);
      }
    }

    // Fallback directo si no está en Electron
    try {
      const url = `https://downloads.khinsider.com/search?search=${encodeURIComponent(clean)}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (!res.ok) return [];
      const html = await res.text();

      const albums: KHInsiderAlbum[] = [];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowHtml = rowMatch[1];
        if (rowHtml.includes('<th')) continue;

        const cells: string[] = [];
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          cells.push(cellMatch[1]);
        }
        if (cells.length < 2) continue;

        const imgMatch = cells[0].match(/<img[^>]+src="([^"]+)"/i);
        const cover = imgMatch ? imgMatch[1] : '';

        const titleLinkMatch = cells[1].match(/<a\s+href="(\/game-soundtracks\/album\/[^"]+)">([\s\S]*?)<\/a>/i);
        if (!titleLinkMatch) continue;

        const albumPath = titleLinkMatch[1];
        const albumUrl = albumPath.startsWith('http') ? albumPath : `https://downloads.khinsider.com${albumPath}`;
        const title = titleLinkMatch[2].replace(/<[^>]+>/g, '').trim();
        const platform = (cells[2] || '').replace(/<[^>]+>/g, '').trim();
        const type = (cells[3] || '').replace(/<[^>]+>/g, '').trim();
        const year = (cells[4] || '').replace(/<[^>]+>/g, '').trim();

        albums.push({
          id: albumPath.replace('/game-soundtracks/album/', ''),
          title,
          albumUrl,
          cover,
          platform,
          type,
          year,
        });
      }

      return albums;
    } catch (e) {
      console.warn('[khinsiderService] Error en búsqueda fallback web:', e);
      return [];
    }
  },

  /**
   * Obtiene los detalles de un álbum y su listado de pistas.
   */
  async getAlbum(albumUrl: string): Promise<KHInsiderAlbumDetail | null> {
    if (!albumUrl) return null;

    if (typeof window !== 'undefined' && (window as any).electronAPI?.khinsiderGetAlbum) {
      try {
        const res = await (window as any).electronAPI.khinsiderGetAlbum(albumUrl);
        if (res && res.success && res.album) {
          return res.album;
        }
      } catch (err) {
        console.warn('[khinsiderService] Error en getAlbum Electron:', err);
      }
    }

    return null;
  },

  /**
   * Obtiene la URL directa del archivo .mp3 a partir de la página de la pista.
   */
  async getTrackAudio(trackPageUrl: string): Promise<string | null> {
    if (!trackPageUrl) return null;

    if (typeof window !== 'undefined' && (window as any).electronAPI?.khinsiderGetTrackAudio) {
      try {
        const res = await (window as any).electronAPI.khinsiderGetTrackAudio(trackPageUrl);
        if (res && res.success && res.audioUrl) {
          return res.audioUrl;
        }
      } catch (err) {
        console.warn('[khinsiderService] Error en getTrackAudio Electron:', err);
      }
    }

    return null;
  },

  /**
   * Descarga la pista localmente para que funcione sin conexión en el carrusel.
   * Devuelve una ruta local-file:///... o la URL remota como respaldo.
   */
  async downloadAndCacheTrack(audioUrl: string): Promise<string> {
    if (!audioUrl) return '';

    if (typeof window !== 'undefined' && (window as any).electronAPI?.khinsiderDownloadTrack) {
      try {
        const res = await (window as any).electronAPI.khinsiderDownloadTrack(audioUrl);
        if (res && res.success && res.localUri) {
          return res.localUri;
        }
      } catch (err) {
        console.warn('[khinsiderService] Error en downloadAndCacheTrack Electron:', err);
      }
    }

    return audioUrl;
  },
};
