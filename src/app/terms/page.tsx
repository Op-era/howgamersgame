import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — HowGamersGame',
  description: 'Terms of Service for HowGamersGame. Rules, rights, and responsibilities for using our platform.',
}

const LAST_UPDATED = 'June 16, 2025'

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navigation />
      <main style={{ flex: 1, maxWidth: 800, margin: '0 auto', padding: '48px 24px', width: '100%' }}>

        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.2em', marginBottom: 8 }}>
            // LEGAL
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 'bold', letterSpacing: '0.08em', color: 'var(--accent-green)', margin: '0 0 8px' }}>
            TERMS OF SERVICE
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Last updated: {LAST_UPDATED} &bull; Haven Command LLC
          </p>
        </div>

        {[
          {
            title: '1. ACCEPTANCE OF TERMS',
            body: `By accessing or using HowGamersGame (howgamersgame.online), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, do not use the site. These Terms constitute a legally binding agreement between you and Haven Command LLC.`,
          },
          {
            title: '2. ELIGIBILITY',
            body: `You must be at least 13 years of age to use this service. By using HowGamersGame, you represent and warrant that you meet this age requirement. If you are under 18, you must have permission from a parent or legal guardian.`,
          },
          {
            title: '3. ACCOUNTS',
            body: `To access certain features (coin balance, leaderboards, subscriptions), you must create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account at witprod@gmail.com.

We reserve the right to terminate accounts that violate these terms, engage in cheating, exploit game mechanics, or engage in any abusive behavior toward other users.`,
          },
          {
            title: '4. COIN ECONOMY',
            body: `HowGamersGame operates a virtual coin system. Coins are:
• Earned by playing games and achieving in-game milestones
• Purchasable through the coin store using real money
• Redeemable for in-game boosts, features, and premium content within the HowGamersGame platform

Coins have no monetary value outside of HowGamersGame and cannot be transferred, exchanged for cash, or refunded. Purchased coins are non-refundable except where required by applicable law. We reserve the right to modify coin prices, earning rates, and redemption options at any time.`,
          },
          {
            title: '5. SUBSCRIPTIONS',
            body: `Gamer Passes are offered as monthly subscriptions billed through Stripe. By subscribing, you authorize us to charge your payment method on a recurring monthly basis.

You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period — you retain access to subscriber benefits until that date. We do not provide prorated refunds for partial months.

We reserve the right to change subscription pricing with 30 days notice to subscribers.`,
          },
          {
            title: '6. ACCEPTABLE USE',
            body: `You agree not to:
• Cheat, exploit bugs, or use bots or scripts to gain unfair advantages in games
• Reverse engineer, decompile, or attempt to extract source code from our games or platform
• Attempt to disrupt, damage, or gain unauthorized access to our systems
• Harass, abuse, or harm other users
• Post or transmit any content that is illegal, offensive, or infringes on the rights of others
• Use the platform for any commercial purpose without our express written consent
• Circumvent any access controls or attempt to access restricted areas of the site`,
          },
          {
            title: '7. INTELLECTUAL PROPERTY',
            body: `All content on HowGamersGame — including games, graphics, logos, text, and software — is owned by Haven Command LLC or its content suppliers and is protected by applicable intellectual property laws.

You are granted a limited, non-exclusive, non-transferable license to access and use the site and its games for personal, non-commercial entertainment purposes only. No rights are transferred to you beyond this limited license.`,
          },
          {
            title: '8. USER-GENERATED CONTENT',
            body: `If you submit any content to our platform (usernames, leaderboard names, developer submissions), you grant us a worldwide, royalty-free license to use, display, and distribute that content in connection with the platform. You represent that you own or have the right to submit such content and that it does not violate any third-party rights.`,
          },
          {
            title: '9. THIRD-PARTY SERVICES',
            body: `Our platform integrates third-party services including Supabase (database and authentication), Stripe (payments), and Google AdSense (advertising). Your use of these services is subject to their respective terms and privacy policies. We are not responsible for the practices or content of third-party services.`,
          },
          {
            title: '10. ADVERTISEMENTS',
            body: `HowGamersGame displays advertisements served by Google AdSense and potentially other advertising networks. We are not responsible for the content of these advertisements. Subscriber pass holders may access reduced or ad-free experiences as described in their pass benefits.`,
          },
          {
            title: '11. DISCLAIMER OF WARRANTIES',
            body: `THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. YOUR USE OF THE PLATFORM IS AT YOUR SOLE RISK.`,
          },
          {
            title: '12. LIMITATION OF LIABILITY',
            body: `TO THE FULLEST EXTENT PERMITTED BY LAW, HAVEN COMMAND LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF OR INABILITY TO USE THE PLATFORM, INCLUDING LOSS OF COINS, VIRTUAL ITEMS, OR DATA, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.`,
          },
          {
            title: '13. CHANGES TO TERMS',
            body: `We reserve the right to modify these Terms at any time. Material changes will be communicated by updating the "Last updated" date on this page. Continued use of the platform after changes constitutes your acceptance of the revised Terms.`,
          },
          {
            title: '14. GOVERNING LAW',
            body: `These Terms shall be governed by the laws of the United States. Any disputes arising under these Terms shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association, except where prohibited by law.`,
          },
          {
            title: '15. CONTACT',
            body: `For questions about these Terms, please contact us:

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
          <Link href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>PRIVACY POLICY</Link>
          <Link href="/contact" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>CONTACT</Link>
        </div>
        &copy; {new Date().getFullYear()} Haven Command LLC. All rights reserved.
      </footer>
    </div>
  )
}
