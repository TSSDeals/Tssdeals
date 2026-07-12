import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  upsertUserByEmail(email: string): Promise<User>;
  upsertUserByPhone(phone: string): Promise<User>;
  setPassword(userId: string, password: string): Promise<void>;
  verifyPassword(email: string, password: string): Promise<User | null>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async upsertUserByEmail(email: string): Promise<User> {
    const existing = await this.getUserByEmail(email);
    if (existing) return existing;
    const [user] = await db
      .insert(users)
      .values({ email })
      .returning();
    return user;
  }

  async upsertUserByPhone(phone: string): Promise<User> {
    const existing = await this.getUserByPhone(phone);
    if (existing) return existing;
    const [user] = await db
      .insert(users)
      .values({ phone })
      .returning();
    return user;
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(password, salt);
    await db
      .update(users)
      .set({ passwordHash: hash, passwordSalt: salt, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.passwordHash || !user.passwordSalt) return null;
    const candidate = hashPassword(password, user.passwordSalt);
    const a = Buffer.from(candidate, "hex");
    const b = Buffer.from(user.passwordHash, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return user;
  }
}

export const authStorage = new AuthStorage();
