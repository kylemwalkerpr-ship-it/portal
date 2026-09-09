export default function AdminSidebarFooterPolish() {
  return (
    <style>{`
      /* Admin-only: the shell already exposes sign-out from the top-right
         UserMenu. The admin footer is the only single-card footer whose
         direct action is labelled exactly "Log out", so this stays isolated
         from the student, attorney, and consultant sidebars. */
      .yousafe-sidebar-user > div:only-child:has(> button[aria-label="Log out"]) > button[aria-label="Log out"] {
        display: none !important;
      }

      .yousafe-sidebar-user:has(> div:only-child > button[aria-label="Log out"]) {
        padding: 12px 14px 14px !important;
      }

      .yousafe-sidebar-user > div:only-child:has(> button[aria-label="Log out"]) {
        padding: 10px 12px !important;
        gap: 10px !important;
        border: 1px solid rgba(148, 163, 184, 0.22);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.035);
      }

      .yousafe-sidebar-user > div:only-child:has(> button[aria-label="Log out"]) > div:nth-child(2) {
        min-width: 0 !important;
        overflow: hidden;
      }

      .yousafe-sidebar-user > div:only-child:has(> button[aria-label="Log out"]) > div:nth-child(2) > div:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `}</style>
  )
}
