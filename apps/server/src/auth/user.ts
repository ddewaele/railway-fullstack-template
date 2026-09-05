import type { User } from "@repo/shared";
import { db } from "../db/client.js";
import { users, type UserRow } from "../db/schema.js";

export type GoogleProfile = { id: string; email: string; name?: string; picture?: string };

/** Creates the user on first login, refreshes profile fields afterwards. */
export async function upsertGoogleUser(profile: GoogleProfile): Promise<UserRow> {
  const values = {
    googleId: profile.id,
    email: profile.email,
    name: profile.name ?? profile.email,
    avatarUrl: profile.picture ?? null,
  };
  const [user] = await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.googleId,
      set: { email: values.email, name: values.name, avatarUrl: values.avatarUrl },
    })
    .returning();
  if (!user) throw new Error("Failed to upsert user");
  return user;
}

export function toPublicUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatarUrl };
}
