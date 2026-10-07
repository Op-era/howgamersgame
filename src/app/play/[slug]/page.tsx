import { notFound } from "next/navigation";
import { query } from "@/lib/db/pg";
import { getSessionUser } from "@/lib/auth/session";
import type { Game } from "@/types/game";
import PlayClient from "./PlayClient";

export const revalidate = 60;
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const r = await query("SELECT title, description FROM games WHERE slug = $1", [slug]);
    const data = r.rows[0] as { title: string; description: string | null } | undefined;
    if (!data) return {};
    return {
      title: `${data.title} — HowGamersGame`,
      description: data.description ?? undefined,
    };
  } catch {
    return {};
  }
}

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const r = await query("SELECT * FROM games WHERE slug = $1 AND is_active = TRUE", [slug]);
  const game = r.rows[0] as Game | undefined;
  if (!game) notFound();

  const user = await getSessionUser().catch(() => null);
  let coinBalance = 0;
  if (user) {
    const p = await query("SELECT coin_balance FROM profiles WHERE id = $1", [user.id]);
    const profile = p.rows[0] as { coin_balance: number } | undefined;
    coinBalance = profile?.coin_balance ?? 0;
  }

  return <PlayClient game={game} userId={user?.id ?? null} initialCoins={coinBalance} />;
}
