import { escapeHtml } from '../coins/html.ts'

export function confirmationEmailHtml(displayName: string, confirmUrl: string): string {
  return `
      <div style="font-family: monospace; background: #0a0a0f; color: #00ff88; padding: 32px; border-radius: 8px; max-width: 480px;">
        <h1 style="color: #00ff88; font-size: 22px; margin: 0 0 8px; letter-spacing: 0.15em;">WELCOME ⚡</h1>
        <p style="color: #ccc; margin: 0 0 8px;">Hey ${escapeHtml(displayName)},</p>
        <p style="color: #ccc; margin: 0 0 24px;">One more step: confirm your email and choose your password to start playing.</p>
        <a href="${escapeHtml(confirmUrl)}" style="display: inline-block; background: #00ff88; color: #000; padding: 14px 28px; border-radius: 4px; text-decoration: none; font-weight: bold; font-size: 13px; letter-spacing: 0.1em;">CONFIRM EMAIL & SET PASSWORD →</a>
        <p style="color: #444; font-size: 11px; margin-top: 32px;">If you didn't create an account, ignore this email.</p>
      </div>
    `
}

export function passwordResetEmailHtml(resetUrl: string): string {
  return `
      <div style="font-family: monospace; background: #0a0a0f; color: #00ff88; padding: 32px; border-radius: 8px; max-width: 480px;">
        <h1 style="color: #00ff88; font-size: 22px; margin: 0 0 8px; letter-spacing: 0.15em;">PASSWORD RESET 🔑</h1>
        <p style="color: #ccc; margin: 0 0 24px;">Click the button below to set a new password. This link expires in 1 hour.</p>
        <a href="${escapeHtml(resetUrl)}" style="display: inline-block; background: #00ff88; color: #000; padding: 14px 28px; border-radius: 4px; text-decoration: none; font-weight: bold; font-size: 13px; letter-spacing: 0.1em;">RESET PASSWORD →</a>
        <p style="color: #444; font-size: 11px; margin-top: 32px;">If you didn't request this, ignore this email.</p>
      </div>
    `
}
