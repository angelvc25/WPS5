import { Linking, Platform } from 'react-native';

export async function openWebLink(url: string) {
  if (!url) return;

  if (Platform.OS === 'web' && (window as any).electronAPI?.openExternalUrl) {
    await (window as any).electronAPI.openExternalUrl(url);
    return;
  }

  await Linking.openURL(url);
}
