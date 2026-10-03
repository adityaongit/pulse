// The avatar (Home header, Settings › Account): an uploaded photo, else the owner's Google photo, else
// AVATAR_URL or public/avatar.*, else null, which the UI draws as a blobatar seeded by the account.
import { existsSync } from "node:fs";
import path from "node:path";
import { getConfig } from "./config";
import type { Db } from "./db";
import { instance } from "./db/schema";

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export function setOwnerPicture(db: Db, picture: string | null) {
  if (picture) db.update(instance).set({ ownerPicture: picture }).run();
}

export function avatarSrc(db: Db): string | null {
  const row = db.select({ at: instance.avatarAt, google: instance.ownerPicture }).from(instance).get();
  if (row?.at) return `/avatar?v=${row.at}`;
  if (row?.google) return row.google;
  const file = ["avatar.jpg", "avatar.png", "avatar.webp"].find((f) => existsSync(path.join(process.cwd(), "public", f)));
  return getConfig().avatarUrl ?? (file ? `/${file}` : null);
}

/** The uploaded photo, for GET /avatar. */
export function uploadedAvatar(db: Db) {
  const row = db.select({ bytes: instance.avatar, type: instance.avatarType }).from(instance).get();
  return row?.bytes && row.type ? { bytes: row.bytes, type: row.type } : null;
}

/** Stores an upload (type and size checked by the caller's schema); null removes it. */
export function setAvatar(db: Db, file: { bytes: Buffer; type: string } | null, now = Math.floor(Date.now() / 1000)) {
  db.update(instance)
    .set(file ? { avatar: file.bytes, avatarType: file.type, avatarAt: now } : { avatar: null, avatarType: null, avatarAt: null })
    .run();
}
