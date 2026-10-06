import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionDev } from "@/lib/auth/devSession";
import { query } from "@/lib/db/pg";
import ApiKeyManager from "./ApiKeyManager";

export const dynamic = "force-dynamic";

const REVIEW_STYLES: Record<string, { label: string; color: string }> = {
  pending: { label: "IN REVIEW", color: "var(--accent-gold)" },
  approved: { label: "LIVE", color: "var(--accent-green)" },
  rejected: { label: "NEEDS WORK", color: "#ff6b6b" },
};

export default async function DevDashboardPage() {
  const dev = await getSessionDev();
  if (!dev) redirect("/developers/login");

  const r = await query(
    ["SELECT g.id, g.slug, g.title, g.description, g.genre, g.game_url,",
     "g.is_active, g.play_count, g.review_status, g.review_note, g.submitted_at,",
     "COALESCE(SUM(CASE WHEN t.type = $2 THEN t.amount ELSE 0 END), 0) AS tokens_awarded,",
     "COALESCE(SUM(CASE WHEN t.type = $3 THEN t.amount ELSE 0 END), 0) AS tokens_spent",
     "FROM games g",
     "LEFT JOIN coin_transactions t ON t.game_id = g.id",
     "WHERE g.developer_id = $1",
     "GROUP BY g.id",
     "ORDER BY g.created_at DESC"].join(" "),
    [dev.id, "award", "spend"]
  );
  const games = r.rows as Array<{
    id: string; slug: string; title: string; description: string | null;
    genre: string | null; game_url: string; is_active: boolean;
    play_count: number; review_status: string; review_note: string | null;
    submitted_at: string | null; tokens_awarded: string; tokens_spent: string;
  }>;

  return (
    <div style={{ minHeight: "100vh", padding: "40px 24px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em", marginBottom: 4 }}>
            DEVELOPER PORTAL
          </div>
          <h1 className="neon-green" style={{ margin: 0, fontSize: 26, letterSpacing: "0.1em" }}>
            {dev.studio_name ?? dev.name}
          </h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{dev.email}</div>
        </div>
        <Link href="/developers/games/new" style={{
          background: "var(--accent-green)", color: "#000", fontWeight: "bold",
          fontSize: 12, padding: "10px 20px", borderRadius: 6,
          textDecoration: "none", letterSpacing: "0.1em",
        }}>
          + SUBMIT GAME
        </Link>
      </div>

      {games.length === 0 && (
        <div style={{
          marginTop: 40, padding: 48, textAlign: "center",
          background: "var(--console-body)", border: "1px solid #1a1a3e", borderRadius: 8,
        }}>
          <div style={{ fontSize: 15, color: "#fff", marginBottom: 8 }}>No games yet</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
            Submit your first game and reach players who play with real coins.
          </div>
          <Link href="/developers/games/new" style={{ color: "var(--accent-green)", fontSize: 14 }}>
            Submit your game
          </Link>
        </div>
      )}

      {games.map((g) => {
        const rs = REVIEW_STYLES[g.review_status] ?? REVIEW_STYLES.pending;
        return (
          <div key={g.id} style={{
            marginTop: 20, background: "var(--console-body)",
            border: "1px solid #1a1a3e", borderRadius: 8, padding: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, color: "#fff", fontWeight: "bold" }}>{g.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  {g.genre ?? "no genre"} | /play/{g.slug}
                </div>
              </div>
              <span style={{
                fontSize: 10, padding: "4px 12px", borderRadius: 10,
                background: "rgba(255,255,255,0.06)", color: rs.color, letterSpacing: "0.15em",
                whiteSpace: "nowrap",
              }}>
                {rs.label}
              </span>
            </div>

            {g.review_status === "rejected" && g.review_note && (
              <div style={{
                marginTop: 12, padding: 12, borderRadius: 6,
                background: "rgba(255,107,107,0.08)", border: "1px solid #ff6b6b",
                fontSize: 13, color: "#ffb3b3",
              }}>
                Reviewer note: {g.review_note}
              </div>
            )}

            <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.15em" }}>PLAYS</div>
                <div style={{ fontSize: 18, color: "#fff" }}>{Number(g.play_count ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.15em" }}>TOKENS SPENT IN GAME</div>
                <div style={{ fontSize: 18, color: "#fff" }}>{Number(g.tokens_spent ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.15em" }}>TOKENS AWARDED</div>
                <div style={{ fontSize: 18, color: "var(--accent-green)" }}>{Number(g.tokens_awarded ?? 0).toLocaleString()}</div>
              </div>
            </div>

            {g.review_status === "approved" && <ApiKeyManager gameId={g.id} />}
          </div>
        );
      })}

      <div style={{ marginTop: 32, textAlign: "center" }}>
        <Link href="/" style={{ color: "var(--text-muted)", fontSize: 12 }}>Back to the arcade</Link>
      </div>
    </div>
  );
}
