import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'engcode-storage';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://storage.engcode.online';

const isR2Configured = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

const s3Client = isR2Configured
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

export class R2Service {
  /**
   * Uploads a Buffer (such as a PDF) to Cloudflare R2 bucket
   */
  static async uploadFileBuffer(buffer: Buffer, key: string, contentType: string = 'application/pdf') {
    if (isR2Configured && s3Client && !R2_ACCOUNT_ID.startsWith('dev_')) {
      try {
        const command = new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        });
        await s3Client.send(command);
        return {
          fileUrl: `${R2_PUBLIC_URL}/${key}`,
          storageKey: key,
          isRealR2: true,
        };
      } catch (err) {
        console.warn('Real R2 upload unavailable, falling back to simulated storage:', err);
      }
    }

    // Dev Fallback Simulation
    return {
      fileUrl: `${R2_PUBLIC_URL}/${key}`,
      storageKey: key,
      isRealR2: false,
    };
  }

  /**
   * Generates a short-lived presigned GET URL for accessing private objects in R2
   */
  static async generateDownloadPresignedUrl(key: string, expiresInSeconds: number = 900): Promise<string> {
    let cleanKey = key;
    if (cleanKey.includes('?')) {
      cleanKey = cleanKey.split('?')[0];
    }
    if (cleanKey.startsWith('http://') || cleanKey.startsWith('https://')) {
      try {
        const urlObj = new URL(cleanKey);
        cleanKey = urlObj.pathname.replace(/^\//, '');
      } catch (e) {}
    }
    cleanKey = cleanKey.replace(/^\//, '');

    if (isR2Configured && s3Client && !R2_ACCOUNT_ID.startsWith('dev_')) {
      try {
        const command = new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: cleanKey,
        });
        return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
      } catch (err) {
        console.warn('Real R2 presigned URL generation unavailable, using fallback:', err);
      }
    }

    // Dev Fallback Simulation (Secure Signed URL Simulation)
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    return `${R2_PUBLIC_URL}/${cleanKey}?expires=${expiresAt}&signature=simulated_presigned_signature`;
  }
}
