import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runVersionedStartupMigrations } from "./startup-migrations";
import { bootstrapApplication, createStartupReadiness } from "./startup-readiness";

const app = express();
// Replit's load balancer terminates TLS upstream and forwards via X-Forwarded-For.
// Trusting the proxy lets `req.ip` resolve to the real client IP, which is required
// for rate limiters on public endpoints to work correctly (and not be spoofable
// by a raw client-supplied X-Forwarded-For header).
app.set("trust proxy", true);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

const startupReadiness = createStartupReadiness();
const readinessHandler = (_req: Request, res: Response) => {
  const state = startupReadiness.get();
  return res.status(state.phase === "ready" ? 200 : 503).json({
    status: state.phase === "ready" ? "ok" : "unhealthy",
    startup: state,
  });
};
app.get("/health", readinessHandler);
app.get("/ready", readinessHandler);
app.use((req, res, next) => {
  const startup = startupReadiness.get();
  if (startup.phase === "failed") {
    return res.status(503).json({ status: "unhealthy", startup });
  }
  if (startup.phase !== "ready" && req.method === "GET" && (req.path === "/" || !req.path.startsWith("/api"))) {
    if (req.path === "/") {
      return res.status(200).set("Content-Type", "text/html").end(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading...</title><meta http-equiv="refresh" content="3"></head><body><p>Loading...</p></body></html>`,
      );
    }
  }
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen(
  {
    port,
    host: "0.0.0.0",
    reusePort: true,
  },
  () => {
    log(`serving on port ${port}`);
  },
);

void bootstrapApplication({
  readiness: startupReadiness,
  // This runner contains structural compatibility migrations and approved
  // static seeds only. Deal maintenance is never invoked by application boot.
  migrate: runVersionedStartupMigrations,
  async initialize() {
    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("Internal Server Error:", err);

      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }
    log("Application ready");
  },
  logFailure(message, error) {
    console.error(message, error);
  },
  async terminate(exitCode) {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeAllConnections?.();
    });
    process.exit(exitCode);
  },
});
