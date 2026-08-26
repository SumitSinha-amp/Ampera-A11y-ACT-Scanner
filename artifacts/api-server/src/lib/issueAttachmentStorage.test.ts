import { Readable } from "stream";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const {
  sendMock,
  getObjectEntityFileMock,
  getObjectMetadataMock,
  deleteObjectMock,
} = vi.hoisted(() => ({
  sendMock: vi.fn(),
  getObjectEntityFileMock: vi.fn(),
  getObjectMetadataMock: vi.fn(),
  deleteObjectMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public readonly input: Record<string, unknown>) {}
  }
  return {
    S3Client: class S3Client {
      send(command: unknown) {
        return sendMock(command);
      }
    },
    PutObjectCommand: class PutObjectCommand extends Command {},
    HeadObjectCommand: class HeadObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
  };
});

vi.mock("./objectStorage", () => ({
  ObjectStorageService: class ObjectStorageService {
    getObjectEntityUploadURL() {
      throw new Error("Replit storage should not be used by R2 tests");
    }
    getObjectEntityFile(objectPath: string) {
      return getObjectEntityFileMock(objectPath);
    }
  },
}));

import {
  AttachmentStorageConfigurationError,
  IssueAttachmentStorageService,
} from "./issueAttachmentStorage";

const ENV_KEYS = [
  "ISSUE_ATTACHMENT_STORAGE_PROVIDER",
  "R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "AZURE_STORAGE_CONNECTION_STRING",
  "WEBSITE_SITE_NAME",
] as const;
const originalEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function useR2Environment() {
  process.env.ISSUE_ATTACHMENT_STORAGE_PROVIDER = "r2";
  process.env.R2_ENDPOINT = "https://example-account.r2.cloudflarestorage.com";
  process.env.R2_BUCKET_NAME = "private-issue-attachments";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
}

describe("IssueAttachmentStorageService Cloudflare R2 backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
    useR2Environment();
    getObjectEntityFileMock.mockResolvedValue({
      getMetadata: getObjectMetadataMock,
      delete: deleteObjectMock,
    });
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prepares a private server-proxied R2 upload", async () => {
    const prepared = await new IssueAttachmentStorageService().prepareUpload("image/png");

    expect(prepared.uploadURL).toBeNull();
    expect(prepared.objectPath).toMatch(/^\/r2-objects\/issues\/[0-9a-f-]+$/);
    expect(prepared.uploadHeaders).toEqual({ "Content-Type": "image/png" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("uploads to R2 and checks the stored size", async () => {
    sendMock.mockImplementation(async (command) => {
      if (command instanceof HeadObjectCommand) return { ContentLength: 4 };
      return {};
    });
    const body = Readable.from(Buffer.from("test"));

    await new IssueAttachmentStorageService().uploadObject(
      "/r2-objects/issues/test-object",
      body,
      4,
      "text/plain",
    );

    expect(sendMock).toHaveBeenCalledTimes(2);
    const put = sendMock.mock.calls[0][0] as PutObjectCommand;
    expect(put.input).toMatchObject({
      Bucket: "private-issue-attachments",
      Key: "issues/test-object",
      Body: body,
      ContentLength: 4,
      ContentType: "text/plain",
    });
  });

  it("verifies the expected R2 object size before confirmation", async () => {
    sendMock.mockResolvedValue({ ContentLength: 12 });
    const storage = new IssueAttachmentStorageService();

    await expect(storage.verifyObject("/r2-objects/issues/test-object", 12)).resolves.toBeUndefined();
    await expect(storage.verifyObject("/r2-objects/issues/test-object", 11))
      .rejects.toThrow("size did not match");
  });

  it("downloads an R2 object as a private response", async () => {
    sendMock.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) {
        return { Body: Readable.from(Buffer.from("image-data")), ContentType: "image/png" };
      }
      return {};
    });

    const response = await new IssueAttachmentStorageService()
      .downloadObject("/r2-objects/issues/test-object", "image/png");

    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("image-data");
  });

  it("fails clearly when R2 credentials are incomplete", async () => {
    delete process.env.R2_SECRET_ACCESS_KEY;

    await expect(new IssueAttachmentStorageService().prepareUpload("image/png"))
      .rejects.toBeInstanceOf(AttachmentStorageConfigurationError);
  });

  it("checks Replit App Storage size before confirming a retained object", async () => {
    process.env.ISSUE_ATTACHMENT_STORAGE_PROVIDER = "replit";
    for (const key of ["R2_ENDPOINT", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
      delete process.env[key];
    }
    getObjectMetadataMock.mockResolvedValueOnce([{ size: "12" }]);
    const storage = new IssueAttachmentStorageService();

    await expect(storage.verifyObject("/objects/issues/test-object", 12)).resolves.toBeUndefined();
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("deletes a Replit App Storage object whose size does not match", async () => {
    process.env.ISSUE_ATTACHMENT_STORAGE_PROVIDER = "replit";
    for (const key of ["R2_ENDPOINT", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
      delete process.env[key];
    }
    getObjectMetadataMock.mockResolvedValueOnce([{ size: "13" }]);
    const storage = new IssueAttachmentStorageService();

    await expect(storage.verifyObject("/objects/issues/test-object", 12))
      .rejects.toThrow("size did not match");
    expect(deleteObjectMock).toHaveBeenCalledWith({ ignoreNotFound: true });
  });
});