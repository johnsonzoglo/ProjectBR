import "reflect-metadata";
import { PromotionsController } from "./modules/rewards/promotions.controller.js";
import { ChatController } from "./modules/chat/chat.controller.js";
import { NotificationsController } from "./modules/notifications/notifications.controller.js";
import { StaffController } from "./modules/users/staff.controller.js";
import { StaffSecurityController } from "./modules/permissions/staff-security.controller.js";
import { ReconciliationController } from "./modules/rewards/reconciliation.controller.js";
import { Controller, Get, Headers, Module, NotFoundException, Res } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./modules/auth/auth.js";
import { UsersController } from "./modules/users/users.controller.js";
import { PortalController } from "./modules/users/portal.controller.js";
import { AdminController } from "./modules/users/admin.controller.js";
import { RewardsController } from "./modules/rewards/rewards.controller.js";
import { AdminRewardsController } from "./modules/rewards/admin-rewards.controller.js";
import { PaymentsController } from "./modules/rewards/payments.controller.js";
import { env, trustedOrigins } from "./config.js";
import { db } from "./database.js";
import { metricsText, requestTelemetry } from "./observability.js";
import type { Response } from "express";

@Controller("api/v1")
class HealthController {
  @Get("health")
  health() { return { status: "ok", service: "rewardly-api", uptimeSeconds: Math.floor(process.uptime()) }; }
  @Get("ready")
  async ready() { await db.$queryRaw`SELECT 1`; const failedJobs = await db.backgroundJob.count({ where: { status: "failed" } }); return { status: "ready", database: "ok", failedJobs }; }
  @Get("metrics")
  async metrics(@Headers("authorization") authorization: string | undefined, @Res() response: Response) {
    if (!env.HEALTH_TOKEN || authorization !== `Bearer ${env.HEALTH_TOKEN}`) throw new NotFoundException();
    const [pending, failed] = await Promise.all([db.backgroundJob.count({ where: { status: "pending" } }), db.backgroundJob.count({ where: { status: "failed" } })]);
    response.type("text/plain; version=0.0.4").send(metricsText({ pending, failed }));
  }
}

@Module({ controllers: [PromotionsController, ChatController, NotificationsController, StaffController, StaffSecurityController, ReconciliationController, HealthController, UsersController, PortalController, AdminController, RewardsController, AdminRewardsController, PaymentsController] })
class AppModule {}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: env.NODE_ENV === "test" ? false : ["error", "warn", "log"] });
  app.use(requestTelemetry);
  app.use(helmet());
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    // Never trust client-supplied proxy headers. Configure a trusted edge before scaling.
    req.headers["x-forwarded-for"] = req.socket.remoteAddress || "127.0.0.1";
    delete req.headers["x-real-ip"];
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && (!req.headers.origin || !trustedOrigins.includes(req.headers.origin))) {
      res.status(403).json({ message: "Request origin is not allowed." }); return;
    }
    next();
  });
  const authPaths = new Set(["/email-otp/verify-email", "/sign-up/email", "/sign-in/email", "/sign-out", "/verify-email", "/send-verification-email", "/request-password-reset", "/reset-password", "/change-password", "/get-session", "/two-factor/enable", "/two-factor/verify-totp", "/two-factor/verify-backup-code", "/two-factor/generate-backup-codes"]);
  app.use("/api/v1/auth", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!authPaths.has(req.path) && !/^\/reset-password\/[A-Za-z0-9_-]+$/.test(req.path)) {
      res.status(404).json({ message: "Endpoint not found." }); return;
    }
    next();
  }, toNodeHandler(auth));
  // Ten product images can be submitted together. Each image is independently
  // validated at 2 MB by the task schema; this only permits the combined form.
  app.use(express.json({ limit: "32mb" }));
  await app.init();
  return app;
}
