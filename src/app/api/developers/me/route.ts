import { NextResponse } from "next/server";
import { getSessionDev } from "@/lib/auth/devSession";

export async function GET() {
  const dev = await getSessionDev();
  if (!dev) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ developer: dev });
}
