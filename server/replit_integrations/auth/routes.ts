import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { toPublicUser } from "@shared/models/auth";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      let user;
      if (req.user?.magicLink) {
        user = await authStorage.getUser(req.user.userId);
      } else {
        const userId = req.user.claims.sub;
        user = await authStorage.getUser(userId);
      }
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ ...toPublicUser(user), isAdmin: user.email === "justin@twinseamsports.com" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
