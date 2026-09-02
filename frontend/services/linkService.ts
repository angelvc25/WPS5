import { Linking, Platform } from 'react-native';

/**
 * Abre una URL externa (http(s), steam://, mailto:, etc.).
 * Devuelve `true` si se pudo delegar la apertura, `false` si algo falló
 * (por ejemplo, el proceso principal de Electron rechazó la URL).
 * No lanza excepción: siempre resuelve, para no romper flujos existentes
 * que no revisan el valor de retorno.
 */
export async function openWebLink(url: string): Promise<boolean> {
  if (!url) return false;

  if (Platform.OS === 'web' && (window as any).electronAPI?.openExternalUrl) {
    try {
      const result = await (window as any).electronAPI.openExternalUrl(url);
      if (result && result.success === false) {
        console.warn('[openWebLink] El proceso principal rechazó la URL:', url, result.error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[openWebLink] Error invocando electronAPI.openExternalUrl:', url, err);
      return false;
    }
  }

  try {
    await Linking.openURL(url);
    return true;
  } catch (err) {
    console.warn('[openWebLink] Linking.openURL falló:', url, err);
    return false;
  }
}
