import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import projectsRouter from "./projects";
import authRouter from "./auth";
import adminRouter from "./admin";
import ticketsRouter from "./tickets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(ticketsRouter);
router.use(projectsRouter);
router.use(scansRouter);

export default router;
