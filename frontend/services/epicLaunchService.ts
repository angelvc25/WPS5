export function buildEpicRunUrl(appName: string): string {
  return `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch&silent=true`;
}
