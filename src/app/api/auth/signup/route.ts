import { createClient } from '@supabase/supabase-js'
import { sendConfirmationEmail } from '@/lib/resend/client'
import { NextResponse } from 'next/server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { email, password, username } = await req.json()

  const displayName = (username as string)?.trim() || email.split('@')[0]
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: {
      data: { full_name: displayName },
      redirectTo,
    },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  try {
    await sendConfirmationEmail(email, displayName, data.properties.action_link)
  } catch (mailErr: any) {
    return NextResponse.json({ error: 'Account created but email failed: ' + mailErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
