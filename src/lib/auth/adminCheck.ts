import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

const ADMIN_EMAILS = ["witprod@gmail.com"];

/** API route guard. Rewritten 2026-10-06: HMAC session (Supabase removed). */
export async function checkAdmin() {
  let user: { id: string; email: string } | null = null;
  try {
    user = await getSessionUser();
  } catch {
    user = null;
  }
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, error: null };
}
