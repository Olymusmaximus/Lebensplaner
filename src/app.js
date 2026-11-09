import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  signOut, deleteUser, EmailAuthProvider, reauthenticateWithCredential
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, getDocs
} from 'firebase/firestore';
import * as CapCore from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { firebaseConfig, WEB_URL, APK_URL } from './config.js';

const IS_NATIVE = !!(CapCore.Capacitor && CapCore.Capacitor.isNativePlatform && CapCore.Capacitor.isNativePlatform());
const FB_READY = !!(firebaseConfig && firebaseConfig.apiKey && !/HIER/i.test(firebaseConfig.apiKey) && firebaseConfig.projectId);

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const today = () => ymd(new Date());
const newId = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const WD = ['Mo','Di','Mi','Do','Fr','Sa','So'];
const fmtLong = s => parse(s).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});
const fmtShort = s => parse(s).toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'short'});
const CATS = {arbeit:'Arbeit',privat:'Privat',gesundheit:'Gesundheit',familie:'Familie',sonstiges:'Sonstiges'};
const catColor = c => `var(--c-${CATS[c]?c:'sonstiges'})`;
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = { check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' };

/* Quest-Icons (eigene Zeichnungen) */
const QI = {
  heute: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>'),
  kalender: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="1"/><path d="M3.5 10h17M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2M7.5 17h2M11 17h2"/>'),
  aufgaben: svg('<path d="M20.5 3.5v4.2L10.2 18 6 13.8 16.3 3.5z"/><path d="M4.5 12.5l7 7M7.8 16.2l-4.3 4.3"/>'),
  gewohnheiten: svg('<path d="M12 21.5c-4 0-7-2.9-7-6.6 0-3.2 2.1-5.1 3.5-6.9.4 1.8 1.4 3 2.6 3.5.1-3.3 1.6-6.4 4.2-8-.3 3 1.2 4.8 2.5 6.5 1 1.4 1.7 3 1.7 4.8 0 3.9-3.3 6.7-7.5 6.7z"/><path d="M12 21.5c-1.7 0-3-1.2-3-2.8 0-1.7 1.4-2.7 2.3-4 .6 1.1 1.6 1.5 2.4 2 .8.5 1.3 1.2 1.3 2.1 0 1.5-1.3 2.7-3 2.7z"/>'),
  notizen: svg('<path d="M7 3.5h11a2 2 0 0 1 2 2v1.5h-4"/><path d="M16 7v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V17h10"/><path d="M7 3.5a2 2 0 0 0-2 2V17"/><path d="M8.5 9h4.5M8.5 12.5h4.5"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3z"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="1.5"/><path d="M11 18.5h2"/>'),
  design: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  logo: svg('<path d="M12 2l9 10-9 10-9-10z"/><path d="M12 7.2l4.4 4.8-4.4 4.8-4.4-4.8z"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>'),
  spark: svg('<path d="M12 3l1.8 5.6L19.5 10l-5.7 1.6L12 17l-1.8-5.4L4.5 10l5.7-1.4z"/>')
};
const QHAB = {
  '🌱': svg('<path d="M12 21v-9"/><path d="M12 12c0-4-3-6.5-7.5-6.5 0 4.2 3 6.5 7.5 6.5zM12 10c0-3.6 2.6-6.3 7.5-6.3 0 4.2-3 6.3-7.5 6.3z"/>'),
  '💧': svg('<path d="M12 3s6.5 6.8 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 9.8 12 3 12 3z"/><path d="M9 14.5a3 3 0 0 0 3 3"/>'),
  '📖': svg('<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>'),
  '🧘': svg('<circle cx="12" cy="4.8" r="2"/><path d="M12 8v5M7.5 11l4.5 2 4.5-2M5 18.5c2.2-2.8 4.4-4.5 7-4.5s4.8 1.7 7 4.5M4 21h16"/>'),
  '🏃': svg('<path d="M6.5 7.5v9M3.5 10v4M17.5 7.5v9M20.5 10v4M6.5 12h11"/>'),
  '🥗': svg('<path d="M12 7.5c-3-2-8-1.2-8 4.8 0 5 3.8 8.7 6 8.7 1 0 1.4-.5 2-.5s1 .5 2 .5c2.2 0 6-3.7 6-8.7 0-6-5-6.8-8-4.8z"/><path d="M12 7.5c0-2.2 1-4 3-4.5"/>'),
  '😴': svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M15 4h3l-3 3h3"/>'),
  '💊': svg('<path d="M10.5 3.8a5 5 0 0 1 7.1 7.1l-6.7 6.7a5 5 0 0 1-7.1-7.1z"/><path d="M7.2 7.2l6.9 6.9"/>'),
  '🌿': svg('<path d="M2.5 20.5l6.5-11 4.2 6.5 3-4.3 5.3 8.8z"/><path d="M7.4 12.2l1.6 1.4 1.5-1.2"/>'),
  '✍️': svg('<path d="M4 20l4-1L19.2 7.8 16.2 4.8 5 16z"/><path d="M14 7l3 3"/>'),
  '🎧': svg('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  '🧹': svg('<path d="M3.5 11L12 3.8l8.5 7.2V20.5h-17z"/><path d="M9.8 20.5v-5.5h4.4v5.5"/>'),
  '💸': svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5v11M14.8 9.3h-3.9a1.6 1.6 0 0 0 0 3.2h2.2a1.6 1.6 0 0 1 0 3.2H9.2"/>'),
  '☀️': svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>'),
  '💖': svg('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>')
};
const EMO = {heute:'🌤️',kalender:'📅',aufgaben:'✏️',gewohnheiten:'🌱',notizen:'💌'};
const HABIT_EMOJIS = ['🌱','💧','📖','🧘','🏃','🥗','😴','💊','🌿','✍️','🎧','🧹','💸','☀️','💖'];
const QUOTES = ['Kleine Schritte sind auch Schritte.','Du schaffst das – einen Tag nach dem anderen.','Heute ist ein guter Tag für einen guten Tag.','Sei lieb zu dir selbst.','Fortschritt, nicht Perfektion.','Atme durch. Du hast Zeit.','Mach heute etwas, worüber dein zukünftiges Ich sich freut.','Ruhe ist auch produktiv.','Glaub an dich, so wie deine beste Freundin an dich glaubt.','Jeder Haken zählt.'];
const MOTTOS = ['Jeder Tag ist ein neues Level.','Kleine Siege summieren sich.','Disziplin schlägt Motivation.','Heute trainieren, morgen stärker.','Fokus. Eine Quest nach der anderen.','Dein zukünftiges Ich zählt auf dich.','Fortschritt ist eine Entscheidung.','Auch Pausen laden Energie auf.','Wer dranbleibt, levelt auf.','Mach den ersten Schritt – der Rest folgt.'];
const BGS = [['traum','Traum ✨'],['wolken','Wolken ☁️'],['blumen','Blümchen 🌼'],['karo','Vichy-Karo 🎀'],['herzen','Herzen 💗'],['salbei','Salbei 🌿'],['punkte','Punktpapier 📓']];
const ACCS = [['gold','Gold','#f2b544'],['smaragd','Smaragd','#3fe0a0'],['rubin','Rubin','#ff4d6d']];
const TABS = ['heute','kalender','aufgaben','gewohnheiten','notizen'];

const TXT = {
  pastel: {
    tabs:{heute:'Heute',kalender:'Kalender',aufgaben:'Aufgaben',gewohnheiten:'Gewohnheiten',notizen:'Notizen'},
    h:{today:'🗓️ Heute',todos:'✏️ To-dos',habits:'🌱 Gewohnheiten',week:'💜 Nächste 7 Tage',tasks:'✏️ Meine To-dos',habitsPage:'🌱 Gewohnheiten',notes:'💌 Notizen',due:'✏️ Fällige To-dos'},
    add:{event:'+ Termin',task:'+ Aufgabe',habit:'+ Neu',habitBig:'+ Gewohnheit',note:'+ Notiz',details:'Mit Details …',quickBtn:'Hinzufügen'},
    empty:{today:'Keine Termine heute – Zeit für dich ☕',todos:'Nichts Dringendes – stark! 🎉',habits:'Leg z.&nbsp;B. „2 Liter Wasser“ oder „10 Min. lesen“ an.',week:'Die Woche ist noch frei 🌈',tasks:'Hier ist nichts – genieß es ✨',habitsPage:'Noch keine Gewohnheiten. Kleine tägliche Dinge – Sport, Lesen, Wasser trinken, früh schlafen – kannst du hier abhaken und deine Serie wachsen sehen.',notes:'Ideen, Einkaufslisten, Ziele – alles, was du festhalten willst.',day:'Keine Termine.',loading:'Einen Moment … 🌷'},
    filters:{offen:'Offen',heute:'Heute & überfällig',erledigt:'Erledigt',alle:'Alle'},
    quick:'Neue Aufgabe eintippen und Enter drücken', clearDone:'Erledigte löschen',
    form:{event:['📅 Neuer Termin','📅 Termin bearbeiten'],task:['✏️ Neues To-do','✏️ To-do bearbeiten'],habit:['🌱 Neue Gewohnheit','🌱 Gewohnheit bearbeiten'],note:['💌 Neue Notiz','💌 Notiz'],icon:'Sticker'},
    saved:{event:'Termin angelegt 🌸',task:'Aufgabe angelegt 🌸',habit:'Gewohnheit angelegt 🌸',note:'Notiz angelegt 🌸',edit:'Gespeichert ✨'},
    prio:[['hoch','Wichtig'],['normal','Normal'],['niedrig','Irgendwann']]
  },
  quest: {
    tabs:{heute:'Übersicht',kalender:'Kalender',aufgaben:'Quests',gewohnheiten:'Routinen',notizen:'Logbuch'},
    h:{today:'Heute im Plan',todos:'Aktive Quests',habits:'Routinen',week:'Nächste 7 Tage',tasks:'Quest-Log',habitsPage:'Routinen',notes:'Logbuch',due:'Fällige Quests'},
    hic:{today:'kalender',todos:'aufgaben',habits:'gewohnheiten',week:'compass',tasks:'aufgaben',habitsPage:'gewohnheiten',notes:'notizen',due:'aufgaben'},
    add:{event:'+ Termin',task:'+ Quest',habit:'+ Neu',habitBig:'+ Routine',note:'+ Eintrag',details:'Mit Details',quickBtn:'Annehmen'},
    empty:{today:'Keine Termine heute. Freie Zeit für dich.',todos:'Keine aktiven Quests – alles erledigt.',habits:'Lege eine Routine an, z.&nbsp;B. „Training“ oder „10 Min. lesen“. Jedes Abhaken bringt +10 XP.',week:'Die nächsten 7 Tage sind noch frei.',tasks:'Keine Quests in dieser Liste.',habitsPage:'Noch keine Routinen. Hake tägliche Gewohnheiten wie Training, Lesen oder früh schlafen ab, baue Serien auf und sammle XP.',notes:'Halte Ideen, Ziele und Listen in deinem Logbuch fest.',day:'Keine Termine.',loading:'Lade Daten …'},
    filters:{offen:'Aktiv',heute:'Heute & überfällig',erledigt:'Abgeschlossen',alle:'Alle'},
    quick:'Neue Quest eintippen und Enter drücken', clearDone:'Abgeschlossene löschen (XP bleiben)',
    form:{event:['Neuer Termin','Termin bearbeiten'],task:['Neue Quest','Quest bearbeiten'],habit:['Neue Routine','Routine bearbeiten'],note:['Neuer Eintrag','Logbuch-Eintrag'],icon:'Symbol'},
    saved:{event:'Termin eingetragen',task:'Quest angenommen',habit:'Routine angelegt',note:'Eintrag gespeichert',edit:'Gespeichert'},
    prio:[['hoch','Wichtig · +40 XP'],['normal','Normal · +20 XP'],['niedrig','Irgendwann · +20 XP']]
  }
};

/* ---------- state & storage ---------- */
let items = new Map();
let backend = 'none';          // 'none' (lädt) | 'auth' (Anmeldeseite) | 'local' | 'cloud'
let fb = { app: null, auth: null, db: null, user: null, unsub: null };
let ui = { tab: 'heute', calMonth: null, sel: today(), taskFilter: 'offen' };
let theme = 'quest', accent = 'gold', currentBg = 'traum';
try {
  const t = localStorage.getItem('lebensplaner.tab'); if (t && TABS.includes(t)) ui.tab = t;
  const th = localStorage.getItem('lebensplaner.theme'); if (th === 'quest' || th === 'pastel') theme = th;
  const ac = localStorage.getItem('lebensplaner.accent'); if (ACCS.some(a=>a[0]===ac)) accent = ac;
  const b = localStorage.getItem('lebensplaner.bg'); if (BGS.some(x=>x[0]===b)) currentBg = b;
} catch(e) {}
const LS = 'lebensplaner.v1';
const LS_LOCALMODE = 'lebensplaner.localMode';
const T = () => TXT[theme] || TXT.quest;
const Q = () => theme !== 'pastel';
const H = key => Q() ? `${QI[TXT.quest.hic[key]]}<span>${TXT.quest.h[key]}</span>` : TXT.pastel.h[key];
const habIcon = x => Q() ? `<span class="hi">${QHAB[x.emoji] || QHAB['🌱']}</span>` : esc(x.emoji || '🌱') + ' ';

let syncState = 'busy';
function setStatus(t, st){ const el=$('#status'); el.textContent = t; if (st) { syncState = st; el.dataset.state = st; } }
function toast(t){ const el=$('#toast'); el.textContent=t; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove('show'),2400); }

function readLocal(){ try { const a = JSON.parse(localStorage.getItem(LS)||'[]'); return Array.isArray(a) ? a.filter(i => i && i.id && i.kind) : []; } catch(e){ return []; } }
function loadLocal(){ readLocal().forEach(i=>items.set(i.id,i)); }
function saveLocal(){ try { localStorage.setItem(LS, JSON.stringify([...items.values()])); } catch(e){ toast('Speichern auf dem Gerät nicht möglich'); } }

const itemsCol = () => collection(fb.db, 'users', fb.user.uid, 'items');
function cleanBody(item){ const body = {...item}; delete body.id; Object.keys(body).forEach(k => body[k] === undefined && delete body[k]); return body; }
function persist(item, del){
  if (backend === 'cloud' && fb.user) {
    const ref = doc(fb.db, 'users', fb.user.uid, 'items', item.id);
    // Firestore speichert sofort lokal (auch offline) und gleicht im Hintergrund ab.
    (del ? deleteDoc(ref) : setDoc(ref, cleanBody(item)))
      .catch(e => toast(e && e.code === 'permission-denied' ? 'Keine Berechtigung – Firestore-Regeln prüfen' : 'Konnte nicht speichern'));
  } else if (backend === 'local') saveLocal();
}
async function bulkWrite(list, del){
  if (backend === 'cloud' && fb.user) {
    for (let i = 0; i < list.length; i += 400) {
      const batch = writeBatch(fb.db);
      list.slice(i, i+400).forEach(it => { const ref = doc(fb.db, 'users', fb.user.uid, 'items', it.id); del ? batch.delete(ref) : batch.set(ref, cleanBody(it)); });
      await batch.commit();
    }
  } else if (backend === 'local') saveLocal();
}
const all = kind => [...items.values()].filter(i => i.kind === kind);
const S = () => items.get('settings') || {};
function setSetting(patch){
  const old = items.get('settings') || {id:'settings', kind:'settings'};
  const nw = {...old, ...patch};
  if (JSON.stringify(old) === JSON.stringify(nw)) return;
  items.set('settings', nw); persist(nw);
}
/* ---------- XP & Level ---------- */
const XP_TASK = 20, XP_HIGH = 40, XP_HABIT = 10;
const taskXP = t => t.prio === 'hoch' ? XP_HIGH : XP_TASK;
const habitXP = h => Object.keys(h.done || {}).length * XP_HABIT;
function totalXP(){
  let x = +(S().xpBank || 0);
  all('task').forEach(t => { if (t.done) x += taskXP(t); });
  all('habit').forEach(h => { x += habitXP(h); });
  return x;
}
function levelInfo(xp){ let lvl = 1, need = 100, rest = xp; while (rest >= need) { rest -= need; lvl++; need = 100 + 50*(lvl-1); } return {lvl, rest, need}; }
const TITLES = [[1,'Neuling'],[3,'Abenteurer'],[6,'Pfadfinder'],[10,'Veteran'],[15,'Meister'],[20,'Champion'],[30,'Legende']];
const titleFor = l => TITLES.filter(([n]) => l >= n).pop()[1];
function bankXP(n){ if (n > 0) setSetting({xpBank: (+(S().xpBank || 0)) + n}); }
function reward(before, delta){
  if (!Q() || !delta) return;
  toast((delta > 0 ? '+' : '−') + Math.abs(delta) + ' XP');
  const after = levelInfo(totalXP()).lvl;
  if (after > before) showLevelUp(after);
}
function showLevelUp(l){
  const el = $('#lvlup');
  el.innerHTML = `<div class="lu-in"><div class="lu-rings"><i></i><i></i><i></i></div><div class="lu-k">Level aufgestiegen</div><div class="lu-n">${l}</div><div class="lu-t">${esc(titleFor(l))}</div><div class="lu-h">Tippen zum Fortfahren</div></div>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(showLevelUp._t); showLevelUp._t = setTimeout(() => el.classList.remove('show'), 4200);
}

/* ---------- Theme ---------- */
function embers(){
  let h = '<div class="beam"></div>', seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 30; i++) {
    const s = (1.5 + rnd()*2.5).toFixed(1);
    h += `<i class="ember" style="left:${(rnd()*100).toFixed(1)}%;width:${s}px;height:${s}px;--dx:${((rnd()-.5)*120).toFixed(0)}px;animation-duration:${(9+rnd()*12).toFixed(1)}s;animation-delay:-${(rnd()*20).toFixed(1)}s"></i>`;
  }
  return h;
}
let appliedKey = '';
function applyTheme(){
  const st = S();
  if (st.theme === 'quest' || st.theme === 'pastel') theme = st.theme;
  if (ACCS.some(a => a[0] === st.accent)) accent = st.accent;
  if (BGS.some(x => x[0] === st.bg)) currentBg = st.bg;
  const key = theme + '|' + accent + '|' + currentBg;
  if (key === appliedKey) return;
  appliedKey = key;
  const q = Q();
  document.body.className = `th-${theme} acc-${accent}`;
  document.documentElement.style.background = q ? '#0a0806' : '#fbf6f1';
  const el = $('#bg'), bgc = q ? 'bg-quest' : 'bg-' + currentBg;
  if (el.className !== bgc) { el.className = bgc; el.innerHTML = q ? embers() : ''; }
  $('#brand').innerHTML = q ? `<span class="qlogo">${QI.logo}</span><b class="bt">Lebens<i>planer</i></b>` : '🌷 Mein <span>Lebensplaner</span>';
  $('#btnAcc').innerHTML = q ? QI.user : '👤';
  const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.setAttribute('content', q ? '#0a0806' : '#fbf6f1');
  if (IS_NATIVE) { try { const SB = CapCore.SystemBars; if (SB && SB.setStyle) Promise.resolve(SB.setStyle({ style: q ? 'DARK' : 'LIGHT' })).catch(()=>{}); } catch(e) {} }
  $('#btnDesign').innerHTML = q ? QI.design : '🎨';
  try { localStorage.setItem('lebensplaner.theme', theme); localStorage.setItem('lebensplaner.accent', accent); localStorage.setItem('lebensplaner.bg', currentBg); } catch(e) {}
}
function designPicker(){
  const q = Q();
  return `<h2>${q ? QI.design + '<span>Design</span>' : '🎨 Design'}</h2>
  <label>Stil</label>
  <div class="bgpick">
    <button type="button" data-lp-theme="quest" class="${q?'on':''}"><span class="pv pv-quest"></span><span class="lb">Quest-Modus ⚔️</span></button>
    <button type="button" data-lp-theme="pastel" class="${!q?'on':''}"><span class="pv bg-traum"></span><span class="lb">Pastell 🌸</span></button>
  </div>
  ${q ? `<label>Leuchtfarbe</label><div class="bgpick">${ACCS.map(([k,l,c]) => `<button type="button" data-lp-acc="${k}" class="${accent===k?'on':''}"><span class="pv" style="background:radial-gradient(ellipse at 50% 120%,${c},#0b0907 72%)"></span><span class="lb">${l}</span></button>`).join('')}</div>`
      : `<label>Hintergrund</label><div class="bgpick">${BGS.map(([k,l]) => `<button type="button" data-lp-bg="${k}" class="${currentBg===k?'on':''}"><span class="pv bg-${k} ${k==='wolken'?'mini':''}"></span><span class="lb">${l}</span></button>`).join('')}</div>`}
  <div class="actions"><span></span><button type="button" class="btn primary" data-close>Fertig</button></div>`;
}

/* ---------- Konto & Anmeldung ---------- */
let authMode = 'login';      // 'login' | 'register' | 'reset'
let authBusy = false;
const AUTH_ERR = {
  'auth/invalid-email': 'Diese E-Mail-Adresse ist ungültig.',
  'auth/missing-password': 'Bitte gib ein Passwort ein.',
  'auth/invalid-credential': 'E-Mail oder Passwort ist falsch.',
  'auth/wrong-password': 'E-Mail oder Passwort ist falsch.',
  'auth/user-not-found': 'Zu dieser E-Mail gibt es kein Konto.',
  'auth/email-already-in-use': 'Für diese E-Mail gibt es schon ein Konto – melde dich an.',
  'auth/weak-password': 'Das Passwort muss mindestens 6 Zeichen haben.',
  'auth/too-many-requests': 'Zu viele Versuche. Bitte warte kurz.',
  'auth/network-request-failed': 'Keine Internetverbindung.',
  'auth/requires-recent-login': 'Bitte melde dich neu an und versuche es dann noch einmal.',
  'auth/operation-not-allowed': 'E-Mail/Passwort-Anmeldung ist in Firebase noch nicht aktiviert.'
};
const authMsg = e => AUTH_ERR[e && e.code] || ('Fehler: ' + ((e && (e.code || e.message)) || 'unbekannt'));

function viewAuth(){
  const q = Q();
  const title = authMode === 'register' ? 'Konto erstellen' : authMode === 'reset' ? 'Passwort zurücksetzen' : 'Anmelden';
  return `<div class="auth-wrap"><div class="card auth">
    <div class="auth-logo">${q ? QI.logo : '🌷'}</div>
    <h1>${q ? 'Willkommen' : 'Willkommen!'}</h1>
    <p class="auth-sub">Mit einem Konto sind deine Termine auf Handy und PC immer gleich.</p>
    ${authMode !== 'reset' ? `<div class="tabs-sub auth-tabs"><button data-auth-mode="login" class="${authMode==='login'?'on':''}">Anmelden</button><button data-auth-mode="register" class="${authMode==='register'?'on':''}">Konto erstellen</button></div>` : `<h2 class="auth-h">${title}</h2>`}
    <form id="authForm" autocomplete="on">
      <label>E-Mail</label><input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="du@beispiel.de">
      ${authMode !== 'reset' ? `<label>Passwort</label><input type="password" name="pw" required minlength="6" autocomplete="${authMode==='register'?'new-password':'current-password'}" placeholder="mindestens 6 Zeichen">` : ''}
      ${authMode === 'register' ? `<label>Passwort wiederholen</label><input type="password" name="pw2" required minlength="6" autocomplete="new-password">` : ''}
      <div class="auth-err" id="authErr"></div>
      <button class="btn primary auth-go" ${authBusy?'disabled':''}>${authBusy ? 'Einen Moment …' : authMode === 'register' ? 'Konto erstellen' : authMode === 'reset' ? 'Link zum Zurücksetzen senden' : 'Anmelden'}</button>
    </form>
    <div class="auth-links">
      ${authMode === 'reset' ? '<a href="#" data-auth-mode="login">Zurück zur Anmeldung</a>' : '<a href="#" data-auth-mode="reset">Passwort vergessen?</a>'}
    </div>
    <div class="auth-alt"><button type="button" class="btn" data-auth-local>Ohne Konto nutzen (nur dieses Gerät)</button></div>
  </div></div>`;
}

async function submitAuth(form){
  const fd = new FormData(form);
  const email = (fd.get('email')||'').toString().trim();
  const pw = (fd.get('pw')||'').toString();
  const err = m => { const el = $('#authErr'); if (el) el.textContent = m; };
  if (authMode === 'register' && pw !== (fd.get('pw2')||'').toString()) return err('Die Passwörter stimmen nicht überein.');
  authBusy = true; form.querySelector('.auth-go').disabled = true;
  try {
    if (authMode === 'reset') {
      await sendPasswordResetEmail(fb.auth, email);
      authMode = 'login'; authBusy = false; render();
      toast('E-Mail zum Zurücksetzen wurde gesendet');
      return;
    }
    if (authMode === 'register') await createUserWithEmailAndPassword(fb.auth, email, pw);
    else await signInWithEmailAndPassword(fb.auth, email, pw);
    // onAuthStateChanged übernimmt den Rest
  } catch(e) { err(authMsg(e)); }
  authBusy = false; const b = form.querySelector('.auth-go'); if (b) b.disabled = false;
}

/* ---- Konto-Menü ---- */
function accountMenu(){
  const q = Q();
  const localCount = readLocal().filter(i => i.kind !== 'settings').length;
  const syncText = {
    ok: 'Alles ist gespeichert und wird mit deinen anderen Geräten abgeglichen.',
    busy: 'Verbinde mit deinem Konto …',
    offline: 'Gerade offline – deine Änderungen werden gespeichert und automatisch abgeglichen, sobald du wieder online bist.',
    local: FB_READY ? 'Deine Einträge liegen nur auf diesem Gerät. Melde dich an, damit sie auch auf deinen anderen Geräten erscheinen.' : 'Deine Einträge liegen nur auf diesem Gerät. (Die Synchronisierung ist in dieser Version noch nicht eingerichtet.)',
    warn: 'Die Verbindung ist unterbrochen. Prüfe deine Internetverbindung.'
  }[syncState] || '';
  const devices = IS_NATIVE
    ? (WEB_URL ? `<p>Am PC öffnest du <b>${esc(WEB_URL)}</b> und meldest dich mit demselben Konto an.</p><div class="linkrow"><code>${esc(WEB_URL)}</code><button type="button" class="btn" data-copy="${esc(WEB_URL)}">Kopieren</button></div>` : '')
    : (APK_URL ? `<p>Die Android-App bekommst du hier – danach mit demselben Konto anmelden:</p><div class="linkrow"><code>${esc(APK_URL)}</code><button type="button" class="btn" data-copy="${esc(APK_URL)}">Kopieren</button></div><p class="hint"><a href="${esc(APK_URL)}">App herunterladen</a></p>` : '');
  return `<h2>${q ? QI.user + '<span>Konto</span>' : '👤 Konto'}</h2>
    <div class="syncbox"><b>${backend === 'cloud' && fb.user ? 'Angemeldet als ' + esc(fb.user.email || '') : 'Ohne Konto'}</b>${syncText}</div>
    ${backend === 'cloud' && localCount ? `<div class="syncbox" style="margin-top:8px"><b>${localCount} Einträge ohne Konto auf diesem Gerät</b>Möchtest du sie in dein Konto übernehmen?<div style="margin-top:8px"><button type="button" class="btn primary" data-migrate>Übernehmen</button></div></div>` : ''}
    <div class="row" style="margin-top:12px;flex-wrap:wrap">
      ${backend === 'cloud' ? '<button type="button" class="btn" data-logout>Abmelden</button>' : (FB_READY ? '<button type="button" class="btn primary" data-login>Anmelden / Konto erstellen</button>' : '')}
    </div>
    ${devices ? `<label style="margin-top:16px">Andere Geräte</label>${devices}` : ''}
    <label style="margin-top:16px">Daten</label>
    <div class="row" style="flex-wrap:wrap">
      <button type="button" class="btn" data-import-open>Importieren</button>
      <button type="button" class="btn" data-export>Exportieren</button>
    </div>
    <div id="dataArea"></div>
    ${backend === 'cloud' ? `<label style="margin-top:16px">Konto</label><button type="button" class="btn danger" data-delacc-open>Konto und alle Daten löschen</button><div id="delArea"></div>` : ''}
    <p class="hint" style="margin-top:14px"><a href="datenschutz.html" target="_blank" rel="noopener">Datenschutz</a> · Version ${APP_VERSION}</p>
    <div class="actions"><span></span><button type="button" class="btn primary" data-close>Fertig</button></div>`;
}
const APP_VERSION = '1.0';

function exportJSON(){
  return JSON.stringify({ app: 'lebensplaner', version: 1, exported: new Date().toISOString(), items: [...items.values()] }, null, 2);
}
function showExport(){
  const area = $('#dataArea'); if (!area) return;
  const json = exportJSON();
  area.innerHTML = `<p class="hint">Hier sind alle deine Daten. Kopiere den Text und speichere ihn z. B. in einer Notiz oder Datei.</p>
    <textarea readonly style="min-height:120px;font-size:12px">${esc(json)}</textarea>
    <div class="row" style="margin-top:8px"><button type="button" class="btn" data-copy-export>Kopieren</button>${IS_NATIVE ? '' : '<button type="button" class="btn" data-export-dl>Als Datei speichern</button>'}</div>`;
}
function showImport(){
  const area = $('#dataArea'); if (!area) return;
  area.innerHTML = `<p class="hint">Wähle eine exportierte Datei (.json) oder füge den Text ein. Vorhandene Einträge bleiben erhalten.</p>
    <form id="importForm"><input type="file" accept=".json,application/json,text/plain" id="importFile" style="margin:6px 0">
    <textarea name="json" placeholder="… oder Text hier einfügen" style="min-height:90px;font-size:12px"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary">Importieren</button></div></form>`;
}
function parseImport(text){
  let data = JSON.parse(text);
  if (data && !Array.isArray(data) && Array.isArray(data.items)) data = data.items;
  if (!Array.isArray(data)) throw new Error('format');
  const ok = ['event','task','habit','note','settings'];
  return data.map(x => (x && x.data && x.id && !x.kind) ? {...x.data, id: x.id} : x)
             .filter(x => x && typeof x === 'object' && typeof x.id === 'string' && ok.includes(x.kind));
}
function importItems(list){
  const out = [];
  list.forEach(it => {
    if (it.kind === 'settings') { const merged = {...(items.get('settings')||{}), ...it, id:'settings', kind:'settings'}; items.set('settings', merged); out.push(merged); }
    else { items.set(it.id, it); out.push(it); }
  });
  render();
  bulkWrite(out).catch(() => toast('Konnte nicht alles speichern'));
  return out.filter(i => i.kind !== 'settings').length;
}
async function migrateLocal(){
  const list = readLocal().filter(i => i.kind !== 'settings');
  if (!list.length) return;
  const n = importItems(list);
  try { localStorage.removeItem(LS); } catch(e) {}
  toast(n + ' Einträge übernommen');
}
function showDeleteAccount(){
  const area = $('#delArea'); if (!area) return;
  area.innerHTML = `<form id="delAccForm"><p class="hint">Dein Konto und <b>alle</b> Termine, Aufgaben, Routinen und Notizen werden endgültig gelöscht. Zur Bestätigung gib dein Passwort ein.</p>
    <input type="password" name="pw" required autocomplete="current-password" placeholder="Passwort">
    <div class="auth-err" id="delErr"></div>
    <div class="row" style="margin-top:8px"><button class="btn danger" style="border-color:currentColor">Endgültig löschen</button></div></form>`;
}
async function deleteAccount(form){
  const pw = (new FormData(form).get('pw')||'').toString();
  const err = m => { const el = $('#delErr'); if (el) el.textContent = m; };
  try {
    const u = fb.user;
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw));
    const snap = await getDocs(itemsCol());
    const refs = snap.docs.map(d => d.ref);
    for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(fb.db); refs.slice(i, i+400).forEach(r => b.delete(r)); await b.commit(); }
    if (fb.unsub) { fb.unsub(); fb.unsub = null; }
    await deleteUser(u);
    closeModal(); toast('Dein Konto wurde gelöscht');
  } catch(e) { err(authMsg(e)); }
}
async function copyText(text, btn){
  try { await navigator.clipboard.writeText(text); if (btn) { const t = btn.textContent; btn.textContent = 'Kopiert ✓'; setTimeout(()=>btn.textContent = t, 1600); } }
  catch(e) { toast('Bitte Text markieren und kopieren'); }
}
/* ---------- domain ---------- */
function put(item){ items.set(item.id, item); render(); persist(item); }
function removeItem(id, noBank){
  const it = items.get(id); if (!it) return;
  if (!noBank) { if (it.kind === 'task' && it.done) bankXP(taskXP(it)); if (it.kind === 'habit') bankXP(habitXP(it)); }
  items.delete(id); render(); persist(it, true);
}
function occursOn(ev, d){
  if (!ev.date) return false;
  if (ev.date === d) return true;
  if (d < ev.date || !ev.repeat || ev.repeat === 'none') return false;
  const a = parse(ev.date), b = parse(d);
  if (ev.repeat === 'daily') return true;
  if (ev.repeat === 'weekly') return Math.round((b-a)/864e5) % 7 === 0;
  if (ev.repeat === 'monthly') return a.getDate() === b.getDate();
  if (ev.repeat === 'yearly') return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  return false;
}
const eventsOn = d => all('event').filter(e => occursOn(e,d)).sort((x,y)=>(x.start||'').localeCompare(y.start||'') || x.title.localeCompare(y.title));
const prioRank = {hoch:0,normal:1,niedrig:2};
function sortTasks(a,b){
  if (a.done !== b.done) return a.done ? 1 : -1;
  const da = a.due || '9999', dbb = b.due || '9999';
  return da.localeCompare(dbb) || (prioRank[a.prio]??1)-(prioRank[b.prio]??1) || (a.created||0)-(b.created||0);
}
function streak(h){
  const done = h.done || {};
  let d = new Date(); if (!done[ymd(d)]) d = addDays(d,-1);
  let n = 0; while (done[ymd(d)]) { n++; d = addDays(d,-1); }
  return n;
}
function toggleHabit(h, d){
  const before = levelInfo(totalXP()).lvl;
  const done = {...(h.done||{})}; const adding = !done[d];
  if (adding) done[d] = true; else delete done[d];
  put({...h, done});
  reward(before, adding ? XP_HABIT : -XP_HABIT);
}
function toggleTask(t){
  const before = levelInfo(totalXP()).lvl;
  put({...t, done: !t.done, doneAt: !t.done ? Date.now() : null});
  reward(before, !t.done ? taskXP(t) : -taskXP(t));
}

/* ---------- render ---------- */
function renderNav(){
  $('#nav').innerHTML = TABS.map(k => `<button data-tab="${k}" class="${ui.tab===k?'on':''}"><span class="em">${Q() ? QI[k] : EMO[k]}</span><span>${T().tabs[k]}</span></button>`).join('');
}
function render(){
  applyTheme();
  const authView = backend === 'auth';
  document.body.classList.toggle('is-auth', authView);
  if (authView) { $('#nav').innerHTML = ''; $('#main').innerHTML = viewAuth(); return; }
  renderNav();
  const m = $('#main');
  if (backend === 'none') { m.innerHTML = `<div class="card empty">${T().empty.loading}</div>`; return; }
  m.innerHTML = ({heute:viewToday,kalender:viewCalendar,aufgaben:viewTasks,gewohnheiten:viewHabits,notizen:viewNotes})[ui.tab]();
}

function eventRow(e){
  const time = e.start ? esc(e.start) + (e.end ? '<br>'+esc(e.end) : '') : 'ganz-<br>tägig';
  const rep = e.repeat && e.repeat!=='none' ? ' · ↻ ' + ({daily:'täglich',weekly:'wöchentlich',monthly:'monatlich',yearly:'jährlich'})[e.repeat] : '';
  return `<div class="item" data-edit="${e.id}"><div class="time">${time}</div><span class="dot" style="background:${catColor(e.cat)}"></span>
    <div class="grow"><div class="t">${esc(e.title)}</div><div class="s">${esc(CATS[e.cat]||'Sonstiges')}${rep}${e.place?' · '+esc(e.place):''}</div></div></div>`;
}
function taskRow(t){
  const td = today();
  let due = '';
  if (t.due) {
    const late = !t.done && t.due < td;
    const label = t.due === td ? 'Heute' : t.due === ymd(addDays(new Date(),1)) ? 'Morgen' : fmtShort(t.due);
    due = `<span class="pill ${late?'late':''}">${late?'überfällig · ':''}${label}</span>`;
  }
  let pr = '';
  if (Q()) { if (!t.done) pr = `<span class="pill ${t.prio==='hoch'?'hoch':''}">${t.prio==='hoch'?'★ ':''}+${taskXP(t)} XP</span>`; }
  else if (t.prio === 'hoch') pr = '<span class="pill hoch">wichtig</span>';
  return `<div class="item ${t.done?'done':''}" data-edit="${t.id}">
    <button class="chk ${t.done?'on':''}" data-toggle-task="${t.id}" aria-label="erledigt">${t.done?ICON.check:''}</button>
    <div class="grow"><div class="t">${esc(t.title)}</div>${t.note?`<div class="s">${esc(t.note)}</div>`:''}</div>${pr}${due}</div>`;
}
const dayIdx = td => Math.floor((parse(td) - new Date(2026,0,1)) / 864e5);

function pastelHero(td, evs, openAll, habits, habitsDone){
  const h = new Date().getHours();
  const greet = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : 'Guten Abend';
  return `<div class="hero">
    <div class="stickers"><span>🌸</span><span>✨</span><span>🍓</span></div>
    <h1>${greet}!</h1><p>${fmtLong(td)}</p>
    <div class="quote">„${QUOTES[((dayIdx(td) % QUOTES.length) + QUOTES.length) % QUOTES.length]}“</div>
    <div class="stat"><div><b>${evs.length}</b>Termine heute</div><div><b>${openAll}</b>offene Aufgaben</div><div><b>${habitsDone}/${habits.length}</b>Gewohnheiten</div></div>
    ${habits.length?`<div class="progress" title="Gewohnheiten heute"><i style="width:${Math.round(habitsDone/habits.length*100)}%"></i></div>`:''}
  </div>`;
}
function questHero(td, evs, openAll, habits, habitsDone){
  const L = levelInfo(totalXP()), pct = Math.round(L.rest / L.need * 100);
  const best = habits.reduce((m,h) => Math.max(m, streak(h)), 0);
  const h = new Date().getHours();
  const greet = h < 5 ? 'Noch wach?' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Willkommen zurück' : 'Guten Abend';
  return `<div class="card qhero">
    <div class="lvl"><svg class="hex" viewBox="0 0 100 112"><polygon points="50,3 96,29 96,83 50,109 4,83 4,29"/><polygon class="in" points="50,13 87,34 87,78 50,99 13,78 13,34"/></svg><div class="lvl-in"><span>Level</span><b>${L.lvl}</b></div></div>
    <div class="qh-main">
      <div class="qh-k">${greet} · ${fmtLong(td)}</div>
      <h1>${esc(titleFor(L.lvl))}</h1>
      <div class="xpbar"><i style="width:${pct}%"></i></div>
      <div class="xptext"><span>${L.rest} / ${L.need} XP</span><span>noch ${L.need - L.rest} XP bis Level ${L.lvl + 1}</span></div>
    </div>
    <div class="qstats">
      <div><b>${evs.length}</b><span>Termine heute</span></div>
      <div><b>${openAll}</b><span>Aktive Quests</span></div>
      <div><b>${habitsDone}/${habits.length}</b><span>Routinen heute</span></div>
      <div><b>${best}</b><span>Beste Serie</span></div>
    </div>
    <div class="qmotto">${QI.spark}„${MOTTOS[((dayIdx(td) % MOTTOS.length) + MOTTOS.length) % MOTTOS.length]}“</div>
  </div>`;
}

function viewToday(){
  const td = today(), q = Q();
  const evs = eventsOn(td);
  const tasks = all('task').filter(t => !t.done && (!t.due || t.due <= td)).sort(sortTasks);
  const habits = all('habit').sort((a,b)=>(a.created||0)-(b.created||0));
  const habitsDone = habits.filter(x => x.done && x.done[td]).length;
  const upcoming = [];
  for (let i=1;i<=7;i++){ const d = ymd(addDays(new Date(),i)); eventsOn(d).forEach(e=>upcoming.push([d,e])); }
  const openAll = all('task').filter(t=>!t.done).length;
  const tx = T();
  return `${q ? questHero(td, evs, openAll, habits, habitsDone) : pastelHero(td, evs, openAll, habits, habitsDone)}
  <div class="grid g2">
    <div class="card tape t-pink"><div class="sec-h"><h2>${H('today')}</h2><button class="btn" data-new="event" data-date="${td}">${tx.add.event}</button></div>
      <div class="list">${evs.length ? evs.map(eventRow).join('') : `<div class="empty">${tx.empty.today}</div>`}</div></div>
    <div class="card tape t-sky"><div class="sec-h"><h2>${H('todos')}</h2><button class="btn" data-new="task" data-date="${td}">${tx.add.task}</button></div>
      <div class="list">${tasks.length ? tasks.slice(0,8).map(taskRow).join('') : `<div class="empty">${tx.empty.todos}</div>`}</div>
      ${tasks.length>8?`<div class="s" style="margin-top:6px"><a href="#" data-tab="aufgaben">+${tasks.length-8} weitere</a></div>`:''}</div>
    <div class="card tape t-sage"><div class="sec-h"><h2>${H('habits')}</h2><button class="btn" data-new="habit">${tx.add.habit}</button></div>
      <div class="list">${habits.length ? habits.map(x => { const on = x.done && x.done[td]; return `<div class="item ${on?'done':''}" data-edit="${x.id}">
        <button class="chk ${on?'on':''}" data-toggle-habit="${x.id}" data-date="${td}">${on?ICON.check:''}</button>
        <div class="grow"><div class="t">${habIcon(x)}${esc(x.name)}</div></div><span class="pill fire">${q ? QI.gewohnheiten : '🔥'} ${streak(x)}</span></div>`; }).join('') : `<div class="empty">${tx.empty.habits}</div>`}</div></div>
    <div class="card tape t-lav"><div class="sec-h"><h2>${H('week')}</h2></div>
      <div class="list">${upcoming.length ? upcoming.slice(0,8).map(([d,e]) => `<div class="item" data-edit="${e.id}"><div class="time" style="min-width:74px">${fmtShort(d)}</div><span class="dot" style="background:${catColor(e.cat)}"></span><div class="grow"><div class="t">${esc(e.title)}</div><div class="s">${e.start?esc(e.start)+' Uhr':'ganztägig'}</div></div></div>`).join('') : `<div class="empty">${tx.empty.week}</div>`}</div></div>
  </div>`;
}

function viewCalendar(){
  if (!ui.calMonth) { const s = parse(ui.sel); ui.calMonth = [s.getFullYear(), s.getMonth()]; }
  const [y,m] = ui.calMonth;
  const first = new Date(y,m,1);
  const start = addDays(first, -((first.getDay()+6)%7));
  const td = today(), tx = T();
  let cells = WD.map(w=>`<div class="wd">${w}</div>`).join('');
  for (let i=0;i<42;i++){
    const d = addDays(start,i), ds = ymd(d);
    if (i>=35 && d.getMonth()!==m) break;
    const evs = eventsOn(ds);
    const dueTasks = all('task').filter(t=>t.due===ds && !t.done).length;
    cells += `<div class="day ${d.getMonth()!==m?'out':''} ${ds===td?'today':''} ${ds===ui.sel?'sel':''}" data-sel="${ds}">
      <div class="n">${d.getDate()}</div>
      ${evs.slice(0,2).map(e=>`<div class="ev" style="background:${catColor(e.cat)};--cc:${catColor(e.cat)}">${e.start?esc(e.start)+' ':''}${esc(e.title)}</div>`).join('')}
      ${evs.length>2?`<div class="more">+${evs.length-2}</div>`:''}
      ${dueTasks?`<div class="more">☐ ${dueTasks}</div>`:''}
      <div class="dots">${evs.slice(0,4).map(e=>`<i style="background:${catColor(e.cat)}"></i>`).join('')}</div>
    </div>`;
  }
  const evs = eventsOn(ui.sel);
  const tasks = all('task').filter(t=>t.due===ui.sel).sort(sortTasks);
  return `<div class="cal-layout">
    <div class="card tape t-pink">
      <div class="cal-h"><h2>${MONTHS[m]} ${y}</h2>
        <div class="row"><button class="btn icon" data-cal="-1" aria-label="voriger Monat">‹</button><button class="btn" data-cal="0">Heute</button><button class="btn icon" data-cal="1" aria-label="nächster Monat">›</button></div></div>
      <div class="cal">${cells}</div>
    </div>
    <div class="card tape t-butter">
      <div class="sec-h"><h2 ${Q()?'':'style="font-size:28px"'}>${Q() ? QI.kalender + '<span>' + fmtLong(ui.sel) + '</span>' : fmtLong(ui.sel)}</h2></div>
      <div class="row" style="margin:8px 0"><button class="btn primary" data-new="event" data-date="${ui.sel}">${tx.add.event}</button><button class="btn" data-new="task" data-date="${ui.sel}">${tx.add.task}</button></div>
      <div class="list">${evs.length ? evs.map(eventRow).join('') : `<div class="empty">${tx.empty.day}</div>`}</div>
      ${tasks.length?`<h3 style="font-size:${Q()?'16px':'24px'};margin:16px 0 2px">${H('due')}</h3><div class="list">${tasks.map(taskRow).join('')}</div>`:''}
    </div>
  </div>`;
}

function viewTasks(){
  const f = ui.taskFilter, td = today(), tx = T();
  let ts = all('task');
  const counts = {offen: ts.filter(t=>!t.done).length, heute: ts.filter(t=>!t.done && t.due && t.due<=td).length, erledigt: ts.filter(t=>t.done).length, alle: ts.length};
  if (f==='offen') ts = ts.filter(t=>!t.done);
  if (f==='heute') ts = ts.filter(t=>!t.done && t.due && t.due<=td);
  if (f==='erledigt') ts = ts.filter(t=>t.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  if (f!=='erledigt') ts.sort(sortTasks);
  return `<div class="card tape t-sky" style="margin-top:12px">
    <div class="sec-h"><h2>${H('tasks')}</h2><button class="btn" data-new="task">${tx.add.details}</button></div>
    <form class="quick" id="quickTask" style="margin-top:10px"><input type="text" id="quickTitle" placeholder="${tx.quick}" autocomplete="off"><button class="btn primary">${tx.add.quickBtn}</button></form>
    <div class="tabs-sub" style="margin-top:12px">${Object.keys(tx.filters).map(k=>`<button data-tf="${k}" class="${f===k?'on':''}">${tx.filters[k]} · ${counts[k]}</button>`).join('')}</div>
    <div class="list">${ts.length ? ts.map(taskRow).join('') : `<div class="empty">${tx.empty.tasks}</div>`}</div>
    ${f==='erledigt' && ts.length ? `<div style="margin-top:12px"><button class="btn danger" id="clearDone">${tx.clearDone}</button></div>` : ''}
  </div>`;
}

function viewHabits(){
  const hs = all('habit').sort((a,b)=>(a.created||0)-(b.created||0)), tx = T();
  const days = []; for (let i=6;i>=0;i--) days.push(ymd(addDays(new Date(),-i)));
  const head = `<div class="habit" style="border:0;padding-bottom:0"><div></div>${days.map(d=>`<div class="hd ${d===today()?'td':''}">${WD[(parse(d).getDay()+6)%7]}<br>${parse(d).getDate()}</div>`).join('')}<div></div></div>`;
  return `<div class="card tape t-sage" style="margin-top:12px">
    <div class="sec-h"><h2>${H('habitsPage')}</h2><button class="btn primary" data-new="habit">${tx.add.habitBig}</button></div>
    ${hs.length ? head + hs.map(h => `<div class="habit"><div class="hn" data-edit="${h.id}">${habIcon(h)}${esc(h.name)}</div>
      ${days.map(d => { const on = h.done && h.done[d]; return `<button class="chk ${on?'on':''}" data-toggle-habit="${h.id}" data-date="${d}" aria-label="${d}">${on?ICON.check:''}</button>`; }).join('')}
      <div class="streak">${Q() ? QI.gewohnheiten : '🔥'} <b>${streak(h)}</b> Tage</div></div>`).join('')
      : `<div class="empty">${tx.empty.habitsPage}</div>`}
  </div>`;
}

function viewNotes(){
  const ns = all('note').sort((a,b)=>(b.updated||0)-(a.updated||0)), tx = T();
  return `<div class="${Q()?'card ':''}sec-h" style="margin-top:6px;${Q()?'padding:14px 18px;':''}"><h2 ${Q()?'':'style="font-size:38px"'}>${H('notes')}</h2><button class="btn primary" data-new="note">${tx.add.note}</button></div>
    ${ns.length ? `<div class="notes">${ns.map(n=>`<div class="card note" data-edit="${n.id}"><h3>${esc(n.title||'Ohne Titel')}</h3><p>${esc(n.body)}</p></div>`).join('')}</div>`
    : `<div class="card tape t-butter empty" style="margin-top:14px">${tx.empty.notes}</div>`}`;
}

/* ---------- modal forms ---------- */
let editing = null;
function openModal(html){ $('#modal').innerHTML = html; $('#scrim').classList.add('open'); setTimeout(()=>{ const f = $('#modal input[type=text], #modal textarea'); f && f.focus(); }, 30); }
function closeModal(){ $('#scrim').classList.remove('open'); editing = null; }
const formIcon = {event:'kalender', task:'aufgaben', habit:'gewohnheiten', note:'notizen'};
const formTitle = (kind, edit) => { const t = T().form[kind][edit?1:0]; return Q() ? QI[formIcon[kind]] + `<span>${t}</span>` : t; };

function formFor(kind, it, date){
  editing = {kind, id: it ? it.id : null, cat: it?.cat || 'privat', emoji: it?.emoji || '🌱', confirmDel:false};
  const tx = T();
  const del = it ? '<button type="button" class="btn danger" id="delBtn">Löschen</button>' : '<span></span>';
  const act = `<div class="actions">${del}<div class="row"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></div>`;
  if (kind==='event') return `<form id="f"><h2>${formTitle(kind, it)}</h2>
    <label>Titel</label><input type="text" name="title" required value="${esc(it?.title)}" placeholder="z. B. Zahnarzt">
    <label>Datum</label><input type="date" name="date" required value="${esc(it?.date || date || today())}">
    <div class="f2"><div><label>Von</label><input type="time" name="start" value="${esc(it?.start)}"></div><div><label>Bis</label><input type="time" name="end" value="${esc(it?.end)}"></div></div>
    <label>Kategorie</label><div class="cats">${Object.entries(CATS).map(([k,l])=>`<button type="button" data-cat="${k}" class="${editing.cat===k?'on':''}"><span class="dot" style="background:${catColor(k)}"></span>${l}</button>`).join('')}</div>
    <div class="f2"><div><label>Wiederholen</label><select name="repeat">${[['none','Nie'],['daily','Täglich'],['weekly','Wöchentlich'],['monthly','Monatlich'],['yearly','Jährlich (z. B. Geburtstag)']].map(([v,l])=>`<option value="${v}" ${(it?.repeat||'none')===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div><label>Ort</label><input type="text" name="place" value="${esc(it?.place)}"></div></div>
    <label>Notiz</label><textarea name="note" style="min-height:60px">${esc(it?.note)}</textarea>${act}</form>`;
  if (kind==='task') return `<form id="f"><h2>${formTitle(kind, it)}</h2>
    <label>Was ist zu tun?</label><input type="text" name="title" required value="${esc(it?.title)}">
    <div class="f2"><div><label>Fällig am</label><input type="date" name="due" value="${esc(it ? it.due : (date||''))}"></div>
    <div><label>Priorität</label><select name="prio">${tx.prio.map(([v,l])=>`<option value="${v}" ${(it?.prio||'normal')===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
    <label>Details</label><textarea name="note" style="min-height:60px">${esc(it?.note)}</textarea>${act}</form>`;
  if (kind==='habit') return `<form id="f"><h2>${formTitle(kind, it)}</h2>
    <label>Name</label><input type="text" name="name" required value="${esc(it?.name)}" placeholder="z. B. 30 Min. Training">
    <label>${tx.form.icon}</label><div class="emojis">${HABIT_EMOJIS.map(e=>`<button type="button" data-emoji="${e}" class="${editing.emoji===e?'on':''}">${Q() ? QHAB[e] : e}</button>`).join('')}</div>${act}</form>`;
  if (kind==='note') return `<form id="f"><h2>${formTitle(kind, it)}</h2>
    <label>Titel</label><input type="text" name="title" value="${esc(it?.title)}">
    <label>Text</label><textarea name="body" style="min-height:220px">${esc(it?.body)}</textarea>${act}</form>`;
}

function submitForm(fd){
  const {kind, id} = editing;
  const old = id ? items.get(id) : null;
  const base = old ? {...old} : {id: newId(kind[0]), kind, created: Date.now()};
  const g = k => (fd.get(k)||'').toString().trim();
  if (kind==='event') Object.assign(base, {title:g('title'), date:g('date'), start:g('start'), end:g('end'), cat:editing.cat, repeat:g('repeat'), place:g('place'), note:g('note')});
  if (kind==='task') Object.assign(base, {title:g('title'), due:g('due'), prio:g('prio'), note:g('note'), done: old?.done||false});
  if (kind==='habit') Object.assign(base, {name:g('name'), emoji:editing.emoji, done: old?.done||{}});
  if (kind==='note') { Object.assign(base, {title:g('title'), body:fd.get('body')||'', updated:Date.now()}); if(!base.title && !base.body.trim()) { closeModal(); return; } }
  closeModal(); put(base);
  toast(old ? T().saved.edit : T().saved[kind]);
}

/* ---------- events ---------- */
function refreshDesign(){ appliedKey = ''; render(); $('#modal').innerHTML = designPicker(); }
const CLICK_SEL = '[data-tab],[data-new],[data-edit],[data-toggle-task],[data-toggle-habit],[data-sel],[data-cal],[data-tf],[data-cat],[data-emoji],[data-lp-bg],[data-lp-theme],[data-lp-acc],[data-bgmenu],[data-accmenu],[data-close],[data-lvlclose],[data-auth-mode],[data-auth-local],[data-login],[data-logout],[data-migrate],[data-import-open],[data-export],[data-export-dl],[data-copy-export],[data-copy],[data-delacc-open],#delBtn,#clearDone';
document.addEventListener('click', e => {
  const t = e.target.closest(CLICK_SEL);
  if (!t || t === document.body || t === document.documentElement) { if (e.target === $('#scrim')) closeModal(); return; }
  if (t.hasAttribute('data-lvlclose')) { t.classList.remove('show'); return; }
  /* Anmeldung & Konto */
  if (t.dataset.authMode) { e.preventDefault(); authMode = t.dataset.authMode; render(); return; }
  if (t.hasAttribute('data-auth-local')) { try { localStorage.setItem(LS_LOCALMODE, '1'); } catch(_) {} startLocal(); return; }
  if (t.hasAttribute('data-login')) { try { localStorage.removeItem(LS_LOCALMODE); } catch(_) {} closeModal(); authMode = 'login'; showAuthScreen(); return; }
  if (t.hasAttribute('data-logout')) { closeModal(); stopCloud(); signOut(fb.auth).then(() => toast('Abgemeldet')); return; }
  if (t.hasAttribute('data-migrate')) { closeModal(); migrateLocal(); return; }
  if (t.hasAttribute('data-accmenu')) { if (backend === 'auth' || backend === 'none') return; editing = null; openModal(accountMenu()); return; }
  if (t.hasAttribute('data-import-open')) { showImport(); return; }
  if (t.hasAttribute('data-export')) { showExport(); return; }
  if (t.hasAttribute('data-copy-export')) { copyText(exportJSON(), t); return; }
  if (t.hasAttribute('data-export-dl')) {
    const url = URL.createObjectURL(new Blob([exportJSON()], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'lebensplaner-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000); return;
  }
  if (t.dataset.copy) { copyText(t.dataset.copy, t); return; }
  if (t.hasAttribute('data-delacc-open')) { showDeleteAccount(); return; }
  /* Planer */
  if (backend === 'auth') return;
  if (t.dataset.toggleTask) { e.stopPropagation(); toggleTask(items.get(t.dataset.toggleTask)); return; }
  if (t.dataset.toggleHabit) { e.stopPropagation(); toggleHabit(items.get(t.dataset.toggleHabit), t.dataset.date); return; }
  if (t.dataset.tab) { e.preventDefault(); ui.tab = t.dataset.tab; try{localStorage.setItem('lebensplaner.tab',ui.tab)}catch(_){} render(); window.scrollTo(0,0); return; }
  if (t.dataset.new) { openModal(formFor(t.dataset.new, null, t.dataset.date)); return; }
  if (t.dataset.edit) { const it = items.get(t.dataset.edit); if (it) openModal(formFor(it.kind, it)); return; }
  if (t.dataset.sel) { ui.sel = t.dataset.sel; const d = parse(ui.sel); if (d.getMonth()!==ui.calMonth[1]) ui.calMonth=[d.getFullYear(),d.getMonth()]; render(); return; }
  if (t.dataset.cal) { const v = +t.dataset.cal; if (v===0) { ui.sel = today(); const d=new Date(); ui.calMonth=[d.getFullYear(),d.getMonth()]; } else { const d = new Date(ui.calMonth[0], ui.calMonth[1]+v, 1); ui.calMonth=[d.getFullYear(),d.getMonth()]; } render(); return; }
  if (t.dataset.tf) { ui.taskFilter = t.dataset.tf; render(); return; }
  if (t.dataset.cat) { editing.cat = t.dataset.cat; document.querySelectorAll('.cats button').forEach(b=>b.classList.toggle('on', b===t)); return; }
  if (t.dataset.lpTheme) { const v = t.dataset.lpTheme; if (v === 'quest' || v === 'pastel') { theme = v; setSetting({theme}); refreshDesign(); } return; }
  if (t.dataset.lpAcc) { const v = t.dataset.lpAcc; if (ACCS.some(a => a[0] === v)) { accent = v; setSetting({accent}); refreshDesign(); } return; }
  if (t.dataset.lpBg) { const v = t.dataset.lpBg; if (BGS.some(x => x[0] === v)) { currentBg = v; setSetting({bg: currentBg}); refreshDesign(); } return; }
  if (t.hasAttribute('data-bgmenu')) { editing = null; openModal(designPicker()); return; }
  if (t.dataset.emoji) { editing.emoji = t.dataset.emoji; document.querySelectorAll('.emojis button').forEach(b=>b.classList.toggle('on', b===t)); return; }
  if (t.hasAttribute('data-close')) { closeModal(); return; }
  if (t.id === 'delBtn') {
    if (!editing.confirmDel) { editing.confirmDel = true; t.textContent = 'Wirklich löschen?'; return; }
    const id = editing.id; closeModal(); removeItem(id); toast('Gelöscht'); return;
  }
  if (t.id === 'clearDone') {
    if (!t.dataset.sure) { t.dataset.sure = 1; t.textContent = 'Sicher? Nochmal tippen'; return; }
    const done = all('task').filter(x=>x.done);
    bankXP(done.reduce((s,x)=>s+taskXP(x),0));
    done.forEach(x=>{ items.delete(x.id); });
    render(); bulkWrite(done, true).catch(()=>{});
    toast(Q() ? 'Log aufgeräumt' : 'Erledigte gelöscht'); return;
  }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const id = e.target.id;
  if (id === 'authForm') { submitAuth(e.target); return; }
  if (id === 'delAccForm') { deleteAccount(e.target); return; }
  if (id === 'importForm') {
    const form = e.target, file = $('#importFile') && $('#importFile').files[0];
    const go = text => {
      try { const n = importItems(parseImport(text)); closeModal(); toast(n + ' Einträge importiert'); }
      catch(err) { toast('Das ist keine gültige Lebensplaner-Datei'); }
    };
    if (file) { const r = new FileReader(); r.onload = () => go(String(r.result || '')); r.readAsText(file); }
    else { const txt = (new FormData(form).get('json') || '').toString().trim(); if (txt) go(txt); }
    return;
  }
  if (id === 'f') submitForm(new FormData(e.target));
  if (id === 'quickTask') {
    const v = $('#quickTitle').value.trim(); if (!v) return;
    put({id:newId('t'), kind:'task', title:v, due:'', prio:'normal', note:'', done:false, created:Date.now()});
    if (Q()) toast(T().saved.task);
    setTimeout(()=>{ const q=$('#quickTitle'); q && q.focus(); },0);
  }
});
document.addEventListener('keydown', e => { if (e.key==='Escape') { if ($('#scrim').classList.contains('open')) closeModal(); $('#lvlup').classList.remove('show'); } });
/* ---------- start ---------- */
function startLocal(msg){
  stopCloud();
  backend = 'local'; items = new Map(); loadLocal();
  setStatus(msg || (FB_READY ? 'Nur auf diesem Gerät · anmelden zum Synchronisieren' : 'Nur auf diesem Gerät gespeichert'), 'local');
  render();
}
function stopCloud(){ if (fb.unsub) { fb.unsub(); fb.unsub = null; } }
function showAuthScreen(){
  stopCloud();
  backend = 'auth'; items = new Map(); authMode = 'login'; authBusy = false;
  setStatus('Nicht angemeldet', 'local');
  render();
}
function startCloud(user){
  stopCloud();
  fb.user = user; backend = 'cloud'; items = new Map();
  setStatus('Verbinde …', 'busy'); render();
  let first = true, offered = false;
  const timer = setTimeout(() => { if (first) setStatus('Offline – Änderungen werden später abgeglichen', 'offline'); }, 8000);
  fb.unsub = onSnapshot(itemsCol(), { includeMetadataChanges: true }, snap => {
    if (!snap.metadata.fromCache) { clearTimeout(timer); first = false; setStatus('Synchronisiert ☁️', 'ok'); }
    else if (!first) setStatus('Offline – Änderungen werden später abgeglichen', 'offline');
    const m = new Map();
    snap.docs.forEach(d => { const v = d.data(); if (v && v.kind) m.set(d.id, {...v, id: d.id}); });
    items = m;
    if (!$('#scrim').classList.contains('open')) render(); else pendingRender = true;
    if (!offered && !snap.metadata.fromCache) {
      offered = true;
      const n = readLocal().filter(i => i.kind !== 'settings').length;
      if (n) { editing = null; openModal(`<h2>${Q() ? QI.user + '<span>Daten übernehmen?</span>' : 'Daten übernehmen?'}</h2>
        <p>Auf diesem Gerät sind <b>${n} Einträge</b> gespeichert, die noch nicht in deinem Konto sind. Sollen sie übernommen werden?</p>
        <div class="actions"><button type="button" class="btn" data-close>Später</button><button type="button" class="btn primary" data-migrate>Übernehmen</button></div>`); }
    }
  }, err => {
    clearTimeout(timer);
    setStatus(err && err.code === 'permission-denied' ? 'Keine Berechtigung – Firestore-Regeln prüfen' : 'Verbindung unterbrochen', 'warn');
  });
}

let pendingRender = false;
new MutationObserver(()=>{ if (pendingRender && !$('#scrim').classList.contains('open')) { pendingRender=false; render(); } }).observe($('#scrim'),{attributes:true});

function boot(){
  applyTheme();
  render();
  if (!FB_READY) return startLocal();
  try {
    fb.app = initializeApp(firebaseConfig);
    fb.auth = initializeAuth(fb.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    fb.db = initializeFirestore(fb.app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true });
  } catch(e) {
    console.error(e);
    return startLocal('Sync-Fehler – nur auf diesem Gerät');
  }
  onAuthStateChanged(fb.auth, user => {
    if (user) { try { localStorage.removeItem(LS_LOCALMODE); } catch(e) {} startCloud(user); }
    else {
      fb.user = null;
      let localMode = false; try { localMode = localStorage.getItem(LS_LOCALMODE) === '1'; } catch(e) {}
      if (localMode) startLocal(); else showAuthScreen();
    }
  });
}

/* Android: Zurück-Taste */
if (IS_NATIVE) {
  try {
    CapApp.addListener('backButton', () => {
      if ($('#lvlup').classList.contains('show')) { $('#lvlup').classList.remove('show'); return; }
      if ($('#scrim').classList.contains('open')) { closeModal(); return; }
      if (backend === 'auth' && authMode !== 'login') { authMode = 'login'; render(); return; }
      if (ui.tab !== 'heute' && backend !== 'auth') { ui.tab = 'heute'; render(); window.scrollTo(0,0); return; }
      CapApp.exitApp();
    });
  } catch(e) {}
}
boot();
