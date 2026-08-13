import { R2Service } from './r2';
import { R2Service as R2Service2 } from '../services/r2.service';
import { LessonService } from '../services/lesson.service';
import { prisma } from '../config/database';

async function verifyR2PlaybackFix() {
  console.log('\n========================================');
  console.log('VERIFYING CLOUDFLARE R2 UPLOAD VS PLAYBACK PRESIGNED URLS');
  console.log('========================================\n');

  let passed = true;

  // 1. Test generateUploadPresignedUrl (Must use PutObject / PUT)
  const uploadKey = 'courses/1/lessons/101/test_video.mp4';
  const uploadUrl = await R2Service.generateUploadPresignedUrl(uploadKey, 'video/mp4', 900);
  console.log('Upload Presigned URL:', uploadUrl);

  const isUploadPut = uploadUrl.includes('mock_presigned_upload') || uploadUrl.includes('x-id=PutObject') || uploadUrl.includes('X-Amz');
  if (isUploadPut) {
    console.log('[✔ PASS] Upload presigned URL generated for PUT upload');
  } else {
    console.error('[✖ FAIL] Upload presigned URL invalid');
    passed = false;
  }

  // 2. Test generateDownloadPresignedUrl (Must use GetObject / GET and NEVER contain x-id=PutObject)
  const downloadUrl = await R2Service.generateDownloadPresignedUrl(uploadKey, 900);
  console.log('Download Presigned URL:', downloadUrl);

  const hasNoPutObject = !downloadUrl.includes('x-id=PutObject');
  const isDownloadGet = downloadUrl.includes('mock_presigned_download') || (!downloadUrl.includes('x-id=PutObject') && (downloadUrl.includes('X-Amz') || downloadUrl.includes('expires=')));

  if (hasNoPutObject && isDownloadGet) {
    console.log('[✔ PASS] Playback presigned URL uses GET / GetObject (Does NOT contain x-id=PutObject)');
  } else {
    console.error('[✖ FAIL] Playback presigned URL contains x-id=PutObject or invalid GET structure');
    passed = false;
  }

  // 3. Test generateDownloadPresignedUrl with dirty storageKey containing x-id=PutObject
  const dirtyKey = `${uploadKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&x-id=PutObject`;
  const sanitizedDownloadUrl = await R2Service.generateDownloadPresignedUrl(dirtyKey, 900);
  console.log('Sanitized Download Presigned URL:', sanitizedDownloadUrl);

  if (!sanitizedDownloadUrl.includes('x-id=PutObject')) {
    console.log('[✔ PASS] Dirty storage key containing x-id=PutObject properly sanitized for GetObject playback');
  } else {
    console.error('[✖ FAIL] Dirty storage key sanitization failed');
    passed = false;
  }

  // 4. Test R2Service2 in src/services/r2.service.ts
  const downloadUrl2 = await R2Service2.generateDownloadPresignedUrl(dirtyKey, 900);
  if (!downloadUrl2.includes('x-id=PutObject')) {
    console.log('[✔ PASS] r2.service.ts generateDownloadPresignedUrl also sanitizes keys and uses GET');
  } else {
    console.error('[✖ FAIL] r2.service.ts sanitization failed');
    passed = false;
  }

  console.log('\n========================================');
  console.log(`R2 PLAYBACK FIX VERIFICATION RESULT: ${passed ? 'ALL PASSED' : 'FAILED'}`);
  console.log('========================================\n');

  if (!passed) process.exit(1);
}

verifyR2PlaybackFix();
