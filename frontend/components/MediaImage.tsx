import React from 'react';
import { Image, ImageProps } from 'expo-image';

function sourceKey(source: ImageProps['source']): string {
  if (!source) return '';
  if (typeof source === 'number') return String(source);
  if (Array.isArray(source)) return source.map(sourceKey).join('|');
  if (typeof source === 'object' && 'uri' in source && source.uri) return source.uri;
  return JSON.stringify(source);
}

export default function MediaImage({
  source,
  recyclingKey,
  cachePolicy = 'memory',
  ...rest
}: ImageProps) {
  return (
    <Image
      source={source}
      cachePolicy={cachePolicy}
      recyclingKey={recyclingKey ?? sourceKey(source)}
      {...rest}
    />
  );
}
