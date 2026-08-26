import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import projectsRouter from "./projects";
import authRouter from "./auth";
import adminRouter from "./admin";
import ticketsRouter from "./tickets";
import issuesRouter, { ISSUE_CREATE_ROUTE_MARKER } from "./issues";
import advancedRouter from "./advanced";
import aiRouter from "./ai";
import crawlerRouter from "./crawler";
import sitesRouter from "./sites";
import qaRouter from "./qa";
import decisionsRouter from "./decisions";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(ticketsRouter);
router.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/issues") {
    res.setHeader("X-Ampera-Issue-Route", ISSUE_CREATE_ROUTE_MARKER);
  }
  next();
});
router.use(projectsRouter);
router.use(scansRouter);
router.use(advancedRouter);
router.use(aiRouter);
router.use(crawlerRouter);
router.use(sitesRouter);
router.use(qaRouter);
router.use(decisionsRouter);
router.use(notificationsRouter);

export default router;
