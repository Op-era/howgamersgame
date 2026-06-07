import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendCoinPurchaseEmail(
  to: string,
  displayName: string,
  packageName: string,
  coins: number,
  amountCents: number
) {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to,
    subject: `You got ${coins.toLocaleString()} coins! 🎮`,
    html: `
      <div style="font-family: monospace; background: #0a0a0f; color: #00ff88; padding: 32px; border-radius: 8px; max-width: 480px;">
        <h1 style="color: #00ff88; font-size: 24px; margin: 0 0 16px;">COINS LOADED ⚡</h1>
        <p style="color: #ccc; margin: 0 0 24px;">Hey ${displayName},</p>
        <p style="color: #ccc;">Your <strong style="color: #00ff88;">${packageName}</strong> pack has been delivered.</p>
        <div style="background: #1a1a2e; border: 1px solid #00ff88; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
          <div style="font-size: 48px; color: #ffd700; font-weight: bold;">${coins.toLocaleString()}</div>
          <div style="color: #888; font-size: 14px; margin-top: 8px;">COINS ADDED TO YOUR WALLET</div>
        </div>
        <p style="color: #666; font-size: 12px;">Amount charged: $${(amountCents / 100).toFixed(2)}</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="display: inline-block; background: #00ff88; color: #000; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold; margin-top: 16px;">PLAY NOW →</a>
      </div>
    `,
  })
}
