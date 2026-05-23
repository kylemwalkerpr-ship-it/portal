/* Time / formatting helpers — match the existing
   lib/messaging/format.ts contract so swapping back is trivial. */

window.fmtTime = (s) => s ? new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

window.fmtRelative = (s) => {
  if (!s) return '';
  const d = new Date(s).getTime();
  const diff = Date.now() - d;
  if (diff < 60_000) return 'now';
  if (diff < 3600_000) return `${Math.floor(diff/60_000)}m`;
  if (diff < 86_400_000) return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff < 7 * 86_400_000) return new Date(d).toLocaleDateString('en-US', { weekday: 'short' });
  if (diff < 365 * 86_400_000) return new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  return new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
};

window.sameDay = (a, b) => {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
      && da.getMonth() === db.getMonth()
      && da.getDate() === db.getDate();
};

window.dateDivider = (s) => {
  if (!s) return '';
  const d = new Date(s);
  const now = new Date();
  if (window.sameDay(d, now)) return 'TODAY';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (window.sameDay(d, yesterday)) return 'YESTERDAY';
  if ((now - d) < 7 * 86_400_000) return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

window.fmtFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
  if (bytes < 1024*1024*1024) return (bytes/(1024*1024)).toFixed(1) + ' MB';
  return (bytes/(1024*1024*1024)).toFixed(1) + ' GB';
};

window.fmtDuration = (sec) => {
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
  return `${m}:${String(s).padStart(2,'0')}`;
};

/* What the conversation row shows under the name */
window.lastSeenString = (person, conv) => {
  if (!person) return '';
  if (person.online) return 'online';
  if (!person.last_seen) return person.subtitle || '';
  const d = new Date(person.last_seen);
  const now = new Date();
  if (window.sameDay(d, now)) return `last seen today at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (window.sameDay(d, yesterday)) return `last seen yesterday at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return `last seen ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
};

/* Mute window helpers */
window.isMuted = (conv) => conv?.muted_until && new Date(conv.muted_until) > new Date();
