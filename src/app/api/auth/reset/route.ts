import { createClient } from '@supabase/supabase-js'
import { sendPasswordResetEmail } from '@/lib/resend/client'
import { NextResponse } from 'next/server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { email } = await req.json()

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/update-password`

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  try {
    await sendPasswordResetEmail(email, data.properties.action_link)
  } catch (mailErr: any) {
    return NextResponse.json({ error: 'Email failed: ' + mailErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
