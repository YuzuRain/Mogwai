"use client";

import { createContext, useContext } from "react";

import type { z } from "zod";
import type { profileSchema } from "@mogwai/shared";

export type Profile = z.infer<typeof profileSchema>;

export const ProfileContext = createContext<{
  profile: Profile;
  reload: () => Promise<void>;
} | null>(null);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside console layout");
  return ctx;
}
