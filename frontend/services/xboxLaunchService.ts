export function isXboxGame(item: { id?: string; platform?: string; path?: string } | null | undefined): boolean {
  if (!item) return false;
  if (item.platform === 'Xbox') return true;
  if (typeof item.id === 'string' && item.id.startsWith('xbox_')) return true;
  if (typeof item.path === 'string') {
    const lower = item.path.toLowerCase();
    if (lower.startsWith('shell:appsfolder')) return true;
    if (lower.includes('xboxgames') || lower.endsWith('gamelaunchhelper.exe')) return true;
  }
  return false;
}

export function buildXboxRunUrl(aumid: string): string {
  return `shell:AppsFolder\\${aumid}`;
}
