"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewButtons({ gameId, title }: { gameId: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function review(action: "approve" | "reject") {
    let note = "";
    if (action === "reject") {
      const input = window.prompt(`Reason for rejecting "${title}" (shown to the developer):`);
      if (input === null) return;
      note = input.trim();
      if (!note) {
        window.alert("Please give a reason so the developer knows what to fix.");
        return;
      }
    }
    setBusy(true);
    const res = await fetch(`/api/admin/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "approve"
          ? { review_status: "approved", is_active: true, status: "live" }
          : { review_status: "rejected", is_active: false, review_note: note }
      ),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      window.alert("Review failed: " + (b.error || res.status));
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        onClick={() => review("approve")}
        disabled={busy}
        style={{
          fontSize: 11, fontWeight: "bold", padding: "6px 14px", borderRadius: 4,
          border: "none", cursor: "pointer",
          background: "var(--accent-green)", color: "#000",
          opacity: busy ? 0.5 : 1,
        }}
      >
        APPROVE
      </button>
      <button
        onClick={() => review("reject")}
        disabled={busy}
        style={{
          fontSize: 11, fontWeight: "bold", padding: "6px 14px", borderRadius: 4,
          cursor: "pointer", background: "transparent", color: "#ff6b6b",
          border: "1px solid #ff6b6b", opacity: busy ? 0.5 : 1,
        }}
      >
        REJECT
      </button>
    </div>
  );
}
