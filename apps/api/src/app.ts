import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./modules/auth/auth.js";
import { UsersController } from "./modules/users/users.controller.js";
import { AdminController } from "./modules/users/admin.controller.js";
import { env } from "./config.js";
import { db } from "./database.js";

@Controller("api/v1")
class HealthController {
  @Get("health")
  async health() { await db.$queryRaw`SELECT 1`; return { status: "ok", module: "identity" }; }
}

@Module({ controllers: [HealthController, UsersController, AdminController] })
class AppModule {}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: env.NODE_ENV === "test" ? false : ["error", "warn", "log"] });
  app.use(helmet());
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    // Never trust client-supplied proxy headers. Configure a trusted edge before scaling.
    req.headers["x-forwarded-for"] = req.socket.remoteAddress || "127.0.0.1";
    delete req.headers["x-real-ip"];
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin !== env.APP_ORIGIN) {
      res.status(403).json({ message: "Request origin is not allowed." }); return;
    }
    next();
  });
  const authPaths = new Set(["/sign-up/email", "/sign-in/email", "/sign-out", "/verify-email", "/send-verification-email", "/request-password-reset", "/reset-password", "/change-password", "/get-session"]);
  app.use("/api/v1/auth", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!authPaths.has(req.path) && !/^\/reset-password\/[A-Za-z0-9_-]+$/.test(req.path)) {
      res.status(404).json({ message: "Endpoint not found." }); return;
    }
    next();
  }, toNodeHandler(auth));
  app.use(express.json({ limit: "16kb" }));
  await app.init();
  return app;
}
