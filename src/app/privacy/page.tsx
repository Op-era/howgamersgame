import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — HowGamersGame',
  description: 'Privacy Policy for HowGamersGame. Learn how we collect, use, and protect your data.',
}

const LAST_UPDATED = 'June 16, 2025'

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navigation />
      <main style={{ flex: 1, maxWidth: 800, margin: '0 auto', padding: '48px 24px', width: '100%' }}>

        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.2em', marginBottom: 8 }}>
            // LEGAL
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 'bold', letterSpacing: '0.08em', color: 'var(--accent-green)', margin: '0 0 8px' }}>
            PRIVACY POLICY
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Last updated: {LAST_UPDATED} &bull; Haven Command LLC
          </p>
        </div>

        {[
          {
            title: '1. WHO WE ARE',
            body: `HowGamersGame (howgamersgame.online) is operated by Haven Command LLC. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our gaming services. Please read this policy carefully. If you disagree with its terms, please discontinue use of the site.`,
          },
          {
            title: '2. INFORMATION WE COLLECT',
            body: `We collect information you voluntarily provide when you create an account (email address, username), make purchases (processed by Stripe — we do not store payment card data), or contact us.

We also automatically collect certain technical information when you visit the site, including your IP address, browser type, operating system, referring URLs, pages viewed, and time spent on the site. This data is collected via cookies, log files, and similar tracking technologies.`,
          },
          {
            title: '3. HOW WE USE YOUR INFORMATION',
            body: `We use your information to:
• Operate and maintain the platform and game services
• Process transactions and manage your coin balance
• Send account-related emails (transactional only — no marketing without consent)
• Monitor and analyze site usage to improve the experience
• Detect, prevent, and address technical issues or abuse
• Comply with legal obligations`,
          },
          {
            title: '4. GOOGLE ADSENSE & THIRD-PARTY ADVERTISING',
            body: `We use Google AdSense to display advertisements on this site. Google AdSense uses cookies to serve ads based on your prior visits to this website and other sites on the internet.

Google's use of advertising cookies enables it and its partners to serve ads based on your visit to this site and/or other sites on the Internet. You may opt out of personalized advertising by visiting Google's Ads Settings at https://www.google.com/settings/ads or by visiting the Network Advertising Initiative opt-out page.

Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to your website or other websites. These cookies allow Google and its partners to serve ads based on your activity across the web. To learn more about how Google uses data when you use our partners' sites or apps, visit https://www.google.com/policies/privacy/partners.

We do not control the cookies placed by Google AdSense and are not responsible for the content of third-party advertisements or the practices of third-party advertisers.`,
          },
          {
            title: '5. COOKIES',
            body: `We use cookies and similar tracking technologies to track activity on our platform and hold certain information. Cookies are files with a small amount of data that may include an anonymous unique identifier.

We use the following types of cookies:
• Session cookies — to operate our service and maintain your login state
• Preference cookies — to remember your settings and game preferences
• Analytics cookies — to understand how you use our site (Google Analytics)
• Advertising cookies — served by Google AdSense for ad personalization

You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our service.`,
          },
          {
            title: '6. DATA SHARING & DISCLOSURE',
            body: `We do not sell, trade, or rent your personal information to third parties. We may share your information with:
• Service providers who assist us in operating the website (Supabase for database/auth, Stripe for payments, Vercel for hosting)
• Law enforcement or government agencies when required by law
• Successor entities in the event of a merger or acquisition

All service providers are bound by contractual obligations to keep personal information confidential.`,
          },
          {
            title: '7. DATA RETENTION',
            body: `We retain your personal information for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by contacting us at witprod@gmail.com. We will delete your data within 30 days of a verified request, except where retention is required by law.`,
          },
          {
            title: '8. CHILDREN\'S PRIVACY',
            body: `Our platform is intended for users aged 13 and older. We do not knowingly collect personal information from children under 13. If we become aware that a child under 13 has provided us with personal information, we will take steps to delete that information promptly. If you believe your child has provided us with personal information, please contact us immediately.`,
          },
          {
            title: '9. YOUR RIGHTS',
            body: `Depending on your location, you may have the following rights regarding your personal data:
• The right to access the personal data we hold about you
• The right to correct inaccurate or incomplete data
• The right to request deletion of your data
• The right to object to or restrict processing of your data
• The right to data portability

To exercise any of these rights, please contact us at witprod@gmail.com.`,
          },
          {
            title: '10. SECURITY',
            body: `We implement reasonable technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. These include HTTPS encryption, secure authentication via Supabase, and access controls. However, no method of transmission over the Internet is 100% secure and we cannot guarantee absolute security.`,
          },
          {
            title: '11. CHANGES TO THIS POLICY',
            body: `We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page with an updated "Last updated" date. Your continued use of the site after changes constitutes acceptance of the updated policy.`,
          },
          {
            title: '12. CONTACT US',
            body: `If you have questions about this Privacy Policy or how we handle your data, please contact us:

Haven Command LLC
Email: witprod@gmail.com
Website: https://howgamersgame.online/contact`,
          },
        ].map(({ title, body }) => (
          <section key={title} style={{ marginBottom: 36 }}>
            <h2 style={{ color: 'var(--accent-gold)', fontSize: 12, letterSpacing: '0.15em', marginBottom: 12 }}>
              {title}
            </h2>
            {body.split('\n\n').map((para, i) => (
              <p key={i} style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: 14, margin: '0 0 12px', whiteSpace: 'pre-line' }}>
                {para}
              </p>
            ))}
          </section>
        ))}

      </main>

      <footer style={{
        borderTop: '1px solid #1a1a3e',
        padding: '24px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 12,
        letterSpacing: '0.05em',
      }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
          <Link href="/about" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>ABOUT</Link>
          <Link href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>TERMS OF SERVICE</Link>
          <Link href="/contact" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>CONTACT</Link>
        </div>
        &copy; {new Date().getFullYear()} Haven Command LLC. All rights reserved.
      </footer>
    </div>
  )
}
