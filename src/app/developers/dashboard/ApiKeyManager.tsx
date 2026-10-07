"use client";

import { useState } from "react";

interface KeyInfo {
  id: string;
  key_prefix: string;
  name: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiKeyManager({ gameId }: { gameId: string }) {
  const [keys, setKeys] = useState<KeyInfo[] | null>(null);
  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/developers/games/${gameId}/keys`);
    if (res.ok) {
      const body = await res.json();
      setKeys(body.keys);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && keys === null) load();
  }

  async function generate() {
    setBusy(true);
    setNewKey(null);
    const res = await fetch(`/api/developers/games/${gameId}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Default" }),
    });
    const body = await res.json();
    setBusy(false);
    if (res.ok) {
      setNewKey(body.apiKey);
      load();
    } else {
      window.alert("Key generation failed: " + (body.error || res.status));
    }
  }

  async function revoke(keyId: string) {
    if (!window.confirm("Revoke this API key? Games using it will stop working.")) return;
    const res = await fetch(`/api/developers/games/${gameId}/keys?keyId=${keyId}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={toggle} style={{
        fontSize: 11, padding: "6px 12px", borderRadius: 4, cursor: "pointer",
        background: "transparent", color: "var(--accent-green)",
        border: "1px solid var(--accent-green)",
      }}>
        {open ? "HIDE API KEYS" : "MANAGE API KEYS"}
      </button>
      {open && (
        <div style={{ marginTop: 12, background: "#0d0d1a", border: "1px solid #1a1a3e", borderRadius: 6, padding: 14 }}>
          {newKey && (
            <div style={{ marginBottom: 12, padding: 12, background: "rgba(0,255,136,0.08)", border: "1px solid var(--accent-green)", borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: "var(--accent-green)", letterSpacing: "0.1em", marginBottom: 6 }}>
                NEW KEY, SHOWN ONCE. COPY IT NOW.
              </div>
              <div style={{ fontSize: 12, color: "#fff", wordBreak: "break-all", fontFamily: "monospace" }}>{newKey}</div>
            </div>
          )}
          {keys === null && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>}
          {keys?.map((k) => (
            <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1a1a3e" }}>
              <div>
                <span style={{ fontSize: 12, color: "#fff", fontFamily: "monospace" }}>{k.key_prefix}...</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>{k.name}</span>
                {!k.is_active && <span style={{ fontSize: 11, color: "#ff6b6b", marginLeft: 8 }}>REVOKED</span>}
              </div>
              {k.is_active && (
                <button onClick={() => revoke(k.id)} style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
                  background: "transparent", color: "#ff6b6b", border: "1px solid #ff6b6b",
                }}>
                  REVOKE
                </button>
              )}
            </div>
          ))}
          {keys && keys.filter((k) => k.is_active).length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>No active keys.</div>
          )}
          <button onClick={generate} disabled={busy} style={{
            marginTop: 10, fontSize: 12, fontWeight: "bold", padding: "8px 16px",
            borderRadius: 4, border: "none", cursor: "pointer",
            background: "var(--accent-green)", color: "#000", opacity: busy ? 0.6 : 1,
          }}>
            {busy ? "GENERATING..." : "+ GENERATE NEW KEY"}
          </button>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            Keys let your game server spend coins for plays. Games cannot award coins. Keep them secret.
          </div>
        </div>
      )}
    </div>
  );
}
