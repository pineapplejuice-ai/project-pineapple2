/*
 * Saath — clickable prototype.
 * One state object + pure view functions. Every animation is computed from a
 * clock, so the same app runs live (performance.now) or frame-by-frame for the
 * video (virtual time set by the renderer). All people and data are illustrative.
 */
(function (global) {
'use strict';

/* ---------------- icons ---------------- */
const ICON = {
  back:'M15 18l-6-6 6-6', next:'M9 6l6 6-6 6', check:'M5 12.5l4.5 4.5L19 7.5', close:'M6 6l12 12M18 6L6 18', plus:'M12 5v14M5 12h14',
  home:'M3.5 11L12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20', calendar:'M4 6h16v14H4zM4 10h16M8.5 3.5v4M15.5 3.5v4',
  file:'M6 3h8.5L19 7.5V21H6zM14 3v5h5M9 13h6M9 16.5h6', users:'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16.5 4.4a3.5 3.5 0 0 1 0 6.3M18 14a6 6 0 0 1 3.5 6',
  phone:'M5 3.5h3.5l2 5L8 10a12 12 0 0 0 6 6l1.5-2.5 5 2v3.5a2 2 0 0 1-2 2A17 17 0 0 1 3 5.5a2 2 0 0 1 2-2z',
  pill:'M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7zM7 7l7 7', clock:'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zM12 7.5V12l3 2',
  shield:'M12 2.5l8 3v6c0 5-3.4 8.8-8 10.5-4.6-1.7-8-5.5-8-10.5v-6zM8.5 12l2.5 2.5 4.5-5', heart:'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
  bag:'M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8', rupee:'M6.5 4h11M6.5 8.5h11M9 4c5.5 0 5.5 9 0 9H6.5l8 7.5', tool:'M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5L16 12l-4-4z',
  bed:'M3 18V6M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3M7 11.5a1.5 1.5 0 1 0 0-.1', cross:'M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9z',
  bell:'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0', mic:'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21',
  alert:'M12 3.5L2.5 20h19zM12 10v4.5M12 17.2v.3', qr:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM18 18h2v2h-2zM14 19h2M19 14v2.5',
  share:'M4 12.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6.5M16 6.5l-4-4-4 4M12 2.5V15', link:'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  nav:'M3.5 11L20.5 3.5 13 20.5l-2-7.5z', camera:'M4 8h3l2-3h6l2 3h3v11H4zM12 11a3 3 0 1 1 0 6a3 3 0 0 1 0-6z', star:'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  upload:'M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v4h16v-4', walk:'M13 4.5a1.5 1.5 0 1 1 0 .1M10 21l2-6 3 3v3M8 12l2.5-4 4 1.5 2 3.5M12.5 15l-1-4', sun:'M12 7.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 0 1 0-9zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  hang:'M3 14.5c5-4.6 13-4.6 18 0l-2.5 3-3.5-1.5v-3a9 9 0 0 0-6 0v3L5.5 17.5z', speaker:'M4 9.5h4l5-4v13l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11', abha:'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 8v8M8 12h8'
};
const ic = (n, s = 20, extra = '') => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" ${extra}><path d="${ICON[n]}"/></svg>`;

/* ---------------- content (illustrative) ---------------- */
const PEOPLE = {
  appa: { key:'appa', name:'Appa', full:'K. Raghavendra', age:72, init:'A', tone:'indigo', lang:'Kannada', conds:['Hypertension','Type 2 diabetes'], blood:'B+', allergy:'Penicillin', doctor:'Dr. Anand Shetty', spec:'Cardiologist', checkTime:'8:00 AM' },
  amma: { key:'amma', name:'Amma', full:'Lakshmi Raghavendra', age:66, init:'L', tone:'marigold', lang:'Kannada', conds:['Hypothyroidism','Knee osteoarthritis'], blood:'O+', allergy:'None known', doctor:'Dr. Kavya Nair', spec:'General physician', checkTime:'8:30 AM' }
};
const MEDS = {
  appa: [ { n:'Amlodipine 5 mg', f:'Blood pressure', w:'Morning, after breakfast', st:'taken', t:'8:12 AM', left:21 },
          { n:'Metformin 500 mg', f:'Diabetes', w:'After breakfast and dinner', st:'taken', t:'8:12 AM', left:6 },
          { n:'Atorvastatin 10 mg', f:'Cholesterol', w:'Night', st:'later', left:24 } ],
  amma: [ { n:'Levothyroxine 50 mcg', f:'Thyroid', w:'Morning, empty stomach', st:'pending', left:18 },
          { n:'Calcium + Vitamin D3', f:'Bones', w:'After lunch', st:'later', left:12 } ]
};
const SVC = [
  { k:'doctor', l:'Doctor visit companion', p:399, i:'cross', d:'up to 3 hours' },
  { k:'meds', l:'Medicines & groceries', p:199, i:'bag', d:'pick-up & drop' },
  { k:'bank', l:'Bank, bills & pension', p:299, i:'rupee', d:'up to 2 hours' },
  { k:'company', l:'Wellbeing visit', p:199, i:'heart', d:'1 hour, tea & a chat' },
  { k:'repair', l:'Home repair help', p:249, i:'tool', d:'finds & supervises' },
  { k:'hospital', l:'Hospital stay support', p:999, i:'bed', d:'per day' }
];
const VISIT = [
  ['Booked', '11:02 AM', 'Ravi Kumar confirmed · ₹399 paid with UPI'],
  ['On the way', '3:40 PM', 'Ravi is 6 min from Appa’s home'],
  ['Reached Appa’s home', '3:58 PM', 'Photo check-in shared with family'],
  ['At the clinic', '4:24 PM', 'Dr. Shetty’s clinic, Saraswathipuram · token 14'],
  ['Visit notes', '4:52 PM', 'Notes and prescription added']
];
const PT = { // parent-mode strings — Kannada & Hindi pending native-speaker review
  kn:{ date:'ಮಂಗಳವಾರ, 10 ನವೆಂಬರ್', greet:'ನಮಸ್ಕಾರ, ಲಕ್ಷ್ಮಿ', q:'ಬೆಳಗಿನ ಔಷಧಿ ತೆಗೆದುಕೊಂಡಿರಾ?', yes:'ಹೌದು, ತೆಗೆದುಕೊಂಡೆ', no:'ಇನ್ನೂ ಇಲ್ಲ', thanks:'ಧನ್ಯವಾದ! ಪ್ರಿಯಾಗೆ ತಿಳಿಸಿದ್ದೇವೆ.',
       call:'ಪ್ರಿಯಾಗೆ ಕರೆ ಮಾಡಿ', help:'ಸಹಾಯ ಬೇಕು', helpSub:'ಒತ್ತಿದರೆ ಪ್ರಿಯಾ ಮತ್ತು ನೆರೆಹೊರೆಯವರಿಗೆ ತಿಳಿಯುತ್ತದೆ', coming:'ಸಹಾಯ ಬರುತ್ತಿದೆ',
       told:['ಪ್ರಿಯಾಗೆ ತಿಳಿಸಲಾಗಿದೆ','ಶೋಭಾ ರಾವ್ — 2 ನಿಮಿಷದಲ್ಲಿ','ರವಿ — 11 ನಿಮಿಷದಲ್ಲಿ'], okay:'ನಾನು ಸರಿಯಾಗಿದ್ದೇನೆ, ರದ್ದು ಮಾಡಿ', meds:'ಇಂದಿನ ಔಷಧಿಗಳು',
       m:[['ಥೈರಾಯ್ಡ್ ಮಾತ್ರೆ','ಬೆಳಿಗ್ಗೆ'],['ಕ್ಯಾಲ್ಸಿಯಂ ಮಾತ್ರೆ','ಮಧ್ಯಾಹ್ನ ಊಟದ ನಂತರ']], lname:'ಕನ್ನಡ' },
  hi:{ date:'मंगलवार, 10 नवंबर', greet:'नमस्ते, लक्ष्मी जी', q:'क्या आपने सुबह की दवा ले ली?', yes:'हाँ, ले ली', no:'अभी नहीं', thanks:'धन्यवाद! प्रिया को बता दिया है।',
       call:'प्रिया को कॉल करें', help:'मदद चाहिए', helpSub:'दबाते ही प्रिया और पड़ोसी को खबर मिलेगी', coming:'मदद आ रही है',
       told:['प्रिया को बता दिया है','शोभा राव — 2 मिनट में','रवि — 11 मिनट में'], okay:'मैं ठीक हूँ, रद्द करें', meds:'आज की दवाइयाँ',
       m:[['थायरॉइड की गोली','सुबह'],['कैल्शियम की गोली','दोपहर खाने के बाद']], lname:'हिंदी' },
  en:{ date:'Tuesday, 10 November', greet:'Namaskara, Lakshmi', q:'Did you take your morning medicine?', yes:'Yes, taken', no:'Not yet', thanks:'Thank you! Priya can see this.',
       call:'Call Priya', help:'I need help', helpSub:'Priya and your neighbour will be told', coming:'Help is on the way',
       told:['Priya has been told','Shobha Rao — in 2 min','Ravi — in 11 min'], okay:'I’m okay, cancel', meds:'Today’s medicines',
       m:[['Thyroid tablet','Morning'],['Calcium tablet','After lunch']], lname:'English' }
};
const IVR = {
  kn:{ q1:'ನಮಸ್ಕಾರ ಲಕ್ಷ್ಮಿ ಅವರೇ. ಬೆಳಗಿನ ಔಷಧಿ ತೆಗೆದುಕೊಂಡಿದ್ದರೆ 1 ಒತ್ತಿ. ಇಲ್ಲದಿದ್ದರೆ 2 ಒತ್ತಿ.', q2:'ಧನ್ಯವಾದ. ಇಂದು ಹೇಗಿದ್ದೀರಿ? ಚೆನ್ನಾಗಿದ್ದರೆ 1, ಹುಷಾರಿಲ್ಲದಿದ್ದರೆ 2, ಸಹಾಯ ಬೇಕಿದ್ದರೆ 9 ಒತ್ತಿ.',
       ok:'ಸಂತೋಷ! ಪ್ರಿಯಾ ಅವರಿಗೆ ತಿಳಿಸುತ್ತೇವೆ. ನಮಸ್ಕಾರ.', unwell:'ಪ್ರಿಯಾ ಅವರಿಗೆ ತಿಳಿಸಿದ್ದೇವೆ. ಹತ್ತು ನಿಮಿಷದಲ್ಲಿ ಮತ್ತೆ ಕರೆ ಮಾಡುತ್ತೇವೆ.', help:'ಸಹಾಯ ಕಳುಹಿಸುತ್ತಿದ್ದೇವೆ. ಶೋಭಾ ರಾವ್ ಮತ್ತು ಪ್ರಿಯಾ ಅವರಿಗೆ ತಿಳಿಸಿದ್ದೇವೆ.' },
  hi:{ q1:'नमस्ते लक्ष्मी जी। अगर आपने सुबह की दवा ले ली है तो 1 दबाएँ, नहीं तो 2 दबाएँ।', q2:'धन्यवाद। आज आप कैसी हैं? ठीक हैं तो 1, तबीयत ठीक नहीं तो 2, मदद चाहिए तो 9 दबाएँ।',
       ok:'बहुत अच्छा! हम प्रिया को बता देंगे। नमस्ते।', unwell:'हमने प्रिया को बता दिया है। दस मिनट में फिर से कॉल करेंगे।', help:'मदद भेज रहे हैं। शोभा राव और प्रिया को बता दिया है।' },
  en:{ q1:'Namaskara, Lakshmi. If you have taken your morning medicine, press 1. If not, press 2.', q2:'Thank you. How are you today? Press 1 if you are well, 2 if you feel unwell, 9 if you need help.',
       ok:'Wonderful! We will let Priya know. Namaskara.', unwell:'We have told Priya. We will call you again in ten minutes.', help:'Sending help now. We have told Shobha Rao and Priya.' }
};

function initState() {
  return { role:'child', screen:'today', tab:'today', stack:[], parent:'amma', recP:'appa', lang:'kn',
    amma:{ checkin:'retry' }, pq:null, call:{ stage:0 }, booked:false,
    book:{ service:'doctor', who:'appa', slot:'today' }, pay:null, visit:{ stage:0, at:0 },
    alert:null, helpSent:null, karthikPaid:false, plan:'care', pendingBanner:null,
    sheet:null, sheetClosing:null, banner:null, toast:null, nav:null, clock:'9:10 AM' };
}

/* ---------------- helpers ---------------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eout = x => 1 - Math.pow(1 - x, 3);
const av = (p, cls = '') => `<div class="av av-${p.tone} ${cls}">${p.init}</div>`;
const hd = (t, s, right = '') => `<div class="hd"><button class="back" data-act="back" aria-label="Back">${ic('back', 22)}</button><div class="tt grow"><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ''}</div>${right}</div>`;
const TABS = [['today','Today','home'],['visits','Visits','calendar'],['records','Records','file'],['family','Family','users']];
const tabs = cur => `<nav class="tabs">${TABS.map(([k, l, i]) => `<button class="tab ${cur === k ? 'on' : ''}" id="tab-${k}" data-act="tab" data-arg="${k}"><span class="ti">${ic(i, 21)}</span>${l}</button>`).join('')}</nav>`;
const timed = (t0, t1) => `${t0 != null ? ` data-t0="${t0.toFixed(3)}"` : ''}${t1 != null ? ` data-t1="${t1.toFixed(3)}"` : ''}`;
function greeting(clock) { const [h, rest] = clock.split(':'); let H = +h % 12; if (/PM/.test(rest)) H += 12; return H < 12 ? 'Good morning' : H < 17 ? 'Good afternoon' : 'Good evening'; }
const fee = s => SVC.find(x => x.k === s.book.service).p;

/* ---------------- views: child (Priya) ---------------- */
function vToday(s) {
  const am = s.amma.checkin, booked = s.booked;
  const ammaStatus = am === 'retry'
    ? `<div class="status warn"><span class="dot"></span>No answer at 8:30 · calling again 9:15</div>`
    : am === 'notwell' ? `<div class="status warn"><span class="dot"></span>Checked in 9:16 AM · not feeling well</div>`
    : `<div class="status ok"><span class="dot"></span>Checked in 9:16 AM</div>`;
  const ammaChips = am === 'retry'
    ? `<span class="chip-s">Thyroid tablet · not confirmed</span>`
    : `<span class="chip-s ok">${ic('check', 13)}Medicine taken</span><span class="chip-s ${am === 'notwell' ? 'warn' : 'ok'}">${am === 'notwell' ? 'Feeling unwell' : 'Feeling fine'}</span>`;
  const alertCard = s.alert && !s.alert.resolved ? `<button class="card row" id="open-alert" data-act="go" data-arg="alert" style="border-color:var(--sos);background:var(--sos-soft)"><div class="av" style="background:var(--sos);color:#fff">${ic('bell', 20)}</div><div class="col grow"><div class="b" style="color:var(--sos)">Amma pressed Help · 6:42 PM</div><div class="sm ink2">Shobha Rao is with her. Tap for details.</div></div>${ic('next', 18)}</button>` : '';
  return `
  <div class="hd-home"><div class="col"><div class="eyebrow">Tuesday, 10 November · Mysuru 26°</div><div class="h-display">${greeting(s.clock)}, Priya</div></div><button class="av av-me" data-act="tab" data-arg="family" aria-label="Family">P</button></div>
  <div class="sa-scroll"><div class="pad">
    ${alertCard}
    <div class="card pcard"><button class="pc-top" id="card-appa" data-act="go" data-arg="parent:appa">${av(PEOPLE.appa, 'av-lg')}<div class="col grow"><div class="pc-name">Appa <span class="mu" style="font-weight:500;font-size:14px">· 72</span></div><div class="status ok"><span class="dot"></span>Checked in 8:12 AM</div></div><span class="chev">${ic('next', 18)}</span></button>
      <div class="chips"><span class="chip-s ok">${ic('check', 13)}Medicines 2 of 2</span><span class="chip-s ok">Feeling good</span><span class="chip-s ind">Doctor at 4:30 PM</span></div></div>
    <div class="card pcard" ${am === 'retry' ? 'style="border-color:var(--marigold)"' : ''}><button class="pc-top" id="card-amma" data-act="go" data-arg="parent:amma">${av(PEOPLE.amma, 'av-lg')}<div class="col grow"><div class="pc-name">Amma <span class="mu" style="font-weight:500;font-size:14px">· 66</span></div>${ammaStatus}</div><span class="chev">${ic('next', 18)}</span></button>
      <div class="chips">${ammaChips}</div>
      ${am === 'retry' ? `<div class="btns"><button class="btn sm btn-sec" data-act="toast" data-arg="Calling Amma from your phone…">${ic('phone', 16)}Call Amma</button><button class="btn sm btn-sec" data-act="toast" data-arg="Shobha Rao (neighbour) asked to check on Amma">${ic('users', 16)}Ask Shobha Rao</button></div>` : ''}</div>
    <div class="sect-t">Today in Mysuru</div>
    <div class="tl">
      <div class="tl-i"><div class="tl-time">8:12 AM</div><div class="tl-rail"><div class="tl-dot ok">${ic('check', 10, 'style="stroke-width:3.5"')}</div></div><div class="tl-body"><div class="t">Appa took BP & diabetes tablets</div><div class="s">Confirmed on his morning call</div></div></div>
      <div class="tl-i"><div class="tl-time">${am === 'retry' ? '9:00 AM' : '9:16 AM'}</div><div class="tl-rail"><div class="tl-dot ${am === 'retry' ? 'warn' : 'ok'}">${am === 'retry' ? '' : ic('check', 10, 'style="stroke-width:3.5"')}</div></div><div class="tl-body"><div class="t">Amma · thyroid tablet</div><div class="s">${am === 'retry' ? 'Waiting for her check-in' : 'Taken · confirmed by voice call'}</div></div></div>
      <div class="tl-i"><div class="tl-time">4:30 PM</div><div class="tl-rail"><div class="tl-dot ${booked ? 'ok' : 'warn'}">${booked ? ic('check', 10, 'style="stroke-width:3.5"') : ''}</div></div><div class="tl-body"><div class="t">Appa · cardiology review</div><div class="s">Dr. Anand Shetty, Saraswathipuram</div>
        ${booked ? `<button class="chip-s ok" style="margin-top:7px" id="track-visit" data-act="go" data-arg="visit">${ic('walk', 13)}Ravi will accompany · track</button>`
                 : `<div class="row" style="margin-top:8px;gap:8px"><span class="chip-s warn">No one to go with him</span><button class="btn sm btn-pri" id="book-from-today" data-act="go" data-arg="book:appa">Book a Sahayak</button></div>`}</div></div>
      <div class="tl-i"><div class="tl-time">8:30 PM</div><div class="tl-rail"><div class="tl-dot"></div></div><div class="tl-body"><div class="t">Appa · Metformin after dinner</div><div class="s">Reminder call in Kannada</div></div></div>
    </div>
    <div class="sect-t">Quick actions</div>
    <div class="qa">
      <button data-act="go" data-arg="book:appa"><span class="qi av-indigo">${ic('walk', 20)}</span><span class="ql">Book a visit</span></button>
      <button data-act="go" data-arg="meds:appa"><span class="qi av-marigold">${ic('pill', 20)}</span><span class="ql">Medicines</span></button>
      <button data-act="go" data-arg="checkin:amma" id="qa-checkin"><span class="qi av-ok">${ic('phone', 20)}</span><span class="ql">Check-in calls</span></button>
      <button data-act="tab" data-arg="records"><span class="qi" style="background:var(--sos-soft);color:var(--sos)">${ic('heart', 20)}</span><span class="ql">Health cards</span></button>
    </div>
  </div></div>${tabs('today')}`;
}

function vParent(s) {
  const p = PEOPLE[s.parent], isA = p.key === 'amma', am = s.amma.checkin;
  return `${hd(p.name, `${p.full}, ${p.age} · Kuvempunagar, Mysuru`)}
  <div class="sa-scroll"><div class="pad">
    <div class="row">${av(p, 'av-xl')}<div class="col"><div class="chips">${p.conds.map(c => `<span class="chip-s">${c}</span>`).join('')}</div><div class="sm ink2" style="margin-top:4px">${p.doctor} · ${p.spec}</div></div></div>
    <div class="card"><div class="row between"><div class="b">Daily check-ins</div><div class="xs mu">last 7 days</div></div><div class="week" style="margin-top:10px">${['Wed','Thu','Fri','Sat','Sun','Mon','Today'].map((d, i) => {
      const today = i === 6, miss = isA && i === 3; const cls = today ? (isA && am === 'retry' ? 'now' : 'ok') : miss ? 'warn' : 'ok';
      return `<div><div class="d">${d}</div><div class="c ${cls}">${cls === 'now' ? '…' : cls === 'warn' ? ic('alert', 14) : ic('check', 14, 'style="stroke-width:3"')}</div></div>`; }).join('')}</div>
      ${isA ? `<div class="xs mu" style="margin-top:10px">Sat: no answer twice — Shobha Rao checked in person at 10:05 AM.</div>` : ''}</div>
    <div class="row" style="gap:10px"><div class="stat"><div class="v num">${isA ? '6/7' : '7/7'}</div><div class="k">check-ins answered</div></div><div class="stat"><div class="v num">${isA ? '92%' : '96%'}</div><div class="k">medicines on time</div></div></div>
    <button class="card row" data-act="go" data-arg="checkin:${p.key}" id="open-checkin"><div class="av av-ok">${ic('phone', 20)}</div><div class="col grow"><div class="b">Voice check-in · ${p.checkTime}</div><div class="sm mu">${p.lang} · works on any phone · escalation on</div></div>${ic('next', 18)}</button>
    <button class="card row" data-act="go" data-arg="meds:${p.key}"><div class="av av-marigold">${ic('pill', 20)}</div><div class="col grow"><div class="b">Medicines</div><div class="sm mu">${MEDS[p.key].length} active · ${isA ? 'next refill in 12 days' : 'Metformin runs out in 6 days'}</div></div>${ic('next', 18)}</button>
    <div class="card row"><div class="av av-plain">${ic('users', 20)}</div><div class="col grow"><div class="b">Local guardian</div><div class="sm mu">Shobha Rao · neighbour, 2 min walk</div></div><button class="btn sm btn-sec" data-act="toast" data-arg="Calling Shobha Rao…">${ic('phone', 16)}</button></div>
  </div></div>`;
}

function vCheckin(s) {
  const p = PEOPLE[s.parent];
  return `${hd('Daily check-in', `${p.name} · voice call in ${p.lang}`)}
  <div class="sa-scroll" id="checkin-scroll"><div class="pad">
    <div class="card" style="background:var(--indigo-soft);border-color:transparent;box-shadow:none"><div class="row"><div class="av" style="background:var(--indigo);color:var(--on-indigo)">${ic('phone', 20)}</div><div class="col grow"><div class="b">Works on any phone</div><div class="sm ink2">A short automated call. ${p.name} answers by pressing 1, 2 or 9. No smartphone or app needed.</div></div></div>
      <button class="btn sm btn-pri" style="margin-top:12px" id="preview-call" data-act="sheet" data-arg="preview">${ic('speaker', 16)}Preview the call</button></div>
    <div class="sect-t">When</div>
    <div class="opts"><span class="opt">7:30 AM</span><span class="opt on">${p.checkTime}</span><span class="opt">9:30 AM</span><span class="opt">+ Evening call</span></div>
    <div class="sect-t">Language</div>
    <div class="opts"><span class="opt on">ಕನ್ನಡ Kannada</span><span class="opt">हिंदी Hindi</span><span class="opt">தமிழ் Tamil</span><span class="opt">తెలుగు Telugu</span><span class="opt">English</span></div>
    <div class="sect-t">Questions</div>
    <div class="card flat col" style="gap:10px"><div class="row sm">${ic('pill', 18)}<span class="grow">Took morning medicines?</span>${ic('check', 16)}</div><div class="divider"></div><div class="row sm">${ic('heart', 18)}<span class="grow">How are you feeling today?</span>${ic('check', 16)}</div><div class="divider"></div><div class="row sm">${ic('bag', 18)}<span class="grow">Need anything brought home?</span><span class="mu">Off</span></div></div>
    <div class="sect-t">If ${p.name} doesn’t answer</div>
    <div class="card flat"><div class="steps">
      <div class="step"><div class="sn">1</div><div><div class="st">Call again after 15 minutes</div><div class="ss">Up to 2 retries</div></div></div>
      <div class="step"><div class="sn">2</div><div><div class="st">Notify you and Karthik</div><div class="ss">Push notification + SMS</div></div></div>
      <div class="step"><div class="sn">3</div><div><div class="st">Ask Shobha Rao to look in</div><div class="ss">Neighbour · local guardian</div></div></div>
      <div class="step"><div class="sn">4</div><div><div class="st">Send a Sahayak home</div><div class="ss">Within 60 min in Mysuru · Care plan</div></div></div>
    </div></div>
    <div class="xs mu">${p.name} agreed to these calls on 2 Nov and can pause them anytime by pressing 0.</div>
  </div></div>`;
}

function vMeds(s) {
  const p = PEOPLE[s.parent], ms = MEDS[p.key];
  const ammaDone = s.amma.checkin !== 'retry';
  return `${hd('Medicines', `${p.name} · ${ms.length} active`, `<button class="back" data-act="toast" data-arg="Upload a prescription photo to add medicines">${ic('plus', 22)}</button>`)}
  <div class="sa-scroll"><div class="pad">
    ${ms.map(m => { const st = m.st === 'pending' && ammaDone ? 'taken' : m.st; const tt = m.st === 'pending' && ammaDone ? '9:16 AM' : m.t;
      return `<div class="card col" style="gap:8px"><div class="row"><div class="av av-marigold">${ic('pill', 20)}</div><div class="col grow"><div class="b">${m.n}</div><div class="sm mu">${m.f} · ${m.w}</div></div></div>
      <div class="row between"><span class="chip-s ${st === 'taken' ? 'ok' : st === 'pending' ? 'warn' : ''}">${st === 'taken' ? ic('check', 13) + 'Taken ' + tt : st === 'pending' ? 'Not confirmed yet' : 'Later today'}</span><span class="xs ${m.left <= 7 ? '' : 'mu'}" style="${m.left <= 7 ? 'color:var(--warn);font-weight:650' : ''}">${m.left} days left</span></div></div>`; }).join('')}
    ${p.key === 'appa' ? `<div class="card" style="border-color:var(--marigold)"><div class="b">Metformin runs out in 6 days</div><div class="sm ink2" style="margin-top:4px">Sri Ganesh Medicals, Kuvempunagar has it. A Sahayak can pick it up with Appa’s prescription.</div><button class="btn sm btn-mari" style="margin-top:10px" data-act="toast" data-arg="Refill pick-up added to Ravi’s next visit">${ic('bag', 16)}Arrange refill · ₹199</button></div>` : ''}
    <div class="xs mu">Saath reminds and records. It never changes doses — only ${p.doctor} can.</div>
  </div></div>`;
}

function vBook(s) {
  const b = s.book, sv = SVC.find(x => x.k === b.service);
  return `${hd('Book a Sahayak', 'Trusted local help in Mysuru')}
  <div class="sa-scroll"><div class="pad">
    <div class="sect-t">What help?</div>
    <div class="svc">${SVC.map(x => `<button class="${x.k === b.service ? 'on' : ''}" data-act="svc" data-arg="${x.k}" id="svc-${x.k}"><span class="av ${x.k === b.service ? 'av-indigo' : 'av-plain'}" style="width:34px;height:34px;border-radius:11px">${ic(x.i, 18)}</span><span class="sl">${x.l}</span><span class="sp">₹${x.p} · ${x.d}</span></button>`).join('')}</div>
    <div class="sect-t">For</div>
    <div class="seg"><button class="${b.who === 'appa' ? 'on' : ''}" data-act="who" data-arg="appa">Appa</button><button class="${b.who === 'amma' ? 'on' : ''}" data-act="who" data-arg="amma">Amma</button><button class="${b.who === 'both' ? 'on' : ''}" data-act="who" data-arg="both">Both</button></div>
    <div class="sect-t">When</div>
    <div class="opts"><button class="opt ${b.slot === 'today' ? 'on' : ''}" data-act="slot" data-arg="today">Today · 4:00 PM</button><button class="opt ${b.slot === 'tom' ? 'on' : ''}" data-act="slot" data-arg="tom">Tomorrow · 10:00 AM</button><button class="opt">Pick a time</button></div>
    ${b.service === 'doctor' ? `<div class="xs mu" style="margin-top:-6px">Picks Appa up 30 min before his 4:30 PM appointment.</div>` : ''}
    <div class="sect-t">Your Sahayak</div>
    <div class="card col" style="gap:10px"><div class="row"><div class="av av-ok av-lg">R</div><div class="col grow"><div class="b">Ravi Kumar</div><div class="sm mu">${ic('star', 13, 'style="display:inline;vertical-align:-2px;fill:var(--marigold);stroke:var(--marigold)"')} 4.9 · 38 visits · has met Appa twice</div></div></div>
      <div class="trust"><span>${ic('shield', 13)}Police verified</span><span>${ic('check', 13)}ID verified</span><span>${ic('cross', 13)}First-aid trained</span></div>
      <div class="xs mu">Speaks ಕನ್ನಡ, हिंदी, English · works within 5 km of Kuvempunagar</div></div>
    <div class="card flat row between"><div class="col"><div class="b">${sv.l}</div><div class="xs mu">Includes travel · pay after confirmation</div></div><div class="price num">₹${sv.p}</div></div>
  </div></div>
  <div class="foot"><button class="btn btn-pri full" id="pay-btn" data-act="sheet" data-arg="pay">Pay ₹${sv.p} with UPI</button></div>`;
}

function vBooked(s) {
  return `${hd('Visit booked', '')}
  <div class="sa-scroll"><div class="pad" style="align-items:center;text-align:center;padding-top:20px">
    <div class="av av-ok" style="width:84px;height:84px;border-radius:30px">${ic('check', 42, 'style="stroke-width:2.6"')}</div>
    <div class="h-display" style="font-size:25px">Ravi will reach Appa at 4:00 PM</div>
    <div class="sm ink2" style="max-width:300px">He’ll take Appa to Dr. Shetty, sit in on the consultation and send you the notes.</div>
    <div class="card col" style="width:100%;text-align:left;gap:10px">
      <div class="row between sm"><span class="mu">Visit</span><span class="b">Doctor visit companion</span></div>
      <div class="row between sm"><span class="mu">Paid</span><span class="b num">₹${fee(s)} · UPI</span></div>
      <div class="row between sm"><span class="mu">Shared with</span><span class="b">Karthik, Shobha Rao</span></div>
      <div class="row between sm"><span class="mu">Appa told</span><span class="b">Voice call at 3:30 PM, in Kannada</span></div>
    </div>
  </div></div>
  <div class="foot"><button class="btn btn-pri full" id="track-btn" data-act="go" data-arg="visit">${ic('walk', 18)}Track the visit</button></div>`;
}

function vVisits(s) {
  const st = s.visit.stage;
  return `<div class="hd-home"><div class="col"><div class="eyebrow">Sahayak visits</div><div class="h-display">Visits</div></div></div>
  <div class="sa-scroll"><div class="pad">
    <div class="sect-t">Today</div>
    ${s.booked ? `<button class="card col" id="visit-card" data-act="go" data-arg="visit" style="gap:10px;text-align:left"><div class="row"><div class="av av-ok">R</div><div class="col grow"><div class="b">Doctor visit · Appa</div><div class="sm mu">Ravi Kumar · 4:00 PM</div></div>${ic('next', 18)}</div><span class="chip-s ${st >= 4 ? 'ok' : 'ind'}" style="align-self:flex-start">${VISIT[st][0]}</span></button>`
      : `<div class="card col" style="gap:10px"><div class="b">Appa’s cardiology review is at 4:30 PM</div><div class="sm mu">No one is going with him yet.</div><button class="btn sm btn-pri" style="align-self:flex-start" data-act="go" data-arg="book:appa">Book a Sahayak</button></div>`}
    <div class="sect-t">Earlier</div>
    <div class="card row"><div class="av av-ok">R</div><div class="col grow"><div class="b">Bank & pension work · Appa</div><div class="sm mu">2 Nov · Ravi Kumar · life certificate submitted</div></div></div>
    <div class="card row"><div class="av av-marigold">M</div><div class="col grow"><div class="b">Wellbeing visit · Amma</div><div class="sm mu">24 Oct · Meena S. · “Watched the Dasara lights together”</div></div></div>
    <div class="card row"><div class="av av-ok">R</div><div class="col grow"><div class="b">Medicines pick-up</div><div class="sm mu">19 Oct · Ravi Kumar · ₹199</div></div></div>
  </div></div>
  <div class="foot" style="border-top:0;padding-bottom:8px"><button class="btn btn-pri full" data-act="go" data-arg="book:appa">${ic('plus', 18)}Book a visit</button></div>${tabs('visits')}`;
}

function vVisit(s) {
  const st = s.visit.stage;
  const steps = VISIT.map((v, i) => `<div class="step ${i < st ? 'done' : i === st ? (st === 4 ? 'done' : 'cur') : 'todo'}"><div class="sn">${i < st || st === 4 ? ic('check', 15, 'style="stroke-width:3"') : i + 1}</div><div><div class="st">${v[0]} ${i <= st ? `<span class="xs mu num" style="font-weight:500">· ${v[1]}</span>` : ''}</div>${i <= st ? `<div class="ss">${v[2]}</div>` : ''}
    ${i === 2 && st >= 2 ? `<div class="photo" style="margin-top:8px"><span class="cap">${ic('camera', 11, 'style="display:inline;vertical-align:-1px"')} Appa & Ravi · 3:58 PM</span></div>` : ''}</div></div>`).join('');
  const notes = st >= 4 ? `<div class="card col" id="visit-notes" style="gap:10px;border-color:var(--ok)"${timed(s.visit.at + .2)}><div class="row"><div class="av av-ok">${ic('file', 20)}</div><div class="col grow"><div class="b">Notes from Dr. Shetty</div><div class="xs mu">Written by Ravi · 4:52 PM</div></div></div>
      <div class="sm" style="line-height:1.55">BP <b class="num">138/86</b>. Continue the same medicines. Walk 30 minutes every morning. Reduce salt. Review again in one month.</div>
      <div class="chips"><span class="chip-s ok">${ic('upload', 13)}Prescription saved to Records</span><span class="chip-s ind">Next review · 10 Dec</span></div>
      <div class="row between" style="margin-top:2px"><span class="sm b">Rate Ravi</span><span class="row" style="gap:4px;color:var(--marigold)">${[1,2,3,4,5].map(() => ic('star', 22, 'style="fill:var(--marigold)"')).join('')}</span></div></div>` : '';
  return `${hd('Doctor visit · Appa', 'Ravi Kumar · Sahayak', `<button class="back" data-act="toast" data-arg="Calling Ravi…" aria-label="Call Ravi">${ic('phone', 20)}</button>`)}
  <div class="sa-scroll" id="visit-scroll"><div class="pad">
    ${st === 1 ? `<div class="card row" style="background:var(--indigo-soft);border-color:transparent;box-shadow:none"><div class="av" style="background:var(--indigo);color:var(--on-indigo)">${ic('nav', 18)}</div><div class="col grow"><div class="b">Ravi is 6 min away</div><div class="sm ink2">On his scooter via Kalidasa Road</div></div></div>` : ''}
    <div class="card flat"><div class="steps">${steps}</div></div>
    ${notes}
    ${st < 4 ? `<button class="xs mu" data-act="visitNext" id="visit-next" style="align-self:center;text-decoration:underline">Simulate next update</button>` : ''}
  </div></div>`;
}

function qrCells() { let h = '', seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) { const f = (a, b) => x >= a && x < a + 7 && y >= b && y < b + 7; const fin = f(0, 0) || f(18, 0) || f(0, 18);
    let on; if (fin) { const lx = x < 7 ? x : x - 18, ly = y < 7 ? y : y - 18; on = lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4); } else on = r() > .52;
    h += on ? '<i></i>' : '<span></span>'; } return h; }

function vRecords(s) {
  const p = PEOPLE[s.recP], meds = MEDS[p.key], fresh = s.visit.stage >= 4 && p.key === 'appa';
  const docs = p.key === 'appa'
    ? [...(fresh ? [['Prescription · Dr. Anand Shetty', '10 Nov · added by Ravi', 1]] : []), ['HbA1c & lipid profile', '2 Nov · lab report'], ['ECG report', '14 Sep · Dr. Shetty’s clinic'], ['Discharge summary · cataract surgery', 'Mar 2025']]
    : [['Thyroid profile (TSH)', '28 Oct · lab report'], ['Knee X-ray', '12 Aug'], ['Prescription · Dr. Kavya Nair', '12 Aug']];
  return `<div class="hd-home"><div class="col"><div class="eyebrow">Shared with family & Sahayak</div><div class="h-display">Records</div></div></div>
  <div class="sa-scroll"><div class="pad">
    <div class="seg"><button class="${p.key === 'appa' ? 'on' : ''}" data-act="recP" data-arg="appa">Appa</button><button class="${p.key === 'amma' ? 'on' : ''}" data-act="recP" data-arg="amma">Amma</button></div>
    <div class="hcard" id="health-card"><div class="row between" style="position:relative;z-index:1"><div><div class="k">Emergency health card</div><div style="font-family:var(--font-d);font-weight:700;font-size:20px;margin-top:2px">${p.full}</div><div class="sm" style="opacity:.8">${p.age} yrs · Kuvempunagar, Mysuru</div></div><div style="text-align:right"><div class="k">Blood</div><div class="blood">${p.blood}</div></div></div>
      <div class="hgrid" style="position:relative;z-index:1"><div><div class="k">Allergies</div><div class="v">${p.allergy}</div></div><div><div class="k">Conditions</div><div class="v">${p.conds.join(', ')}</div></div><div><div class="k">Medicines</div><div class="v">${meds.map(m => m.n.split(' ')[0]).join(', ')}</div></div><div><div class="k">Call first</div><div class="v">Priya · Shobha Rao</div></div></div></div>
    <div class="btns"><button class="btn sm btn-pri" id="show-qr" data-act="sheet" data-arg="qr">${ic('qr', 16)}QR for hospital</button><button class="btn sm btn-sec" data-act="toast" data-arg="Card link copied — valid for 24 hours">${ic('share', 16)}Share card</button></div>
    <div class="card row" style="align-items:flex-start"><div class="av av-indigo">${ic('abha', 20)}</div><div class="col grow"><div class="row between"><div class="b">Link ABHA health ID</div><span class="chip-s mari">Planned</span></div><div class="sm mu">Pull reports from hospitals and labs on India’s digital health network (ABDM), with ${p.name}’s consent.</div></div></div>
    <div class="sect-t">Documents</div>
    ${docs.map(d => `<div class="card row flat"><div class="av av-plain">${ic('file', 19)}</div><div class="col grow"><div class="b sm">${d[0]} ${d[2] ? '<span class="newdot"></span>' : ''}</div><div class="xs mu">${d[1]}</div></div>${ic('next', 16)}</div>`).join('')}
    <button class="btn btn-line full" data-act="toast" data-arg="Take a photo of a report to add it">${ic('upload', 18)}Add a report or prescription</button>
  </div></div>${tabs('records')}`;
}

function vFamily(s) {
  const total = 1499 + (s.booked ? 399 : 0), half = Math.round(total / 2);
  return `<div class="hd-home"><div class="col"><div class="eyebrow">Raghavendra family</div><div class="h-display">Family circle</div></div></div>
  <div class="sa-scroll" id="family-scroll"><div class="pad">
    <div class="card col" style="gap:12px">
      <div class="row"><div class="av av-me">P</div><div class="col grow"><div class="b">Priya <span class="mu" style="font-weight:500">· you</span></div><div class="xs mu">Bengaluru · manages care</div></div><span class="chip-s ind">Admin</span></div>
      <div class="row"><div class="av av-plain">K</div><div class="col grow"><div class="b">Karthik</div><div class="xs mu">Singapore · brother · gets every alert</div></div></div>
      <div class="row"><div class="av av-marigold">S</div><div class="col grow"><div class="b">Shobha Rao</div><div class="xs mu">Mysuru · neighbour · local guardian</div></div></div>
      <div class="row"><div class="av av-ok">R</div><div class="col grow"><div class="b">Ravi Kumar</div><div class="xs mu">Sahayak · sees visit-related records only</div></div></div>
    </div>
    <div class="sect-t">November costs</div>
    <div class="card col" style="gap:10px">
      <div class="row between sm"><span>Care plan</span><span class="num b">₹1,499</span></div>
      ${s.booked ? `<div class="row between sm"><span>Doctor visit · Ravi</span><span class="num b">₹399</span></div>` : ''}
      <div class="divider"></div>
      <div class="row between"><span class="b">Total</span><span class="price num" style="font-size:22px">₹${total.toLocaleString('en-IN')}</span></div>
      <div class="row between sm"><span class="row" style="gap:8px"><span class="av av-me" style="width:26px;height:26px;font-size:12px">P</span>Priya · 50%</span><span class="chip-s ok">${ic('check', 13)}Paid ₹${half.toLocaleString('en-IN')}</span></div>
      <div class="row between sm"><span class="row" style="gap:8px"><span class="av av-plain" style="width:26px;height:26px;font-size:12px">K</span>Karthik · 50%</span>${s.karthikPaid ? `<span class="chip-s ok">${ic('check', 13)}Paid ₹${half.toLocaleString('en-IN')}</span>` : `<button class="chip-s warn" id="remind-k" data-act="toast" data-arg="Reminder sent to Karthik with a UPI link">Due ₹${half.toLocaleString('en-IN')} · remind</button>`}</div>
    </div>
    <div class="sect-t">Who’s handling what</div>
    <div class="card col" style="gap:10px">
      <div class="row sm"><span class="chip-s ${s.booked ? 'ok' : 'warn'}">${s.booked ? 'Done' : 'Open'}</span><span class="grow">Appa’s cardiology review</span><span class="mu xs">${s.booked ? 'Priya' : '—'}</span></div>
      <div class="row sm"><span class="chip-s">Due 15 Nov</span><span class="grow">Amma’s electricity bill</span><span class="mu xs">Karthik</span></div>
      <div class="row sm"><span class="chip-s ok">Done</span><span class="grow">Gas cylinder booking</span><span class="mu xs">Shobha Rao</span></div>
    </div>
    <button class="card row" data-act="go" data-arg="plans" id="open-plans"><div class="av av-indigo">${ic('shield', 20)}</div><div class="col grow"><div class="b">Care plan · ₹1,499/month</div><div class="sm mu">UPI AutoPay on the 1st · both parents</div></div>${ic('next', 18)}</button>
  </div></div>${tabs('family')}`;
}

function vPlans(s) {
  const pl = (k, name, price, items, tag) => `<button class="plan ${s.plan === k ? 'on' : ''}" data-act="plan" data-arg="${k}"><div class="row between"><div class="b" style="font-size:16px">${name}</div>${tag ? `<span class="chip-s mari">${tag}</span>` : ''}</div><div><span class="price num">₹${price}</span><span class="sm mu"> / month · both parents</span></div><ul style="display:flex;flex-direction:column;gap:7px;padding:0;margin:0">${items.map(i => `<li>${ic('check', 16)}<span>${i}</span></li>`).join('')}</ul></button>`;
  return `${hd('Plans', 'Cancel anytime · UPI AutoPay')}
  <div class="sa-scroll"><div class="pad">
    ${pl('basic', 'Basic', '499', ['Daily voice check-ins in their language', 'Medicine reminders & records', 'Escalation to family and neighbour', 'Emergency health card'])}
    ${pl('care', 'Care', '1,499', ['Everything in Basic', '2 Sahayak visits every month', 'Sahayak at the door within 60 min in emergencies', 'Monthly wellbeing summary'], 'Most families')}
    <div class="card flat"><div class="b">Pay as you go</div><div class="sm mu" style="margin-top:3px">Extra visits ₹199–₹399 · hospital stay support ₹999/day</div></div>
    <div class="xs mu">Available in Mysuru first. Children abroad can pay by international card.</div>
  </div></div>`;
}

function vAlert(s) {
  const a = s.alert || { at: 0 }, t0 = a.at || 0;
  const item = (dt, icn, title, sub, cls = 'ok') => `<div class="row" style="align-items:flex-start"${timed(t0 + dt)}><div class="av av-${cls}" style="width:34px;height:34px;border-radius:11px">${ic(icn, 17)}</div><div class="col grow"><div class="b sm">${title}</div><div class="xs mu">${sub}</div></div></div>`;
  return `<div class="alert-top">${hd('<span style="color:#fff">Emergency</span>', '<span style="color:rgba(255,255,255,.8)">Started 6:42 PM</span>')}
    <div class="row" style="gap:16px;padding:4px 4px 0"><div class="pulse-wrap"><div class="ring"></div><div class="core">${ic('bell', 26)}</div></div><div class="col"><div style="font-family:var(--font-d);font-weight:800;font-size:25px;line-height:1.1">Amma pressed Help</div><div class="sm" style="opacity:.9">At home · Kuvempunagar, Mysuru</div></div></div></div>
  <div class="sa-scroll"><div class="pad" style="padding-top:14px">
    <div class="btns"><button class="btn btn-sos" data-act="toast" data-arg="Calling Amma…">${ic('phone', 18)}Call Amma</button><button class="btn btn-line" style="border-color:var(--sos);color:var(--sos)" data-act="toast" data-arg="Opens your dialer with 112">${ic('phone', 18)}Dial 112</button></div>
    <div class="sect-t">What’s happening</div>
    <div class="card col" style="gap:12px">
      ${item(.4, 'users', 'Shobha Rao alerted · on her way', 'Neighbour · 2 min walk')}
      ${item(1.0, 'walk', 'Ravi Kumar dispatched', 'Sahayak · arriving in about 11 min')}
      ${item(1.6, 'bell', 'Karthik notified', 'Singapore · seen')}
      ${item(2.4, 'phone', 'Saath called Amma back', 'She said she feels dizzy and is sitting down', 'marigold')}
      ${item(5.2, 'check', 'Shobha Rao is with Amma · 6:45 PM', '“She’s sitting, drinking water. BP on her home machine: 104/68.”')}
    </div>
    <div class="card row"><div class="av" style="background:var(--sos-soft);color:var(--sos)">${ic('cross', 20)}</div><div class="col grow"><div class="b">Nearest 24×7 hospital</div><div class="sm mu">2.1 km · about 8 min by car</div></div><button class="btn sm btn-sec" data-act="toast" data-arg="Health card sent to the hospital desk">${ic('share', 15)}Card</button></div>
    <button class="btn btn-line full" id="resolve" data-act="resolve">${ic('check', 18)}Mark as resolved</button>
  </div></div>`;
}

/* ---------------- views: parent (Amma) ---------------- */
function vPHome(s) {
  const L = PT[s.lang], help = s.helpSent;
  const qCard = s.pq ? `<div class="card row" style="background:var(--ok-soft);border-color:transparent;box-shadow:none"><div class="av av-ok" style="background:var(--ok);color:#fff">${ic('check', 22, 'style="stroke-width:3"')}</div><div class="b" style="font-size:18px;color:var(--ok)">${L.thanks}</div></div>`
    : `<div class="card col" style="gap:14px;padding:18px"><div class="big-q">${L.q}</div><button class="bigbtn btn-ok" id="p-yes" data-act="pAnswer" data-arg="yes">${ic('check', 26, 'style="stroke-width:3"')}${L.yes}</button><button class="bigbtn btn-sec" data-act="pAnswer" data-arg="no">${L.no}</button></div>`;
  const helpBlock = help ? `<div class="card col" style="gap:12px;border:2px solid var(--sos);padding:18px"${timed(help.at)}><div class="row"><div class="pulse-wrap" style="width:48px;height:48px"><div class="ring" style="background:var(--sos-soft)"></div><div class="core" style="inset:6px;background:var(--sos);color:#fff">${ic('bell', 20)}</div></div><div style="font-family:var(--font-d);font-weight:800;font-size:24px;color:var(--sos)">${L.coming}</div></div>
      ${L.told.map((x, i) => `<div class="row" style="font-size:18px;font-weight:600"${timed(help.at + .5 + i * .6)}><span style="color:var(--ok)">${ic('check', 22, 'style="stroke-width:3"')}</span>${x}</div>`).join('')}
      <button class="bigbtn btn-sec" style="height:56px;font-size:16px" data-act="cancelHelp">${L.okay}</button></div>`
    : `<button class="help" id="p-help" data-act="help"><span class="l1">${ic('bell', 30)}</span><span class="l1">${L.help}</span><span class="l2">${L.helpSub}</span></button>`;
  return `<div class="sa-scroll pm"><div class="pad" style="gap:16px;padding-top:10px">
    <div class="row between"><div class="lang">${['kn', 'hi', 'en'].map(k => `<button class="${s.lang === k ? 'on' : ''}" data-act="lang" data-arg="${k}">${PT[k].lname}</button>`).join('')}</div>
      <button class="chip-s ind" id="p-voice" data-act="go" data-arg="p_call">${ic('phone', 13)}Basic phone</button></div>
    <div><div class="eyebrow" style="font-size:15px">${L.date}</div><div class="h-display" style="font-size:33px;margin-top:4px">${L.greet}</div></div>
    ${help ? helpBlock + qCard : qCard + `<button class="calltile" data-act="toast" data-arg="Calling Priya…"><div class="av av-me av-xl" style="width:60px;height:60px;border-radius:50%">P</div><div class="col grow"><div class="b" style="font-size:20px">${L.call}</div><div class="sm mu">Bengaluru</div></div><div class="av" style="background:var(--ok);color:#fff;width:52px;height:52px;border-radius:50%">${ic('phone', 24)}</div></button>` + helpBlock}
    <div class="card col" style="gap:12px"><div class="b" style="font-size:17px">${L.meds}</div>${L.m.map((m, i) => `<div class="row" style="font-size:17px"><div class="av av-marigold">${ic('pill', 20)}</div><div class="col grow"><div class="b">${m[0]}</div><div class="sm mu">${m[1]}</div></div>${i === 0 && (s.pq === 'yes' || s.amma.checkin !== 'retry') ? `<span style="color:var(--ok)">${ic('check', 24, 'style="stroke-width:3"')}</span>` : ''}</div>`).join('')}</div>
  </div></div>`;
}

function vPCall(s) {
  const c = s.call, V = IVR[s.lang], E = IVR.en, st = c.stage || 0;
  const bub = (txt, en, t0) => `<div class="bub"${timed(t0)}>${txt}${s.lang !== 'en' ? `<div class="en">${en}</div>` : ''}</div>`;
  const me = (k, t0) => `<div class="bub me"${timed(t0)}>${k}</div>`;
  let body = '';
  if (st === 0) {
    body = `<div class="col" style="align-items:center;gap:18px;margin-top:60px"><div class="pulse-wrap" style="width:110px;height:110px"><div class="ring" style="background:rgba(140,144,255,.3)"></div><div class="core" style="inset:14px;background:#8C90FF;color:#0E0D24;font-family:var(--font-d);font-weight:800;font-size:30px">स</div></div>
      <div class="who">Saath · daily check-in</div><div class="sub">Voice call · ${PT[s.lang].lname} · +91 80 4718 ••••</div></div>
      <div class="row" style="justify-content:space-around;margin-top:auto;padding:0 40px 50px"><div class="col" style="align-items:center;gap:8px"><button class="callbtn" style="background:#E5484D" data-act="toast" data-arg="We’ll try again in 15 minutes">${ic('hang', 28)}</button><span class="xs" style="opacity:.7">Decline</span></div>
      <div class="col" style="align-items:center;gap:8px"><button class="callbtn" id="answer" style="background:#22B573" data-act="answer">${ic('phone', 28)}</button><span class="xs" style="opacity:.7">Answer</span></div></div>`;
  } else {
    const end = c.a2 === '9' ? V.help : c.a2 === '2' ? V.unwell : V.ok, endEn = c.a2 === '9' ? E.help : c.a2 === '2' ? E.unwell : E.ok;
    const lines = [bub(V.q1, E.q1, c.t1 + .3)];
    if (c.a1) { lines.push(me(c.a1, c.t2)); lines.push(bub(V.q2, E.q2, c.t2 + .5)); }
    if (c.a2) { lines.push(me(c.a2, c.t3)); lines.push(bub(end, endEn, c.t3 + .5)); }
    const hot = st === 1 ? ['1', '2'] : st === 2 ? ['1', '2', '9'] : [];
    const last = st === 1 ? c.t1 : st === 2 ? c.t2 : c.t3;
    body = `<div class="col" style="align-items:center;gap:2px;margin-top:6px"><div class="who" style="font-size:20px">Saath · daily check-in</div><div class="sub">${st >= 3 ? 'Call ending' : 'Connected · ' + PT[s.lang].lname}</div></div>
      <div class="col" style="gap:10px;padding:14px 18px;flex:1;min-height:0;justify-content:flex-end;overflow:hidden">${lines.slice(-3).join('')}</div>
      <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(k => `<button class="${hot.includes(k) ? 'hot' : ''}" id="key-${k === '*' ? 'star' : k === '#' ? 'hash' : k}" data-act="key" data-arg="${k}"${(k === c.a1 && st === 2) ? ` data-press="${c.t2}"` : ''}${(k === c.a2 && st === 3) ? ` data-press="${c.t3}"` : ''}>${k}</button>`).join('')}</div>
      <div class="row" style="justify-content:center;padding:16px 0 30px"><button class="callbtn" id="end-call" style="background:#E5484D" data-act="endCall">${ic('hang', 28)}</button></div>
      ${st >= 3 ? `<div class="xs" style="text-align:center;opacity:.7;margin-top:-22px;padding-bottom:16px"${timed(last + 1.6)}>Priya will see this in the Saath app</div>` : ''}`;
  }
  return `<div class="call" style="flex:1;display:flex;flex-direction:column;min-height:0">${body}</div>`;
}

/* ---------------- overlays ---------------- */
function sheetHtml(k, s) {
  if (k === 'pay') {
    const amt = fee(s), p = s.pay;
    const body = !p ? `<div class="col" style="gap:12px">
        <div class="row between"><div class="b" style="font-size:17px">Pay ₹${amt}</div><span class="xs mu">to Saath Care · Mysuru</span></div>
        <div class="card flat row" style="border-color:var(--indigo)"><div class="av av-indigo">${ic('rupee', 20)}</div><div class="col grow"><div class="b">Any UPI app on this phone</div><div class="xs mu">You’ll approve with your UPI PIN</div></div><span style="color:var(--indigo)">${ic('check', 20, 'style="stroke-width:3"')}</span></div>
        <div class="card flat row"><div class="av av-plain">${ic('link', 20)}</div><div class="col grow"><div class="b">Send request to Karthik</div><div class="xs mu">He pays from Singapore</div></div></div>
        <button class="btn btn-pri full" id="pay-now" data-act="pay">Pay ₹${amt}</button></div>`
      : `<div class="stack1" style="min-height:200px">
        <div class="col" style="align-items:center;justify-content:center;gap:14px"${timed(null, p.at + 1.5)}><div class="spin" style="width:38px;height:38px;border-width:4px"></div><div class="b">Waiting for UPI approval…</div><div class="xs mu">Approve ₹${amt} in your UPI app</div></div>
        <div class="col" style="align-items:center;justify-content:center;gap:10px"${timed(p.at + 1.5)}><div class="av av-ok" style="width:64px;height:64px;border-radius:22px;background:var(--ok);color:#fff">${ic('check', 34, 'style="stroke-width:3"')}</div><div class="b" style="font-size:18px">Paid ₹${amt}</div><div class="xs mu num">UPI ref 431298765210 · 11:02 AM</div><button class="btn btn-pri full" id="pay-done" data-act="paid" style="margin-top:6px">Continue</button></div></div>`;
    return body;
  }
  if (k === 'qr') {
    const p = PEOPLE[s.recP];
    return `<div class="col" style="gap:8px;text-align:center"><div class="b" style="font-size:17px">${p.full} · emergency card</div><div class="xs mu">Hospital staff scan this to see blood group, allergies, conditions and medicines. Valid 24 hours.</div><div class="qr">${qrCells()}</div><div class="xs mu">Prototype QR</div><button class="btn btn-sec full" data-act="closeSheet">Done</button></div>`;
  }
  if (k === 'preview') {
    const V = IVR.kn, E = IVR.en;
    return `<div class="col" style="gap:12px"><div class="b" style="font-size:17px">The call Amma hears</div><div class="xs mu">About 40 seconds · recorded voice · Kannada</div>
      ${[[V.q1, E.q1], [V.q2, E.q2], [V.ok, E.ok]].map(([a, b]) => `<div class="card flat" style="background:var(--surface-2);border:0"><div style="font-size:15px;line-height:1.5">${a}</div><div class="xs mu" style="margin-top:5px">${b}</div></div>`).join('')}
      <button class="btn btn-sec full" data-act="closeSheet">Close</button></div>`;
  }
  return '';
}
function bannerHtml(b) {
  const map = {
    checkin: [ic('check', 20, 'style="stroke-width:3"'), 'var(--ok)', 'Amma checked in · 9:16 AM', 'Took her thyroid tablet · feeling fine'],
    unwell: [ic('alert', 20), 'var(--warn)', 'Amma isn’t feeling well · 9:16 AM', 'We’ll call her again at 9:26. Call her now?'],
    kpaid: [ic('rupee', 20), 'var(--indigo)', 'Karthik paid ₹949 · UPI', 'November costs are settled'],
    help: [ic('bell', 20), 'var(--sos)', 'Amma pressed Help', 'Shobha Rao and Ravi have been alerted']
  }[b.k];
  return `<div class="sa-banner" data-at="${b.at}"><div class="av" style="background:${map[1]};color:#fff;width:38px;height:38px;border-radius:12px">${map[0]}</div><div class="col grow"><div class="b sm">${map[2]}</div><div class="xs mu">${map[3]}</div></div><span class="xs mu">now</span></div>`;
}

/* ---------------- router ---------------- */
const VIEWS = { today: vToday, parent: vParent, checkin: vCheckin, meds: vMeds, book: vBook, booked: vBooked, visits: vVisits, visit: vVisit, records: vRecords, family: vFamily, plans: vPlans, alert: vAlert, p_home: vPHome, p_call: vPCall };
const DARK = { p_call: 1, alert: 1 };

/* ---------------- reducer ---------------- */
function reduce(app, a, arg) {
  const s = app.state, at = app.now();
  const nav = (to, kind) => { s.nav = { from: s.screen, to, at, kind }; s.screen = to; };
  switch (a) {
    case 'tab': if (s.screen === arg) return; s.stack = []; s.tab = arg; nav(arg, 'fade'); break;
    case 'go': { const [scr, p] = (arg || '').split(':'); if (p) { if (scr === 'book') s.book.who = p; else s.parent = p; }
      if (scr === 'alert' && s.alert && !s.alert.at) s.alert.at = at;
      s.stack.push(s.screen); nav(scr, 'push'); break; }
    case 'back': { const to = s.stack.length ? s.stack.pop() : (s.role === 'parent' ? 'p_home' : 'today'); nav(to, 'pop'); break; }
    case 'role': { s.role = arg; s.stack = [];
      if (arg === 'child') { s.tab = 'today'; const al = s.alert && !s.alert.resolved; if (al && !s.alert.at) s.alert.at = at + .35;
        nav(al ? 'alert' : 'today', 'fade'); if (al) s.stack = ['today'];
        if (s.pendingBanner) { s.banner = { k: s.pendingBanner, at: at + .6 }; s.pendingBanner = null; } }
      else nav('p_home', 'fade'); break; }
    case 'lang': s.lang = arg; break;
    case 'sheet': s.sheet = { k: arg, at }; s.sheetClosing = null; s.pay = null; break;
    case 'closeSheet': if (s.sheet) s.sheetClosing = { k: s.sheet.k, at }; s.sheet = null; break;
    case 'svc': s.book.service = arg; break;
    case 'who': s.book.who = arg; break;
    case 'slot': s.book.slot = arg; break;
    case 'pay': s.pay = { at }; s.clock = '11:01 AM'; break;
    case 'paid': if (s.sheet) s.sheetClosing = { k: s.sheet.k, at }; s.sheet = null; s.pay = null; s.booked = true; s.clock = '11:02 AM';
      s.nav = { from: s.screen, to: 'booked', at, kind: 'push' }; s.screen = 'booked'; break;
    case 'visitNext': if (!s.booked) s.booked = true; s.visit.stage = Math.min(4, s.visit.stage + 1); s.visit.at = at; s.clock = VISIT[s.visit.stage][1]; break;
    case 'answer': s.call = { stage: 1, t1: at }; s.clock = '9:15 AM'; break;
    case 'key': { const c = s.call;
      if (c.stage === 1 && (arg === '1' || arg === '2')) { c.a1 = arg; c.stage = 2; c.t2 = at; }
      else if (c.stage === 2 && ['1', '2', '9'].includes(arg)) { c.a2 = arg; c.stage = 3; c.t3 = at; s.clock = '9:16 AM';
        s.amma.checkin = arg === '1' ? 'done' : 'notwell'; s.pq = c.a1 === '1' ? 'yes' : 'no';
        if (arg === '9') { s.alert = { at: null, resolved: false }; s.helpSent = { at }; s.clock = '9:16 AM'; }
        else s.pendingBanner = arg === '1' ? 'checkin' : 'unwell'; }
      break; }
    case 'endCall': s.call.stage = 0; nav('p_home', 'fade'); break;
    case 'pAnswer': s.pq = arg; if (arg === 'yes') { s.amma.checkin = 'done'; s.pendingBanner = 'checkin'; } s.clock = '9:16 AM'; break;
    case 'help': s.helpSent = { at }; s.alert = { at: null, resolved: false }; s.clock = '6:42 PM'; break;
    case 'cancelHelp': s.helpSent = null; if (s.alert) s.alert.resolved = true; s.toast = { text: PT[s.lang].okay.split(',')[0] + ' ✓', at }; break;
    case 'resolve': if (s.alert) s.alert.resolved = true; s.helpSent = null; s.stack = []; s.tab = 'today'; nav('today', 'pop');
      s.toast = { text: 'Resolved · Shobha Rao is staying with Amma tonight', at: at + .3 }; break;
    case 'recP': s.recP = arg; break;
    case 'plan': s.plan = arg; s.toast = { text: arg === 'care' ? 'Care plan selected · ₹1,499/month' : 'Basic plan selected · ₹499/month', at }; break;
    case 'kPays': s.karthikPaid = true; s.banner = { k: 'kpaid', at }; break;
    case 'toast': s.toast = { text: arg, at }; break;
    case 'scenario': scenario(app, arg); break;
    case 'reset': app.state = initState(); break;
  }
}
function scenario(app, k) {
  const at = app.now();
  if (k === 'call') { app.state = Object.assign(initState(), { role: 'parent', screen: 'p_call', nav: { from: app.state.screen, to: 'p_call', at, kind: 'fade' } }); return; }
  const s = app.state;
  const go = (role, scr, stack = [], tab = 'today') => { s.role = role; s.stack = stack; s.tab = tab; s.nav = { from: s.screen, to: scr, at, kind: 'fade' }; s.screen = scr; s.sheet = null; };
  if (k === 'child') go('child', s.alert && !s.alert.resolved ? 'alert' : 'today');
  if (k === 'parent') go('parent', 'p_home');
  if (k === 'book') { s.booked = false; s.visit = { stage: 0, at: 0 }; go('child', 'book', ['today']); }
  if (k === 'visit') { s.booked = true; if (s.visit.stage < 1) s.visit = { stage: 1, at }; s.clock = VISIT[s.visit.stage][1]; go('child', 'visit', ['visits'], 'visits'); }
  if (k === 'help') { s.helpSent = { at }; s.alert = { at: at + .35, resolved: false }; s.clock = '6:42 PM'; go('child', 'alert', ['today']); }
  if (k === 'family') go('child', 'family', [], 'family');
}

/* ---------------- mount ---------------- */
function mount(root, opts = {}) {
  const app = { root, opts, state: initState(), time: 0, mode: opts.mode || 'live' };
  app.now = () => app.mode === 'video' ? app.time : performance.now() / 1000;
  root.classList.add('sa'); if (opts.framed) root.classList.add('framed');
  app.view = scr => (VIEWS[scr] || vToday)(app.state);

  app.render = () => {
    const s = app.state, t = app.now();
    const oldScroll = root.querySelector('.sa-layer.cur .sa-scroll'), oldScr = root.dataset.scr, oldTop = oldScroll ? oldScroll.scrollTop : 0;
    const showPrev = s.nav && s.nav.from && s.nav.from !== s.screen && t - s.nav.at < .6;
    const status = `<div class="sa-status"><span class="num">${s.clock.replace(/ (AM|PM)/, '')}</span><span class="cam"></span><span class="row" style="gap:6px"><svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1" opacity=".4"/></svg><svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 11.5L.6 3.6a10.5 10.5 0 0 1 14.8 0z"/></svg><svg width="26" height="13" viewBox="0 0 26 13"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".5"/><rect x="2.5" y="2.5" width="14" height="8" rx="2" fill="currentColor"/><rect x="23.5" y="4" width="2" height="5" rx="1" fill="currentColor" opacity=".5"/></svg></span></div>`;
    const sheetK = s.sheet ? s.sheet.k : (s.sheetClosing && t - s.sheetClosing.at < .5 ? s.sheetClosing.k : null);
    const sheetAt = s.sheet ? s.sheet.at : s.sheetClosing ? s.sheetClosing.at : 0;
    const overlays = (sheetK ? `<div class="sa-dim" data-act="closeSheet"></div><div class="sa-sheet" role="dialog" data-at="${sheetAt}" data-closing="${s.sheet ? 0 : 1}"><div class="grab"></div>${sheetHtml(sheetK, s)}</div>` : '')
      + (s.banner && t - s.banner.at < 5 ? bannerHtml(s.banner) : '')
      + (s.toast && t - s.toast.at < 3.4 ? `<div class="sa-toast" data-at="${s.toast.at}">${ic('check', 18)}${s.toast.text}</div>` : '');
    root.classList.toggle('sb-dark', !!DARK[s.screen]);
    root.innerHTML = status + `<div class="sa-stage">${showPrev ? `<section class="sa-layer prev" data-scr="${s.nav.from}">${app.view(s.nav.from)}</section>` : ''}<section class="sa-layer cur" data-scr="${s.screen}">${app.view(s.screen)}</section>${overlays}</div><div class="sa-gesture"></div>`;
    root.dataset.scr = s.screen;
    const sc = root.querySelector('.sa-layer.cur .sa-scroll'); if (sc && oldScr === s.screen && app.mode !== 'video') sc.scrollTop = oldTop;
    app.animate(t);
    if (opts.onChange) opts.onChange(s);
  };

  app.animate = t => {
    const s = app.state, nav = s.nav;
    const cur = root.querySelector('.sa-layer.cur'), prev = root.querySelector('.sa-layer.prev');
    const D = nav && nav.kind === 'fade' ? .34 : .4, p = nav ? clamp((t - nav.at) / D) : 1, e = eio(p);
    if (cur) { cur.style.zIndex = 2; cur.style.opacity = 1; cur.style.transform = 'none';
      if (nav && p < 1) { if (nav.kind === 'push') cur.style.transform = `translateX(${(1 - e) * 100}%)`;
        else if (nav.kind === 'pop') { cur.style.zIndex = 1; cur.style.transform = `translateX(${-(1 - e) * 22}%)`; }
        else { cur.style.opacity = e; cur.style.transform = `translateY(${(1 - e) * 10}px)`; } } }
    if (prev) { if (!nav || p >= 1) prev.style.visibility = 'hidden';
      else { prev.style.visibility = 'visible';
        if (nav.kind === 'push') { prev.style.zIndex = 1; prev.style.transform = `translateX(${-e * 22}%)`; prev.style.opacity = 1 - e * .25; }
        else if (nav.kind === 'pop') { prev.style.zIndex = 3; prev.style.transform = `translateX(${e * 100}%)`; }
        else { prev.style.zIndex = 1; prev.style.opacity = 1 - e; } } }
    root.querySelectorAll('[data-t0],[data-t1]').forEach(el => {
      const t0 = el.dataset.t0 ? +el.dataset.t0 : -1e9, t1 = el.dataset.t1 ? +el.dataset.t1 : 1e9;
      const o = t < t0 || t >= t1 ? 0 : clamp((t - t0) / .35);
      el.style.opacity = o; el.style.visibility = o <= 0 ? 'hidden' : 'visible'; el.style.transform = `translateY(${(1 - eout(clamp((t - t0) / .4))) * 8}px)`; });
    const sh = root.querySelector('.sa-sheet'), dim = root.querySelector('.sa-dim');
    if (sh) { let q = eout(clamp((t - +sh.dataset.at) / .34)); if (sh.dataset.closing === '1') q = 1 - q;
      sh.style.transform = `translateY(${(1 - q) * 105}%)`; dim.style.opacity = q; const v = q <= 0.001 ? 'hidden' : 'visible'; sh.style.visibility = v; dim.style.visibility = v; }
    const bn = root.querySelector('.sa-banner');
    if (bn) { const at = +bn.dataset.at, q = eout(clamp((t - at) / .45)), out = clamp((t - at - 4.2) / .4); bn.style.transform = `translateY(${-130 * (1 - q) - 130 * out * out}px)`; bn.style.visibility = t < at || out >= 1 ? 'hidden' : 'visible'; }
    const to = root.querySelector('.sa-toast');
    if (to) { const at = +to.dataset.at, o = Math.min(clamp((t - at) / .25), clamp((at + 3 - t) / .3)); to.style.opacity = o; to.style.visibility = o <= 0 ? 'hidden' : 'visible'; to.style.transform = `translateY(${(1 - o) * 12}px)`; }
    root.querySelectorAll('.spin').forEach(el => el.style.transform = `rotate(${(t * 400) % 360}deg)`);
    root.querySelectorAll('.ring').forEach(el => { const ph = (t % 1.6) / 1.6; el.style.transform = `scale(${1 + ph * .75})`; el.style.opacity = (1 - ph) * .9; });
    root.querySelectorAll('[data-press]').forEach(el => { const at = +el.dataset.press; el.classList.toggle('pressed', t >= at - .05 && t < at + .4); });
  };

  app.dispatch = (a, arg) => { reduce(app, a, arg); app.render(); };
  app.clickEl = el => app.dispatch(el.dataset.act, el.dataset.arg);
  root.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || !root.contains(el) || app.mode === 'video') return; e.preventDefault(); app.clickEl(el); });

  if (app.mode !== 'video') {
    const loop = () => { const s = app.state, t = app.now();
      if (s.nav && t - s.nav.at > .6 && root.querySelector('.sa-layer.prev')) root.querySelector('.sa-layer.prev').remove();
      if (s.toast && t - s.toast.at > 3.5) { s.toast = null; root.querySelector('.sa-toast')?.remove(); }
      if (s.sheetClosing && t - s.sheetClosing.at > .5) { s.sheetClosing = null; root.querySelector('.sa-sheet')?.remove(); root.querySelector('.sa-dim')?.remove(); }
      app.animate(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  app.reset = () => { app.state = initState(); };
  app.render();
  return app;
}

global.Saath = { mount, initState };
})(window);
