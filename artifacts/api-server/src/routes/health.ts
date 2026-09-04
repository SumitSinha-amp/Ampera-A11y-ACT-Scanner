import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();
// Bump this when a production API bundle contains a deployment-critical fix.
// It is exposed as a response header so Azure deployments can be verified
// without exposing environment variables or application secrets.
export const API_BUILD_ID = "issues-attachments-r2-v1";

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.setHeader("X-Ampera-API-Build", API_BUILD_ID);
  res.json(data);
});

export default router;
