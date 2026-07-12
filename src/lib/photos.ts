import { Directory, File, Paths } from 'expo-file-system';

import { newId } from './id';

/**
 * Image-picker results live in caches the OS may clear. Copy anything the
 * user attaches into the app's document tree so records keep their photos.
 */
export function persistPhoto(tempUri: string): string {
  try {
    const dir = new Directory(Paths.document, 'photos');
    if (!dir.exists) dir.create();
    const source = new File(tempUri);
    const ext = tempUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const target = new File(dir, `${newId()}.${ext.length <= 5 ? ext : 'jpg'}`);
    source.copy(target);
    return target.uri;
  } catch {
    // Keep the original reference rather than losing the attachment.
    return tempUri;
  }
}
