/*
 * Saath v2 — two phones, one family.
 * A single store holds the family's shared state (W) and each phone's UI state (P.amma, P.priya).
 * Views are pure functions; animations read a clock, so the same code runs live in the browser
 * or frame-by-frame for the video. Follow-up events (a notification, a payment confirming,
 * the visit updating) are scheduled actions, so they replay deterministically.
 * People, places, prices and medical details are illustrative.
 */
(function (global) {
'use strict';

const ICON = {
  back: 'M15 18l-6-6 6-6', check: 'M5 12.5l4.5 4.5L19 7.5', phone: 'M5 3.5h3.5l2 5L8 10a12 12 0 0 0 6 6l1.5-2.5 5 2v3.5a2 2 0 0 1-2 2A17 17 0 0 1 3 5.5a2 2 0 0 1 2-2z',
  hang: 'M3 14.5c5-4.6 13-4.6 18 0l-2.5 3-3.5-1.5v-3a9 9 0 0 0-6 0v3L5.5 17.5z', bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  alert: 'M12 3.5L2.5 20h19zM12 10v4.5M12 17.2v.3', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'
};
const ic = (n, s = 20, x = '') => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" ${x}><path d="${ICON[n]}"/></svg>`;
const MARK = (s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="12" r="6.2" fill="currentColor"/><circle cx="17.2" cy="12" r="4.4" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eout = x => 1 - Math.pow(1 - x, 3);
const timed = t0 => t0 == null ? '' : ` data-t0="${(+t0).toFixed(3)}"`;

/* ---------------- strings on Amma's phone (Kannada & Hindi pending native review) ---------------- */
const L = {
  kn: { name: 'ಕನ್ನಡ', date: 'ಬುಧವಾರ, 11 ನವೆಂಬರ್', greet: 'ನಮಸ್ಕಾರ, ಲಕ್ಷ್ಮಿ', done: 'ಬೆಳಗಿನ ಕರೆ ಮುಗಿದಿದೆ', call: 'ಪ್ರಿಯಾಗೆ ಕರೆ ಮಾಡಿ',
        help: 'ಸಹಾಯ ಬೇಕು', helpSub: 'ಪ್ರಿಯಾ ಮತ್ತು ಶೋಭಾ ಅವರಿಗೆ ತಿಳಿಯುತ್ತದೆ', coming: 'ಸಹಾಯ ಬರುತ್ತಿದೆ',
        told: ['ಪ್ರಿಯಾಗೆ ತಿಳಿಸಲಾಗಿದೆ', 'ಶೋಭಾ ಬರುತ್ತಿದ್ದಾರೆ · 2 ನಿಮಿಷ', 'ರವಿ ಬರುತ್ತಿದ್ದಾರೆ · 11 ನಿಮಿಷ'], okay: 'ನಾನು ಸರಿಯಾಗಿದ್ದೇನೆ', morning: 'ಬೆಳಗಿನ ಕರೆ' },
  hi: { name: 'हिंदी', date: 'बुधवार, 11 नवंबर', greet: 'नमस्ते, लक्ष्मी जी', done: 'सुबह की कॉल हो गई', call: 'प्रिया को कॉल करें',
        help: 'मदद चाहिए', helpSub: 'प्रिया और शोभा को पता चलेगा', coming: 'मदद आ रही है',
        told: ['प्रिया को बता दिया है', 'शोभा आ रही हैं · 2 मिनट', 'रवि आ रहे हैं · 11 मिनट'], okay: 'मैं ठीक हूँ', morning: 'सुबह की कॉल' },
  en: { name: 'English', date: 'Wednesday, 11 November', greet: 'Namaskara, Lakshmi', done: 'Morning call done', call: 'Call Priya',
        help: 'I need help', helpSub: 'Priya and Shobha will be told', coming: 'Help is on the way',
        told: ['Priya has been told', 'Shobha is coming · 2 min', 'Ravi is coming · 11 min'], okay: 'I’m okay', morning: 'Morning call' }
};
const IVR = {
  kn: ['ನಮಸ್ಕಾರ ಲಕ್ಷ್ಮಿ ಅವರೇ. ಬೆಳಗಿನ ಔಷಧಿ ತೆಗೆದುಕೊಂಡಿದ್ದರೆ 1 ಒತ್ತಿ. ಇಲ್ಲದಿದ್ದರೆ 2 ಒತ್ತಿ.', 'ಧನ್ಯವಾದ. ಇಂದು ಹೇಗಿದ್ದೀರಿ? ಚೆನ್ನಾಗಿದ್ದರೆ 1, ಹುಷಾರಿಲ್ಲದಿದ್ದರೆ 2, ಸಹಾಯ ಬೇಕಿದ್ದರೆ 9 ಒತ್ತಿ.', 'ಸಂತೋಷ! ಪ್ರಿಯಾ ಅವರಿಗೆ ತಿಳಿಸುತ್ತೇವೆ. ನಮಸ್ಕಾರ.'],
  hi: ['नमस्ते लक्ष्मी जी। अगर आपने सुबह की दवा ले ली है तो 1 दबाएँ, नहीं तो 2 दबाएँ।', 'धन्यवाद। आज आप कैसी हैं? ठीक हैं तो 1, तबीयत ठीक नहीं तो 2, मदद चाहिए तो 9 दबाएँ।', 'बहुत अच्छा! हम प्रिया को बता देंगे। नमस्ते।'],
  en: ['Namaskara, Lakshmi. If you have taken your morning medicine, press 1. If not, press 2.', 'Thank you. How are you today? Press 1 if you are well, 2 if you feel unwell, 9 if you need help.', 'Wonderful. We will let Priya know. Namaskara.']
};
const VISIT = [['4:00 PM', 'Ravi picked up Appa', 'From home in Kuvempunagar'], ['4:24 PM', 'At the clinic', 'Dr. Shetty’s clinic, Saraswathipuram'], ['4:52 PM', 'Seen by Dr. Shetty', 'His advice is below']];
const VISIT_H = ['Ravi has picked up Appa', 'They’re at the clinic', 'Done. Here’s what the doctor said.'];

function newWorld() {
  return { step: 1, clock: '8:30 AM', lang: 'kn', call: { stage: 0 }, booked: false, pay: null,
    visit: -1, visitAt: [], help: null, alert: null, resolved: false };
}
function newPhone(dev) { return { screen: dev === 'amma' ? 'a_call' : 'p_home', stack: [], nav: null, sheet: null, sheetClose: null, banner: null, toast: null, parent: 'amma' }; }

/* ---------------- Priya's phone ---------------- */
function pHome(W, P) {
  const c = W.call.stage, alertOn = W.alert && !W.resolved;
  let head = 'Appa is fine. Amma is on her morning call.', hc = '';
  if (alertOn) { head = 'Amma pressed Help.'; hc = 'sos-t'; }
  else if (W.resolved) head = 'Amma is okay. Shobha is with her.';
  else if (W.visit >= 0 && W.visit < 2) head = 'Ravi is with Appa at the doctor.';
  else if (W.visit >= 2) head = 'Both are fine. Appa’s check-up went well.';
  else if (c >= 3) head = 'Amma and Appa are both fine this morning.';
  const amma = alertOn ? ['Pressed Help at 6:42 PM', 'sos'] : W.resolved ? ['Shobha is with her. Feeling better.', 'warn']
    : c >= 3 ? ['Took her medicine at 8:31 · feeling fine', 'ok'] : ['On her morning call now', 'wait'];
  const appa = W.visit >= 2 ? ['Check-up done · BP 138/86', 'ok'] : W.visit >= 0 ? ['At the doctor with Ravi', 'ok'] : ['Took his tablets at 8:12 · feeling good', 'ok'];
  let checkup;
  if (!W.booked) checkup = `<div class="flag">${ic('alert', 17)}No one is going with him</div><div class="act"><button class="btn" id="find-help" data-act="go" data-arg="p_request">Find someone to go</button></div>`;
  else checkup = `<div class="good">${ic('check', 17)}${W.visit < 0 ? 'Ravi Kumar will take him · leaves at 4:00 PM' : W.visit < 2 ? 'Ravi is with him now' : 'Done · doctor’s advice added'}</div><div class="act"><button class="btn ghost" id="see-visit" data-act="seeVisit">See the visit</button></div>`;
  return `<div class="scroll"><div class="page">
    <div class="topline"><span class="brandline">${MARK(20)}Saath</span><span class="av sm priya">P</span></div>
    <div class="meta">Wednesday, 11 November</div>
    <h1 class="h1 ${hc}" style="margin-top:6px">${head}</h1>
    <div class="meta" style="margin-top:8px">Updated ${W.clock}</div>
    ${alertOn ? `<div style="margin-top:18px"><button class="btn" id="open-alert" data-act="openAlert" style="background:var(--sos);color:#fff">See what’s happening</button></div>` : ''}
    <div class="list" style="margin-top:24px">
      <button class="person" id="row-appa" data-act="go" data-arg="p_parent:appa"><span class="av appa">A</span><span class="tx"><span class="nm">Appa</span><br><span class="ln">${appa[0]}</span></span><span class="dot ${appa[1]}"></span></button>
      <button class="person" id="row-amma" data-act="go" data-arg="p_parent:amma"><span class="av amma">L</span><span class="tx"><span class="nm">Amma</span><br><span class="ln">${amma[0]}</span></span><span class="dot ${amma[1]}"></span></button>
    </div>
    <div class="sec">Later today</div>
    <div class="ev"><div class="tm">4:30 PM</div><div><div class="tt">Appa’s heart check-up</div><div class="ds">Dr. Anand Shetty, Saraswathipuram</div>${checkup}</div></div>
    <div class="ev"><div class="tm">8:30 PM</div><div><div class="tt">Appa’s evening tablet</div><div class="ds">We’ll call to remind him</div></div></div>
  </div></div>`;
}

function pParent(W, P) {
  const isA = P.parent === 'amma', done = W.call.stage >= 3;
  const days = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Today'];
  const week = days.map((d, i) => `<div><i class="${i === 6 ? (isA && !done ? 'now' : '') : isA && i === 2 ? 'miss' : ''}"></i>${d}</div>`).join('');
  const meds = isA
    ? [['Levothyroxine 50 mcg', 'Morning, before food', done ? '8:31 AM' : ''], ['Calcium + Vitamin D3', 'After lunch', '']]
    : [['Amlodipine 5 mg', 'Morning', '8:12 AM'], ['Metformin 500 mg', 'After breakfast and dinner', '8:12 AM'], ['Atorvastatin 10 mg', 'Night', '']];
  return `<div class="appbar"><button class="icon-btn" data-act="back" aria-label="Back">${ic('back', 24)}</button></div>
  <div class="scroll"><div class="page" style="padding-top:0">
    <div style="display:flex;align-items:center;gap:16px"><span class="av lg ${isA ? 'amma' : 'appa'}">${isA ? 'L' : 'A'}</span><div><h1 class="h2">${isA ? 'Amma' : 'Appa'}</h1><div class="meta">${isA ? 'Lakshmi Raghavendra, 66' : 'K. Raghavendra, 72'} · Kuvempunagar, Mysuru</div></div></div>
    <div style="margin-top:20px"><button class="btn ghost" data-act="toast" data-arg="Calling ${isA ? 'Amma' : 'Appa'}…">${ic('phone', 18)}Call ${isA ? 'Amma' : 'Appa'}</button></div>
    <div class="sec">Morning call</div>
    <div style="font-size:16px;margin-top:6px">Every day at ${isA ? '8:30' : '8:00'} AM, in Kannada. <button class="link" data-act="toast" data-arg="Time, language and questions can be changed here">Change</button></div>
    <div class="week">${week}</div>
    ${isA ? `<div class="meta" style="margin-top:10px">Missed on Saturday. Shobha checked on her at 10:05 AM.</div>` : ''}
    <div class="sec">If ${isA ? 'she doesn’t' : 'he doesn’t'} answer</div>
    <ol class="ladder" style="padding:0"><li>We call again after 15 minutes</li><li>We tell you and Karthik</li><li>We ask Shobha, the neighbour, to look in</li><li>We send a Sahayak, within the hour</li></ol>
    <div class="sec">Medicines</div>
    <div class="list" style="margin-top:8px">${meds.map(m => `<div class="person" style="padding:13px 0"><span class="tx"><span class="nm" style="font-size:16px">${m[0]}</span><br><span class="ln">${m[1]}</span></span>${m[2] ? `<span class="ok-t" style="font-size:14px;font-weight:600;display:flex;gap:5px;align-items:center">${ic('check', 16)}${m[2]}</span>` : ''}</div>`).join('')}</div>
  </div></div>`;
}

function pRequest(W, P) {
  return `<div class="appbar"><button class="icon-btn" data-act="back" aria-label="Back">${ic('back', 24)}</button></div>
  <div class="scroll" id="request-scroll"><div class="page" style="padding-top:0">
    <h1 class="h2">Someone to go with Appa</h1>
    <div class="meta" style="margin-top:4px">to his heart check-up today</div>
    <div class="kv">
      <div class="r"><span class="k">When</span><span class="v">Today, 4:00 PM<small>Leaves home 30 minutes before the appointment</small></span></div>
      <div class="r"><span class="k">Where</span><span class="v">Dr. Anand Shetty’s clinic<small>Saraswathipuram, 3 km from home</small></span></div>
      <div class="r"><span class="k">Helper</span><span class="v" style="display:flex;gap:12px;align-items:flex-start"><span class="av sm" style="background:var(--bg-2)">R</span><span>Ravi Kumar<small>Sahayak · ${ic('star', 13, 'style="display:inline;vertical-align:-2px;fill:currentColor"')} 4.9 from 38 visits · has been with Appa twice</small></span></span></div>
      <div class="r"><span class="k">Checked</span><span class="v">ID and police verified, trained in first aid</span></div>
      <div class="r"><span class="k">He will</span><span class="v">Take Appa there and back, sit in on the consultation, and send you the doctor’s advice.</span></div>
    </div>
  </div></div>
  <div class="foot">${!W.booked
    ? `<button class="btn" id="pay" data-act="pay">Pay ₹399 with UPI</button><div class="meta">Free to cancel until 2:00 PM</div>`
    : `<div class="good" style="margin:0 0 12px;justify-content:center;font-size:15.5px">${ic('check', 18)}Ravi is booked. We’ll remind Appa at 3:30 PM.</div><button class="btn" id="done-request" data-act="doneRequest">Done</button>`}</div>`;
}

function pVisit(W, P) {
  const st = Math.max(0, W.visit), at = W.visitAt || [];
  const items = VISIT.slice(0, st + 1).map((v, i) => `<div class="it"${timed(at[i])}><div class="tm">${v[0]}</div><div><div class="tt">${v[1]}</div><div class="ds">${v[2]}</div>${i === 0 ? '<div class="photo" aria-label="Photo of Appa with Ravi"></div>' : ''}</div></div>`).join('');
  const note = st >= 2 ? `<div class="note"${timed(at[2] != null ? at[2] + .4 : null)}><div class="lab">Doctor’s advice, written by Ravi</div>
      <p class="quote">“BP is 138/86. Keep the same medicines. Walk for 30 minutes every morning, and less salt. Come back in a month.”</p>
      <div class="row"><span>Prescription</span><span class="ok-t" style="font-weight:600">Saved</span></div>
      <div class="row"><span>Next check-up</span><span style="font-weight:600">11 December</span></div></div>` : '';
  return `<div class="appbar"><button class="icon-btn" data-act="back" aria-label="Back">${ic('back', 24)}</button><span class="ttl">Appa’s check-up</span></div>
  <div class="scroll" id="visit-scroll"><div class="page" style="padding-top:4px">
    <h1 class="h2">${VISIT_H[st]}</h1><div class="meta" style="margin-top:4px">With Ravi Kumar · today</div>
    <div class="tl">${items}</div>${note}
  </div></div>`;
}

function pAlert(W, P) {
  const t0 = W.alert ? W.alert.at : 0;
  const it = (d, html) => `<div class="it"${timed(t0 + d)}>${ic('check', 18)}<div>${html}</div></div>`;
  return `<div class="redtop">
      <button class="icon-btn" data-act="back" aria-label="Back" style="margin-left:-12px;color:#fff">${ic('back', 24)}</button>
      <h1 class="h1" style="margin-top:6px">Amma pressed Help</h1><div class="meta" style="margin-top:4px">6:42 PM · at home in Kuvempunagar</div>
      <div style="margin-top:18px"><button class="btn on-red" id="call-amma" data-act="toast" data-arg="Calling Amma…">${ic('phone', 18)}Call Amma</button></div></div>
    <div class="scroll"><div class="page" style="padding-top:4px">
      <div class="sec" style="margin-top:14px">Happening now</div>
      <div class="live">
        ${it(.5, '<b>Shobha</b> is on her way<small>Neighbour · 2 minutes away</small>')}
        ${it(1.2, '<b>Ravi</b> is coming<small>Sahayak · about 11 minutes</small>')}
        ${it(1.9, '<b>Karthik</b> has been told<small>In Singapore</small>')}
        <div class="it big"${timed(t0 + 4.6)}>${ic('check', 18)}<div><span style="font-family:var(--sans);font-size:13.5px;font-weight:600;color:var(--mu)">6:45 PM · Shobha is with Amma</span><br>“She felt dizzy, so she’s sitting down. Her BP is 104/68.”</div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:22px">
        <button class="btn" id="close-alert" data-act="closeAlert">She’s okay · close alert</button>
        <button class="btn sos-line" data-act="toast" data-arg="This opens your dialer with 112">Call 112</button></div>
    </div></div>`;
}

/* ---------------- Amma's phone ---------------- */
function aCall(W, P) {
  const c = W.call, l = L[W.lang], s = c.stage;
  if (s === 0) return `<div class="call" style="flex:1;display:flex;flex-direction:column">
      <div style="margin-top:110px"><div class="sub">Incoming call</div><div class="who" style="margin-top:6px">Saath</div><div class="sub" style="margin-top:4px">${l.morning} · ${l.name}</div></div>
      <div style="position:relative;width:118px;height:118px;margin:56px auto 0"><span class="ring"></span><span class="ring" data-ring-delay=".8"></span><span style="position:absolute;inset:14px;border-radius:50%;background:#1F2A2E;display:flex;align-items:center;justify-content:center;color:#fff">${MARK(44)}</span></div>
      <div style="margin-top:auto;display:flex;justify-content:space-around;padding:0 46px 64px">
        <div style="text-align:center"><button class="callbtn red" data-act="decline" aria-label="Decline">${ic('hang', 30)}</button><div class="sub" style="margin-top:8px">Decline</div></div>
        <div style="text-align:center"><button class="callbtn green" id="answer" data-act="answer" aria-label="Answer">${ic('phone', 28)}</button><div class="sub" style="margin-top:8px">Answer</div></div></div></div>`;
  const q = IVR[W.lang][Math.min(2, s - 1)], qen = IVR.en[Math.min(2, s - 1)];
  const qAt = s === 1 ? c.t1 + .3 : s === 2 ? c.t2 + .45 : c.t3 + .45;
  const hot = s === 1 ? ['1', '2'] : s === 2 ? ['1', '2', '9'] : [];
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(k => {
    const press = (s >= 2 && k === c.a1) ? ` data-press="${s === 2 ? c.t2 : -9}"` : '';
    const press2 = (s >= 3 && k === c.a2) ? ` data-press="${c.t3}"` : '';
    return `<button class="${hot.includes(k) ? 'hot' : ''}" id="key-${k === '*' ? 'star' : k === '#' ? 'hash' : k}" data-act="key" data-arg="${k}"${press2 || press}>${k}</button>`; }).join('');
  return `<div class="call" style="flex:1;display:flex;flex-direction:column">
    <div style="margin-top:58px"><div class="who" style="font-size:28px">Saath</div><div class="sub">${s >= 3 ? 'Call ending' : l.morning + ' · ' + l.name}</div></div>
    <div class="speak" style="margin-top:34px;min-height:200px"${timed(qAt)}><div class="bars" aria-hidden="true">${'<i></i>'.repeat(9)}</div><div class="said">${q}</div>${W.lang !== 'en' ? `<div class="tr">${qen}</div>` : ''}</div>
    <div class="keypad" style="margin-top:auto">${keys}</div>
    <div style="display:flex;justify-content:center;padding:22px 0 40px"><button class="callbtn red" id="end-call" data-act="endCall" aria-label="End call">${ic('hang', 30)}</button></div></div>`;
}
function aHome(W, P) {
  const l = L[W.lang];
  return `<div class="scroll elder"><div class="page">
    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px"><span class="meta" style="font-size:15px">${l.date}</span>
      <span class="langs">${['kn', 'hi', 'en'].map(k => `<button class="${W.lang === k ? 'on' : ''}" data-act="lang" data-arg="${k}">${L[k].name}</button>`).join('')}</span></div>
    <div class="greet">${l.greet}</div>
    ${W.call.stage >= 3 ? `<div class="done-line">${ic('check', 22, 'style="stroke-width:2.6"')}${l.done}</div>` : ''}
    <button class="bigcall" id="call-priya" data-act="toast" data-arg="${l.call}…"><span class="av priya" style="width:56px;height:56px;font-size:24px">P</span><span class="tx">${l.call}</span><span class="ph">${ic('phone', 26)}</span></button>
    <button class="helpbtn" id="help" data-act="help">${ic('bell', 34)}<span class="l1">${l.help}</span><span class="l2">${l.helpSub}</span></button>
  </div></div>`;
}
function aHelp(W, P) {
  const l = L[W.lang], t0 = W.help ? W.help.at : 0;
  return `<div class="scroll redfull elder"><div class="page" style="padding-top:70px">
    <div style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center">${ic('bell', 34)}</div>
    <div class="greet" style="margin-top:22px">${l.coming}</div>
    <div class="told">${l.told.map((x, i) => `<div${timed(t0 + .6 + i * .7)}>${ic('check', 24, 'style="stroke-width:2.6"')}${x}</div>`).join('')}</div>
    <div style="margin-top:34px"><button class="btn on-red" id="okay" data-act="okay" style="height:64px;font-size:19px;border-radius:20px">${l.okay}</button></div>
  </div></div>`;
}

const VIEWS = { p_home: pHome, p_parent: pParent, p_request: pRequest, p_visit: pVisit, p_alert: pAlert, a_call: aCall, a_home: aHome, a_help: aHelp };
const FLUSH = { a_call: 1, a_help: 1, p_alert: 1 };

function sheetHtml(k, W) {
  if (k !== 'pay') return '';
  const t = W.pay ? W.pay.at + 1.7 : 0;
  return `<div class="stack" style="min-height:190px;text-align:center">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px" data-t1="${t.toFixed(3)}"><div class="spin"></div><div style="font-size:17px;font-weight:600">Approve ₹399 in your UPI app</div><div class="meta">Paying Saath Care, Mysuru</div></div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px"${timed(t)}><span style="width:64px;height:64px;border-radius:50%;background:var(--ok);color:#fff;display:flex;align-items:center;justify-content:center">${ic('check', 32, 'style="stroke-width:2.6"')}</span><div style="font-size:19px;font-weight:600">Paid ₹399</div><div class="meta">UPI · 8:34 AM</div></div></div>`;
}

/* ---------------- reducer ---------------- */
function reduce(S, dev, a, arg, at) {
  const W = S.W, P = S.P[dev], A = S.P.amma, Pr = S.P.priya;
  const nav = (ph, to, kind) => { if (ph.screen === to && kind === 'fade') return; ph.nav = { from: ph.screen, to, at, kind }; ph.screen = to; };
  switch (a) {
    case 'go': { const [scr, p] = (arg || '').split(':'); if (p) P.parent = p; P.stack.push(P.screen); nav(P, scr, 'push'); break; }
    case 'back': nav(P, P.stack.pop() || (dev === 'amma' ? 'a_home' : 'p_home'), 'pop'); break;
    case 'toast': P.toast = { text: arg, at }; break;
    case 'lang': W.lang = arg; break;
    /* Amma */
    case 'answer': if (W.call.stage !== 0) return; W.call = { stage: 1, t1: at }; W.clock = '8:31 AM'; S.sound('ring_stop', at); S.sound('connect', at); break;
    case 'decline': P.toast = { text: 'Saath will call again in 15 minutes.', at }; break;
    case 'key': { const c = W.call; S.sound('dtmf_' + arg, at);
      if (c.stage === 1 && (arg === '1' || arg === '2')) { c.a1 = arg; c.stage = 2; c.t2 = at; }
      else if (c.stage === 2 && ['1', '2', '9'].includes(arg)) { c.a2 = arg; c.stage = 3; c.t3 = at;
        if (arg === '9') { S.schedule(1.4, 'amma', 'endCall'); S.schedule(1.6, 'amma', 'help'); }
        else { S.schedule(1.4, 'priya', 'notify'); S.schedule(3.6, 'amma', 'endCall'); } }
      break; }
    case 'endCall': { const c = W.call; if (c.stage === 4) return;
      if (c.stage < 3) { W.call = { stage: 0 }; P.toast = { text: 'Call ended. Saath will try again shortly.', at }; S.sound('hangup', at); S.schedule(2.2, 'amma', 'ringAgain'); return; }
      c.stage = 4; S.sound('hangup', at); nav(A, 'a_home', 'fade'); if (W.step === 1) W.step = 2; break; }
    case 'ringAgain': if (W.call.stage === 0) S.sound('ring_start', at); break;
    case 'help': if (W.help) return; W.help = { at }; W.clock = '6:42 PM'; if (W.call.stage < 3) W.call = { stage: 4, a1: '1', a2: '1' }; nav(A, 'a_help', 'fade'); S.sound('help', at); S.schedule(1.4, 'priya', 'alertIn'); break;
    case 'okay': W.help = null; nav(A, 'a_home', 'fade');
      if (W.alert && !W.resolved) { W.resolved = true; Pr.stack = []; nav(Pr, 'p_home', 'fade'); Pr.toast = { text: 'Amma says she’s okay.', at }; }
      if (W.step === 4) W.step = 5; break;
    /* Priya */
    case 'notify': Pr.banner = { k: 'checkin', at }; S.sound('notify', at); break;
    case 'openBanner': Pr.banner = null; if (Pr.screen !== 'p_home') { Pr.stack = []; nav(Pr, 'p_home', 'fade'); } break;
    case 'pay': if (W.booked || P.sheet) return; P.sheet = { k: 'pay', at }; W.pay = { at }; S.schedule(1.7, 'priya', 'paid'); break;
    case 'paid': W.booked = true; W.clock = '8:34 AM'; S.sound('success', at); S.schedule(1.3, 'priya', 'closeSheet'); break;
    case 'closeSheet': if (P.sheet) { P.sheetClose = { k: P.sheet.k, at }; P.sheet = null; } break;
    case 'doneRequest': P.stack = []; nav(P, 'p_home', 'pop'); if (W.step === 2) W.step = 3; break;
    case 'seeVisit': P.stack.push(P.screen); nav(P, 'p_visit', 'push');
      if (W.visit < 0) { W.visit = 0; W.visitAt = [at + .35]; W.clock = '4:00 PM'; S.sound('tick', at + .35); S.schedule(2.8, 'priya', 'visitNext'); S.schedule(5.6, 'priya', 'visitNext'); }
      if (W.step === 2) W.step = 3; break;
    case 'visitNext': if (W.visit >= 2) return; W.visit++; W.visitAt[W.visit] = at; W.clock = VISIT[W.visit][0]; S.sound('tick', at); if (W.visit === 2 && W.step === 3) W.step = 4; break;
    case 'alertIn': W.alert = { at }; W.resolved = false; Pr.sheet = null; Pr.banner = null; Pr.stack = ['p_home']; nav(Pr, 'p_alert', 'fade'); S.sound('alert', at); break;
    case 'openAlert': P.stack.push(P.screen); nav(P, 'p_alert', 'push'); break;
    case 'closeAlert': W.resolved = true; W.help = null; Pr.stack = []; nav(Pr, 'p_home', 'pop'); Pr.toast = { text: 'Alert closed. Shobha is staying with Amma tonight.', at: at + .35 };
      if (A.screen === 'a_help') nav(A, 'a_home', 'fade'); if (W.step === 4) W.step = 5; S.sound('resolve', at); break;
  }
}

/* ---------------- store ---------------- */
function createStore(opts = {}) {
  const S = { mode: opts.mode || 'live', time: 0, W: newWorld(), P: { amma: newPhone('amma'), priya: newPhone('priya') }, els: {}, gen: 0, pending: [], sounds: [] };
  S.now = () => S.mode === 'video' ? S.time : performance.now() / 1000;
  S.sound = (name, at) => { if (S.mode === 'video') S.sounds.push({ name, at }); else if (opts.onSound) { const d = at - S.now(); d > .02 ? setTimeout(() => opts.onSound(name), d * 1000) : opts.onSound(name); } };
  S.schedule = (delay, dev, act, arg) => { const at = S.now() + delay;
    if (S.mode === 'video') S.pending.push({ at, dev, act, arg });
    else { const g = S.gen; setTimeout(() => { if (g === S.gen) S.dispatch(dev, act, arg); }, delay * 1000); } };
  S.dispatch = (dev, act, arg) => { reduce(S, dev, act, arg, S.now()); S.renderAll(); if (opts.onChange) opts.onChange(S); };
  S.click = (dev, b) => S.dispatch(dev, b.dataset.act, b.dataset.arg);

  S.attach = (dev, el, o = {}) => {
    el.classList.add('sa'); if (o.framed) el.classList.add('framed');
    S.els[dev] = el;
    el.addEventListener('click', e => { if (S.mode === 'video') return; const b = e.target.closest('[data-act]'); if (!b || !el.contains(b)) return; e.preventDefault(); S.click(dev, b); });
    S.render(dev);
  };
  S.render = dev => {
    const el = S.els[dev], W = S.W, P = S.P[dev], t = S.now();
    const sc = el.querySelector('.layer.cur .scroll'), keep = el.dataset.scr === P.screen && S.mode !== 'video' ? (sc ? sc.scrollTop : 0) : 0;
    const view = scr => VIEWS[scr](W, P, S);
    const showPrev = P.nav && P.nav.from && P.nav.from !== P.screen && t - P.nav.at < .6;
    const sk = P.sheet ? P.sheet.k : (P.sheetClose && t - P.sheetClose.at < .5 ? P.sheetClose.k : null);
    const sAt = P.sheet ? P.sheet.at : P.sheetClose ? P.sheetClose.at : 0;
    const overlays = (sk ? `<div class="dim"></div><div class="sheet" role="dialog" data-at="${sAt}" data-closing="${P.sheet ? 0 : 1}"><div class="grab"></div>${sheetHtml(sk, W)}</div>` : '')
      + (P.banner && t - P.banner.at < 6 ? `<button class="banner" id="banner" data-act="openBanner" data-at="${P.banner.at}"><span class="app">${MARK(14)}Saath · now</span><div class="t">Amma answered her morning call</div><div class="d">Took her medicine · feeling fine</div></button>` : '')
      + (P.toast && t - P.toast.at < 3.4 ? `<div class="toast" data-at="${P.toast.at}">${P.toast.text}</div>` : '');
    const dark = P.screen === 'a_call' || P.screen === 'a_help' || P.screen === 'p_alert';
    el.classList.toggle('on-dark', dark);
    const status = `<div class="sa-status"><span>${W.clock.replace(/ (AM|PM)/, '')}</span><span class="cam"></span><span style="display:flex;gap:6px;align-items:center"><svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1" opacity=".4"/></svg><svg width="25" height="12" viewBox="0 0 25 12"><rect x=".5" y=".5" width="21" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".5"/><rect x="2.5" y="2.5" width="14" height="7" rx="2" fill="currentColor"/></svg></span></div>`;
    el.innerHTML = status
      + (showPrev ? `<section class="layer prev${FLUSH[P.nav.from] ? ' flush' : ''}" data-scr="${P.nav.from}">${view(P.nav.from)}</section>` : '')
      + `<section class="layer cur${FLUSH[P.screen] ? ' flush' : ''}" data-scr="${P.screen}">${view(P.screen)}</section>` + overlays + `<div class="gesture"></div>`;
    el.dataset.scr = P.screen;
    const nsc = el.querySelector('.layer.cur .scroll'); if (nsc && keep) nsc.scrollTop = keep;
    animatePhone(S, dev, t);
  };
  S.renderAll = () => Object.keys(S.els).forEach(S.render);
  S.animate = t => Object.keys(S.els).forEach(d => animatePhone(S, d, t));
  S.snapshot = () => JSON.parse(JSON.stringify({ W: S.W, P: S.P }));
  S.restore = s => { const c = JSON.parse(JSON.stringify(s)); S.W = c.W; S.P = c.P; };
  S.gotoStep = n => {
    S.gen++; S.pending = []; const at = S.now(); const W = newWorld(), A = newPhone('amma'), Pr = newPhone('priya');
    if (n >= 2) { W.call = { stage: 4, a1: '1', a2: '1' }; W.clock = '8:31 AM'; A.screen = 'a_home'; W.step = 2; }
    if (n >= 3) { W.booked = true; W.clock = '8:34 AM'; W.step = 3; }
    if (n >= 4) { W.visit = 2; W.visitAt = [0, 0, 0]; W.clock = '6:40 PM'; W.step = 4; }
    if (n >= 5) { W.step = 5; W.alert = { at: 0 }; W.resolved = true; W.clock = '6:50 PM'; }
    [A, Pr].forEach(p => { p.nav = { from: null, to: p.screen, at, kind: 'fade' }; });
    S.W = W; S.P = { amma: A, priya: Pr };
    S.sound(n === 1 ? 'ring_start' : 'ring_stop', at);
    S.renderAll(); if (opts.onChange) opts.onChange(S);
  };
  if (S.mode !== 'video') {
    const loop = () => { const t = S.now();
      for (const dev in S.els) { const el = S.els[dev], P = S.P[dev];
        if (P.nav && t - P.nav.at > .6) el.querySelector('.layer.prev')?.remove();
        if (P.toast && t - P.toast.at > 3.5) { P.toast = null; el.querySelector('.toast')?.remove(); }
        if (P.banner && t - P.banner.at > 6) { P.banner = null; el.querySelector('.banner')?.remove(); }
        if (P.sheetClose && t - P.sheetClose.at > .5) { P.sheetClose = null; el.querySelector('.sheet')?.remove(); el.querySelector('.dim')?.remove(); } }
      S.animate(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  return S;
}

/* ---------------- per-phone animation (pure function of t) ---------------- */
function animatePhone(S, dev, t) {
  const el = S.els[dev], P = S.P[dev]; if (!el) return;
  const nav = P.nav, cur = el.querySelector('.layer.cur'), prev = el.querySelector('.layer.prev');
  const D = nav && nav.kind === 'fade' ? .36 : .42, p = nav ? clamp((t - nav.at) / D) : 1, e = eio(p);
  if (cur) { cur.style.zIndex = 2; cur.style.opacity = 1; cur.style.transform = 'none';
    if (nav && p < 1) { if (nav.kind === 'push') cur.style.transform = `translateX(${(1 - e) * 100}%)`;
      else if (nav.kind === 'pop') { cur.style.zIndex = 1; cur.style.transform = `translateX(${-(1 - e) * 20}%)`; }
      else cur.style.opacity = e; } }
  if (prev) { if (!nav || p >= 1) prev.style.visibility = 'hidden';
    else { prev.style.visibility = 'visible';
      if (nav.kind === 'push') { prev.style.zIndex = 1; prev.style.transform = `translateX(${-e * 20}%)`; }
      else if (nav.kind === 'pop') { prev.style.zIndex = 3; prev.style.transform = `translateX(${e * 100}%)`; }
      else { prev.style.zIndex = 1; prev.style.opacity = 1 - e; } } }
  el.querySelectorAll('[data-t0],[data-t1]').forEach(n => {
    const t0 = n.dataset.t0 ? +n.dataset.t0 : -1e9, t1 = n.dataset.t1 ? +n.dataset.t1 : 1e9;
    const o = t < t0 || t >= t1 ? 0 : clamp((t - t0) / .4);
    n.style.opacity = o; n.style.visibility = o <= 0 ? 'hidden' : 'visible'; n.style.transform = `translateY(${(1 - eout(clamp((t - t0) / .45))) * 8}px)`; });
  const sh = el.querySelector('.sheet'), dim = el.querySelector('.dim');
  if (sh) { let q = eout(clamp((t - +sh.dataset.at) / .36)); if (sh.dataset.closing === '1') q = 1 - q;
    sh.style.transform = `translateY(${(1 - q) * 105}%)`; dim.style.opacity = q; const v = q <= .001 ? 'hidden' : 'visible'; sh.style.visibility = v; dim.style.visibility = v; }
  const bn = el.querySelector('.banner');
  if (bn) { const at = +bn.dataset.at, q = eout(clamp((t - at) / .45)), out = clamp((t - at - 5.2) / .4);
    bn.style.transform = `translateY(${-140 * (1 - q) - 140 * out * out}px)`; bn.style.visibility = t < at || out >= 1 ? 'hidden' : 'visible'; }
  const to = el.querySelector('.toast');
  if (to) { const at = +to.dataset.at, o = Math.min(clamp((t - at) / .25), clamp((at + 3 - t) / .3)); to.style.opacity = o; to.style.visibility = o <= 0 ? 'hidden' : 'visible'; to.style.transform = `translateY(${(1 - o) * 10}px)`; }
  el.querySelectorAll('.spin').forEach(n => n.style.transform = `rotate(${(t * 420) % 360}deg)`);
  el.querySelectorAll('.ring').forEach(n => { const ph = ((t + (+n.dataset.ringDelay || 0)) % 1.6) / 1.6; n.style.transform = `scale(${1 + ph * .6})`; n.style.opacity = (1 - ph) * .9; });
  el.querySelectorAll('[data-press]').forEach(n => { const at = +n.dataset.press; n.classList.toggle('pressed', t >= at - .03 && t < at + .4); });
  el.querySelectorAll('.bars i').forEach((n, i) => { n.style.height = (5 + 12 * Math.abs(Math.sin(t * 7.3 + i * 1.7) * Math.sin(t * 2.1 + i))) + 'px'; });
}

global.Saath = { createStore, newWorld };
})(window);
