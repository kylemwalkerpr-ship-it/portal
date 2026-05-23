/* Icon library — every WhatsApp icon we need, hand-written SVG so it
   matches strokes/density. All icons accept { size, color } props. */

const I = (svgChildren) => function Icon({ size = 20, color = 'currentColor', style = {}, className }) {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth: 1.7,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    style, className,
  }, svgChildren);
};

const c = React.createElement;

window.Icons = {
  /* ── nav rail ── */
  Chats:      I([c('path', { key:1, d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' })]),
  Status:     I([c('circle', { key:1, cx:12, cy:12, r:9, strokeDasharray:'2 3' }), c('circle', { key:2, cx:12, cy:12, r:4 })]),
  Calls:      I([c('path', { key:1, d:'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' })]),
  Archive:    I([c('rect', { key:1, x:2, y:4, width:20, height:5, rx:1 }), c('path', { key:2, d:'M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9' }), c('line', { key:3, x1:10, y1:13, x2:14, y2:13 })]),
  Star:       I([c('polygon', { key:1, points:'12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' })]),
  Settings:   I([c('circle', { key:1, cx:12, cy:12, r:3 }), c('path', { key:2, d:'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' })]),
  /* ── chat header ── */
  Search:     I([c('circle', { key:1, cx:11, cy:11, r:7 }), c('path', { key:2, d:'m21 21-4.3-4.3' })]),
  Phone:      I([c('path', { key:1, d:'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' })]),
  Video:      I([c('polygon', { key:1, points:'23 7 16 12 23 17 23 7' }), c('rect', { key:2, x:1, y:5, width:15, height:14, rx:2 })]),
  More:       I([c('circle', { key:1, cx:5,  cy:12, r:1.2, fill:'currentColor' }), c('circle', { key:2, cx:12, cy:12, r:1.2, fill:'currentColor' }), c('circle', { key:3, cx:19, cy:12, r:1.2, fill:'currentColor' })]),
  /* ── composer ── */
  Smile:      I([c('circle', { key:1, cx:12, cy:12, r:9 }), c('path', { key:2, d:'M8 14s1.5 2 4 2 4-2 4-2' }), c('line', { key:3, x1:9,  y1:9, x2:9.01,  y2:9 }), c('line', { key:4, x1:15, y1:9, x2:15.01, y2:9 })]),
  Plus:       I([c('line', { key:1, x1:12, y1:5, x2:12, y2:19 }), c('line', { key:2, x1:5, y1:12, x2:19, y2:12 })]),
  Paperclip:  I([c('path', { key:1, d:'M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' })]),
  Mic:        I([c('path', { key:1, d:'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z' }), c('path', { key:2, d:'M19 10v2a7 7 0 0 1-14 0v-2' }), c('line', { key:3, x1:12, y1:19, x2:12, y2:23 }), c('line', { key:4, x1:8, y1:23, x2:16, y2:23 })]),
  Send:       I([c('line', { key:1, x1:22, y1:2, x2:11, y2:13 }), c('polygon', { key:2, points:'22 2 15 22 11 13 2 9 22 2' })]),
  Camera:     I([c('path', { key:1, d:'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' }), c('circle', { key:2, cx:12, cy:13, r:4 })]),
  /* ── attachments ── */
  Document:   I([c('path', { key:1, d:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }), c('polyline', { key:2, points:'14 2 14 8 20 8' }), c('line', { key:3, x1:8, y1:13, x2:16, y2:13 }), c('line', { key:4, x1:8, y1:17, x2:13, y2:17 })]),
  Photo:      I([c('rect', { key:1, x:3, y:3, width:18, height:18, rx:2 }), c('circle', { key:2, cx:8.5, cy:8.5, r:1.5 }), c('polyline', { key:3, points:'21 15 16 10 5 21' })]),
  Audio:      I([c('path', { key:1, d:'M9 18V5l12-2v13' }), c('circle', { key:2, cx:6, cy:18, r:3 }), c('circle', { key:3, cx:18, cy:16, r:3 })]),
  Location:   I([c('path', { key:1, d:'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' }), c('circle', { key:2, cx:12, cy:10, r:3 })]),
  Contact:    I([c('path', { key:1, d:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }), c('circle', { key:2, cx:12, cy:7, r:4 })]),
  Poll:       I([c('rect', { key:1, x:3,  y:12, width:4, height:8 }), c('rect', { key:2, x:10, y:7,  width:4, height:13 }), c('rect', { key:3, x:17, y:3,  width:4, height:17 })]),
  /* ── message-level ── */
  Reply:      I([c('polyline', { key:1, points:'9 17 4 12 9 7' }), c('path', { key:2, d:'M20 18v-2a4 4 0 0 0-4-4H4' })]),
  Forward:    I([c('polyline', { key:1, points:'15 17 20 12 15 7' }), c('path', { key:2, d:'M4 18v-2a4 4 0 0 1 4-4h12' })]),
  Copy:       I([c('rect', { key:1, x:9, y:9, width:13, height:13, rx:2 }), c('path', { key:2, d:'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' })]),
  Trash:      I([c('polyline', { key:1, points:'3 6 5 6 21 6' }), c('path', { key:2, d:'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' })]),
  Pin:        I([c('path', { key:1, d:'M12 17v5' }), c('path', { key:2, d:'M9 10.76V6a3 3 0 0 1 6 0v4.76a2 2 0 0 0 .59 1.41l2.7 2.7a1 1 0 0 1-.71 1.71H6.42a1 1 0 0 1-.71-1.71l2.7-2.7A2 2 0 0 0 9 10.76z' })]),
  Bell:       I([c('path', { key:1, d:'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' }), c('path', { key:2, d:'M13.73 21a2 2 0 0 1-3.46 0' })]),
  BellOff:    I([c('path', { key:1, d:'M13.73 21a2 2 0 0 1-3.46 0' }), c('path', { key:2, d:'M18.63 13A17.89 17.89 0 0 1 18 8' }), c('path', { key:3, d:'M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14' }), c('path', { key:4, d:'M18 8a6 6 0 0 0-9.33-5' }), c('line', { key:5, x1:1, y1:1, x2:23, y2:23 })]),
  Block:      I([c('circle', { key:1, cx:12, cy:12, r:10 }), c('line', { key:2, x1:4.93, y1:4.93, x2:19.07, y2:19.07 })]),
  Check:      I([c('polyline', { key:1, points:'20 6 9 17 4 12' })]),
  CheckDouble:I([c('polyline', { key:1, points:'18 7 9 16 5 12' }), c('polyline', { key:2, points:'22 11 13 20 11.5 18.5' })]),
  Clock:      I([c('circle', { key:1, cx:12, cy:12, r:10 }), c('polyline', { key:2, points:'12 6 12 12 16 14' })]),
  /* ── misc ── */
  ChevronDown:I([c('polyline', { key:1, points:'6 9 12 15 18 9' })]),
  ChevronRight:I([c('polyline',{ key:1, points:'9 18 15 12 9 6' })]),
  ChevronLeft:I([c('polyline', { key:1, points:'15 18 9 12 15 6' })]),
  X:          I([c('line', { key:1, x1:18, y1:6, x2:6, y2:18 }), c('line', { key:2, x1:6, y1:6, x2:18, y2:18 })]),
  Play:       I([c('polygon', { key:1, points:'5 3 19 12 5 21 5 3', fill:'currentColor' })]),
  Pause:      I([c('rect', { key:1, x:6, y:4, width:4, height:16, fill:'currentColor' }), c('rect', { key:2, x:14, y:4, width:4, height:16, fill:'currentColor' })]),
  Download:   I([c('path', { key:1, d:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }), c('polyline', { key:2, points:'7 10 12 15 17 10' }), c('line', { key:3, x1:12, y1:15, x2:12, y2:3 })]),
  Edit:       I([c('path', { key:1, d:'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }), c('path', { key:2, d:'M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' })]),
  Info:       I([c('circle', { key:1, cx:12, cy:12, r:10 }), c('line', { key:2, x1:12, y1:16, x2:12, y2:12 }), c('line', { key:3, x1:12, y1:8, x2:12.01, y2:8 })]),
  NewChat:    I([c('path', { key:1, d:'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z' })]),
  Filter:     I([c('polygon', { key:1, points:'22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3' })]),
  Verified:   I([c('path', { key:1, d:'M9 12l2 2 4-4', stroke:'#fff' }), c('circle', { key:2, cx:12, cy:12, r:10, fill:'currentColor', stroke:'none' }), c('path', { key:3, d:'M9 12l2 2 4-4', stroke:'#fff', strokeWidth:2.5 })]),
  PinSmall:   I([c('path', { key:1, d:'M12 17v5M9 10.76V6a3 3 0 0 1 6 0v4.76a2 2 0 0 0 .59 1.41l2.7 2.7a1 1 0 0 1-.71 1.71H6.42a1 1 0 0 1-.71-1.71l2.7-2.7A2 2 0 0 0 9 10.76z', fill:'currentColor' })]),
  Reaction:   I([c('circle', { key:1, cx:12, cy:12, r:9 }), c('path', { key:2, d:'M8 14s1.5 2 4 2 4-2 4-2' }), c('line', { key:3, x1:9, y1:9, x2:9.01, y2:9 }), c('line', { key:4, x1:15, y1:9, x2:15.01, y2:9 }), c('path', { key:5, d:'M18 4l1.5 1.5L21 4', stroke:'currentColor' })]),
  Image:      I([c('rect', { key:1, x:3, y:3, width:18, height:18, rx:2 }), c('circle', { key:2, cx:8.5, cy:8.5, r:1.5 }), c('polyline', { key:3, points:'21 15 16 10 5 21' })]),
  PlayCircle: I([c('circle', { key:1, cx:12, cy:12, r:10 }), c('polygon', { key:2, points:'10 8 16 12 10 16 10 8', fill:'currentColor' })]),
};
