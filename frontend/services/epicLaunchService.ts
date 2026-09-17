export function isEpicGame(item: { id?: string; platform?: string } | null | undefined): boolean {
  return item?.platform === 'Epic';
}

export function buildEpicRunUrl(appName: string): string {
  return `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch&silent=true`;
}
