import '../config/env';
import { prisma } from '../config/database';
import { config } from '../config/env';

export function sanitizeObjectKey(rawKey: string): string {
  if (!rawKey) return '';
  let cleanKey = rawKey;
  if (cleanKey.includes('?')) {
    cleanKey = cleanKey.split('?')[0];
  }
  if (cleanKey.startsWith('http://') || cleanKey.startsWith('https://')) {
    try {
      const urlObj = new URL(cleanKey);
      cleanKey = urlObj.pathname.replace(/^\//, '');
      const bucket = config.r2.bucketName;
      if (bucket && cleanKey.startsWith(`${bucket}/`)) {
        cleanKey = cleanKey.substring(bucket.length + 1);
      }
    } catch (e) {}
  }
  return cleanKey.replace(/^\//, '');
}

export async function sanitizeAllLessonVideoKeys() {
  const videos = await prisma.lessonVideo.findMany();
  let updatedCount = 0;

  for (const video of videos) {
    const cleaned = sanitizeObjectKey(video.r2StorageKey);
    if (cleaned !== video.r2StorageKey) {
      await prisma.lessonVideo.update({
        where: { id: video.id },
        data: { r2StorageKey: cleaned },
      });
      console.log(`Updated video #${video.id}: "${video.r2StorageKey}" -> "${cleaned}"`);
      updatedCount++;
    }
  }

  console.log(`Sanitized ${updatedCount} / ${videos.length} LessonVideo records in database.`);
  return updatedCount;
}

if (require.main === module) {
  sanitizeAllLessonVideoKeys()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
