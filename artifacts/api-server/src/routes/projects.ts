import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/projects", async (_req, res): Promise<void> => {
  const projects = await db.select()
    .from(projectsTable)
    .orderBy(asc(projectsTable.name));

  res.json(projects.map(p => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/projects", async (req, res): Promise<void> => {
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

router.get("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
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

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  await db.delete(projectsTable).where(eq(projectsTable.id, id));
  res.status(204).send();
});

export default router;
