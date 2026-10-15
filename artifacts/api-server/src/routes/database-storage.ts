import { Router, type IRouter } from "express";
import { UpdateDatabaseStorageBody } from "@workspace/api-zod";
import { requireAdmin, requireSuperAdmin } from "../middlewares/authMiddleware";
import { checkStorage, getStorageConfig, getStorageStatus, saveStorageConfig } from "../lib/databaseStorageMonitor";
import { AZURE_RESOURCE_PATTERN, storageEmailTemplate } from "../lib/azureStorageMetrics";

const router: IRouter = Router();
router.get("/admin/database-storage", requireAdmin, async (_req, res) => {
  res.json(await getStorageStatus());
});
router.put("/admin/database-storage", requireSuperAdmin, async (req, res) => {
  const parsed = UpdateDatabaseStorageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Provide enabled and resourceId." }); return; }
  const config = { enabled: parsed.data.enabled, resourceId: parsed.data.resourceId.trim() };
  if ((config.enabled || config.resourceId) && !AZURE_RESOURCE_PATTERN.test(config.resourceId)) {
    res.status(400).json({ error: "Enter a complete Azure PostgreSQL Flexible Server resource ID." }); return;
  }
  await saveStorageConfig(config);
  void checkStorage();
  res.json(await getStorageStatus());
});
router.post("/admin/database-storage/check", requireSuperAdmin, async (_req, res) => {
  await checkStorage();
  res.json(await getStorageStatus());
});
router.get("/admin/database-storage/azure-template", requireAdmin, async (_req, res) => {
  const config = await getStorageConfig();
  if (!AZURE_RESOURCE_PATTERN.test(config.resourceId)) {
    res.status(400).json({ error: "Save a valid Azure server resource ID first." }); return;
  }
  res.setHeader("Content-Disposition", 'attachment; filename="ampera-azure-storage-email-alert.json"');
  res.json(storageEmailTemplate(config.resourceId));
});
export default router;
