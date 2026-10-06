"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", fontSize: 14,
  background: "#0d0d1a", border: "1px solid #1a1a3e", borderRadius: 6,
  color: "#fff", fontFamily: "inherit", boxSizing: "border-box",
};

export default function DevLoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/developers/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Sign in failed");
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
        <h1 className="neon-green" style={{ textAlign: "center", fontSize: 28, letterSpacing: "0.1em", margin: "0 0 32px" }}>
          DEV SIGN IN
        </h1>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input style={inputStyle} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {error && <div style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={busy} style={{
            padding: "14px", fontSize: 14, fontWeight: "bold", letterSpacing: "0.1em",
            background: "var(--accent-green)", color: "#000", border: "none",
            borderRadius: 6, cursor: "pointer", opacity: busy ? 0.6 : 1,
          }}>
            {busy ? "SIGNING IN..." : "SIGN IN"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
          New here? <Link href="/developers/signup" style={{ color: "var(--accent-green)" }}>Create a developer account</Link>
        </p>
      </div>
    </div>
  );
}
