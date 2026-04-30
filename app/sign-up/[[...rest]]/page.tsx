'use client'
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#05080f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <SignUp forceRedirectUrl="/dashboard" />
    </div>
  )
}
