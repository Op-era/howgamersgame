"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Navigation from "@/components/layout/Navigation"

function ResetForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const welcome = searchParams.get("welcome") === "1"
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!token) {
      setError("This reset link is invalid or has expired.")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || "Reset failed. Please try again.")
      } else {
        setDone(true)
      }
    } catch {
      setError("Something went wrong. Please try again.")
    }
    setLoading(false)
  }

  const inputStyle = {
    width: "100%",
    background: "var(--console-dark)",
    border: "1px solid #2a2a5e",
    borderRadius: 6,
    padding: "10px 14px",
    color: "#fff",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box" as const,
  }

  const labelStyle = {
    fontSize: 11,
    color: "var(--text-muted)",
    letterSpacing: "0.1em",
    display: "block" as const,
    marginBottom: 6,
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 41px)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--console-body)",
          border: "1px solid #1a1a3e",
          borderRadius: 12,
          padding: 32,
        }}
      >
        <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "#fff", letterSpacing: "0.1em" }}>
          {welcome ? "CHOOSE YOUR PASSWORD" : "SET NEW PASSWORD"}
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 12, color: "var(--text-muted)" }}>
          {welcome
            ? "Confirm your email by choosing a password for your account."
            : "Choose a new password for your account."}
        </p>

        {done ? (
          <div>
            <div
              style={{
                background: "rgba(0,255,136,0.1)",
                border: "1px solid var(--accent-green)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                fontSize: 12,
                color: "var(--accent-green)",
                letterSpacing: "0.05em",
              }}
            >
              Password set! You can now log in with your new password.
            </div>
            <Link
              href="/auth/login"
              style={{ color: "var(--accent-green)", fontSize: 13, letterSpacing: "0.1em", textDecoration: "none" }}
            >
              GO TO LOG IN →
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>NEW PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>CONFIRM PASSWORD</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>
            {error && <p style={{ color: "#ff4444", fontSize: 12, margin: 0 }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? "#333" : "var(--accent-green)",
                color: "#000",
                border: "none",
                borderRadius: 6,
                padding: "12px 24px",
                fontSize: 13,
                fontWeight: "bold",
                letterSpacing: "0.15em",
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {loading ? "..." : "SET PASSWORD"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <Navigation />
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </div>
  )
}
