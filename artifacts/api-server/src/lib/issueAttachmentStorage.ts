import { randomUUID } from "crypto";
import { Readable } from "stream";
import { BlobSASPermissions, BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { ObjectStorageService } from "./objectStorage";

const AZURE_OBJECT_PREFIX = "/azure-objects/";
const DEFAULT_AZURE_CONTAINER = "issue-attachments";

export class AttachmentStorageConfigurationError extends Error {}

export interface PreparedAttachmentUpload {
  uploadURL: string;
  objectPath: string;
  uploadHeaders: Record<string, string>;
}

export class IssueAttachmentStorageService {
  private readonly replitStorage = new ObjectStorageService();

  private usesAzure(): boolean {
    return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.WEBSITE_SITE_NAME);
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

  async prepareUpload(contentType: string): Promise<PreparedAttachmentUpload> {
    if (this.usesAzure()) {
      const container = this.azureContainer();
      await container.createIfNotExists();
      const objectName = `issues/${randomUUID()}`;
      const blob = container.getBlockBlobClient(objectName);
      const uploadURL = await blob.generateSasUrl({
        permissions: BlobSASPermissions.parse("cw"),
        startsOn: new Date(Date.now() - 5 * 60_000),
        expiresOn: new Date(Date.now() + 15 * 60_000),
      });
      return {
        uploadURL,
        objectPath: `${AZURE_OBJECT_PREFIX}${objectName}`,
        uploadHeaders: {
          "Content-Type": contentType || "application/octet-stream",
          "x-ms-blob-type": "BlockBlob",
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

  async verifyObject(objectPath: string): Promise<void> {
    if (objectPath.startsWith(AZURE_OBJECT_PREFIX)) {
      const blob = this.azureContainer().getBlockBlobClient(objectPath.slice(AZURE_OBJECT_PREFIX.length));
      if (!(await blob.exists())) throw new Error("Uploaded Azure Blob object was not found");
      return;
    }
    await this.replitStorage.getObjectEntityFile(objectPath);
  }

  async downloadObject(objectPath: string, contentType: string): Promise<Response> {
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