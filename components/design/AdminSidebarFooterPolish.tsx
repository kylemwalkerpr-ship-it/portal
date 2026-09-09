export default function AdminSidebarFooterPolish() {
  return (
    <style>{`
      /* Every dashboard already exposes Sign out from the top-right UserMenu.
         Remove the cramped duplicate action from the narrow sidebar footer,
         while leaving role-specific content (such as the student wallet card)
         untouched. */
      .yousafe-sidebar-user > div:has(> button[aria-label^="Log out"]) > button[aria-label^="Log out"] {
        display: none !important;
      }

      .yousafe-sidebar-user:has(> div > button[aria-label^="Log out"]) {
        padding: 12px 14px 14px !important;
      }

      .yousafe-sidebar-user > div:has(> button[aria-label^="Log out"]) {
        padding: 10px 12px !important;
        gap: 10px !important;
        border: 1px solid rgba(148, 163, 184, 0.22);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.035);
      }

      .yousafe-sidebar-user > div:has(> button[aria-label^="Log out"]) > div:nth-child(2) {
        min-width: 0 !important;
        overflow: hidden;
      }

      .yousafe-sidebar-user > div:has(> button[aria-label^="Log out"]) > div:nth-child(2) > div:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `}</style>
  )
}
