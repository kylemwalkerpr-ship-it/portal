export default function AdminSidebarFooterPolish() {
  return (
    <style>{`
      /* The admin shell already exposes sign-out from the top-right UserMenu.
         Keep the sidebar footer as a quiet identity card instead of duplicating
         the destructive action in a cramped 240px rail. */
      .yousafe-sidebar-user > div > button[aria-label="Log out"] {
        display: none !important;
      }

      .yousafe-sidebar-user {
        padding: 12px 14px 14px !important;
      }

      .yousafe-sidebar-user > div {
        padding: 10px 12px !important;
        gap: 10px !important;
        border: 1px solid rgba(148, 163, 184, 0.22);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.035);
      }

      .yousafe-sidebar-user > div > div:nth-child(2) {
        min-width: 0 !important;
        overflow: hidden;
      }

      .yousafe-sidebar-user > div > div:nth-child(2) > div:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `}</style>
  )
}
