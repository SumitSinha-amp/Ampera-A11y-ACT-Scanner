import { randomUUID } from "crypto";
import { Readable } from "stream";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ObjectStorageService } from "./objectStorage";

const AZURE_OBJECT_PREFIX = "/azure-objects/";
const R2_OBJECT_PREFIX = "/r2-objects/";
const DEFAULT_AZURE_CONTAINER = "issue-attachments";
const DEFAULT_R2_BUCKET = "issue-attachments";

export class AttachmentStorageConfigurationError extends Error {}

export interface PreparedAttachmentUpload {
  uploadURL: string | null;
  objectPath: string;
  uploadHeaders: Record<string, string>;
}

export class IssueAttachmentStorageService {
  private readonly replitStorage = new ObjectStorageService();

  private provider(): "r2" | "azure" | "replit" {
    const configured = process.env.ISSUE_ATTACHMENT_STORAGE_PROVIDER?.trim().toLowerCase();
    if (configured) {
      if (configured === "r2" || configured === "azure" || configured === "replit") return configured;
      throw new AttachmentStorageConfigurationError(
        "ISSUE_ATTACHMENT_STORAGE_PROVIDER must be one of: r2, azure, or replit.",
      );
    }
    if (
      process.env.R2_ENDPOINT ||
      process.env.R2_BUCKET_NAME ||
      process.env.R2_ACCESS_KEY_ID ||
      process.env.R2_SECRET_ACCESS_KEY
    ) return "r2";
    if (process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.WEBSITE_SITE_NAME) return "azure";
    return "replit";
  }

  private azureContainer(): ContainerClient {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new AttachmentStorageConfigurationError(
        "Issue attachments require AZURE_STORAGE_CONNECTION_STRING in Azure App Service.",
      );
    }
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME?.trim() || DEFAULT_AZURE_CONTAINER;
    return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  }

  private r2Config(): { client: S3Client; bucket: string } {
    const endpoint = process.env.R2_ENDPOINT?.trim().replace(/\/+$/, "");
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
    const bucket = process.env.R2_BUCKET_NAME?.trim() || DEFAULT_R2_BUCKET;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new AttachmentStorageConfigurationError(
        "Issue attachments require R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY when R2 storage is selected.",
      );
    }
    return {
      client: new S3Client({
        endpoint,
        region: "auto",
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      }),
      bucket,
    };
  }

  private r2Key(objectPath: string): string {
    if (!objectPath.startsWith(R2_OBJECT_PREFIX)) throw new Error("Invalid Cloudflare R2 object path");
    return objectPath.slice(R2_OBJECT_PREFIX.length);
  }

  private readableBody(body: unknown): Readable {
    if (body instanceof Readable) return body;
    if (body && typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function") {
      return Readable.from(body as AsyncIterable<Uint8Array>);
    }
    if (body && typeof (body as ReadableStream<Uint8Array>).getReader === "function") {
      return Readable.fromWeb(body as any);
    }
    throw new Error("Cloudflare R2 returned no readable body");
  }

  async prepareUpload(contentType: string): Promise<PreparedAttachmentUpload> {
    if (this.provider() === "r2") {
      this.r2Config();
      const objectName = `issues/${randomUUID()}`;
      return {
        // R2 uploads are proxied through the authenticated API route so the
        // bucket can remain private and does not need browser CORS settings.
        uploadURL: null,
        objectPath: `${R2_OBJECT_PREFIX}${objectName}`,
        uploadHeaders: {
          "Content-Type": contentType || "application/octet-stream",
        },
      };
    }

    if (this.provider() === "azure") {
      const container = this.azureContainer();
      await container.createIfNotExists();
      const objectName = `issues/${randomUUID()}`;
      return {
        // Azure uploads are proxied through the authenticated API route. This
        // avoids requiring a permissive Blob Storage CORS policy in every
        // customer's Azure subscription.
        uploadURL: null,
        objectPath: `${AZURE_OBJECT_PREFIX}${objectName}`,
        uploadHeaders: {
          "Content-Type": contentType || "application/octet-stream",
        },
      };
    }

    const uploadURL = await this.replitStorage.getObjectEntityUploadURL();
    return {
      uploadURL,
      objectPath: this.replitStorage.normalizeObjectEntityPath(uploadURL),
      uploadHeaders: {
        "Content-Type": contentType || "application/octet-stream",
      },
    };
  }

  async uploadObject(objectPath: string, body: Readable, size: number, contentType: string): Promise<void> {
    if (objectPath.startsWith(R2_OBJECT_PREFIX)) {
      const { client, bucket } = this.r2Config();
      const key = this.r2Key(objectPath);
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentLength: size,
        ContentType: contentType || "application/octet-stream",
      }));
      const properties = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (properties.ContentLength !== size) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        throw new Error("Uploaded Cloudflare R2 object size did not match the requested attachment");
      }
      return;
    }

    if (!objectPath.startsWith(AZURE_OBJECT_PREFIX)) {
      throw new Error("Server-proxied uploads are only supported for Cloudflare R2 or Azure Blob Storage");
    }
    const blob = this.azureContainer().getBlockBlobClient(objectPath.slice(AZURE_OBJECT_PREFIX.length));
    await blob.uploadStream(body, 4 * 1024 * 1024, 4, {
      blobHTTPHeaders: { blobContentType: contentType || "application/octet-stream" },
    });
    const properties = await blob.getProperties();
    if (properties.contentLength !== size) {
      await blob.deleteIfExists();
      throw new Error("Uploaded Azure Blob size did not match the requested attachment");
    }
  }

  async verifyObject(objectPath: string, expectedSize?: number): Promise<void> {
    if (objectPath.startsWith(R2_OBJECT_PREFIX)) {
      const { client, bucket } = this.r2Config();
      const properties = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: this.r2Key(objectPath) }));
      if (expectedSize !== undefined && properties.ContentLength !== expectedSize) {
        throw new Error("Cloudflare R2 object size did not match the requested attachment");
      }
      return;
    }

    if (objectPath.startsWith(AZURE_OBJECT_PREFIX)) {
      const blob = this.azureContainer().getBlockBlobClient(objectPath.slice(AZURE_OBJECT_PREFIX.length));
      if (!(await blob.exists())) throw new Error("Uploaded Azure Blob object was not found");
      if (expectedSize !== undefined) {
        const properties = await blob.getProperties();
        if (properties.contentLength !== expectedSize) {
          throw new Error("Azure Blob size did not match the requested attachment");
        }
      }
      return;
    }
    const file = await this.replitStorage.getObjectEntityFile(objectPath);
    if (expectedSize !== undefined) {
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) !== expectedSize) {
        await file.delete({ ignoreNotFound: true });
        throw new Error("Replit App Storage object size did not match the requested attachment");
      }
    }
  }

  async downloadObject(objectPath: string, contentType: string): Promise<Response> {
    if (objectPath.startsWith(R2_OBJECT_PREFIX)) {
      const { client, bucket } = this.r2Config();
      const download = await client.send(new GetObjectCommand({ Bucket: bucket, Key: this.r2Key(objectPath) }));
      const stream = Readable.toWeb(this.readableBody(download.Body)) as ReadableStream<Uint8Array>;
      return new Response(stream, {
        headers: {
          "Content-Type": contentType || download.ContentType || "application/octet-stream",
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    if (objectPath.startsWith(AZURE_OBJECT_PREFIX)) {
      const blob = this.azureContainer().getBlockBlobClient(objectPath.slice(AZURE_OBJECT_PREFIX.length));
      const download = await blob.download();
      if (!download.readableStreamBody) throw new Error("Azure Blob returned no readable body");
      const stream = Readable.toWeb(download.readableStreamBody as Readable) as ReadableStream<Uint8Array>;
      return new Response(stream, {
        headers: {
          "Content-Type": contentType || download.contentType || "application/octet-stream",
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    const file = await this.replitStorage.getObjectEntityFile(objectPath);
    return this.replitStorage.downloadObject(file, 300, contentType);
  }
}