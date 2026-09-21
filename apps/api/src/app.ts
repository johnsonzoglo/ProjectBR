import "reflect-metadata";
import { PromotionsController } from "./modules/rewards/promotions.controller.js";
import { ChatController } from "./modules/chat/chat.controller.js";
import { NotificationsController } from "./modules/notifications/notifications.controller.js";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./modules/auth/auth.js";
import { UsersController } from "./modules/users/users.controller.js";
import { AdminController } from "./modules/users/admin.controller.js";
import { RewardsController } from "./modules/rewards/rewards.controller.js";
import { AdminRewardsController } from "./modules/rewards/admin-rewards.controller.js";
import { PaymentsController } from "./modules/rewards/payments.controller.js";
import { env, trustedOrigins } from "./config.js";
import { db } from "./database.js";

@Controller("api/v1")
class HealthController {
  @Get("health")
  async health() { await db.$queryRaw`SELECT 1`; return { status: "ok", module: "identity" }; }
}

@Module({ controllers: [PromotionsController, ChatController, NotificationsController, HealthController, UsersController, AdminController, RewardsController, AdminRewardsController, PaymentsController] })
class AppModule {}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: env.NODE_ENV === "test" ? false : ["error", "warn", "log"] });
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
  const authPaths = new Set(["/email-otp/verify-email", "/sign-up/email", "/sign-in/email", "/sign-out", "/verify-email", "/send-verification-email", "/request-password-reset", "/reset-password", "/change-password", "/get-session"]);
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
