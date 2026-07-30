import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import projectsRouter from "./projects";
import authRouter from "./auth";
import adminRouter from "./admin";
import ticketsRouter from "./tickets";
import advancedRouter from "./advanced";
import aiRouter from "./ai";
import crawlerRouter from "./crawler";
import sitesRouter from "./sites";
import qaRouter from "./qa";
import decisionsRouter from "./decisions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(ticketsRouter);
router.use(projectsRouter);
router.use(scansRouter);
router.use(advancedRouter);
router.use(aiRouter);
router.use(crawlerRouter);
router.use(sitesRouter);
router.use(qaRouter);
router.use(decisionsRouter);

export default router;
