import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: transactions } = await supabase
    .from('coin_transactions')
    .select('id, type, amount, description, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const balance = profile?.coin_balance ?? 0
  const totalPurchased = profile?.total_coins_purchased ?? 0

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navigation />
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 24, letterSpacing: '0.15em', marginBottom: 24 }}>
          <span className="neon-green">MY PROFILE</span>
        </h1>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 32,
        }}>
          {[
            { label: 'COIN BALANCE', value: balance.toLocaleString() + ' ⬡', color: 'var(--accent-gold)' },
            { label: 'TOTAL PURCHASED', value: totalPurchased.toLocaleString() + ' ⬡', color: 'var(--accent-green)' },
            { label: 'TRANSACTIONS', value: transactions?.length ?? 0, color: '#fff' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--console-body)',
              border: '1px solid #1a1a3e',
              borderRadius: 8,
              padding: 16,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 8 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 32 }}>
          <Link
            href="/store"
            style={{
              display: 'inline-block',
              background: 'var(--accent-gold)',
              color: '#000',
              fontWeight: 'bold',
              fontSize: 12,
              padding: '10px 24px',
              borderRadius: 6,
              textDecoration: 'none',
              letterSpacing: '0.1em',
            }}
          >
            BUY MORE COINS →
          </Link>
        </div>

        {/* Transaction history */}
        {transactions && transactions.length > 0 && (
          <div>
            <h2 style={{ fontSize: 14, letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: 16 }}>
              TRANSACTION HISTORY
            </h2>
            <div style={{
              background: 'var(--console-body)',
              border: '1px solid #1a1a3e',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              {transactions.map((tx, i) => (
                <div key={tx.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 20px',
                  borderBottom: i < transactions.length - 1 ? '1px solid #0d0d1a' : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#fff', marginBottom: 2 }}>
                      {tx.description ?? tx.type}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(tx.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 15,
                    fontWeight: 'bold',
                    color: tx.amount > 0 ? 'var(--accent-green)' : '#ff6666',
                  }}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()} ⬡
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {transactions?.length === 0 && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
            No transactions yet. <Link href="/store" style={{ color: 'var(--accent-green)' }}>Buy some coins!</Link>
          </div>
        )}
      </div>
    </div>
  )
}
