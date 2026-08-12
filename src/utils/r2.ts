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

  static async generateUploadPresignedUrl(storageKey: string, contentType: string = 'video/mp4', expiresIn: number = 900) {
    const client = this.getClient();

    if (!client) {
      // Mock Presigned Upload URL for local development / automated tests when R2 credentials are not configured
      return `https://mock-r2-upload.ahmedhamed.online/${config.r2.bucketName}/${storageKey}?mock_presigned_upload=true`;
    }

    const command = new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: storageKey,
      ContentType: contentType,
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  static async generateDownloadPresignedUrl(storageKey: string, expiresIn: number = 900) {
    const client = this.getClient();

    if (!client) {
      // Mock Presigned Download URL for local development / automated tests when R2 credentials are not configured
      return `https://mock-r2-download.ahmedhamed.online/${config.r2.bucketName}/${storageKey}?token=mock_presigned_view_token&expiresIn=${expiresIn}`;
    }

    const command = new GetObjectCommand({
      Bucket: config.r2.bucketName,
      Key: storageKey,
    });

    return getSignedUrl(client, command, { expiresIn });
  }
}
