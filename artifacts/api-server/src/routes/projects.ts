import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { getEffectivePermissions } from "../lib/permissions";

const router: IRouter = Router();

router.get("/projects", requireAuth, async (_req, res): Promise<void> => {
  const projects = await db.select()
    .from(projectsTable)
    .orderBy(asc(projectsTable.name));

  res.json(projects.map(p => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/projects", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session!.user!.id;
  const role = req.session!.user!.role;
  const perms = await getEffectivePermissions(userId, role);
  if (!perms.canCreateProject) {
    res.status(403).json({ error: "You don't have permission to create projects" });
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 200) {
    res.status(400).json({ error: "Project name is required (max 200 chars)" });
    return;
  }

  const [project] = await db.insert(projectsTable)
    .values({ name })
    .returning();

  res.status(201).json({
    ...project,
    createdAt: project.createdAt.toISOString(),
  });
});

router.get("/projects/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const [project] = await db.select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json({ ...project, createdAt: project.createdAt.toISOString() });
});

router.delete("/projects/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session!.user!.id;
  const role = req.session!.user!.role;
  const perms = await getEffectivePermissions(userId, role);
  if (!perms.canDeleteProject) {
    res.status(403).json({ error: "You don't have permission to delete projects" });
    return;
  }

  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  await db.delete(projectsTable).where(eq(projectsTable.id, id));
  res.status(204).send();
});

export default router;
