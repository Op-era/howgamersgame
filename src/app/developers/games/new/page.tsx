"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", fontSize: 14,
  background: "#0d0d1a", border: "1px solid #1a1a3e", borderRadius: 6,
  color: "#fff", fontFamily: "inherit", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.15em", marginBottom: 6, display: "block",
};

export default function SubmitGamePage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [gameUrl, setGameUrl] = useState("");
  const [coverArt, setCoverArt] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!acceptTerms) {
      setError("You must accept the developer terms to submit your game.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/developers/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, description, genre, game_url: gameUrl,
        cover_art_url: coverArt || null, accept_terms: true,
      }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Submission failed");
      return;
    }
    router.push("/developers/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", padding: "40px 24px", maxWidth: 640, margin: "0 auto" }}>
      <Link href="/developers/dashboard" style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}>
        Back to dashboard
      </Link>
      <h1 className="neon-green" style={{ fontSize: 26, letterSpacing: "0.1em", margin: "16px 0 8px" }}>
        SUBMIT YOUR GAME
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>
        Our team reviews every submission. Approved games go live in the arcade.
      </p>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <label style={labelStyle}>GAME TITLE</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
        </div>
        <div>
          <label style={labelStyle}>DESCRIPTION</label>
          <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </div>
        <div>
          <label style={labelStyle}>GENRE</label>
          <input style={inputStyle} value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Arcade, Puzzle, Action..." maxLength={60} />
        </div>
        <div>
          <label style={labelStyle}>GAME URL (HTTPS)</label>
          <input style={inputStyle} value={gameUrl} onChange={(e) => setGameUrl(e.target.value)} placeholder="https://yourgame.com/index.html" required />
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
            Your game is framed on our site. It must run in an iframe and work on mobile screens.
          </div>
        </div>
        <div>
          <label style={labelStyle}>COVER ART URL (OPTIONAL)</label>
          <input style={inputStyle} value={coverArt} onChange={(e) => setCoverArt(e.target.value)} placeholder="https://..." />
        </div>

        <div style={{ background: "#0d0d1a", border: "1px solid #1a1a3e", borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.15em", color: "var(--accent-gold)", marginBottom: 12 }}>
            DEVELOPER TERMS
          </div>
          <ul style={{ fontSize: 13, color: "#ccc", lineHeight: 1.7, paddingLeft: 20, margin: "0 0 16px" }}>
            <li>Non exclusive. You may list your game anywhere else, and we may feature other games like yours.</li>
            <li>We frame your game on our site and we may run our own ads around it.</li>
            <li>You may run your own ads inside your game, but you may not award tokens for ad views or clicks.</li>
            <li>Token issuance belongs to the platform alone. Tokens only ever reach players from HowGamersGame, never from a developer.</li>
          </ul>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13, color: "#fff" }}>
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16 }} />
            <span>I have read and accept the developer terms above.</span>
          </label>
        </div>

        {error && <div style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={busy} style={{
          padding: "14px", fontSize: 14, fontWeight: "bold", letterSpacing: "0.1em",
          background: "var(--accent-green)", color: "#000", border: "none",
          borderRadius: 6, cursor: "pointer", opacity: busy ? 0.6 : 1,
        }}>
          {busy ? "SUBMITTING..." : "SUBMIT FOR REVIEW"}
        </button>
      </form>
    </div>
  );
}
