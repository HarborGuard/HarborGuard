import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';

let _client: DashboardS3Client | null = null;

export class DashboardS3Client {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT ?? process.env.HG_S3_ENDPOINT;
    const accessKey = process.env.S3_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.S3_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
    this.bucket = process.env.S3_BUCKET ?? process.env.HG_S3_BUCKET ?? '';

    if (!accessKey || !secretKey || !this.bucket) {
      throw new Error('S3 not configured: S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY required');
    }

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: !!endpoint,
    });
  }

  async getScanEnvelope(scanId: string): Promise<any | null> {
    return this.getJson(`scans/${scanId}/envelope.json`);
  }

  async getRawResult(scanId: string, scanner: string): Promise<any | null> {
    return this.getJson(`scans/${scanId}/raw/${scanner}.json`);
  }

  async getSbom(scanId: string): Promise<any | null> {
    return this.getJson(`scans/${scanId}/sbom.cdx.json`);
  }

  async getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  private async getJson(key: string): Promise<any | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) return null;
      const text = await streamToString(response.Body as Readable);
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  static isConfigured(): boolean {
    const bucket = process.env.S3_BUCKET ?? process.env.HG_S3_BUCKET;
    const accessKey = process.env.S3_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.S3_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
    return !!(bucket && accessKey && secretKey);
  }

  static getInstance(): DashboardS3Client {
    if (!_client) {
      _client = new DashboardS3Client();
    }
    return _client;
  }
}

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
