/* ─────────────────────────────────────────────────────────────────────────
   App root — wires the store, three-column layout, and all modals.
   ───────────────────────────────────────────────────────────────────── */

function App() {
  const store = window.useStore();
  const { state, setUI, sendMessage, setActive } = store;

  const [imageViewerMsg, setImageViewerMsg] = React.useState(null);
  const [forwardMsg,     setForwardMsg]     = React.useState(null);
  const [showArchived,   setShowArchived]   = React.useState(false);
  const [showStarred,    setShowStarred]    = React.useState(false);
  const [showSettings,   setShowSettings]   = React.useState(false);
  const [showNewChat,    setShowNewChat]    = React.useState(false);
  const [showInquiryComposer, setShowInquiryComposer] = React.useState(false);
  const [statusPersonId, setStatusPersonId] = React.useState(null);
  const [ticketModal, setTicketModal]       = React.useState(null); // { order, conv }

  /* Expose a tiny helper for the NewChat modal to materialise a fresh
     conversation row in seed-only mode. In production this is the
     /api/messages/start endpoint. */
  React.useEffect(() => {
    window._mc_startChat = (personId) => {
      const existing = state.conversations.find(c => c.type === 'dm' && c.counterpart_id === personId);
      if (existing) { setActive(existing.id); return; }
      /* Use sendMessage on a synthesised new conversation. We do it by
         seeding a new row in state through a system message. */
      const cid = `c_new_${Date.now()}`;
      /* Inject directly via a one-off setState. */
      const ui = state.ui;
      const conv = {
        id: cid, type: 'dm', counterpart_id: personId,
        context_kind: 'general', context_label: null,
        pinned_at: null, archived_at: null, muted_until: null, blocked: false,
        last_message_at: null, last_message_id: null, last_message_snippet: null,
        last_message_from_me: false, unread: 0,
      };
      /* We can't reach setState from here without exposing it. Patch the
         store inline via a tiny dispatch. */
      const newConvs = [conv, ...state.conversations];
      /* Use the persisted localStorage and force-reload pattern: write
         straight to localStorage and reload the in-memory store. */
      const next = { ...state, conversations: newConvs, messages: { ...state.messages, [cid]: [] }, ui: { ...ui, active_id: cid } };
      try { localStorage.setItem('mc_whatsapp_v6', JSON.stringify(next)); } catch (e) {}
      window.location.reload();
    };
    return () => { delete window._mc_startChat; };
  }, [state, setActive]);

  /* Apply theme/accent/wallpaper to the root */
  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme     = state.ui.theme;
    root.dataset.accent    = state.ui.accent;
    root.dataset.wallpaper = state.ui.wallpaper;
    root.dataset.density   = state.ui.density;
    root.style.setProperty('--msg-font-size', state.ui.font_size + 'px');
  }, [state.ui]);

  /* Role-aware shell. Each role gets its own left rail + center pane. */
  const role = state.me.role;
  const isSupport = role === 'support';
  const isAdmin   = role === 'admin';

  let leftRail, centerPane;
  if (isSupport) {
    leftRail = <window.SupportShell onOpenSettings={() => setShowSettings(true)}/>;
    centerPane = <window.SupportConversationView onOpenTicketModal={(order, conv) => setTicketModal({ order, conv })}/>;
  } else if (isAdmin) {
    leftRail = <window.AdminTicketsShell onOpenSettings={() => setShowSettings(true)}/>;
    centerPane = <window.AdminTicketView/>;
  } else if (state.ui.view === 'marketplace' && ['attorney','consultant'].includes(role)) {
    leftRail = <window.MarketplaceFeed
        onOpenSettings={() => setShowSettings(true)}
        onOpenStarred={() => setShowStarred(true)}
        onNewChat={() => setShowNewChat(true)}
        onOpenStatus={setStatusPersonId}
      />;
    centerPane = <window.ChatView onForwardMessage={setForwardMsg} onOpenImageViewer={setImageViewerMsg} onOpenStatus={setStatusPersonId}/>;
  } else {
    leftRail = <window.ChatList
        onOpenArchived={() => setShowArchived(true)}
        onOpenStarred={() => setShowStarred(true)}
        onOpenSettings={() => setShowSettings(true)}
        onNewChat={() => setShowNewChat(true)}
        onPostInquiry={() => setShowInquiryComposer(true)}
        onOpenStatus={setStatusPersonId}
      />;
    centerPane = <window.ChatView onForwardMessage={setForwardMsg} onOpenImageViewer={setImageViewerMsg} onOpenStatus={setStatusPersonId}/>;
  }

  return (
    <div className="shell" data-role={role}>
      {leftRail}
      {centerPane}

      {imageViewerMsg && (
        <window.Modals.ImageViewer
          message={imageViewerMsg}
          conv={state.conversations.find(c => c.id === state.ui.active_id)}
          onClose={() => setImageViewerMsg(null)}
          onForward={(m) => { setImageViewerMsg(null); setForwardMsg(m); }}
        />
      )}
      {forwardMsg && (
        <window.Modals.ForwardPicker
          message={forwardMsg}
          onClose={() => setForwardMsg(null)}
        />
      )}
      {showArchived && <window.Modals.ArchivedView   onClose={() => setShowArchived(false)}/>}
      {showStarred  && <window.Modals.StarredView    onClose={() => setShowStarred(false)}/>}
      {showSettings && <window.Modals.SettingsPanel  onClose={() => setShowSettings(false)}/>}
      {showNewChat  && <window.Modals.NewChatModal   onClose={() => setShowNewChat(false)}/>}

      {showInquiryComposer && (
        <window.InquiryComposer onClose={(inq) => {
          setShowInquiryComposer(false);
          if (inq) setTimeout(() => setStatusPersonId('me'), 250);
        }}/>
      )}
      {statusPersonId && (
        <window.InquiryStatusViewer
          personId={statusPersonId}
          onClose={() => setStatusPersonId(null)}
        />
      )}
      {ticketModal && (
        <window.RefundTicketModal
          order={ticketModal.order}
          conv={ticketModal.conv}
          onClose={() => setTicketModal(null)}
        />
      )}

      <window.Modals.ToastHost/>
    </div>
  );
}

/* Mount */
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  React.createElement(window.StoreProvider, null,
    React.createElement(App)
  )
);
