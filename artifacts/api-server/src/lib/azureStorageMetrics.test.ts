import { describe, expect, it } from "vitest";
import { AZURE_RESOURCE_PATTERN, parseStorageFree, shouldNotifyStorageLow, storageEmailTemplate, STORAGE_THRESHOLD_BYTES } from "./azureStorageMetrics";

const now = Date.parse("2026-10-07T10:00:00Z");
const resource = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/test/providers/Microsoft.DBforPostgreSQL/flexibleServers/test";
const payload = (points: unknown[]) => ({ value: [{ name: { value: "storage_free" }, timeseries: [{ data: points }] }] });
describe("Azure database storage alerts", () => {
  it("uses the latest measured free space, not an older low point", () => {
    expect(parseStorageFree(payload([
      { timeStamp: "2026-10-07T09:59:00Z", minimum: 1e9 },
      { timeStamp: "2026-10-07T10:00:00Z", minimum: 8e9 },
    ]), now).freeBytes).toBe(8e9);
  });
  it("conservatively uses the lowest value across servers in the latest bucket", () => {
    expect(parseStorageFree(payload([
      { timeStamp: "2026-10-07T10:00:00Z", minimum: 8e9 },
      { timeStamp: "2026-10-07T10:00:00Z", minimum: 4e9 },
    ]), now).freeBytes).toBe(4e9);
  });
  it("never treats missing or invalid measurements as zero or healthy", () => {
    for (const value of [null, {}, payload([]), payload([{ timeStamp: "bad", minimum: 0 }]),
      payload([{ timeStamp: "2026-10-07T10:00:00Z", minimum: -1 }])]) {
      expect(() => parseStorageFree(value, now)).toThrow();
    }
  });
  it("rejects stale and future-only readings", () => {
    expect(() => parseStorageFree(payload([{ timeStamp: "2026-10-07T09:00:00Z", minimum: 8e9 }]), now)).toThrow(/stale/);
    expect(() => parseStorageFree(payload([{ timeStamp: "2026-10-08T10:00:00Z", minimum: 8e9 }]), now)).toThrow();
  });
  it("fires at exactly 5 GB, below it and at zero, but not above", () => {
    for (const value of [0, 4.9e9, STORAGE_THRESHOLD_BYTES]) expect(shouldNotifyStorageLow(null, resource, value)).toBe(true);
    expect(shouldNotifyStorageLow(null, resource, STORAGE_THRESHOLD_BYTES + 1)).toBe(false);
  });
  it("deduplicates a continuing low episode and rearms after recovery or server changes", () => {
    expect(shouldNotifyStorageLow({ resourceId: resource, notifiedLow: true }, resource, 4e9)).toBe(false);
    expect(shouldNotifyStorageLow({ resourceId: resource, notifiedLow: false }, resource, 4e9)).toBe(true);
    expect(shouldNotifyStorageLow({ resourceId: "other", notifiedLow: true }, resource, 4e9)).toBe(true);
  });
  it("only accepts Flexible Server resource IDs, never arbitrary URLs or paths", () => {
    expect(AZURE_RESOURCE_PATTERN.test(resource)).toBe(true);
    for (const value of ["http://localhost/", resource + "?extra=1", resource + "/../../other", resource.replace("flexibleServers", "servers")]) {
      expect(AZURE_RESOURCE_PATTERN.test(value)).toBe(false);
    }
  });
  it("uses the same inclusive byte threshold in the independent Azure email rule", () => {
    const template = storageEmailTemplate(resource);
    const rule = template.resources[1].properties as any;
    expect(rule.criteria.allOf[0]).toMatchObject({
      metricName: "storage_free", operator: "LessThanOrEqual", threshold: STORAGE_THRESHOLD_BYTES, timeAggregation: "Minimum",
    });
    expect(rule.autoMitigate).toBe(true);
    expect(template.parameters.alertEmail.type).toBe("secureString");
  });
});
