import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import projectsRouter from "./projects";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(scansRouter);

export default router;
