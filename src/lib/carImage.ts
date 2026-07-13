import { Directory, File, Paths } from 'expo-file-system';

import { newId } from './id';

/**
 * Studio car renders via the imagin.studio CDN, parameterized by make, model,
 * and year. Three modes, held in settings.carImageKey:
 *
 *   ''      off, Garage draws its own silhouette and stays fully offline
 *   'img'   imagin.studio's public demo key: real renders, but watermarked
 *   <key>   your own customer key: clean renders
 *
 * With no key at all the CDN answers with a car under a dust cover, so demo
 * mode exists to make the feature visible without an account.
 */

/** imagin.studio's published demo key. Renders come back watermarked. */
export const DEMO_CAR_IMAGE_KEY = 'img';

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
    fileType: 'png',
  });
  if (opts.year) params.set('modelYear', String(opts.year));
  return `https://cdn.imagin.studio/getImage?${params.toString()}`;
}

/**
 * The image to show for a car: whatever the owner attached, otherwise a studio
 * render when imagery is switched on, otherwise nothing (the caller draws the
 * silhouette).
 */
export function resolveCarImage(
  vehicle: { make: string; model: string; year: number; photoUri: string | null },
  carImageKey: string
): string | null {
  if (vehicle.photoUri) return vehicle.photoUri;
  if (!carImageKey) return null;
  return buildCarImageUrl({
    key: carImageKey,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
  });
}

/**
 * Downloads a remote car image into the app's document tree so the garage
 * stays local-first after the initial fetch. Returns null on any failure;
 * callers keep the remote URL, which expo-image caches on its own.
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
