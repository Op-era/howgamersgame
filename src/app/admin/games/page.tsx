import { requireAdmin } from "@/lib/auth/adminGuard";
import { query } from "@/lib/db/pg";
import { gamePlayUrl, gameTestUrl } from "@/types/game";
import Link from "next/link";
import type { Game } from "@/types/game";
import PromoteButton from "./PromoteButton";
import ReviewButtons from "./ReviewButtons";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<Game["status"], { label: string; bg: string; color: string }> = {
  draft: { label: "DRAFT", bg: "rgba(255,255,255,0.08)", color: "#aaa" },
  testing: { label: "TESTING", bg: "rgba(255,184,0,0.15)", color: "var(--accent-gold)" },
  live: { label: "LIVE", bg: "rgba(0,255,136,0.15)", color: "var(--accent-green)" },
};

interface AdminGame extends Game {
  review_status: string;
  review_note: string | null;
  submitted_at: string | null;
  developer_name: string | null;
  developer_email: string | null;
  studio_name: string | null;
}

export default async function AdminGamesPage() {
  await requireAdmin();
  const r = await query(
    `SELECT g.*, d.name AS developer_name, d.email AS developer_email, d.studio_name
     FROM games g LEFT JOIN developers d ON d.id = g.developer_id
     ORDER BY g.sort_order`
  );
  const games = r.rows as AdminGame[];
  const pending = games.filter((g) => g.review_status === "pending");
  const rest = games.filter((g) => g.review_status !== "pending");

  return (
    <div style={{ minHeight: "100vh", padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em", marginBottom: 4 }}>
            ADMIN
          </div>
          <h1 className="neon-green" style={{ margin: 0, fontSize: 24, letterSpacing: "0.15em" }}>
            GAME MANAGEMENT
          </h1>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/" style={{ color: "var(--text-muted)", fontSize: 12, textDecoration: "none", padding: "10px 16px" }}>
            Back to site
          </Link>
          <Link href="/admin/payouts" style={{
            color: "var(--accent-gold)", fontSize: 12, textDecoration: "none",
            padding: "10px 16px", border: "1px solid var(--accent-gold)", borderRadius: 6,
          }}>
            PAYOUTS
          </Link>
          <Link href="/admin/games/new" style={{
            background: "var(--accent-green)", color: "#000", fontWeight: "bold",
            fontSize: 12, padding: "10px 20px", borderRadius: 6,
            textDecoration: "none", letterSpacing: "0.1em",
          }}>
            + ADD GAME
          </Link>
        </div>
      </div>

      {pending.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 14, color: "var(--accent-gold)", letterSpacing: "0.15em", marginBottom: 12 }}>
            PENDING REVIEW ({pending.length})
          </h2>
          <div style={{ background: "var(--console-body)", border: "1px solid var(--accent-gold)", borderRadius: 8, overflow: "hidden" }}>
            {pending.map((game, i) => (
              <div key={game.id} style={{
                padding: "16px 20px",
                borderBottom: i < pending.length - 1 ? "1px solid #0d0d1a" : "none",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 14, color: "#fff", fontWeight: "bold", marginBottom: 4 }}>
                    {game.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                    by {game.developer_name ?? "unknown"}{game.studio_name ? ` (${game.studio_name})` : ""} • {game.developer_email ?? ""}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {game.genre ?? "no genre"} • <a href={game.game_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-green)" }}>preview game URL</a>
                  </div>
                  {game.description && (
                    <div style={{ fontSize: 12, color: "#ccc", marginTop: 6, maxWidth: 560 }}>{game.description}</div>
                  )}
                </div>
                <ReviewButtons gameId={game.id} title={game.title} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        background: "var(--console-body)", border: "1px solid #1a1a3e",
        borderRadius: 8, overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 100px 90px 70px 90px 170px",
          padding: "10px 20px", borderBottom: "1px solid #1a1a3e",
          fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.15em",
        }}>
          <span>TITLE</span><span>TYPE</span><span>GENRE</span><span>PLAYS</span><span>STATUS</span>
          <span style={{ textAlign: "right" }}>ACTIONS</span>
        </div>

        {!rest?.length && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No games yet. <Link href="/admin/games/new" style={{ color: "var(--accent-green)" }}>Add your first game</Link>
          </div>
        )}

        {rest?.map((game: AdminGame, i: number) => {
          const status = STATUS_STYLES[game.status];
          return (
          <div key={game.id} style={{
            display: "grid", gridTemplateColumns: "1fr 100px 90px 70px 90px 170px",
            padding: "14px 20px",
            borderBottom: i < rest.length - 1 ? "1px solid #0d0d1a" : "none",
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 13, color: "#fff", fontWeight: "bold", marginBottom: 2 }}>
                {game.title}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                /play/{game.slug}{!game.is_active && " • hidden"}{game.developer_id && " • dev submission"}
                {game.review_status === "rejected" && " • rejected"}
              </div>
            </div>
            <div>
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 10,
                background: game.game_type === "supabase" ? "rgba(0,255,136,0.15)" : "rgba(124,58,237,0.2)",
                color: game.game_type === "supabase" ? "var(--accent-green)" : "#a78bfa",
                letterSpacing: "0.1em",
              }}>
                {game.game_type.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{game.genre ?? "—"}</div>
            <div style={{ fontSize: 12, color: "#fff" }}>{Number(game.play_count ?? 0).toLocaleString()}</div>
            <div>
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 10,
                background: status.bg, color: status.color, letterSpacing: "0.1em",
              }}>
                {status.label}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              {game.status === "testing" && <PromoteButton gameId={game.id} />}
              <Link href={game.status === "live" ? gamePlayUrl(game.slug) : gameTestUrl(game.slug)} target="_blank" style={{
                fontSize: 11, color: "var(--text-muted)", textDecoration: "none",
                padding: "4px 8px", border: "1px solid #333", borderRadius: 4,
              }}>
                {game.status === "live" ? "PLAY" : "TEST"}
              </Link>
              <Link href={`/admin/games/${game.id}`} style={{
                fontSize: 11, color: "var(--accent-green)", textDecoration: "none",
                padding: "4px 8px", border: "1px solid var(--accent-green)", borderRadius: 4,
              }}>
                EDIT
              </Link>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
