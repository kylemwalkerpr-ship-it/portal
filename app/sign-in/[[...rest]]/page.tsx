'use client'
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#05080f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <SignIn forceRedirectUrl="/dashboard" />
    </div>
  )
}
