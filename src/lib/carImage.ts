import { Directory, File, Paths } from 'expo-file-system';

import { newId } from './id';

/**
 * Optional studio imagery via the imagin.studio CDN. Renders are
 * parameterized by make/model/year and look consistent and cinematic,
 * but the service needs a customer key (Settings · Car imagery).
 * Without a key the app uses the drawn silhouette, fully offline.
 */
export function buildCarImageUrl(opts: {
  key: string;
  make: string;
  model: string;
  year?: number;
  /** imagin.studio angle code; 23 is the front three-quarter hero angle. */
  angle?: number;
}): string {
  const params = new URLSearchParams({
    customer: opts.key,
    make: opts.make.toLowerCase(),
    modelFamily: opts.model.toLowerCase(),
    zoomType: 'fullscreen',
    angle: String(opts.angle ?? 23),
  });
  if (opts.year) params.set('modelYear', String(opts.year));
  return `https://cdn.imagin.studio/getImage?${params.toString()}`;
}

/**
 * Downloads a remote car image into the app's document tree so the garage
 * stays local-first after the initial fetch. Returns null on any failure;
 * callers keep the remote URL or fall back to the silhouette.
 */
export async function downloadCarImage(url: string): Promise<string | null> {
  try {
    const dir = new Directory(Paths.document, 'photos');
    if (!dir.exists) dir.create();
    const target = new File(dir, `studio-${newId()}.png`);
    const result = await File.downloadFileAsync(url, target);
    return result.uri;
  } catch {
    return null;
  }
}
