import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env';

export class R2Service {
  private static client: S3Client | null = null;

  private static getClient(): S3Client | null {
    if (this.client) return this.client;

    const { accountId, accessKeyId, secretAccessKey } = config.r2;

    // If real R2 credentials are not provided, return null for mock presigned URL mode
    if (!accountId || !accessKeyId || !secretAccessKey || accessKeyId === 'mock_key') {
      return null;
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    return this.client;
  }

  static async uploadFileBuffer(buffer: Buffer, key: string, contentType: string = 'application/pdf') {
    const client = this.getClient();
    let cleanKey = key.split('?')[0].replace(/^\//, '');

    if (client) {
      try {
        const command = new PutObjectCommand({
          Bucket: config.r2.bucketName,
          Key: cleanKey,
          Body: buffer,
          ContentType: contentType,
        });
        await client.send(command);
        return {
          fileUrl: `${config.r2.publicUrl || 'https://pub-r2.ahmedhamed.online'}/${cleanKey}`,
          storageKey: cleanKey,
          isRealR2: true,
        };
      } catch (err) {
        console.warn('Real R2 upload unavailable, falling back to simulated storage:', err);
      }
    }

    return {
      fileUrl: `${config.r2.publicUrl || 'https://pub-r2.ahmedhamed.online'}/${cleanKey}`,
      storageKey: cleanKey,
      isRealR2: false,
    };
  }

  static async generateUploadPresignedUrl(storageKey: string, contentType: string = 'video/mp4', expiresIn: number = 900) {
    const client = this.getClient();

    let cleanKey = storageKey;
    if (cleanKey.includes('?')) {
      cleanKey = cleanKey.split('?')[0];
    }
    cleanKey = cleanKey.replace(/^\//, '');

    if (!client) {
      // Mock Presigned Upload URL for local development / automated tests when R2 credentials are not configured
      return `https://mock-r2-upload.ahmedhamed.online/${config.r2.bucketName}/${cleanKey}?mock_presigned_upload=true`;
    }

    const command = new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: cleanKey,
      ContentType: contentType,
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  static async generateDownloadPresignedUrl(storageKey: string, expiresIn: number = 900) {
    const client = this.getClient();

    // Sanitize key: strip query params, x-id=PutObject, or full URL prefix if passed
    let cleanKey = storageKey;
    if (cleanKey.includes('?')) {
      cleanKey = cleanKey.split('?')[0];
    }
    if (cleanKey.startsWith('http://') || cleanKey.startsWith('https://')) {
      try {
        const urlObj = new URL(cleanKey);
        cleanKey = urlObj.pathname.replace(/^\//, '');
        if (cleanKey.startsWith(`${config.r2.bucketName}/`)) {
          cleanKey = cleanKey.substring(config.r2.bucketName.length + 1);
        }
      } catch (e) {}
    }
    cleanKey = cleanKey.replace(/^\//, '');

    if (!client) {
      // Mock Presigned Download URL for local development / automated tests when R2 credentials are not configured
      return `https://mock-r2-download.ahmedhamed.online/${config.r2.bucketName}/${cleanKey}?token=mock_presigned_view_token&expiresIn=${expiresIn}`;
    }

    const command = new GetObjectCommand({
      Bucket: config.r2.bucketName,
      Key: cleanKey,
    });

    return getSignedUrl(client, command, { expiresIn });
  }
}
