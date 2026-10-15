export const STORAGE_THRESHOLD_BYTES = 5_000_000_000; // GB, not GiB.
export const METRIC_MAX_AGE_MS = 15 * 60_000;
export const AZURE_RESOURCE_PATTERN = /^\/subscriptions\/[0-9a-f-]{36}\/resourceGroups\/[a-z0-9_.()-]+\/providers\/Microsoft\.DBforPostgreSQL\/flexibleServers\/[a-z0-9-]+$/i;

export function parseStorageFree(payload: unknown, now = Date.now()) {
  const values = (payload as { value?: unknown[] })?.value;
  if (!Array.isArray(values)) throw new Error("Azure returned no storage metrics.");
  const points: { freeBytes: number; timestamp: number }[] = [];
  for (const metric of values as any[]) {
    if (metric?.name?.value !== "storage_free") continue;
    for (const series of metric.timeseries ?? []) {
      for (const point of series.data ?? []) {
        const timestamp = Date.parse(point.timeStamp);
        if (typeof point.minimum === "number" && Number.isFinite(point.minimum) &&
            point.minimum >= 0 && Number.isFinite(timestamp) && timestamp <= now + 120_000) {
          points.push({ freeBytes: point.minimum, timestamp });
        }
      }
    }
  }
  if (!points.length) throw new Error("Azure has not published a Storage Free reading.");
  const latest = Math.max(...points.map(p => p.timestamp));
  if (now - latest > METRIC_MAX_AGE_MS) throw new Error("Azure's latest storage metric is stale.");
  return {
    freeBytes: Math.min(...points.filter(p => p.timestamp === latest).map(p => p.freeBytes)),
    sampledAt: new Date(latest).toISOString(),
  };
}

export function shouldNotifyStorageLow(previous: { resourceId: string; notifiedLow: boolean } | null, resourceId: string, freeBytes: number) {
  return freeBytes <= STORAGE_THRESHOLD_BYTES &&
    (!previous || previous.resourceId !== resourceId || !previous.notifiedLow);
}

export function storageEmailTemplate(resourceId: string) {
  return {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
    contentVersion: "1.0.0.0",
    parameters: {
      databaseResourceId: { type: "string", defaultValue: resourceId },
      databaseRegion: { type: "string", metadata: { description: "Azure region of the PostgreSQL flexible server, for example centralindia." } },
      alertEmail: { type: "secureString", metadata: { description: "Email address to receive low-storage and recovery notifications." } },
    },
    variables: {
      groupName: "[concat('ampera-storage-email-', uniqueString(parameters('databaseResourceId')))]",
      alertName: "[concat('ampera-storage-5gb-', uniqueString(parameters('databaseResourceId')))]",
    },
    resources: [
      {
        type: "Microsoft.Insights/actionGroups", apiVersion: "2023-01-01",
        name: "[variables('groupName')]", location: "Global",
        properties: {
          groupShortName: "AmperaDB", enabled: true,
          emailReceivers: [{ name: "Storage administrator", emailAddress: "[parameters('alertEmail')]", useCommonAlertSchema: true }],
        },
      },
      {
        type: "Microsoft.Insights/metricAlerts", apiVersion: "2018-03-01",
        name: "[variables('alertName')]", location: "global",
        dependsOn: ["[resourceId('Microsoft.Insights/actionGroups', variables('groupName'))]"],
        properties: {
          description: "Ampera PostgreSQL server has 5 GB or less storage remaining (5,000,000,000 bytes).",
          severity: 1, enabled: true, autoMitigate: true,
          scopes: ["[parameters('databaseResourceId')]"],
          targetResourceType: "Microsoft.DBforPostgreSQL/flexibleServers",
          targetResourceRegion: "[parameters('databaseRegion')]",
          evaluationFrequency: "PT1M", windowSize: "PT5M",
          criteria: {
            "odata.type": "Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria",
            allOf: [{
              criterionType: "StaticThresholdCriterion", name: "FreeStorage",
              metricNamespace: "Microsoft.DBforPostgreSQL/flexibleServers", metricName: "storage_free",
              operator: "LessThanOrEqual", threshold: STORAGE_THRESHOLD_BYTES,
              timeAggregation: "Minimum", skipMetricValidation: false,
            }],
          },
          actions: [{ actionGroupId: "[resourceId('Microsoft.Insights/actionGroups', variables('groupName'))]" }],
        },
      },
    ],
  };
}
