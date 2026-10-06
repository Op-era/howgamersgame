import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

const ADMIN_EMAILS = ["witprod@gmail.com"];

/** Page guard. Rewritten 2026-10-06: HMAC session (Supabase removed). */
export async function requireAdmin() {
  let user: { id: string; email: string } | null = null;
  try {
    user = await getSessionUser();
  } catch {
    user = null;
  }
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    redirect("/");
  }
  return user;
}
