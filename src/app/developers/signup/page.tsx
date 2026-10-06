"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", fontSize: 14,
  background: "#0d0d1a", border: "1px solid #1a1a3e", borderRadius: 6,
  color: "#fff", fontFamily: "inherit", boxSizing: "border-box",
};

export default function DevSignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studio, setStudio] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/developers/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, studio_name: studio || null }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Signup failed");
      return;
    }
    router.push("/developers/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em", marginBottom: 8, textAlign: "center" }}>
          DEVELOPER PORTAL
        </div>
        <h1 className="neon-green" style={{ textAlign: "center", fontSize: 28, letterSpacing: "0.1em", margin: "0 0 8px" }}>
          JOIN AS A DEV
        </h1>
        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, marginBottom: 32 }}>
          List your games on HowGamersGame. Players spend coins in your game, you earn from every play.
        </p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input style={inputStyle} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input style={inputStyle} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={inputStyle} placeholder="Studio name (optional)" value={studio} onChange={(e) => setStudio(e.target.value)} />
          {error && <div style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={busy} style={{
            padding: "14px", fontSize: 14, fontWeight: "bold", letterSpacing: "0.1em",
            background: "var(--accent-green)", color: "#000", border: "none",
            borderRadius: 6, cursor: "pointer", opacity: busy ? 0.6 : 1,
          }}>
            {busy ? "CREATING..." : "CREATE DEVELOPER ACCOUNT"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
          Already have an account? <Link href="/developers/login" style={{ color: "var(--accent-green)" }}>Sign in</Link>
        </p>
        <p style={{ textAlign: "center", marginTop: 12, fontSize: 12 }}>
          <Link href="/" style={{ color: "var(--text-muted)" }}>Back to the arcade</Link>
        </p>
      </div>
    </div>
  );
}
