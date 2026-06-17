import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY!)

const FROM = () => process.env.RESEND_FROM_EMAIL!
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://howgamersgame.online'

export async function sendConfirmationEmail(to: string, displayName: string, confirmUrl: string) {
  await resend.emails.send({
    from: FROM(),
    to,
    subject: 'Confirm your HowGamersGame account',
    html: `
      <div style="font-family: monospace; background: #0a0a0f; color: #00ff88; padding: 32px; border-radius: 8px; max-width: 480px;">
        <h1 style="color: #00ff88; font-size: 22px; margin: 0 0 8px; letter-spacing: 0.15em;">ACCOUNT CREATED ⚡</h1>
        <p style="color: #ccc; margin: 0 0 8px;">Hey ${displayName},</p>
        <p style="color: #ccc; margin: 0 0 24px;">One more step — confirm your email to start playing.</p>
        <a href="${confirmUrl}" style="display: inline-block; background: #00ff88; color: #000; padding: 14px 28px; border-radius: 4px; text-decoration: none; font-weight: bold; font-size: 13px; letter-spacing: 0.1em;">CONFIRM EMAIL →</a>
        <p style="color: #444; font-size: 11px; margin-top: 32px;">If you didn't create an account, ignore this email.</p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await resend.emails.send({
    from: FROM(),
    to,
    subject: 'Reset your HowGamersGame password',
    html: `
      <div style="font-family: monospace; background: #0a0a0f; color: #00ff88; padding: 32px; border-radius: 8px; max-width: 480px;">
        <h1 style="color: #00ff88; font-size: 22px; margin: 0 0 8px; letter-spacing: 0.15em;">PASSWORD RESET 🔑</h1>
        <p style="color: #ccc; margin: 0 0 24px;">Click the button below to set a new password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display: inline-block; background: #00ff88; color: #000; padding: 14px 28px; border-radius: 4px; text-decoration: none; font-weight: bold; font-size: 13px; letter-spacing: 0.1em;">RESET PASSWORD →</a>
        <p style="color: #444; font-size: 11px; margin-top: 32px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
  })
}

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
