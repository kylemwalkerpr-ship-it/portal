import type { ReactNode } from 'react'
import AdminSidebarFooterPolish from '@/components/design/AdminSidebarFooterPolish'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminSidebarFooterPolish />
      {children}
    </>
  )
}
