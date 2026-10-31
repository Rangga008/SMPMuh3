import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { EnvService } from '../config/env.service';

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(env: EnvService) {
    const s3 = env.s3;
    this.bucket = s3.bucket;
    this.client = new S3Client({
      endpoint: s3.endpoint,
      region: s3.region,
      credentials: {
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey,
      },
      forcePathStyle: s3.forcePathStyle,
    });
  }

  /**
   * Pastikan bucket ada — self-healing untuk S3Mock lokal (data store bisa
   * di-reset) dan instalasi baru; no-op pada S3 produksi yang sudah ada.
   */
  async onModuleInit() {
    try {
      await this.client.send(
        new CreateBucketCommand({ Bucket: this.bucket }),
      );
      this.logger.log(`Bucket "${this.bucket}" dibuat`);
    } catch (e) {
      const code = e instanceof S3ServiceException ? e.name : '';
      if (
        code === 'BucketAlreadyOwnedByYou' ||
        code === 'BucketAlreadyExists' ||
        code === 'BucketNotEmpty'
      ) {
        return;
      }
      if (e instanceof Error && 'name' in e && (e.name === 'NoSuchBucket')) {
        return;
      }
      this.logger.warn(
        `Bucket "${this.bucket}" tidak dapat dipastikan: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObjectStream(key: string): Promise<Readable> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return res.Body as Readable;
  }

  /** Read the whole object into memory — safe for small files (docs ≤ 5 MB). */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async deleteObject(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  onModuleDestroy() {
    this.client.destroy();
  }
}
