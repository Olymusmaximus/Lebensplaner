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
import { LocalNotifications } from '@capacitor/local-notifications';
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
let MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
let WD = ['Mo','Di','Mi','Do','Fr','Sa','So'];
let LOCALE = 'de-DE';
const fmtLong = s => parse(s).toLocaleDateString(LOCALE,{weekday:'long',day:'numeric',month:'long'});
const fmtShort = s => parse(s).toLocaleDateString(LOCALE,{weekday:'short',day:'numeric',month:'short'});
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
  finanzen: svg('<ellipse cx="9" cy="5.5" rx="6" ry="2.5"/><path d="M3 5.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4"/><path d="M3 9.5v4c0 1.4 2.7 2.5 6 2.5"/><path d="M3 13.5v4c0 1.4 2.7 2.5 6 2.5"/><ellipse cx="16" cy="13.5" rx="5" ry="2.2"/><path d="M11 13.5v4.3c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-4.3"/>'),
  repeat: svg('<path d="M17 2.5l3 3-3 3"/><path d="M4 11V9.5a4 4 0 0 1 4-4h12"/><path d="M7 21.5l-3-3 3-3"/><path d="M20 13v1.5a4 4 0 0 1-4 4H4"/>'),
  goal: svg('<path d="M5 21.5V3"/><path d="M5 3.5h12l-2.5 4 2.5 4H5"/>'),
  chart: svg('<path d="M3 21h18"/><path d="M6 17.5V11M11 17.5V5M16 17.5v-8M20 17.5v-4"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3z"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="1.5"/><path d="M11 18.5h2"/>'),
  design: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  logo: svg('<path d="M12 2l9 10-9 10-9-10z"/><path d="M12 7.2l4.4 4.8-4.4 4.8-4.4-4.8z"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>'),
  coin: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><path d="M12 9.5v5"/>'),
  gift: svg('<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/><path d="M12 8.5C10.5 5 7 4.5 7 6.8 7 8.5 12 8.5 12 8.5zM12 8.5c1.5-3.5 5-4 5-1.7 0 1.7-5 1.7-5 1.7z"/>'),
  trophy: svg('<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3 4M16.5 6h3a3 3 0 0 1-3 4M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z"/>'),
  timer: svg('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M18.5 6.5l1.5-1.5"/>'),
  bell: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  schichten: svg('<rect x="3" y="5" width="18" height="15.5" rx="1"/><path d="M3 9.5h18M8 3v4M16 3v4"/><circle cx="12" cy="15" r="3.6"/><path d="M12 13.2V15l1.3.9"/>'),
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
const EMO = {heute:'🌤️',kalender:'📅',schichten:'🕒',aufgaben:'✏️',gewohnheiten:'🌱',finanzen:'💶',notizen:'💌'};
const HABIT_EMOJIS = ['🌱','💧','📖','🧘','🏃','🥗','😴','💊','🌿','✍️','🎧','🧹','💸','☀️','💖'];
const QUOTES = ['Kleine Schritte sind auch Schritte.','Du schaffst das – einen Tag nach dem anderen.','Heute ist ein guter Tag für einen guten Tag.','Sei lieb zu dir selbst.','Fortschritt, nicht Perfektion.','Atme durch. Du hast Zeit.','Mach heute etwas, worüber dein zukünftiges Ich sich freut.','Ruhe ist auch produktiv.','Glaub an dich, so wie deine beste Freundin an dich glaubt.','Jeder Haken zählt.'];
const MOTTOS = ['Jeder Tag ist ein neues Level.','Kleine Siege summieren sich.','Disziplin schlägt Motivation.','Heute trainieren, morgen stärker.','Fokus. Eine Quest nach der anderen.','Dein zukünftiges Ich zählt auf dich.','Fortschritt ist eine Entscheidung.','Auch Pausen laden Energie auf.','Wer dranbleibt, levelt auf.','Mach den ersten Schritt – der Rest folgt.'];
const BGS = [['traum','Traum ✨'],['wolken','Wolken ☁️'],['blumen','Blümchen 🌼'],['karo','Vichy-Karo 🎀'],['herzen','Herzen 💗'],['salbei','Salbei 🌿'],['punkte','Punktpapier 📓']];
const ACCS = [['gold','Gold','#f2b544'],['smaragd','Smaragd','#3fe0a0'],['rubin','Rubin','#ff4d6d']];
const TABS = ['heute','kalender','schichten','aufgaben','gewohnheiten','finanzen','notizen'];

const TXT = {
  pastel: {
    tabs:{heute:'Heute',kalender:'Kalender',schichten:'Schichten',aufgaben:'Aufgaben',gewohnheiten:'Gewohnheiten',finanzen:'Finanzen',notizen:'Notizen'},
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
    tabs:{heute:'Übersicht',kalender:'Kalender',schichten:'Schichten',aufgaben:'Quests',gewohnheiten:'Routinen',finanzen:'Finanzen',notizen:'Logbuch'},
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
let ui = { tab: 'heute', calMonth: null, sel: today(), taskFilter: 'offen', calView: 'month' };
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
  applyLang();
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
  ${langPicker()}
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
    <label style="margin-top:16px">Einstellungen</label>
    <div class="row" style="flex-wrap:wrap">
      <button type="button" class="btn" data-notif-open>${q ? QI.bell : '🔔'} Erinnerungen</button>
      <button type="button" class="btn" data-tab="profil" data-close-after>${q ? QI.trophy : '🏆'} Profil & Erfolge</button>
    </div>
    <label style="margin-top:16px">Daten</label>
    <div class="row" style="flex-wrap:wrap">
      <button type="button" class="btn" data-import-open>Importieren</button>
      <button type="button" class="btn" data-ics-open>Kalender (.ics) importieren</button>
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
  const ok = ['event','task','habit','note','settings','txn','recurring','goal','reward','shift'];
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
  if (!noBank) { if (it.kind === 'task' && it.done) { bankXP(taskXP(it)); setSetting({questsBank: (+(S().questsBank || 0)) + 1}); } if (it.kind === 'habit') bankXP(habitXP(it)); }
  if (it.kind === 'task' && (it.hist || []).length) setSetting({questsBank: (+(S().questsBank || 0)) + it.hist.length});
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
  if (t.repeat && t.repeat !== 'none' && !t.done) return completeRepeating(t);
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
  m.innerHTML = (({heute:viewToday,kalender:viewCalendar,schichten:viewShifts,aufgaben:viewTasks,gewohnheiten:viewHabits,finanzen:viewFinance,notizen:viewNotes,profil:viewProfile})[ui.tab] || viewToday)();
  afterRender();
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
  const subs = t.subs || [], subDone = subs.filter(x => x.d).length;
  if (subs.length && !t.done) pr = `<span class="pill">${subDone}/${subs.length}</span>` + pr;
  if (t.repeat && t.repeat !== 'none') pr = `<span class="pill" title="${TREPEAT[t.repeat] || ''}">↻</span>` + pr;
  return `<div class="item ${t.done?'done':''}" data-edit="${t.id}">
    <button class="chk ${t.done?'on':''}" data-toggle-task="${t.id}" aria-label="erledigt">${t.done?ICON.check:''}</button>
    <div class="grow"><div class="t">${esc(t.title)}</div>${t.note?`<div class="s">${esc(t.note)}</div>`:''}${subsBlock(t)}</div>${pr}${due}</div>`;
}
const dayIdx = td => Math.floor((parse(td) - new Date(2026,0,1)) / 864e5);

function pastelHero(td, evs, openAll, habits, habitsDone){
  const h = new Date().getHours();
  const greet = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : 'Guten Abend';
  return `<div class="hero">
    <div class="stickers"><span>🌸</span><span>✨</span><span>🍓</span></div>
    <h1>${greet}!</h1><p>${fmtLong(td)}</p>
    <div class="quote">„${QUOTES[((dayIdx(td) % QUOTES.length) + QUOTES.length) % QUOTES.length]}“</div>
    <div class="stat"><div><b>${evs.length}</b>Termine heute</div><div><b>${openAll}</b>offene Aufgaben</div><div><b>${habitsDone}/${habits.length}</b>Gewohnheiten</div><div class="stat-link" data-tab="profil"><b>🪙 ${coins()}</b>Level ${levelInfo(totalXP()).lvl} · Profil ›</div></div>
    ${habits.length?`<div class="progress" title="Gewohnheiten heute"><i style="width:${Math.round(habitsDone/habits.length*100)}%"></i></div>`:''}
  </div>`;
}
function questHero(td, evs, openAll, habits, habitsDone){
  const L = levelInfo(totalXP()), pct = Math.round(L.rest / L.need * 100);
  const best = habits.reduce((m,h) => Math.max(m, streak(h)), 0);
  const h = new Date().getHours();
  const greet = h < 5 ? 'Noch wach?' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Willkommen zurück' : 'Guten Abend';
  return `<div class="card qhero">
    <div class="lvl" data-tab="profil" title="Profil, Shop & Erfolge"><svg class="hex" viewBox="0 0 100 112"><polygon points="50,3 96,29 96,83 50,109 4,83 4,29"/><polygon class="in" points="50,13 87,34 87,78 50,99 13,78 13,34"/></svg><div class="lvl-in"><span>Level</span><b>${L.lvl}</b></div></div>
    <div class="qh-main">
      <div class="qh-k">${greet} · ${fmtLong(td)}</div>
      <h1>${esc(titleFor(L.lvl))}</h1>
      <div class="xpbar"><i style="width:${pct}%"></i></div>
      <div class="xptext"><span>${L.rest} / ${L.need} XP</span><span>noch ${L.need - L.rest} XP bis Level ${L.lvl + 1}</span></div>
      <div class="qh-links"><button class="btn" data-tab="profil">${QI.coin} ${coins()} Münzen · Profil & Shop</button><button class="btn" data-focus-open>${QI.timer} Fokus</button></div>
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
  ${shiftTodayCard()}
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
    ${financeTodayCard()}
    ${weeklyTodayCard()}
  </div>`;
}

function calMonthView(){
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
    const shs = shiftsOn(ds);
    cells += `<div class="day ${d.getMonth()!==m?'out':''} ${ds===td?'today':''} ${ds===ui.sel?'sel':''}" data-sel="${ds}">
      <div class="n">${d.getDate()}</div>${shs.length ? `<div class="shmini">${shs.slice(0, 2).map(s => `<i style="--sc:${shMeta(s).color}">${esc(shMeta(s).short)}</i>`).join('')}</div>` : ''}
      ${evs.slice(0,2).map(e=>`<div class="ev" style="background:${catColor(e.cat)};--cc:${catColor(e.cat)}">${e.start?esc(e.start)+' ':''}${esc(e.title)}</div>`).join('')}
      ${evs.length>2?`<div class="more">+${evs.length-2}</div>`:''}
      ${dueTasks?`<div class="more">☐ ${dueTasks}</div>`:''}
      <div class="dots">${evs.slice(0,4).map(e=>`<i style="background:${catColor(e.cat)}"></i>`).join('')}</div>
    </div>`;
  }
  const evs = eventsOn(ui.sel);
  const tasks = all('task').filter(t=>t.due===ui.sel).sort(sortTasks);
  return `<div class="cal-layout">
    <div class="card tape t-pink">${calSwitch()}
      <div class="cal-h"><h2>${MONTHS[m]} ${y}</h2>
        <div class="row"><button class="btn icon" data-cal="-1" aria-label="voriger Monat">‹</button><button class="btn" data-cal="0">Heute</button><button class="btn icon" data-cal="1" aria-label="nächster Monat">›</button></div></div>
      <div class="cal">${cells}</div>
    </div>
    <div class="card tape t-butter">
      <div class="sec-h"><h2 ${Q()?'':'style="font-size:28px"'}>${Q() ? QI.kalender + '<span>' + fmtLong(ui.sel) + '</span>' : fmtLong(ui.sel)}</h2></div>
      <div class="row" style="margin:8px 0;flex-wrap:wrap"><button class="btn primary" data-new="event" data-date="${ui.sel}">${tx.add.event}</button><button class="btn" data-new="task" data-date="${ui.sel}">${tx.add.task}</button><button class="btn" data-new="shift" data-date="${ui.sel}">+ Schicht</button></div>
      ${shiftDayList(ui.sel)}
      <div class="list">${evs.length ? evs.map(eventRow).join('') : `<div class="empty">${tx.empty.day}</div>`}</div>
      ${tasks.length?`<h3 style="font-size:${Q()?'16px':'24px'};margin:16px 0 2px">${H('due')}</h3><div class="list">${tasks.map(taskRow).join('')}</div>`:''}
      ${financeDayList(ui.sel)}
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
    <div class="sec-h"><h2>${H('tasks')}</h2><div class="row"><button class="btn" data-focus-open>${Q() ? QI.timer : '⏱'} Fokus</button><button class="btn" data-new="task">${tx.add.details}</button></div></div>
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

/* ---------- Finanzen ---------- */
const FIN_KINDS = ['txn','recurring','goal'];
const FCATS = {
  wohnen:['Wohnen','🏠','#8fb8ff'], lebensmittel:['Lebensmittel','🛒','#6fd39a'], mobilitaet:['Mobilität','🚗','#ffb26b'],
  versicherung:['Versicherung','🛡️','#b79cff'], abos:['Abos & Medien','📺','#ff8fb1'], handy:['Handy & Internet','📱','#6fc8ff'],
  freizeit:['Freizeit','🎮','#ffd36b'], gesundheit:['Gesundheit','💊','#6fe0d0'], kleidung:['Kleidung','👕','#e2a5ff'],
  sparen:['Sparen','💰','#a8e06b'], sonstiges:['Sonstiges','📦','#b9ab92']
};
const ICATS = { gehalt:['Gehalt','💼','#6fd39a'], nebenjob:['Nebenjob','🧰','#8fb8ff'], kindergeld:['Kindergeld','👪','#ffd36b'], geschenk:['Geschenk','🎁','#ff8fb1'], einnahme:['Sonstiges','📦','#b9ab92'] };
const fcatOf = (type, k) => (type === 'income' ? (ICATS[k] || ICATS.einnahme) : (FCATS[k] || FCATS.sonstiges));
const INTERVALS = { weekly:['Wöchentlich',52/12,'pro Woche'], monthly:['Monatlich',1,'pro Monat'], quarterly:['Vierteljährlich',1/3,'pro Quartal'], halfyearly:['Halbjährlich',1/6,'pro Halbjahr'], yearly:['Jährlich',1/12,'pro Jahr'] };
const EURF = new Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR'});
const EURF_EN = new Intl.NumberFormat('en-IE', {style:'currency', currency:'EUR'});
const eur = n => (LANG === 'en' ? EURF_EN : EURF).format(Math.round((+n || 0) * 100) / 100);
const numDE = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2});
function parseAmt(s){
  s = String(s || '').trim().replace(/[\s€]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : NaN;
}
const FH = (icon, emoji, text) => Q() ? `${QI[icon]}<span>${text}</span>` : `${emoji} ${text}`;
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

function occInMonth(r, y, m){
  if (!r.start || r.active === false) return [];
  const s = parse(r.start), out = [];
  const mStart = new Date(y, m, 1), mEnd = new Date(y, m, daysInMonth(y, m));
  const end = r.until ? parse(r.until) : null;
  const ok = d => d >= s && d >= mStart && d <= mEnd && (!end || d <= end);
  if (r.interval === 'weekly') {
    let d = new Date(s);
    if (d < mStart) d = addDays(d, Math.ceil((mStart - d) / 864e5 / 7) * 7);
    while (d <= mEnd) { if (ok(d)) out.push(ymd(d)); d = addDays(d, 7); }
    return out;
  }
  const step = {monthly:1, quarterly:3, halfyearly:6, yearly:12}[r.interval] || 1;
  const diff = (y - s.getFullYear()) * 12 + (m - s.getMonth());
  if (diff < 0 || diff % step !== 0) return out;
  const d = new Date(y, m, Math.min(s.getDate(), daysInMonth(y, m)));
  if (ok(d)) out.push(ymd(d));
  return out;
}
function nextDue(r, from){
  const f = parse(from);
  for (let i = 0; i < 14; i++) {
    const dt = new Date(f.getFullYear(), f.getMonth() + i, 1);
    const occ = occInMonth(r, dt.getFullYear(), dt.getMonth()).filter(d => d >= from);
    if (occ.length) return occ[0];
  }
  return null;
}
function finRowsForDates(from, to){
  // alle Zahlungen (Buchungen + wiederkehrende) zwischen from und to (inklusive)
  const rows = [];
  all('txn').forEach(t => { if (t.date >= from && t.date <= to) rows.push({date:t.date, amount:+t.amount || 0, type:t.type, cat:t.cat, title:t.note || fcatOf(t.type, t.cat)[0], id:t.id, rec:false}); });
  const a = parse(from), b = parse(to);
  for (let dt = new Date(a.getFullYear(), a.getMonth(), 1); dt <= b; dt = new Date(dt.getFullYear(), dt.getMonth() + 1, 1)) {
    all('recurring').forEach(r => occInMonth(r, dt.getFullYear(), dt.getMonth()).forEach(d => { if (d >= from && d <= to) rows.push({date:d, amount:+r.amount || 0, type:r.type, cat:r.cat, title:r.name, id:r.id, rec:true, interval:r.interval}); }));
  }
  return rows.sort((x, y) => y.date.localeCompare(x.date) || (y.rec - x.rec));
}
function monthFin(y, m){
  const from = `${y}-${pad(m+1)}-01`, to = `${y}-${pad(m+1)}-${pad(daysInMonth(y, m))}`;
  const rows = finRowsForDates(from, to);
  const inc = rows.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const exp = rows.filter(r => r.type !== 'income').reduce((s, r) => s + r.amount, 0);
  const byCat = {};
  rows.filter(r => r.type !== 'income').forEach(r => { const k = FCATS[r.cat] ? r.cat : 'sonstiges'; byCat[k] = (byCat[k] || 0) + r.amount; });
  return {rows, inc, exp, byCat};
}
const perMonth = r => (+r.amount || 0) * (INTERVALS[r.interval] || INTERVALS.monthly)[1];
const fixedMonthly = type => all('recurring').filter(r => r.active !== false && (type === 'income' ? r.type === 'income' : r.type !== 'income') && (!r.until || r.until >= today())).reduce((s, r) => s + perMonth(r), 0);
const hasFinance = () => all('txn').length + all('recurring').length + all('goal').length > 0;

function finRow(r, showDate = true){
  const c = fcatOf(r.type, r.cat), td = today();
  const planned = r.date > td;
  return `<div class="item frow" data-edit="${r.id}">
    ${showDate ? `<div class="time" style="min-width:58px">${parse(r.date).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit'})}</div>` : ''}
    <span class="dot" style="background:${c[2]}"></span>
    <div class="grow"><div class="t">${esc(r.title)}</div><div class="s">${Q() ? '' : c[1] + ' '}${esc(c[0])}${r.rec ? ' · ↻ ' + (INTERVALS[r.interval] || INTERVALS.monthly)[0] : ''}${planned ? ' · geplant' : ''}</div></div>
    <div class="famt ${r.type === 'income' ? 'in' : 'out'}">${r.type === 'income' ? '+' : '−'}${eur(r.amount)}</div></div>`;
}

function viewFinance(){
  if (!ui.finMonth) { const d = new Date(); ui.finMonth = [d.getFullYear(), d.getMonth()]; }
  const [y, m] = ui.finMonth, td = today(), q = Q();
  const F = monthFin(y, m), saldo = F.inc - F.exp;
  const budgets = S().budgets || {};
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (+v || 0), 0);
  const spentBudgeted = Object.keys(budgets).reduce((s, k) => s + (F.byCat[k] || 0), 0);
  const recs = all('recurring').slice().sort((a, b) => (a.type === 'income') - (b.type === 'income') || (nextDue(a, td) || '9999').localeCompare(nextDue(b, td) || '9999'));
  const goals = all('goal').slice().sort((a, b) => (a.created || 0) - (b.created || 0));
  const catKeys = Object.keys(FCATS).filter(k => (F.byCat[k] || 0) > 0 || (+budgets[k] || 0) > 0).sort((a, b) => (F.byCat[b] || 0) - (F.byCat[a] || 0));
  const maxV = Math.max(1, ...catKeys.map(k => Math.max(F.byCat[k] || 0, +budgets[k] || 0)));
  const fixOut = fixedMonthly('expense'), fixIn = fixedMonthly('income');
  const isNow = (() => { const d = new Date(); return d.getFullYear() === y && d.getMonth() === m; })();

  const cats = catKeys.length ? catKeys.map(k => {
    const v = F.byCat[k] || 0, b = +budgets[k] || 0, c = FCATS[k], over = b && v > b;
    return `<div class="cbar ${over ? 'over' : ''}">
      <div class="cbar-top"><span><span class="dot" style="background:${c[2]}"></span> ${q ? '' : c[1] + ' '}${c[0]}</span><span>${eur(v)}${b ? ` <small>/ ${eur(b)}</small>` : ''}</span></div>
      <div class="cbar-track"><i class="cbar-fill" style="width:${Math.min(100, v / maxV * 100).toFixed(1)}%;background:${c[2]}"></i>${b ? `<i class="cbar-limit" style="left:${Math.min(100, b / maxV * 100).toFixed(1)}%"></i>` : ''}</div>
      ${over ? `<div class="cbar-warn">${eur(v - b)} über Budget</div>` : b ? `<div class="cbar-ok">noch ${eur(b - v)} frei</div>` : ''}
    </div>`; }).join('') : `<div class="empty">Noch keine Ausgaben in diesem Monat.</div>`;

  const recList = recs.length ? recs.map(r => {
    const c = fcatOf(r.type, r.cat), nd = nextDue(r, td), ended = r.until && r.until < td;
    return `<div class="item frow ${ended ? 'done' : ''}" data-edit="${r.id}"><span class="dot" style="background:${c[2]}"></span>
      <div class="grow"><div class="t">${esc(r.name)}</div><div class="s">${(INTERVALS[r.interval] || INTERVALS.monthly)[0]}${nd ? ' · nächste: ' + fmtShort(nd) : ended ? ' · beendet' : ''}${cancelPill(r)}</div></div>
      <div class="famt ${r.type === 'income' ? 'in' : 'out'}">${r.type === 'income' ? '+' : '−'}${eur(r.amount)}</div></div>`; }).join('')
    : `<div class="empty">Trag hier regelmäßige Zahlungen ein – Miete, Handyvertrag, Versicherungen, Streaming-Abos, Fitnessstudio, aber auch dein Gehalt. Sie erscheinen dann automatisch in jedem Monat.</div>`;

  const goalList = goals.length ? goals.map(g => {
    const tgt = +g.target || 0, sv = +g.saved || 0, pct = tgt ? Math.min(100, sv / tgt * 100) : 0, done = tgt && sv >= tgt;
    let rate = '';
    if (g.deadline && !done && g.deadline > td) {
      const months = Math.max(1, (parse(g.deadline).getFullYear() - new Date().getFullYear()) * 12 + parse(g.deadline).getMonth() - new Date().getMonth());
      rate = ` · ${eur((tgt - sv) / months)} pro Monat bis ${parse(g.deadline).toLocaleDateString(LOCALE,{month:'short',year:'numeric'})}`;
    }
    return `<div class="goal ${done ? 'reached' : ''}">
      <div class="goal-top"><div class="grow" data-edit="${g.id}" style="cursor:pointer"><div class="t">${done ? (q ? '★ ' : '🏆 ') : ''}${esc(g.name)}</div><div class="s">${eur(sv)} von ${eur(tgt)}${rate}</div></div>
      <button class="btn" data-deposit="${g.id}">${q ? '+ Einzahlen' : '+ Einzahlen'}</button></div>
      <div class="cbar-track goal-track"><i class="cbar-fill" style="width:${pct.toFixed(1)}%"></i></div>
    </div>`; }).join('')
    : `<div class="empty">Spar auf etwas hin – Urlaub, Führerschein, neues Handy. Du siehst, wie viel noch fehlt und wie viel du pro Monat zurücklegen musst.</div>`;

  return `<div class="card tape t-peach fin-head" style="margin-top:12px">
      <div class="fin-month"><h2>${q ? QI.finanzen + '<span>' : '💶 '}${MONTHS[m]} ${y}${q ? '</span>' : ''}</h2>
        <div class="row"><button class="btn icon" data-fm="-1" aria-label="voriger Monat">‹</button>${isNow ? '' : '<button class="btn" data-fm="0">Heute</button>'}<button class="btn icon" data-fm="1" aria-label="nächster Monat">›</button></div></div>
      <div class="fin-stats">
        <div><span>Einnahmen</span><b class="pos">${eur(F.inc)}</b></div>
        <div><span>Ausgaben</span><b class="neg">${eur(F.exp)}</b></div>
        <div><span>${saldo >= 0 ? 'Übrig' : 'Minus'}</span><b class="${saldo >= 0 ? 'pos' : 'neg'}">${eur(saldo)}</b></div>
        <div><span>Fixkosten / Monat</span><b>${eur(fixOut)}</b></div>
      </div>
      ${totalBudget ? `<div class="cbar" style="margin-top:14px"><div class="cbar-top"><span>Budgets</span><span>${eur(spentBudgeted)} <small>/ ${eur(totalBudget)}</small></span></div><div class="cbar-track ${spentBudgeted > totalBudget ? 'over' : ''}"><i class="cbar-fill tot" style="width:${Math.min(100, spentBudgeted / totalBudget * 100).toFixed(1)}%"></i></div><div class="cbar-ok">${spentBudgeted > totalBudget ? eur(spentBudgeted - totalBudget) + ' über deinen Budgets' : 'noch ' + eur(totalBudget - spentBudgeted) + ' frei in deinen Budgets'}</div></div>` : ''}
      <div class="fin-actions"><button class="btn primary" data-new="txn" data-ftype="expense">− Ausgabe</button><button class="btn" data-new="txn" data-ftype="income">+ Einnahme</button><button class="btn" data-new="recurring" data-ftype="expense">↻ Fixkosten / Abo</button></div>
    </div>
    <div class="grid g2">
      <div class="card tape t-pink"><div class="sec-h"><h2>${FH('chart','📊','Kategorien')}</h2><button class="btn" data-budget-open>Budgets</button></div>${cats}</div>
      <div class="card tape t-lav"><div class="sec-h"><h2>${FH('repeat','🔁','Fixkosten & Abos')}</h2><button class="btn" data-new="recurring" data-ftype="expense">+ Neu</button></div>
        <div class="list">${recList}</div>
        ${recs.length ? `<div class="fin-sum">≈ ${eur(fixOut)} pro Monat · ${eur(fixOut * 12)} pro Jahr${fixIn ? ` · feste Einnahmen ${eur(fixIn)} / Monat` : ''}</div>` : ''}</div>
      <div class="card tape t-sky"><div class="sec-h"><h2>${FH('finanzen','🧾','Buchungen')}</h2><button class="btn" data-new="txn" data-ftype="expense">+ Neu</button></div>
        <div class="list">${F.rows.length ? F.rows.map(r => finRow(r)).join('') : `<div class="empty">In diesem Monat gibt es noch keine Buchungen.</div>`}</div></div>
      <div class="card tape t-sage"><div class="sec-h"><h2>${FH('goal','🎯','Sparziele')}</h2><button class="btn" data-new="goal">+ Neu</button></div>${goalList}</div>
    </div>
    <div class="card tape t-butter fin-chart" style="margin-top:22px">${finChart(y, m)}</div>`;
}

function financeTodayCard(){
  if (!hasFinance()) return '';
  const d = new Date(), td = today();
  const F = monthFin(d.getFullYear(), d.getMonth()), saldo = F.inc - F.exp;
  const upcoming = finRowsForDates(td, ymd(addDays(d, 7))).filter(r => r.rec && r.type !== 'income').reverse().slice(0, 3);
  const budgets = S().budgets || {}; const tb = Object.values(budgets).reduce((s, v) => s + (+v || 0), 0);
  const sb = Object.keys(budgets).reduce((s, k) => s + (F.byCat[k] || 0), 0);
  return `<div class="card tape t-peach"><div class="sec-h"><h2>${FH('finanzen','💶','Finanzen · ' + MONTHS[d.getMonth()])}</h2><button class="btn" data-tab="finanzen">Öffnen</button></div>
    <div class="fin-mini"><div><span>${saldo >= 0 ? 'Übrig' : 'Minus'}</span><b class="${saldo >= 0 ? 'pos' : 'neg'}">${eur(saldo)}</b></div><div><span>Ausgaben</span><b>${eur(F.exp)}</b></div>${tb ? `<div><span>Budget frei</span><b class="${tb - sb >= 0 ? 'pos' : 'neg'}">${eur(tb - sb)}</b></div>` : ''}</div>
    ${upcoming.length ? `<div class="s" style="margin:10px 0 2px;font-weight:700">Nächste Abbuchungen</div><div class="list">${upcoming.map(r => finRow(r)).join('')}</div>` : ''}
  </div>`;
}
function financeDayList(ds){
  const rows = finRowsForDates(ds, ds);
  return rows.length ? `<h3 style="font-size:${Q() ? '16px' : '24px'};margin:16px 0 2px">${FH('finanzen','💶','Zahlungen')}</h3><div class="list">${rows.map(r => finRow(r, false)).join('')}</div>` : '';
}

/* Formulare */
function fcatButtons(){
  const src = editing.ftype === 'income' ? ICATS : FCATS;
  return Object.entries(src).map(([k, c]) => `<button type="button" data-fcat="${k}" class="${editing.fcat === k ? 'on' : ''}"><span class="dot" style="background:${c[2]}"></span>${Q() ? '' : c[1] + ' '}${c[0]}</button>`).join('');
}
function finForm(kind, it, date, ftype){
  const type = it?.type || ftype || 'expense';
  editing = {kind, id: it ? it.id : null, ftype: type, fcat: it?.cat || (type === 'income' ? 'gehalt' : (kind === 'recurring' ? 'wohnen' : 'lebensmittel')), confirmDel: false};
  const del = it ? '<button type="button" class="btn danger" id="delBtn">Löschen</button>' : '<span></span>';
  const act = `<div class="actions">${del}<div class="row"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></div>`;
  const typeSw = `<div class="tabs-sub ftype"><button type="button" data-fset="expense" class="${type !== 'income' ? 'on' : ''}">Ausgabe</button><button type="button" data-fset="income" class="${type === 'income' ? 'on' : ''}">Einnahme</button></div>`;
  const title = (icon, emoji, t) => Q() ? `${QI[icon]}<span>${t}</span>` : `${emoji} ${t}`;
  if (kind === 'txn') return `<form id="f"><h2>${title('finanzen','💶', it ? 'Buchung bearbeiten' : 'Neue Buchung')}</h2>${typeSw}
    <label>Betrag (€)</label><input type="text" class="amt" name="amount" inputmode="decimal" required autocomplete="off" value="${it ? numDE(it.amount) : ''}" placeholder="0,00">
    <label>Kategorie</label><div class="cats" id="fcats">${fcatButtons()}</div>
    <div class="f2"><div><label>Datum</label><input type="date" name="date" value="${esc(it?.date || date || today())}"></div><div><label>Notiz</label><input type="text" name="note" value="${esc(it?.note)}" placeholder="z. B. Wocheneinkauf"></div></div>${act}</form>`;
  if (kind === 'recurring') return `<form id="f"><h2>${title('repeat','🔁', it ? 'Fixkosten bearbeiten' : 'Fixkosten / Abo / Einkommen')}</h2>${typeSw}
    <label>Name</label><input type="text" name="name" required value="${esc(it?.name)}" placeholder="z. B. Miete, Netflix, Handyvertrag, Gehalt">
    <div class="f2"><div><label>Betrag (€)</label><input type="text" class="amt" name="amount" inputmode="decimal" required autocomplete="off" value="${it ? numDE(it.amount) : ''}" placeholder="0,00"></div>
    <div><label>Wie oft?</label><select name="interval">${Object.entries(INTERVALS).map(([k, v]) => `<option value="${k}" ${(it?.interval || 'monthly') === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div></div>
    <div class="f2"><div><label>Nächste / erste Zahlung</label><input type="date" name="start" required value="${esc(it?.start || date || today())}"></div><div><label>Endet am (optional)</label><input type="date" name="until" value="${esc(it?.until)}"></div></div>
    <label>Kündbar bis (optional) – Erinnerung 7 Tage vorher</label><input type="date" name="cancelBy" value="${esc(it?.cancelBy)}">
    <label>Kategorie</label><div class="cats" id="fcats">${fcatButtons()}</div>
    <label>Notiz</label><input type="text" name="note" value="${esc(it?.note)}" placeholder="z. B. Vertragsnummer, kündbar bis …">${act}</form>`;
  if (kind === 'goal') return `<form id="f"><h2>${title('goal','🎯', it ? 'Sparziel bearbeiten' : 'Neues Sparziel')}</h2>
    <label>Wofür sparst du?</label><input type="text" name="name" required value="${esc(it?.name)}" placeholder="z. B. Urlaub, Führerschein, Notgroschen">
    <div class="f2"><div><label>Zielbetrag (€)</label><input type="text" class="amt" name="target" inputmode="decimal" required autocomplete="off" value="${it ? numDE(it.target) : ''}" placeholder="0,00"></div>
    <div><label>Schon gespart (€)</label><input type="text" name="saved" inputmode="decimal" autocomplete="off" value="${it ? numDE(it.saved) : ''}" placeholder="0,00"></div></div>
    <label>Bis wann? (optional)</label><input type="date" name="deadline" value="${esc(it?.deadline)}">${act}</form>`;
}
function finSubmit(fd){
  const {kind, id} = editing;
  const old = id ? items.get(id) : null;
  const base = old ? {...old} : {id: newId(kind === 'txn' ? 'b' : kind[0]), kind, created: Date.now()};
  const g = k => (fd.get(k) || '').toString().trim();
  if (kind === 'txn' || kind === 'recurring') {
    const a = parseAmt(g('amount'));
    if (!(a > 0)) { toast('Bitte einen gültigen Betrag eingeben'); return; }
    if (kind === 'txn') Object.assign(base, {type: editing.ftype, amount: a, cat: editing.fcat, date: g('date') || today(), note: g('note')});
    else Object.assign(base, {type: editing.ftype, amount: a, cat: editing.fcat, name: g('name'), interval: g('interval') || 'monthly', start: g('start') || today(), until: g('until'), cancelBy: g('cancelBy'), note: g('note'), active: true});
  }
  if (kind === 'goal') {
    const tg = parseAmt(g('target')); if (!(tg > 0)) { toast('Bitte einen gültigen Zielbetrag eingeben'); return; }
    const sv = parseAmt(g('saved'));
    Object.assign(base, {name: g('name'), target: tg, saved: sv > 0 ? sv : 0, deadline: g('deadline')});
  }
  closeModal(); put(base);
  toast(old ? 'Gespeichert' : ({txn: editing && editing.ftype === 'income' ? 'Einnahme eingetragen' : 'Buchung eingetragen', recurring: 'Fixkosten angelegt', goal: 'Sparziel angelegt'})[kind] || 'Gespeichert');
}
function budgetForm(){
  editing = {kind: 'budget'};
  const b = S().budgets || {};
  const m = new Date();
  const spent = monthFin(m.getFullYear(), m.getMonth()).byCat;
  return `<form id="budgetForm"><h2>${Q() ? QI.chart + '<span>Monatsbudgets</span>' : '📊 Monatsbudgets'}</h2>
    <p class="hint">Wie viel möchtest du pro Monat höchstens ausgeben? Leer lassen = kein Budget.</p>
    <div class="budget-list">${Object.entries(FCATS).map(([k, c]) => `<div class="budget-row"><span><span class="dot" style="background:${c[2]}"></span> ${Q() ? '' : c[1] + ' '}${c[0]}<small>${spent[k] ? ' · diesen Monat ' + eur(spent[k]) : ''}</small></span><input type="text" inputmode="decimal" name="b_${k}" value="${b[k] ? numDE(b[k]) : ''}" placeholder="–"></div>`).join('')}</div>
    <div class="actions"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`;
}
function saveBudgets(fd){
  const out = {};
  Object.keys(FCATS).forEach(k => { const v = parseAmt(fd.get('b_' + k)); if (v > 0) out[k] = v; });
  setSetting({budgets: out}); closeModal(); render(); toast('Budgets gespeichert');
}
function depositForm(gid){
  const g = items.get(gid); if (!g) return '';
  editing = {kind: 'deposit', id: gid};
  return `<form id="depositForm"><h2>${Q() ? QI.goal + '<span>' + esc(g.name) + '</span>' : '🎯 ' + esc(g.name)}</h2>
    <p>Gespart: <b>${eur(g.saved)}</b> von ${eur(g.target)}</p>
    <label>Betrag (€)</label><input type="text" class="amt" id="depAmt" inputmode="decimal" autocomplete="off" placeholder="0,00">
    <div class="actions"><button type="button" class="btn" data-dep="out">− Abheben</button><button type="button" class="btn primary" data-dep="in">+ Einzahlen</button></div></form>`;
}
function doDeposit(dir){
  const g = items.get(editing && editing.id); if (!g) return;
  const a = parseAmt($('#depAmt') && $('#depAmt').value);
  if (!(a > 0)) { toast('Bitte einen gültigen Betrag eingeben'); return; }
  const before = +g.saved || 0, tgt = +g.target || 0;
  const saved = Math.max(0, Math.round((before + (dir === 'in' ? a : -a)) * 100) / 100);
  closeModal(); put({...g, saved});
  if (dir === 'in' && tgt && before < tgt && saved >= tgt) toast((Q() ? '★ ' : '🏆 ') + 'Sparziel erreicht!');
  else toast(dir === 'in' ? eur(a) + ' eingezahlt' : eur(a) + ' abgehoben');
}

/* ---------- Quests: Wiederholung & Unteraufgaben ---------- */
const TREPEAT = {none:'Nie', daily:'Täglich', weekdays:'Werktags (Mo–Fr)', weekly:'Wöchentlich', monthly:'Monatlich'};
function hashStr(s){ let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function advanceDue(rep, ds){
  const d = parse(ds);
  if (rep === 'daily') return ymd(addDays(d, 1));
  if (rep === 'weekdays') { let x = addDays(d, 1); while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1); return ymd(x); }
  if (rep === 'weekly') return ymd(addDays(d, 7));
  if (rep === 'monthly') { const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); return ymd(new Date(n.getFullYear(), n.getMonth(), Math.min(d.getDate(), daysInMonth(n.getFullYear(), n.getMonth())))); }
  return ymd(addDays(d, 1));
}
function completeRepeating(t){
  const td = today(), before = levelInfo(totalXP()).lvl, xp = taskXP(t);
  let nd = t.due && t.due > td ? t.due : (t.due || td);
  do { nd = advanceDue(t.repeat, nd); } while (nd <= td);
  bankXP(xp);
  put({...t, due: nd, hist: [...(t.hist || []), td].slice(-150), subs: (t.subs || []).map(s => ({...s, d: false}))});
  reward(before, xp);
  toast(`${Q() ? '+' + xp + ' XP · ' : 'Erledigt! '}nächstes Mal ${fmtShort(nd)}`);
}
function toggleSub(tid, sid){
  const t = items.get(tid); if (!t) return;
  const subs = (t.subs || []).map(s => s.id === sid ? {...s, d: !s.d} : s);
  put({...t, subs});
  if (subs.length && subs.every(s => s.d) && !t.done) toast('Alle Unteraufgaben erledigt – jetzt die Quest abhaken!');
}
function subsBlock(t){
  const subs = t.subs || []; if (!subs.length || t.done) return '';
  return `<div class="subs">${subs.slice(0, 8).map(s => `<button type="button" class="sub ${s.d ? 'on' : ''}" data-subtoggle="${t.id}|${s.id}"><i>${s.d ? ICON.check : ''}</i><span>${esc(s.t)}</span></button>`).join('')}${subs.length > 8 ? `<span class="s">+${subs.length - 8} weitere</span>` : ''}</div>`;
}
function syncSubsFromDom(){
  if (!editing || !editing.subs) return;
  document.querySelectorAll('#subsBox .sub-in').forEach(inp => { const i = +inp.dataset.i; if (editing.subs[i]) editing.subs[i].t = inp.value; });
}
function subsEditor(){
  return (editing.subs || []).map((s, i) => `<div class="sub-ed"><input type="text" class="sub-in" data-i="${i}" value="${esc(s.t)}"><button type="button" class="btn icon" data-sub-del="${i}" aria-label="entfernen">✕</button></div>`).join('');
}
function addSub(){
  const inp = $('#subNew'); if (!inp) return; const v = inp.value.trim(); if (!v) return;
  syncSubsFromDom(); editing.subs.push({id: newId('s'), t: v, d: false});
  $('#subsBox').innerHTML = subsEditor(); inp.value = ''; inp.focus();
}

/* ---------- Münzen & Belohnungs-Shop ---------- */
const coinsEarned = () => Math.floor(totalXP() / 10);
const coins = () => Math.max(0, coinsEarned() - (+(S().coinsSpent || 0)));
const COIN = () => Q() ? `<span class="coin">${QI.coin}</span>` : '🪙';
const REWARD_EMOJIS = ['🍕','🎮','🎬','🛍️','☕','🍰','🛁','😴','📱','🎧','✈️','🎁'];
function rewardForm(it){
  editing = {kind: 'reward', id: it ? it.id : null, emoji: it?.emoji || '🎁', confirmDel: false};
  const del = it ? '<button type="button" class="btn danger" id="delBtn">Löschen</button>' : '<span></span>';
  return `<form id="f"><h2>${Q() ? QI.gift + '<span>' + (it ? 'Belohnung bearbeiten' : 'Neue Belohnung') + '</span>' : '🎁 ' + (it ? 'Belohnung bearbeiten' : 'Neue Belohnung')}</h2>
    <p class="hint">Was gönnst du dir, wenn du genug Münzen gesammelt hast? Für jede 10 XP bekommst du 1 Münze.</p>
    <label>Belohnung</label><input type="text" name="name" required value="${esc(it?.name)}" placeholder="z. B. Pizza bestellen, Gaming-Abend, Kino">
    <label>Preis in Münzen</label><input type="text" name="cost" inputmode="numeric" required value="${it ? +it.cost : ''}" placeholder="z. B. 30">
    <label>Symbol</label><div class="emojis">${REWARD_EMOJIS.map(e => `<button type="button" data-emoji="${e}" class="${editing.emoji === e ? 'on' : ''}">${e}</button>`).join('')}</div>
    <div class="actions">${del}<div class="row"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></div></form>`;
}
function redeem(id, btn){
  const r = items.get(id); if (!r) return;
  const cost = Math.max(1, Math.round(+r.cost || 0));
  if (coins() < cost) { toast(`Dir fehlen noch ${cost - coins()} Münzen`); return; }
  if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = `Sicher? −${cost}`; return; }
  setSetting({coinsSpent: (+(S().coinsSpent || 0)) + cost, redeemLog: [{n: r.name, c: cost, e: r.emoji || '🎁', d: today()}, ...(S().redeemLog || [])].slice(0, 30)});
  render(); toast(`Gönn dir: ${r.name}! ${r.emoji || '🎁'}`);
}

/* ---------- Erfolge ---------- */
function questsDoneCount(){ return all('task').filter(t => t.done).length + all('task').reduce((s, t) => s + (t.hist || []).length, 0) + (+(S().questsBank || 0)); }
function bestStreakEver(){
  let best = 0;
  all('habit').forEach(h => { const ds = Object.keys(h.done || {}).sort(); let run = 0, prev = null;
    ds.forEach(d => { run = (prev && ymd(addDays(parse(prev), 1)) === d) ? run + 1 : 1; prev = d; best = Math.max(best, run); }); });
  return best;
}
function lastMonthBudgetKept(){
  const b = S().budgets || {}, keys = Object.keys(b); if (!keys.length) return false;
  const d = new Date(), lm = new Date(d.getFullYear(), d.getMonth() - 1, 1), F = monthFin(lm.getFullYear(), lm.getMonth());
  return F.exp > 0 && keys.every(k => (F.byCat[k] || 0) <= +b[k]);
}
function achStats(){
  return { quests: questsDoneCount(), streak: bestStreakEver(), level: levelInfo(totalXP()).lvl,
    goals: all('goal').filter(g => +g.target && +g.saved >= +g.target).length, events: all('event').length,
    focus: +(S().focusCount || 0), budget: lastMonthBudgetKept() ? 1 : 0, redeemed: (S().redeemLog || []).length,
    routines: all('habit').reduce((s, h) => s + Object.keys(h.done || {}).length, 0) };
}
const ACH = [
  ['q1',  '🗡️', 'Erste Quest',       'Schließe deine erste Quest ab',          'quests', 1],
  ['q10', '⚔️', 'Quest-Jäger',       'Schließe 10 Quests ab',                  'quests', 10],
  ['q50', '🏹', 'Unermüdlich',       'Schließe 50 Quests ab',                  'quests', 50],
  ['q100','👑', 'Legendär fleißig',  'Schließe 100 Quests ab',                 'quests', 100],
  ['s3',  '🔥', 'Dranbleiber',       'Halte eine Routine 3 Tage am Stück',     'streak', 3],
  ['s7',  '💪', 'Eine Woche stark',  'Halte eine Routine 7 Tage am Stück',     'streak', 7],
  ['s30', '🛡️', 'Eiserner Wille',    'Halte eine Routine 30 Tage am Stück',    'streak', 30],
  ['r100','🌱', 'Gewohnheitstier',   'Hake 100 Mal eine Routine ab',           'routines', 100],
  ['l5',  '⭐', 'Aufsteiger',        'Erreiche Level 5',                       'level', 5],
  ['l10', '🌟', 'Veteran',           'Erreiche Level 10',                      'level', 10],
  ['l20', '💫', 'Champion',          'Erreiche Level 20',                      'level', 20],
  ['e10', '📅', 'Gut organisiert',   'Trage 10 Termine ein',                   'events', 10],
  ['f1',  '⏱️', 'Erster Fokus',      'Schließe eine Fokus-Runde ab',           'focus', 1],
  ['f10', '🧠', 'Tiefer Fokus',      'Schließe 10 Fokus-Runden ab',            'focus', 10],
  ['g1',  '🐷', 'Sparfuchs',         'Erreiche dein erstes Sparziel',          'goals', 1],
  ['b1',  '📊', 'Budget-Meister',    'Halte einen ganzen Monat alle Budgets ein', 'budget', 1],
  ['w1',  '🎁', 'Gönn dir',          'Löse deine erste Belohnung ein',         'redeemed', 1]
];
let achReady = false;
function checkAchievements(){
  if (!achReady || (backend !== 'local' && backend !== 'cloud')) return;
  const st = achStats(), have = S().ach || {};
  const fresh = ACH.filter(a => st[a[4]] >= a[5] && !have[a[0]]).map(a => a[0]);
  if (!S().achInit) { const upd = {...have}; fresh.forEach(id => upd[id] = today()); setSetting({ach: upd, achInit: true}); return; }
  if (!fresh.length) return;
  const upd = {...have}; fresh.forEach(id => upd[id] = today());
  setSetting({ach: upd});
  const a = ACH.find(x => x[0] === fresh[fresh.length - 1]);
  setTimeout(() => showAchievement(a), 600);
}
function showAchievement(a){
  const el = $('#lvlup');
  el.innerHTML = `<div class="lu-in"><div class="lu-rings"><i></i><i></i><i></i></div><div class="lu-k">Erfolg freigeschaltet</div><div class="lu-n ach-n">${a[1]}</div><div class="lu-t">${esc(a[2])}</div><div class="lu-h">${esc(a[3])}</div></div>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(showLevelUp._t); showLevelUp._t = setTimeout(() => el.classList.remove('show'), 4200);
}

/* ---------- Wochenrückblick ---------- */
function weekRange(offset){ const d = new Date(), mon = addDays(d, -((d.getDay() + 6) % 7) + offset * 7); return [ymd(mon), ymd(addDays(mon, 6))]; }
function weekStats(offset){
  const [a, b] = weekRange(offset), end = offset === 0 ? today() : b, inR = ds => ds >= a && ds <= end;
  const quests = all('task').filter(t => t.done && t.doneAt && inR(ymd(new Date(t.doneAt)))).length + all('task').reduce((s, t) => s + (t.hist || []).filter(inR).length, 0);
  const hs = all('habit'), days = Math.round((parse(end) - parse(a)) / 864e5) + 1;
  const checks = hs.reduce((s, h) => s + Object.keys(h.done || {}).filter(inR).length, 0);
  const rate = hs.length ? Math.round(checks / (hs.length * days) * 100) : null;
  const spent = finRowsForDates(a, end).filter(r => r.type !== 'income').reduce((s, r) => s + r.amount, 0);
  let events = 0; for (let i = 0; i < days; i++) events += eventsOn(ymd(addDays(parse(a), i))).length;
  const focus = (S().focusLog || []).filter(inR).length;
  return {a, b, quests, rate, spent, events, focus, checks};
}
function weekReviewHTML(){
  const w = weekStats(0), l = weekStats(-1);
  const cmp = (x, y, lowerBetter) => { if (y == null || x == null || x === y) return '<span class="wdiff">±0</span>'; const up = x > y, good = lowerBetter ? !up : up; return `<span class="wdiff ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'}</span>`; };
  const rows = [
    ['Quests erledigt', w.quests, l.quests, false, v => v],
    ['Routinen-Quote', w.rate, l.rate, false, v => v == null ? '–' : v + ' %'],
    ['Ausgaben', w.spent, l.spent, true, v => eur(v)],
    ['Termine', w.events, l.events, null, v => v],
    ['Fokus-Runden', w.focus, l.focus, false, v => v]
  ];
  return `<div class="wr-range">${fmtShort(w.a)} – ${fmtShort(w.b)} · im Vergleich zur Vorwoche</div>
    <div class="wr">${rows.map(([lbl, x, y, lb, f]) => `<div><span>${lbl}</span><b>${f(x)}</b>${lb === null ? '' : cmp(x, y, lb)}<small>Vorwoche: ${f(y)}</small></div>`).join('')}</div>`;
}
function weeklyTodayCard(){
  const dow = new Date().getDay(); if (dow !== 0 && dow !== 1) return '';
  const w = weekStats(dow === 1 ? -1 : 0);
  return `<div class="card tape t-sky"><div class="sec-h"><h2>${FH('chart', '📈', dow === 1 ? 'Deine letzte Woche' : 'Dein Wochenrückblick')}</h2><button class="btn" data-tab="profil">Ansehen</button></div>
    <div class="fin-mini"><div><span>Quests</span><b>${w.quests}</b></div><div><span>Routinen</span><b>${w.rate == null ? '–' : w.rate + ' %'}</b></div><div><span>Ausgaben</span><b>${eur(w.spent)}</b></div></div></div>`;
}

/* ---------- Profil ---------- */
function viewProfile(){
  const q = Q(), L = levelInfo(totalXP()), pct = Math.round(L.rest / L.need * 100), c = coins();
  const st = achStats(), have = S().ach || {};
  const rewards = all('reward').slice().sort((a, b) => (+a.cost || 0) - (+b.cost || 0));
  const log = (S().redeemLog || []).slice(0, 5);
  const unlocked = ACH.filter(a => have[a[0]] || st[a[4]] >= a[5]).length;
  return `<div class="card tape t-lav prof-head" style="margin-top:12px">
      <div class="prof-top">
        <div><div class="qh-k">${q ? 'Dein Profil' : '🏆 Dein Profil'}</div><h1>${esc(titleFor(L.lvl))} · Level ${L.lvl}</h1>
          <div class="xpbar"><i style="width:${pct}%"></i></div>
          <div class="xptext"><span>${L.rest} / ${L.need} XP</span><span>noch ${L.need - L.rest} XP bis Level ${L.lvl + 1}</span></div></div>
        <div class="coins-big">${COIN()}<b>${c}</b><span>Münzen</span></div>
      </div>
      <div class="fin-actions"><button class="btn primary" data-focus-open>${q ? QI.timer : '⏱'} Fokus-Timer</button><button class="btn" data-new="reward">+ Belohnung</button><button class="btn" data-tab="heute">Zurück zur Übersicht</button></div>
    </div>
    <div class="grid g2">
      <div class="card tape t-sky"><div class="sec-h"><h2>${FH('chart', '📈', 'Wochenrückblick')}</h2></div>${weekReviewHTML()}</div>
      <div class="card tape t-peach"><div class="sec-h"><h2>${FH('gift', '🎁', 'Belohnungs-Shop')}</h2><button class="btn" data-new="reward">+ Neu</button></div>
        <div class="shop">${rewards.length ? rewards.map(r => { const cost = Math.max(1, Math.round(+r.cost || 0)), ok = c >= cost;
          return `<div class="item shop-it"><span class="shop-e">${esc(r.emoji || '🎁')}</span><div class="grow" data-edit="${r.id}" style="cursor:pointer"><div class="t">${esc(r.name)}</div><div class="s">${cost} Münzen${ok ? '' : ' · noch ' + (cost - c)}</div></div><button class="btn ${ok ? 'primary' : ''}" data-redeem="${r.id}" ${ok ? '' : 'disabled'}>Einlösen</button></div>`; }).join('')
          : '<div class="empty">Leg Belohnungen an, die du dir mit Münzen „kaufen“ kannst – zum Beispiel Pizza bestellen, einen Gaming-Abend oder ein neues Spiel. Für jede 10 XP bekommst du 1 Münze.</div>'}</div>
        ${log.length ? `<div class="s" style="margin-top:10px;font-weight:700">Zuletzt eingelöst</div><div class="redeemed">${log.map(x => `<span class="pill">${esc(x.e || '🎁')} ${esc(x.n)} · ${parse(x.d).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit'})}</span>`).join('')}</div>` : ''}</div>
      <div class="card tape t-butter ach-card"><div class="sec-h"><h2>${FH('trophy', '🏆', 'Erfolge')}</h2><span class="pill">${unlocked} / ${ACH.length}</span></div>
        <div class="ach-grid">${ACH.map(a => { const v = st[a[4]], ok = have[a[0]] || v >= a[5];
          return `<div class="ach ${ok ? 'on' : ''}" title="${esc(a[3])}"><div class="ach-i">${a[1]}</div><div class="ach-t">${esc(a[2])}</div><div class="ach-d">${esc(a[3])}</div>${ok ? `<div class="ach-ok">${have[a[0]] ? 'seit ' + parse(have[a[0]]).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit', year:'2-digit'}) : 'freigeschaltet'}</div>` : `<div class="cbar-track"><i class="cbar-fill tot" style="width:${Math.min(100, (+v || 0) / a[5] * 100).toFixed(0)}%"></i></div><div class="ach-p">${Math.min(+v || 0, a[5])} / ${a[5]}</div>`}</div>`; }).join('')}</div></div>
    </div>`;
}

/* ---------- Kalender: Woche & Tag ---------- */
function calSwitch(){ return `<div class="tabs-sub calsw">${[['month','Monat'],['week','Woche'],['day','Tag']].map(([k, l]) => `<button data-calview="${k}" class="${(ui.calView || 'month') === k ? 'on' : ''}">${l}</button>`).join('')}</div>`; }
function viewCalendar(){ const v = ui.calView || 'month'; return v === 'week' ? calWeekView() : v === 'day' ? calDayView() : calMonthView(); }
function calWeekView(){
  const sel = parse(ui.sel), mon = addDays(sel, -((sel.getDay() + 6) % 7)), td = today();
  const days = [...Array(7)].map((_, i) => ymd(addDays(mon, i)));
  return `<div class="card tape t-pink">${calSwitch()}
    <div class="cal-h"><h2>${fmtShort(days[0])} – ${fmtShort(days[6])}</h2><div class="row"><button class="btn icon" data-calnav="-7" aria-label="vorige Woche">‹</button><button class="btn" data-calnav="0">Heute</button><button class="btn icon" data-calnav="7" aria-label="nächste Woche">›</button></div></div>
    <div class="week">${days.map(ds => { const evs = eventsOn(ds), ts = all('task').filter(t => t.due === ds && !t.done), pays = finRowsForDates(ds, ds);
      return `<div class="wday ${ds === td ? 'today' : ''}"><div class="wday-h" data-dayopen="${ds}"><b>${WD[(parse(ds).getDay() + 6) % 7]}</b> ${parse(ds).getDate()}.</div><div class="wday-b">
        ${shiftsOn(ds).map(s => { const mt = shMeta(s); return `<div class="wev wshift" data-edit="${s.id}" style="--cc:${mt.color}"><span>${s.mode === 'fixed' ? fmtH(shiftHours(s)) : esc(s.start) + '–' + esc(s.end)}</span>${esc(mt.name)}</div>`; }).join('')}
        ${evs.map(e => `<div class="wev" data-edit="${e.id}" style="--cc:${catColor(e.cat)}"><span>${e.start ? esc(e.start) : 'ganztägig'}</span>${esc(e.title)}</div>`).join('')}
        ${ts.map(t => `<div class="wev wtask" data-edit="${t.id}"><span>Quest</span>${esc(t.title)}</div>`).join('')}
        ${pays.map(r => `<div class="wev wpay" data-edit="${r.id}"><span>${r.type === 'income' ? '+' : '−'}${eur(r.amount)}</span>${esc(r.title)}</div>`).join('')}
        <button class="wadd" data-new="event" data-date="${ds}" aria-label="Termin hinzufügen">+</button></div></div>`; }).join('')}</div></div>`;
}
const HH = 48;
function calDayView(){
  const ds = ui.sel, evs = eventsOn(ds), td = today(), tx = T();
  const toMin = s => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const blocks = evs.filter(e => e.start).map(e => { const s = toMin(e.start); let en = e.end ? toMin(e.end) : s + 60; if (en <= s) en = s + 30; return {e, s, en}; }).sort((a, b) => a.s - b.s);
  const lanes = []; blocks.forEach(b => { let i = lanes.findIndex(l => l <= b.s); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = b.en; b.lane = i; });
  const nl = Math.max(1, lanes.length);
  const hours = [...Array(24)].map((_, h) => `<div class="hr" style="top:${h * HH}px"><span>${pad(h)}:00</span></div>`).join('');
  const now = new Date(), nowLine = ds === td ? `<div class="nowline" style="top:${(now.getHours() * 60 + now.getMinutes()) / 60 * HH}px"></div>` : '';
  const evHTML = blocks.map(b => `<div class="tblock" data-edit="${b.e.id}" style="top:${b.s / 60 * HH}px;height:${Math.max(24, (b.en - b.s) / 60 * HH - 2)}px;left:calc(54px + (100% - 58px) * ${b.lane / nl});width:calc((100% - 58px) / ${nl} - 3px);--cc:${catColor(b.e.cat)}"><b>${esc(b.e.title)}</b><span>${esc(b.e.start)}${b.e.end ? '–' + esc(b.e.end) : ''}${b.e.place ? ' · ' + esc(b.e.place) : ''}</span></div>`).join('');
  const allday = evs.filter(e => !e.start), ts = all('task').filter(t => t.due === ds).sort(sortTasks);
  return `<div class="card tape t-pink">${calSwitch()}
    <div class="cal-h"><h2>${fmtLong(ds)}</h2><div class="row"><button class="btn icon" data-calnav="-1" aria-label="voriger Tag">‹</button><button class="btn" data-calnav="0">Heute</button><button class="btn icon" data-calnav="1" aria-label="nächster Tag">›</button></div></div>
    <div class="row" style="margin-bottom:10px;flex-wrap:wrap"><button class="btn primary" data-new="event" data-date="${ds}">${tx.add.event}</button><button class="btn" data-new="task" data-date="${ds}">${tx.add.task}</button><button class="btn" data-new="shift" data-date="${ds}">+ Schicht</button></div>
    ${shiftDayList(ds)}
    ${allday.length ? `<div class="allday">${allday.map(e => `<div class="wev" data-edit="${e.id}" style="--cc:${catColor(e.cat)}"><span>ganztägig</span>${esc(e.title)}</div>`).join('')}</div>` : ''}
    <div class="tl-wrap" id="tlWrap"><div class="timeline" style="height:${24 * HH}px">${hours}${shiftBands(ds)}${nowLine}${evHTML}</div></div>
    ${ts.length ? `<h3 style="font-size:${Q() ? '16px' : '24px'};margin:16px 0 2px">${H('due')}</h3><div class="list">${ts.map(taskRow).join('')}</div>` : ''}
    ${financeDayList(ds)}</div>`;
}
function calNav(v){
  if (v === 0) ui.sel = today(); else ui.sel = ymd(addDays(parse(ui.sel), v));
  const d = parse(ui.sel); ui.calMonth = [d.getFullYear(), d.getMonth()]; render();
}

/* ---------- Kalender-Import (.ics) ---------- */
function parseICS(text){
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out = []; let cur = null;
  const val = l => l.slice(l.indexOf(':') + 1);
  const unesc = s => s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
  const dt = l => { const params = l.slice(0, l.indexOf(':')), v = val(l).trim();
    const y = +v.slice(0, 4), mo = +v.slice(4, 6) - 1, d = +v.slice(6, 8);
    if (/VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(v)) return {date: ymd(new Date(y, mo, d)), time: ''};
    const h = +v.slice(9, 11), mi = +v.slice(11, 13);
    const x = /Z$/i.test(v) ? new Date(Date.UTC(y, mo, d, h, mi)) : new Date(y, mo, d, h, mi);
    return {date: ymd(x), time: pad(x.getHours()) + ':' + pad(x.getMinutes())}; };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (l === 'BEGIN:VEVENT') cur = {};
    else if (l === 'END:VEVENT') { if (cur && cur.title && cur.date) out.push(cur); cur = null; }
    else if (cur && l.includes(':')) {
      const key = l.split(/[;:]/)[0].toUpperCase();
      try {
        if (key === 'SUMMARY') cur.title = unesc(val(l));
        else if (key === 'LOCATION') cur.place = unesc(val(l));
        else if (key === 'DESCRIPTION') cur.note = unesc(val(l)).slice(0, 500);
        else if (key === 'UID') cur.uid = val(l).trim();
        else if (key === 'DTSTART') { const x = dt(l); cur.date = x.date; cur.start = x.time; }
        else if (key === 'DTEND') { const x = dt(l); cur.end = x.time; }
        else if (key === 'RRULE') { const v = val(l), f = (v.match(/FREQ=(\w+)/i) || [])[1], iv = +((v.match(/INTERVAL=(\d+)/i) || [])[1] || 1); if (iv === 1) cur.repeat = ({DAILY:'daily', WEEKLY:'weekly', MONTHLY:'monthly', YEARLY:'yearly'})[(f || '').toUpperCase()] || 'none'; }
      } catch(e) {}
    }
  }
  const cutoff = ymd(addDays(new Date(), -365));
  return out.filter(e => e.date >= cutoff || (e.repeat && e.repeat !== 'none')).slice(0, 3000).map(e => ({
    id: 'ics_' + hashStr(e.uid || (e.title + e.date + (e.start || ''))).toString(36), kind: 'event', title: e.title.slice(0, 200), date: e.date,
    start: e.start || '', end: e.start ? (e.end || '') : '', place: e.place || '', note: e.note || '', cat: 'sonstiges', repeat: e.repeat || 'none', created: Date.now() }));
}
function showICSImport(){
  const area = $('#dataArea'); if (!area) return;
  area.innerHTML = `<p class="hint">Exportiere deinen Kalender als <b>.ics</b>-Datei (Outlook: Kalender → Freigeben/Veröffentlichen bzw. „Kalender speichern“; Google Kalender: Einstellungen → Importieren & Exportieren → Exportieren) und wähle sie hier aus.</p>
    <form id="icsForm"><input type="file" accept=".ics,text/calendar" id="icsFile" style="margin:6px 0"><div class="row" style="margin-top:8px"><button class="btn primary">Termine importieren</button></div></form>`;
}

/* ---------- Finanzen: Verlauf & Kündigungsfristen ---------- */
function finChart(y, m){
  const months = [...Array(6)].map((_, i) => { const d = new Date(y, m - 5 + i, 1); return [d.getFullYear(), d.getMonth()]; });
  const data = months.map(([yy, mm]) => { const F = monthFin(yy, mm); return {lbl: MONTHS[mm].slice(0, 3), inc: F.inc, exp: F.exp}; });
  const max = Math.max(1, ...data.map(d => Math.max(d.inc, d.exp)));
  const W = 600, Hh = 200, bw = 30, gap = W / 6;
  const bars = data.map((d, i) => { const x = i * gap + gap / 2 - bw - 2, hi = d.inc / max * (Hh - 30), he = d.exp / max * (Hh - 30);
    return `<g><rect class="b-inc" x="${x}" y="${Hh - 20 - hi}" width="${bw}" height="${hi}" rx="3"><title>Einnahmen ${eur(d.inc)}</title></rect>
      <rect class="b-exp" x="${x + bw + 4}" y="${Hh - 20 - he}" width="${bw}" height="${he}" rx="3"><title>Ausgaben ${eur(d.exp)}</title></rect>
      <text x="${i * gap + gap / 2}" y="${Hh - 4}" text-anchor="middle">${d.lbl}</text></g>`; }).join('');
  const avg = data.reduce((s, d) => s + d.exp, 0) / 6;
  return `<div class="sec-h"><h2>${FH('chart', '📊', 'Verlauf (6 Monate)')}</h2></div>
    <svg class="fchart" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" aria-label="Einnahmen und Ausgaben der letzten 6 Monate"><line x1="0" x2="${W}" y1="${Hh - 20}" y2="${Hh - 20}" class="axis"/>${bars}</svg>
    <div class="fchart-l"><span><i class="l-inc"></i>Einnahmen</span><span><i class="l-exp"></i>Ausgaben</span><span>Ø Ausgaben: ${eur(avg)} / Monat</span></div>`;
}
function cancelPill(r){
  if (!r.cancelBy || r.cancelBy < today()) return '';
  const days = Math.round((parse(r.cancelBy) - parse(today())) / 864e5);
  return ` <span class="pill ${days <= 30 ? 'late' : ''}">kündbar bis ${parse(r.cancelBy).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit', year:'2-digit'})}</span>`;
}

/* ---------- Fokus-Timer ---------- */
const FOCUS_XP = 15;
let focus = null; try { focus = JSON.parse(localStorage.getItem('lebensplaner.focus') || 'null'); } catch(e) {}
let focusInt = null;
const fmtMS = ms => { const s = Math.ceil(ms / 1000); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
function saveFocus(){ try { focus ? localStorage.setItem('lebensplaner.focus', JSON.stringify(focus)) : localStorage.removeItem('lebensplaner.focus'); } catch(e) {} }
function focusForm(){
  if (focus) return focusRunningHTML();
  editing = {kind: 'focus', fdur: 25};
  return `<form id="focusForm"><h2>${Q() ? QI.timer + '<span>Fokus-Timer</span>' : '⏱ Fokus-Timer'}</h2>
    <p class="hint">Arbeite konzentriert an einer Sache, ohne Ablenkung. Wenn die Zeit um ist, bekommst du <b>+${FOCUS_XP} XP</b>${IS_NATIVE ? ' und eine Benachrichtigung' : ''}.</p>
    <label>Dauer</label><div class="tabs-sub ftime">${[15, 25, 45, 60].map(m => `<button type="button" data-fdur="${m}" class="${m === 25 ? 'on' : ''}">${m} Min.</button>`).join('')}</div>
    <label>Woran arbeitest du? (optional)</label><select name="task"><option value="">–</option>${all('task').filter(t => !t.done).sort(sortTasks).map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select>
    <div class="actions"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Start</button></div></form>`;
}
function focusRunningHTML(){
  editing = {kind: 'focusrun'};
  const left = Math.max(0, focus.end - Date.now()), t = items.get(focus.task);
  return `<div id="focusRun"><h2>${Q() ? QI.timer + '<span>Fokus läuft</span>' : '⏱ Fokus läuft'}</h2>${t ? `<p>${esc(t.title)}</p>` : ''}
    <div class="ftimer" id="ftimer">${fmtMS(left)}</div><div class="cbar-track"><i class="cbar-fill tot" id="fbar" style="width:${(100 - left / (focus.dur * 60000) * 100).toFixed(1)}%"></i></div>
    <p class="hint">Du kannst das Fenster schließen – der Timer läuft weiter.</p>
    <div class="actions"><button type="button" class="btn danger" data-focus-stop>Abbrechen</button><button type="button" class="btn primary" data-close>Ausblenden</button></div></div>`;
}
function startFocus(fd){
  const dur = (editing && editing.fdur) || 25;
  focus = {end: Date.now() + dur * 60000, dur, task: (fd.get('task') || '').toString()};
  saveFocus(); notifyFocus(); openModal(focusRunningHTML()); tickFocus();
}
function stopFocus(){ focus = null; saveFocus(); notifyFocus(); clearInterval(focusInt); updateFocusPill(); closeModal(); toast('Fokus abgebrochen'); }
function finishFocus(){
  focus = null; saveFocus(); clearInterval(focusInt); updateFocusPill();
  const before = levelInfo(totalXP()).lvl;
  setSetting({xpBank: (+(S().xpBank || 0)) + FOCUS_XP, focusCount: (+(S().focusCount || 0)) + 1, focusLog: [today(), ...(S().focusLog || [])].slice(0, 300)});
  if ($('#focusRun')) closeModal();
  render(); reward(before, FOCUS_XP); toast(`Fokus geschafft! +${FOCUS_XP} XP`);
}
function tickFocus(){
  clearInterval(focusInt); updateFocusPill(); if (!focus) return;
  const step = () => {
    if (!focus) { clearInterval(focusInt); return; }
    const left = focus.end - Date.now();
    if (left <= 0) { finishFocus(); return; }
    const el = $('#ftimer'); if (el) el.textContent = fmtMS(left);
    const b = $('#fbar'); if (b) b.style.width = (100 - left / (focus.dur * 60000) * 100).toFixed(1) + '%';
    updateFocusPill();
  };
  step(); focusInt = setInterval(step, 1000);
}
function updateFocusPill(){
  let p = $('#focusPill');
  if (!focus || backend === 'auth') { if (p) p.remove(); return; }
  if (!p) { p = document.createElement('button'); p.id = 'focusPill'; p.type = 'button'; p.setAttribute('data-focus-open', ''); document.body.appendChild(p); }
  p.textContent = '⏱ ' + fmtMS(Math.max(0, focus.end - Date.now()));
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && focus) tickFocus(); });

/* ---------- Erinnerungen (Android) ---------- */
const NOTIF_DEFAULTS = { on: true, events: true, eventMin: 30, allDayTime: '08:00', tasks: true, taskTime: '09:00', pays: true, payTime: '18:00', habits: true, habitTime: '20:00', shifts: true, shiftMin: 60 };
const NS = () => ({...NOTIF_DEFAULTS, ...(S().notif || {})});
const notifId = key => (hashStr(key) % 2000000000) + 1;
let notifTimer = null;
function scheduleNotifications(){ if (!IS_NATIVE || (backend !== 'local' && backend !== 'cloud')) return; clearTimeout(notifTimer); notifTimer = setTimeout(doScheduleNotifications, 1500); }
async function doScheduleNotifications(){
  try {
    const pending = await LocalNotifications.getPending();
    const keepFocus = focus ? notifId('focus') : -1;
    const old = (pending.notifications || []).filter(n => n.id !== keepFocus).map(n => ({id: n.id}));
    if (old.length) await LocalNotifications.cancel({notifications: old});
    const ns = NS(); if (!ns.on) return;
    const perm = await LocalNotifications.checkPermissions(); if (perm.display !== 'granted') return;
    const now = Date.now(), list = [];
    const at = (ds, hm) => { const [h, m] = String(hm || '09:00').split(':').map(Number); const d = parse(ds); d.setHours(h || 0, m || 0, 0, 0); return d; };
    const L = x => LANG === 'en' ? trStr(String(x)) : String(x);
    const push = (key, title, body, when, horizonDays = 14) => { const t = when.getTime(); if (t > now + 30000 && t < now + horizonDays * 864e5) list.push({id: notifId(key), title: L(title), body: L(body), schedule: {at: when, allowWhileIdle: true}, smallIcon: 'ic_stat_lebensplaner', iconColor: '#F2B544'}); };
    for (let i = 0; i < 14; i++) {
      const ds = ymd(addDays(new Date(), i));
      if (ns.events) eventsOn(ds).forEach(e => {
        if (e.remind === 'none') return;
        if (e.start) { const min = (e.remind !== undefined && e.remind !== '') ? +e.remind : +ns.eventMin; const w = at(ds, e.start); w.setMinutes(w.getMinutes() - min);
          push('e:' + e.id + ':' + ds, e.title, (min ? (min >= 1440 ? 'Morgen' : min >= 60 ? `In ${min / 60} Std.` : `In ${min} Min.`) + ' · ' : 'Jetzt · ') + e.start + ' Uhr' + (e.place ? ' · ' + e.place : ''), w); }
        else push('e:' + e.id + ':' + ds, e.title, 'Heute · ganztägig', at(ds, ns.allDayTime));
      });
      if (ns.tasks) all('task').filter(t => !t.done && t.due === ds).forEach(t => push('t:' + t.id + ':' + ds, (Q() ? 'Quest fällig: ' : 'Heute fällig: ') + t.title, t.note || (Q() ? `+${taskXP(t)} XP warten auf dich` : 'Tippe, um den Planer zu öffnen'), at(ds, ns.taskTime)));
      if (ns.pays) { const tm = ymd(addDays(parse(ds), 1)); finRowsForDates(tm, tm).filter(r => r.rec && r.type !== 'income').forEach(r => push('p:' + r.id + ':' + tm, 'Morgen wird abgebucht: ' + r.title, eur(r.amount), at(ds, ns.payTime))); }
      if (ns.shifts) shiftsOn(ds).forEach(s => { if (s.mode === 'fixed' || hm2min(s.start) == null) return; const min = +ns.shiftMin || 0, w = at(ds, s.start); w.setMinutes(w.getMinutes() - min); const mt = shMeta(s);
        push('s:' + s.id + ':' + ds, mt.name + ' um ' + s.start + ' Uhr', (min ? (min >= 1440 ? 'Morgen' : min >= 60 ? `In ${min / 60} Std.` : `In ${min} Min.`) : 'Jetzt') + ' · bis ' + s.end + ' Uhr', w); });
      if (ns.habits) { const open = all('habit').filter(h => !(h.done && h.done[ds])); if (open.length) push('h:' + ds, open.length === 1 ? 'Routine noch offen: ' + open[0].name : `${open.length} Routinen noch offen`, open.slice(0, 3).map(h => h.name).join(', ') + (open.length > 3 ? ' …' : ''), at(ds, ns.habitTime)); }
    }
    all('recurring').forEach(r => { if (r.cancelBy) push('c:' + r.id + ':' + r.cancelBy, 'Kündigungsfrist: ' + r.name, 'Kündbar bis ' + fmtShort(r.cancelBy) + ' – noch 7 Tage', at(ymd(addDays(parse(r.cancelBy), -7)), '10:00'), 120); });
    list.sort((a, b) => a.schedule.at - b.schedule.at);
    if (list.length) await LocalNotifications.schedule({notifications: list.slice(0, 64)});
  } catch(e) { console.warn('Erinnerungen:', e); }
}
async function notifyFocus(){
  if (!IS_NATIVE) return;
  try {
    await LocalNotifications.cancel({notifications: [{id: notifId('focus')}]});
    if (focus) await LocalNotifications.schedule({notifications: [{id: notifId('focus'), title: 'Fokus geschafft! ⏱', body: `+${FOCUS_XP} XP – Zeit für eine kurze Pause.`, schedule: {at: new Date(focus.end), allowWhileIdle: true}, smallIcon: 'ic_stat_lebensplaner', iconColor: '#F2B544'}]});
  } catch(e) {}
}
async function askNotifPermission(){
  if (!IS_NATIVE) return false;
  try { const p = await LocalNotifications.requestPermissions(); return p.display === 'granted'; } catch(e) { return false; }
}
function notifForm(){
  editing = {kind: 'notif'};
  const ns = NS(), mins = [[0,'Zur Startzeit'],[10,'10 Min. vorher'],[15,'15 Min. vorher'],[30,'30 Min. vorher'],[60,'1 Std. vorher'],[120,'2 Std. vorher'],[1440,'1 Tag vorher']];
  const row = (key, label, timeKey, extra = '') => `<div class="nrow"><label class="chkl"><input type="checkbox" name="${key}" ${ns[key] ? 'checked' : ''}> ${label}</label>${timeKey ? `<input type="time" name="${timeKey}" value="${esc(ns[timeKey])}">` : ''}${extra}</div>`;
  return `<form id="notifForm"><h2>${Q() ? QI.bell + '<span>Erinnerungen</span>' : '🔔 Erinnerungen'}</h2>
    ${IS_NATIVE ? '' : '<div class="syncbox"><b>Nur in der Android-App</b>Erinnerungen kommen als Benachrichtigung aufs Handy. Die Einstellungen hier gelten auch dort.</div>'}
    <div class="nrow"><label class="chkl big"><input type="checkbox" name="on" ${ns.on ? 'checked' : ''}> Erinnerungen einschalten</label></div>
    ${row('events', 'Termine', null, `<select name="eventMin">${mins.map(([v, l]) => `<option value="${v}" ${+ns.eventMin === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    <div class="nrow sub"><span>Ganztägige Termine um</span><input type="time" name="allDayTime" value="${esc(ns.allDayTime)}"></div>
    ${row('shifts', 'Schichtbeginn', null, `<select name="shiftMin">${mins.map(([v, l]) => `<option value="${v}" ${+ns.shiftMin === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    ${row('tasks', 'Fällige Quests / Aufgaben um', 'taskTime')}
    ${row('pays', 'Abbuchungen (am Vortag) um', 'payTime')}
    ${row('habits', 'Offene Routinen um', 'habitTime')}
    <p class="hint">Kündigungsfristen von Abos erinnern dich immer 7 Tage vorher. Pro Termin kannst du die Erinnerung im Termin selbst ändern.</p>
    <div class="actions">${IS_NATIVE ? '<button type="button" class="btn" data-notif-test>Test senden</button>' : '<span></span>'}<div class="row"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></div></form>`;
}
async function saveNotif(form){
  const fd = new FormData(form), g = k => (fd.get(k) || '').toString(), c = k => fd.get(k) === 'on';
  const notif = { on: c('on'), events: c('events'), eventMin: +g('eventMin') || 0, allDayTime: g('allDayTime') || '08:00', tasks: c('tasks'), taskTime: g('taskTime') || '09:00', pays: c('pays'), payTime: g('payTime') || '18:00', habits: c('habits'), habitTime: g('habitTime') || '20:00', shifts: c('shifts'), shiftMin: +g('shiftMin') || 0 };
  setSetting({notif}); closeModal(); render();
  if (IS_NATIVE && notif.on) { const ok = await askNotifPermission(); if (!ok) { toast('Bitte Benachrichtigungen in den Android-Einstellungen erlauben'); return; } }
  scheduleNotifications(); toast('Erinnerungen gespeichert');
}
async function testNotif(){
  if (!(await askNotifPermission())) { toast('Benachrichtigungen sind nicht erlaubt'); return; }
  try { await LocalNotifications.schedule({notifications: [{id: notifId('test' + Date.now()), title: 'Lebensplaner', body: 'So sehen deine Erinnerungen aus. 👍', schedule: {at: new Date(Date.now() + 5000), allowWhileIdle: true}, smallIcon: 'ic_stat_lebensplaner', iconColor: '#F2B544'}]}); toast('Test kommt in 5 Sekunden'); } catch(e) { toast('Konnte keine Erinnerung planen'); }
}

/* ---------- Schichten (Schichtdienst) ---------- */
const SH_COLORS = ['#ffd36b','#ff9f5a','#8fb8ff','#b79cff','#6fd39a','#ff6b7f','#6fe0d0','#e2a5ff','#b9ab92'];
const SH_DEFAULT_TYPES = [
  {id:'frueh', name:'Frühschicht', short:'F', mode:'time', start:'06:00', end:'14:00', pause:30, color:'#ffd36b'},
  {id:'spaet', name:'Spätschicht', short:'S', mode:'time', start:'14:00', end:'22:00', pause:30, color:'#ff9f5a'},
  {id:'nacht', name:'Nachtschicht', short:'N', mode:'time', start:'22:00', end:'06:00', pause:30, color:'#8fb8ff'},
  {id:'urlaub', name:'Urlaub', short:'U', mode:'fixed', hours:8, color:'#6fd39a'},
  {id:'krank', name:'Krank', short:'K', mode:'fixed', hours:8, color:'#ff6b7f'}
];
const shTypes = () => Array.isArray(S().shiftTypes) ? S().shiftTypes : SH_DEFAULT_TYPES;
const shType = id => shTypes().find(t => t.id === id);
const SHS = () => ({soll: 0, wage: 0, onToday: true, ...(S().shiftCfg || {})});
const hm2min = s => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
function spanMin(start, end){ const a = hm2min(start), b = hm2min(end); if (a == null || b == null) return 0; let d = b - a; if (d <= 0) d += 1440; return d; }
function shiftHours(s){
  if (!s) return 0;
  if (s.mode === 'fixed') return Math.max(0, +s.hours || 0);
  return Math.max(0, spanMin(s.start, s.end) - (+s.pause || 0)) / 60;
}
const numStr = n => (Math.round((+n || 0) * 100) / 100).toLocaleString(LOCALE, {maximumFractionDigits: 2});
const fmtH = h => numStr(h) + ' Std.';
const sgnH = h => (Math.round(h * 100) / 100 >= 0 ? '+' : '−') + fmtH(Math.abs(h));
const shMeta = s => { const t = shType(s.type); return {name: t ? t.name : (s.tname || 'Schicht'), short: t ? t.short : (s.tshort || '?'), color: t ? t.color : (s.tcolor || '#b9ab92')}; };
const shSort = (a, b) => a.date.localeCompare(b.date) || (hm2min(a.start) ?? 9999) - (hm2min(b.start) ?? 9999);
const shiftsOn = ds => all('shift').filter(s => s.date === ds).sort(shSort);
const shiftsIn = (from, to) => all('shift').filter(s => s.date >= from && s.date <= to).sort(shSort);
const monthRange = (y, m) => [`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(daysInMonth(y, m))}`];
const shStart = s => { const d = parse(s.date), m = hm2min(s.start) || 0; d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; };
const shEnd = s => new Date(shStart(s).getTime() + spanMin(s.start, s.end) * 60000);
const shTimeLabel = s => s.mode === 'fixed' ? fmtH(shiftHours(s)) : `${esc(s.start)}–${esc(s.end)}`;
const shBadge = (mt, cls = '') => `<span class="shbadge ${cls}" style="--sc:${mt.color}">${esc(mt.short)}</span>`;
function shiftStats(list){
  const by = {}; let hours = 0, work = 0, count = 0;
  list.forEach(s => {
    const h = shiftHours(s), k = s.type || ('?' + (s.tname || ''));
    hours += h; if (s.mode !== 'fixed') { work += h; count++; }
    (by[k] = by[k] || {n: 0, h: 0, s}).n++; by[k].h += h;
  });
  return {hours, work, count, by, n: list.length};
}
function shFromType(t, ds){
  if (!t) return {date: ds, type: '', mode: 'time', start: '08:00', end: '16:00', pause: 30, tname: 'Schicht', tshort: '?', tcolor: '#b9ab92'};
  const base = {date: ds, type: t.id, tname: t.name, tshort: t.short, tcolor: t.color};
  return t.mode === 'fixed' ? {...base, mode: 'fixed', hours: +t.hours || 0, start: '', end: '', pause: 0} : {...base, mode: 'time', start: t.start, end: t.end, pause: +t.pause || 0};
}

/* Übersicht im Schicht-Bereich */
function shStatTiles(list){
  return `<div class="fin-stats shstats">${list.map(([l, v, c]) => `<div><span>${l}</span><b class="${c || ''}">${v}</b></div>`).join('')}</div>`;
}
function shBreakdown(st){
  const rows = Object.values(st.by).sort((a, b) => b.h - a.h || b.n - a.n);
  if (!rows.length) return '<div class="empty">Noch keine Schichten in diesem Zeitraum.</div>';
  return `<div class="list">${rows.map(v => { const mt = shMeta(v.s); return `<div class="item shrow">${shBadge(mt)}<div class="grow"><div class="t">${esc(mt.name)}</div><div class="s">${v.n}×</div></div><div class="famt">${fmtH(v.h)}</div></div>`; }).join('')}</div>
    <div class="fin-sum">Gesamt: ${fmtH(st.hours)}${Math.abs(st.work - st.hours) > 0.001 ? ` · davon gearbeitet ${fmtH(st.work)}` : ''}</div>`;
}
function shHead(title, attr, isNow){
  const q = Q();
  return `<div class="fin-month"><h2>${q ? QI.schichten + '<span>' + title + '</span>' : '🕒 ' + title}</h2>
    <div class="row"><button class="btn icon" ${attr}="-1" aria-label="zurück">‹</button>${isNow ? '' : `<button class="btn" ${attr}="0">Heute</button>`}<button class="btn icon" ${attr}="1" aria-label="weiter">›</button></div></div>`;
}
const shSwitch = () => `<div class="tabs-sub shsw">${[['month','Monat'],['year','Jahr']].map(([k, l]) => `<button data-shview="${k}" class="${(ui.shView || 'month') === k ? 'on' : ''}">${l}</button>`).join('')}<button class="shset-btn" data-shset>${Q() ? QI.design : '⚙️'} Schichtarten & Soll</button></div>`;

function viewShifts(){
  if (!ui.shMonth) { const d = new Date(); ui.shMonth = [d.getFullYear(), d.getMonth()]; }
  if (!ui.shYear) ui.shYear = new Date().getFullYear();
  return (ui.shView || 'month') === 'year' ? shYearView() : shMonthView();
}
function shMonthView(){
  const [y, m] = ui.shMonth, td = today(), cfg = SHS(), paint = ui.shPaint || '';
  const [from, to] = monthRange(y, m), list = shiftsIn(from, to), st = shiftStats(list);
  const isNow = td >= from && td <= to;
  const tiles = [['Stunden gesamt', fmtH(st.hours)], ['Schichten', String(st.count)]];
  if (cfg.soll > 0) { const d = st.hours - cfg.soll; tiles.push(['Saldo · Soll ' + fmtH(cfg.soll), sgnH(d), d >= 0 ? 'pos' : 'neg']); }
  else tiles.push(['Ø pro Schicht', st.count ? fmtH(st.work / st.count) : '–']);
  if (isNow) tiles.push(['Bis heute', fmtH(shiftStats(list.filter(s => s.date <= td)).hours)]);
  if (cfg.wage > 0) tiles.push(['≈ Brutto', eur(st.hours * cfg.wage), 'pos']);
  const pt = paint && paint !== '__del' ? shType(paint) : null;
  const chips = shTypes().map(t => `<button type="button" data-shpaint="${esc(t.id)}" class="shchip ${paint === t.id ? 'on' : ''}" style="--sc:${t.color}"><b>${esc(t.short)}</b><span>${esc(t.name)}</span></button>`).join('')
    + `<button type="button" data-shpaint="__del" class="shchip del ${paint === '__del' ? 'on' : ''}"><b>×</b><span>Entfernen</span></button>`;
  const hint = pt ? `<span>Tippe auf die Tage, um „${esc(pt.name)}“ einzutragen.</span> <span>Zum Beenden den Knopf nochmal antippen.</span>`
    : paint === '__del' ? '<span>Tippe auf einen Tag, um seine Schicht zu entfernen.</span>'
    : '<span>Tipp: Wähle eine Schicht und tippe dann auf die Tage – so ist dein Dienstplan in Sekunden eingetragen.</span>';
  const first = new Date(y, m, 1), start = addDays(first, -((first.getDay() + 6) % 7));
  let cells = WD.map(w => `<div class="wd">${w}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), ds = ymd(d);
    if (i >= 35 && d.getMonth() !== m) break;
    cells += `<div class="day shday ${d.getMonth() !== m ? 'out' : ''} ${ds === td ? 'today' : ''}" data-shday="${ds}"><div class="n">${d.getDate()}</div>${shiftsOn(ds).map(s => { const mt = shMeta(s); return `<div class="shtag" style="--sc:${mt.color}" ${paint ? '' : `data-edit="${s.id}"`}><b>${esc(mt.short)}</b><span>${numStr(shiftHours(s))}h</span></div>`; }).join('')}</div>`;
  }
  return `<div class="card tape t-butter fin-head" style="margin-top:12px">${shSwitch()}
      ${shHead(`${MONTHS[m]} ${y}`, 'data-shm', isNow)}
      ${shStatTiles(tiles)}
      <div class="fin-actions"><button class="btn primary" data-new="shift" data-date="${isNow ? td : from}">+ Schicht</button><button class="btn" data-shcopy>Monat kopieren</button></div>
    </div>
    <div class="card tape t-sky shplan ${paint ? 'painting' : ''}" style="margin-top:22px">
      <div class="sec-h"><h2>${FH('schichten', '🗓️', 'Dienstplan')}</h2></div>
      <div class="shchips">${chips}</div>
      <div class="hint shhint">${hint}</div>
      <div class="cal shcal">${cells}</div>
    </div>
    <div class="grid g2" style="margin-top:22px">
      <div class="card tape t-peach"><div class="sec-h"><h2>${FH('chart', '📊', 'Aufteilung')}</h2></div>${shBreakdown(st)}</div>
      <div class="card tape t-lav"><div class="sec-h"><h2>${FH('kalender', '📋', 'Alle Schichten')}</h2></div>
        <div class="list">${list.length ? list.map(shiftRow).join('') : '<div class="empty">In diesem Monat ist noch nichts eingetragen.</div>'}</div></div>
    </div>`;
}
function shiftRow(s){
  const mt = shMeta(s), d = parse(s.date);
  return `<div class="item shrow" data-edit="${s.id}"><div class="time shd"><span>${WD[(d.getDay() + 6) % 7]}</span>${d.toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit'})}</div>${shBadge(mt)}
    <div class="grow"><div class="t">${esc(mt.name)}</div><div class="s">${s.mode === 'fixed' ? 'feste Stunden' : `${esc(s.start)}–${esc(s.end)}${+s.pause ? ` · ${+s.pause} Min. Pause` : ''}`}${s.note ? ' · ' + esc(s.note) : ''}</div></div>
    <div class="famt">${fmtH(shiftHours(s))}</div></div>`;
}
function shYearView(){
  const y = ui.shYear, cfg = SHS(), now = new Date(), cy = now.getFullYear();
  const months = [...Array(12)].map((_, m) => { const [a, b] = monthRange(y, m); return {m, st: shiftStats(shiftsIn(a, b))}; });
  const st = shiftStats(shiftsIn(`${y}-01-01`, `${y}-12-31`));
  // Soll zählt erst ab dem ersten Monat mit eingetragenen Schichten (sonst stünden vor dem App-Start lauter Minusstunden)
  const lastM = y < cy ? 11 : y === cy ? now.getMonth() : -1, firstM = months.findIndex(x => x.st.n > 0);
  const sollOn = m => cfg.soll > 0 && firstM >= 0 && m >= firstM && m <= lastM;
  const tiles = [['Stunden gesamt', fmtH(st.hours)], ['Schichten', String(st.count)]];
  if (cfg.soll > 0 && firstM >= 0 && firstM <= lastM) {
    const d = months.filter(x => sollOn(x.m)).reduce((s, x) => s + x.st.hours - cfg.soll, 0);
    tiles.push([firstM < lastM ? `Saldo ${MONTHS[firstM]}–${MONTHS[lastM]}` : `Saldo ${MONTHS[lastM]}`, sgnH(d), d >= 0 ? 'pos' : 'neg']);
  }
  const used = months.filter(x => x.st.n).length;
  tiles.push(['Ø pro Monat', used ? fmtH(st.hours / used) : '–']);
  if (cfg.wage > 0) tiles.push(['≈ Brutto', eur(st.hours * cfg.wage), 'pos']);
  const maxH = Math.max(1, cfg.soll || 0, ...months.map(x => x.st.hours));
  const rows = months.map(x => { const cur = y === cy && x.m === now.getMonth(), d = x.st.hours - cfg.soll;
    return `<div class="shyr ${cur ? 'cur' : ''} ${x.st.n ? '' : 'empty-m'}" data-shmonth="${y}-${x.m}">
      <span class="shyr-m">${MONTHS[x.m]}</span>
      <div class="cbar-track"><i class="cbar-fill tot" style="width:${(x.st.hours / maxH * 100).toFixed(1)}%"></i>${cfg.soll > 0 ? `<i class="cbar-limit" style="left:${(cfg.soll / maxH * 100).toFixed(1)}%"></i>` : ''}</div>
      <span class="shyr-n">${x.st.count}×</span><b>${fmtH(x.st.hours)}</b>
      ${sollOn(x.m) ? `<small class="${d >= 0 ? 'pos' : 'neg'}">${sgnH(d)}</small>` : '<small></small>'}</div>`; }).join('');
  return `<div class="card tape t-butter fin-head" style="margin-top:12px">${shSwitch()}
      ${shHead(`Jahr ${y}`, 'data-shy', y === cy)}
      ${shStatTiles(tiles)}
      <div class="fin-actions"><button class="btn" data-shcopy>Jahr kopieren</button></div>
    </div>
    <div class="grid g2" style="margin-top:22px">
      <div class="card tape t-sky"><div class="sec-h"><h2>${FH('chart', '📊', 'Monate')}</h2>${cfg.soll > 0 ? `<span class="pill">Soll ${fmtH(cfg.soll)}</span>` : ''}</div><div class="shyears">${rows}</div>
        <div class="fin-sum">Gesamt ${y}: ${fmtH(st.hours)} · ${st.count} Schichten</div></div>
      <div class="card tape t-peach"><div class="sec-h"><h2>${FH('schichten', '🕒', 'Schichtarten')}</h2></div>${shBreakdown(st)}</div>
    </div>`;
}

/* Text zum Kopieren (Stundenzettel) */
function shSummaryText(){
  const L = x => LANG === 'en' ? trStr(String(x)) : String(x), cfg = SHS();
  const out = [];
  const typeLines = st => Object.values(st.by).sort((a, b) => b.h - a.h).map(v => `${L(shMeta(v.s).name)}: ${v.n}× · ${L(fmtH(v.h))}`);
  if ((ui.shView || 'month') === 'year') {
    const y = ui.shYear, st = shiftStats(shiftsIn(`${y}-01-01`, `${y}-12-31`));
    out.push(L(`Schichten ${y}`), '');
    for (let m = 0; m < 12; m++) { const [a, b] = monthRange(y, m), ms = shiftStats(shiftsIn(a, b)); if (ms.n) out.push(`${MONTHS[m]}: ${L(fmtH(ms.hours))} (${ms.count}×)`); }
    out.push('', L(`Gesamt: ${fmtH(st.hours)}`), ...typeLines(st));
  } else {
    const [y, m] = ui.shMonth, [a, b] = monthRange(y, m), list = shiftsIn(a, b), st = shiftStats(list);
    out.push(`${L('Schichten')} ${MONTHS[m]} ${y}`, '');
    list.forEach(s => { const d = parse(s.date); out.push(`${WD[(d.getDay() + 6) % 7]} ${d.toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit'})}  ${L(shMeta(s).name)}  ${s.mode === 'fixed' ? '' : `${s.start}–${s.end}${+s.pause ? ` (${L(`${+s.pause} Min. Pause`)})` : ''}  `}${L(fmtH(shiftHours(s)))}${s.note ? '  · ' + s.note : ''}`); });
    out.push('', L(`Gesamt: ${fmtH(st.hours)}`), ...typeLines(st));
    if (cfg.soll > 0) out.push(L(`Soll: ${fmtH(cfg.soll)}`), L(`Saldo: ${sgnH(st.hours - cfg.soll)}`));
  }
  return out.join('\n');
}

/* Schnell eintragen (Pinsel) */
function paintDay(ds){
  const p = ui.shPaint, ex = shiftsOn(ds);
  if (p === '__del') { if (!ex.length) return; ex.forEach(s => items.delete(s.id)); render(); bulkWrite(ex, true).catch(() => {}); return; }
  const t = shType(p); if (!t) return;
  if (ex.length === 1 && ex[0].type === p) { items.delete(ex[0].id); render(); persist(ex[0], true); return; }
  const nw = {...shFromType(t, ds), id: newId('sh'), kind: 'shift', created: Date.now()};
  ex.forEach(s => items.delete(s.id)); items.set(nw.id, nw); render();
  if (ex.length) bulkWrite(ex, true).catch(() => {});
  persist(nw);
}

/* Formular: Schicht */
function shTimeFields(c){
  if (c.mode === 'fixed') return `<input type="hidden" name="mode" value="fixed"><label>Stunden</label><input type="text" name="hours" inputmode="decimal" autocomplete="off" value="${esc(numStr(c.hours))}" placeholder="8"><div class="shcalc" id="shCalc"></div>`;
  return `<input type="hidden" name="mode" value="time"><div class="f3"><div><label>Von</label><input type="time" name="start" value="${esc(c.start)}"></div><div><label>Bis</label><input type="time" name="end" value="${esc(c.end)}"></div><div><label>Pause (Min.)</label><input type="number" name="pause" min="0" step="5" inputmode="numeric" value="${esc(+c.pause || 0)}"></div></div><div class="shcalc" id="shCalc">${shCalcText(c)}</div>`;
}
function shCalcText(c){
  if (c.mode === 'fixed') return '';
  if (hm2min(c.start) == null || hm2min(c.end) == null) return '';
  const night = hm2min(c.end) <= hm2min(c.start);
  return `<b>= ${fmtH(shiftHours(c))}</b>${night ? ' <span>(endet am nächsten Tag)</span>' : ''}`;
}
function updateShCalc(){
  const f = $('#shiftForm'), out = $('#shCalc'); if (!f || !out) return; const el = f.elements; if (!el.start) return;
  out.innerHTML = shCalcText({mode: 'time', start: el.start.value, end: el.end.value, pause: el.pause.value});
}
function shiftForm(it, date){
  const types = shTypes(), t0 = it ? shType(it.type) : types[0];
  editing = {kind: 'shift', id: it ? it.id : null, stype: it ? (it.type || '') : (t0 ? t0.id : ''), confirmDel: false};
  const cur = it || shFromType(t0, date || today());
  const ttl = it ? 'Schicht bearbeiten' : 'Schicht eintragen';
  const del = it ? '<button type="button" class="btn danger" id="delBtn">Löschen</button>' : '<span></span>';
  return `<form id="shiftForm"><h2>${Q() ? QI.schichten + `<span>${ttl}</span>` : '🕒 ' + ttl}</h2>
    <label>Schicht</label><div class="cats shtypes">${types.map(t => `<button type="button" data-shtype="${esc(t.id)}" class="${editing.stype === t.id ? 'on' : ''}">${shBadge(t)}${esc(t.name)}</button>`).join('')}</div>
    <label>Datum</label><input type="date" name="date" required value="${esc(cur.date || date || today())}">
    <div id="shTimes">${shTimeFields(cur)}</div>
    <label>Notiz (optional)</label><input type="text" name="note" value="${esc(it?.note)}" placeholder="z. B. Vertretung, Station 3">
    ${it ? `<div style="margin-top:10px"><button type="button" class="btn" data-new="shift" data-date="${esc(it.date)}">+ Weitere Schicht am selben Tag</button></div>` : ''}
    <div class="actions">${del}<div class="row"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></div></form>`;
}
function pickShiftType(id){
  const t = shType(id); if (!t || !editing) return;
  editing.stype = id;
  document.querySelectorAll('.shtypes button').forEach(b => b.classList.toggle('on', b.dataset.shtype === id));
  const f = $('#shiftForm'); $('#shTimes').innerHTML = shTimeFields(shFromType(t, f.elements.date.value));
}
function saveShift(fd){
  const g = k => (fd.get(k) || '').toString().trim();
  const t = shType(editing.stype), old = editing.id ? items.get(editing.id) : null;
  const base = old ? {...old} : {id: newId('sh'), kind: 'shift', created: Date.now()};
  const mode = g('mode') === 'fixed' ? 'fixed' : 'time';
  Object.assign(base, {date: g('date') || today(), type: editing.stype || '', mode, note: g('note'),
    tname: t ? t.name : (base.tname || 'Schicht'), tshort: t ? t.short : (base.tshort || '?'), tcolor: t ? t.color : (base.tcolor || '#b9ab92')});
  if (mode === 'fixed') { const h = parseAmt(g('hours')); Object.assign(base, {hours: h > 0 ? h : 0, start: '', end: '', pause: 0}); }
  else {
    if (hm2min(g('start')) == null || hm2min(g('end')) == null) { toast('Bitte Beginn und Ende eintragen'); return; }
    Object.assign(base, {start: g('start'), end: g('end'), pause: Math.max(0, parseInt(g('pause'), 10) || 0)}); delete base.hours;
  }
  closeModal(); put(base); toast(old ? 'Gespeichert' : 'Schicht eingetragen');
}

/* Einstellungen: Schichtarten, Soll, Lohn */
let shDraft = null;
function shSettings(){
  editing = {kind: 'shset'};
  const cfg = SHS(), d = shDraft || {}, types = shTypes();
  const soll = d.soll !== undefined ? d.soll : (cfg.soll ? numStr(cfg.soll) : '');
  const wage = d.wage !== undefined ? d.wage : (cfg.wage ? numDE(cfg.wage) : '');
  const onT = d.soll !== undefined ? d.onToday === 'on' : cfg.onToday;
  return `<form id="shSetForm"><h2>${Q() ? QI.schichten + '<span>Schichtarten & Soll</span>' : '🕒 Schichtarten & Soll'}</h2>
    <label>Deine Schichtarten</label>
    <div class="list">${types.length ? types.map(t => `<div class="item shrow" data-shtedit="${esc(t.id)}">${shBadge(t)}<div class="grow"><div class="t">${esc(t.name)}</div><div class="s">${t.mode === 'fixed' ? `${fmtH(+t.hours || 0)} · feste Stunden` : `${esc(t.start)}–${esc(t.end)} · ${+t.pause || 0} Min. Pause · ${fmtH(shiftHours(t))}`}</div></div><span class="pill">›</span></div>`).join('') : '<div class="empty">Noch keine Schichtarten.</div>'}</div>
    <div class="row" style="margin-top:8px"><button type="button" class="btn" data-shtedit="__new">+ Neue Schichtart</button></div>
    <div class="f2"><div><label>Soll-Stunden pro Monat</label><input type="text" name="soll" inputmode="decimal" autocomplete="off" value="${esc(soll)}" placeholder="z. B. 160"></div>
      <div><label>Stundenlohn € (optional)</label><input type="text" name="wage" inputmode="decimal" autocomplete="off" value="${esc(wage)}" placeholder="z. B. 15,50"></div></div>
    <div class="nrow"><label class="chkl"><input type="checkbox" name="onToday" ${onT ? 'checked' : ''}> Schicht-Karte auf der Übersicht zeigen</label></div>
    <p class="hint">Mit Soll-Stunden siehst du Über- und Minusstunden für jeden Monat und fürs Jahr. Mit Stundenlohn zeigt die App einen ungefähren Brutto-Verdienst (ohne Zuschläge).</p>
    <div class="actions"><span></span><div class="row"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></div></form>`;
}
function saveShSettings(fd){
  const g = k => (fd.get(k) || '').toString().trim();
  const soll = parseAmt(g('soll')), wage = parseAmt(g('wage'));
  setSetting({shiftCfg: {soll: soll > 0 ? soll : 0, wage: wage > 0 ? wage : 0, onToday: fd.get('onToday') === 'on'}});
  shDraft = null; closeModal(); render(); toast('Gespeichert');
}
function shTypeTimeFields(t){
  return editing.tmode === 'fixed'
    ? `<label>Stunden pro Tag</label><input type="text" name="hours" inputmode="decimal" autocomplete="off" value="${t && t.mode === 'fixed' ? esc(numStr(t.hours)) : '8'}">`
    : `<div class="f3"><div><label>Von</label><input type="time" name="start" value="${esc(t && t.mode !== 'fixed' ? t.start : '08:00')}"></div><div><label>Bis</label><input type="time" name="end" value="${esc(t && t.mode !== 'fixed' ? t.end : '16:00')}"></div><div><label>Pause (Min.)</label><input type="number" name="pause" min="0" step="5" inputmode="numeric" value="${esc(t && t.mode !== 'fixed' ? (+t.pause || 0) : 30)}"></div></div>`;
}
function shTypeForm(id){
  const t = id && id !== '__new' ? shType(id) : null;
  editing = {kind: 'shtype', id: t ? t.id : null, color: t ? t.color : SH_COLORS[shTypes().length % SH_COLORS.length], tmode: t ? (t.mode || 'time') : 'time', confirmDel: false};
  const ttl = t ? 'Schichtart bearbeiten' : 'Neue Schichtart';
  return `<form id="shTypeForm"><h2>${Q() ? QI.schichten + `<span>${ttl}</span>` : '🕒 ' + ttl}</h2>
    <div class="f2 shname"><div><label>Name</label><input type="text" name="name" required value="${esc(t?.name)}" placeholder="z. B. Frühschicht, Bereitschaft"></div>
      <div><label>Kürzel</label><input type="text" name="short" maxlength="3" required value="${esc(t?.short)}" placeholder="F"></div></div>
    <label>Farbe</label><div class="swatches">${SH_COLORS.map(c => `<button type="button" data-shcolor="${c}" class="${editing.color === c ? 'on' : ''}" style="--sc:${c}" aria-label="Farbe"></button>`).join('')}</div>
    <label>Art</label><div class="tabs-sub shmode"><button type="button" data-shmode="time" class="${editing.tmode === 'time' ? 'on' : ''}">Mit Uhrzeit</button><button type="button" data-shmode="fixed" class="${editing.tmode === 'fixed' ? 'on' : ''}">Feste Stunden (z. B. Urlaub)</button></div>
    <div id="shTypeTimes">${shTypeTimeFields(t)}</div>
    <div class="actions">${t ? '<button type="button" class="btn danger" data-shtdel>Löschen</button>' : '<span></span>'}<div class="row"><button type="button" class="btn" data-shset-back>Zurück</button><button class="btn primary">Speichern</button></div></div></form>`;
}
function saveShType(fd){
  const g = k => (fd.get(k) || '').toString().trim();
  const name = g('name'), short = g('short').slice(0, 3);
  if (!name || !short) { toast('Bitte Name und Kürzel eingeben'); return; }
  const t = {id: editing.id || newId('st'), name, short, color: editing.color, mode: editing.tmode};
  if (t.mode === 'fixed') { const h = parseAmt(g('hours')); t.hours = h > 0 ? h : 0; }
  else { if (hm2min(g('start')) == null || hm2min(g('end')) == null) { toast('Bitte Beginn und Ende eintragen'); return; } Object.assign(t, {start: g('start'), end: g('end'), pause: Math.max(0, parseInt(g('pause'), 10) || 0)}); }
  const list = shTypes().map(x => ({...x}));
  const i = list.findIndex(x => x.id === t.id); if (i >= 0) list[i] = t; else list.push(t);
  setSetting({shiftTypes: list}); render(); openModal(shSettings()); toast('Schichtart gespeichert');
}
function deleteShType(btn){
  if (!editing.confirmDel) { editing.confirmDel = true; btn.textContent = 'Wirklich löschen?'; return; }
  setSetting({shiftTypes: shTypes().filter(x => x.id !== editing.id)}); render(); openModal(shSettings()); toast('Schichtart gelöscht');
}

/* Karte auf der Übersicht */
function shiftTodayCard(){
  const cfg = SHS(); if (!cfg.onToday) return '';
  const now = new Date(), td = today(), q = Q(), any = all('shift').length > 0;
  const todays = shiftsOn(td);
  const running = [...shiftsOn(ymd(addDays(now, -1))), ...todays].find(s => s.mode !== 'fixed' && hm2min(s.start) != null && now >= shStart(s) && now < shEnd(s));
  let head;
  if (running) { const mt = shMeta(running); head = `${shBadge(mt, 'big')}<div class="grow"><div class="t">${esc(mt.name)} läuft</div><div class="s">${shTimeLabel(running)} · noch ${fmtH((shEnd(running) - now) / 36e5)}</div></div>`; }
  else if (todays.length) { const s = todays[0], mt = shMeta(s); head = `${shBadge(mt, 'big')}<div class="grow"><div class="t">Heute: ${esc(mt.name)}</div><div class="s">${shTimeLabel(s)}${s.mode === 'fixed' ? '' : ' · ' + fmtH(shiftHours(s))}${todays.length > 1 ? ` · +${todays.length - 1} weitere` : ''}</div></div>`; }
  else { const nx = all('shift').filter(s => s.date > td).sort(shSort)[0];
    head = `<span class="shbadge big free">–</span><div class="grow"><div class="t">Heute frei</div><div class="s">${nx ? `Nächste Schicht: ${fmtShort(nx.date)} · ${esc(shMeta(nx).name)}${nx.start ? ' · ' + esc(nx.start) : ''}` : 'Trag deinen Dienstplan ein – die Stunden werden automatisch für Monat und Jahr zusammengerechnet.'}</div></div>`; }
  const [a, b] = monthRange(now.getFullYear(), now.getMonth());
  const ms = shiftStats(shiftsIn(a, b)), ys = shiftStats(shiftsIn(`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`));
  const strip = [...Array(7)].map((_, i) => { const ds = ymd(addDays(now, i)), d = parse(ds), ss = shiftsOn(ds);
    return `<button class="shs ${ds === td ? 'today' : ''}" data-shopen="${ds}"><span>${WD[(d.getDay() + 6) % 7]}</span><b>${d.getDate()}</b>${ss.length ? ss.slice(0, 2).map(s => { const mt = shMeta(s); return `<i style="--sc:${mt.color}">${esc(mt.short)}</i>`; }).join('') : '<i class="free">–</i>'}</button>`; }).join('');
  return `<div class="card tape t-butter shcard">
    <div class="sec-h"><h2>${FH('schichten', '🕒', 'Schichten')}</h2><div class="row"><button class="btn" data-new="shift" data-date="${td}">+ Schicht</button><button class="btn" data-tab="schichten">Öffnen</button></div></div>
    <div class="item shnow" ${running || todays.length ? `data-edit="${(running || todays[0]).id}"` : `data-tab="schichten"`}>${head}</div>
    ${any ? `<div class="shstrip">${strip}</div>` : ''}
    <div class="fin-mini"><div><span>${MONTHS[now.getMonth()]}</span><b>${fmtH(ms.hours)}</b></div>${cfg.soll > 0 ? `<div><span>Saldo Monat</span><b class="${ms.hours - cfg.soll >= 0 ? 'pos' : 'neg'}">${sgnH(ms.hours - cfg.soll)}</b></div>` : `<div><span>Schichten</span><b>${ms.count}</b></div>`}<div><span>Jahr ${now.getFullYear()}</span><b>${fmtH(ys.hours)}</b></div></div>
  </div>`;
}

/* Kalender-Anzeige */
function shiftDayList(ds){
  const ss = shiftsOn(ds);
  return ss.length ? `<div class="list shdaylist">${ss.map(s => { const mt = shMeta(s); return `<div class="item shrow" data-edit="${s.id}">${shBadge(mt)}<div class="grow"><div class="t">${esc(mt.name)}</div><div class="s">${shTimeLabel(s)}${s.mode === 'fixed' ? '' : ' · ' + fmtH(shiftHours(s))}</div></div></div>`; }).join('')}</div>` : '';
}
function shiftBands(ds){
  const segs = [];
  shiftsOn(ds).forEach(s => { if (s.mode === 'fixed' || hm2min(s.start) == null) return; const a = hm2min(s.start); segs.push({s, a, b: Math.min(1440, a + spanMin(s.start, s.end))}); });
  shiftsOn(ymd(addDays(parse(ds), -1))).forEach(s => { if (s.mode === 'fixed' || hm2min(s.start) == null) return; const e = hm2min(s.start) + spanMin(s.start, s.end); if (e > 1440) segs.push({s, a: 0, b: e - 1440}); });
  return segs.map(g => { const mt = shMeta(g.s); return `<div class="tshift" data-edit="${g.s.id}" style="top:${g.a / 60 * HH}px;height:${Math.max(16, (g.b - g.a) / 60 * HH)}px;--sc:${mt.color}"><span>${esc(mt.name)} · ${esc(g.s.start)}–${esc(g.s.end)}</span></div>`; }).join('');
}

/* ---------- Nach jedem Rendern ---------- */
let tlScrolled = '';
function afterRender(){
  const tl = $('#tlWrap');
  if (tl && tlScrolled !== ui.sel) { tlScrolled = ui.sel; const now = new Date(); tl.scrollTop = Math.max(0, ((ui.sel === today() ? now.getHours() - 1 : 7) * HH)); }
  if (!tl) tlScrolled = '';
  checkAchievements();
  scheduleNotifications();
  updateFocusPill();
}

/* ---------- Sprache (Deutsch / Englisch) ---------- */
let LANG = 'de';
const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WD_DE = ['Mo','Di','Mi','Do','Fr','Sa','So'], WD_EN = ['Mo','Tu','We','Th','Fr','Sa','Su'];
function langSetting(){ const s = S().lang; if (s) return s; try { return localStorage.getItem('lebensplaner.lang') || 'auto'; } catch(e) { return 'auto'; } }
function resolveLang(){ const l = langSetting(); return l === 'auto' ? ((navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en') : l; }
function applyLang(){
  const l = resolveLang(); if (l === LANG && document.documentElement.lang === l) return false;
  LANG = l; LOCALE = l === 'en' ? 'en-GB' : 'de-DE'; MONTHS = l === 'en' ? MONTHS_EN : MONTHS_DE; WD = l === 'en' ? WD_EN : WD_DE;
  document.documentElement.lang = l; appliedKey = '';
  if (l === 'en') trNode(document.body);
  return true;
}
const D = {
  // Navigation & Überschriften
  'Heute':'Today','Kalender':'Calendar','Aufgaben':'Tasks','Gewohnheiten':'Habits','Finanzen':'Finances','Notizen':'Notes',
  'Übersicht':'Overview','Quests':'Quests','Routinen':'Routines','Logbuch':'Logbook','To-dos':'To-dos','Meine To-dos':'My to-dos',
  'Nächste 7 Tage':'Next 7 days','Heute im Plan':'Today\u2019s plan','Aktive Quests':'Active quests','Quest-Log':'Quest log','Fällige Quests':'Due quests','Fällige To-dos':'Due to-dos',
  'Mein':'My','Lebensplaner':'Life Planner','Lebens':'Life','planer':'planner','Mein Lebensplaner':'My Life Planner',
  // Knöpfe
  '+ Termin':'+ Event','+ Aufgabe':'+ Task','+ Neu':'+ New','+ Gewohnheit':'+ Habit','+ Notiz':'+ Note','+ Quest':'+ Quest','+ Routine':'+ Routine','+ Eintrag':'+ Entry',
  'Mit Details …':'With details …','Mit Details':'With details','Hinzufügen':'Add','Annehmen':'Accept','+ Hinzufügen':'+ Add',
  'Speichern':'Save','Abbrechen':'Cancel','Löschen':'Delete','Wirklich löschen?':'Really delete?','Fertig':'Done','Öffnen':'Open','Ansehen':'View',
  'Kopieren':'Copy','Kopiert ✓':'Copied ✓','Übernehmen':'Transfer','Später':'Later','Start':'Start','Ausblenden':'Hide',
  'Erledigte löschen':'Delete completed','Abgeschlossene löschen (XP bleiben)':'Delete completed (XP stays)','Sicher? Nochmal tippen':'Sure? Tap again',
  'Budgets':'Budgets','Einlösen':'Redeem','+ Einzahlen':'+ Deposit','− Abheben':'− Withdraw','+ Belohnung':'+ Reward','− Ausgabe':'− Expense','+ Einnahme':'+ Income','↻ Fixkosten / Abo':'↻ Fixed cost / subscription',
  'Zurück zur Übersicht':'Back to overview','Fokus':'Focus','Fokus-Timer':'Focus timer','Test senden':'Send test',
  'Monat':'Month','Woche':'Week','Tag':'Day',
  // Leere Zustände
  'Keine Termine heute – Zeit für dich ☕':'No events today – time for yourself ☕','Nichts Dringendes – stark! 🎉':'Nothing urgent – nice! 🎉',
  'Die Woche ist noch frei 🌈':'The week is still free 🌈','Hier ist nichts – genieß es ✨':'Nothing here – enjoy it ✨',
  'Noch keine Gewohnheiten. Kleine tägliche Dinge – Sport, Lesen, Wasser trinken, früh schlafen – kannst du hier abhaken und deine Serie wachsen sehen.':'No habits yet. Tick off small daily things – exercise, reading, drinking water, sleeping early – and watch your streak grow.',
  'Ideen, Einkaufslisten, Ziele – alles, was du festhalten willst.':'Ideas, shopping lists, goals – everything you want to keep.',
  'Keine Termine.':'No events.','Einen Moment … 🌷':'One moment … 🌷','Lade Daten …':'Loading data …',
  'Keine Termine heute. Freie Zeit für dich.':'No events today. Free time for you.','Keine aktiven Quests – alles erledigt.':'No active quests – all done.',
  'Die nächsten 7 Tage sind noch frei.':'The next 7 days are still free.','Keine Quests in dieser Liste.':'No quests in this list.',
  'Noch keine Routinen. Hake tägliche Gewohnheiten wie Training, Lesen oder früh schlafen ab, baue Serien auf und sammle XP.':'No routines yet. Tick off daily habits like training, reading or sleeping early, build streaks and collect XP.',
  'Halte Ideen, Ziele und Listen in deinem Logbuch fest.':'Keep ideas, goals and lists in your logbook.',
  'Ohne Titel':'Untitled',
  // Filter
  'Offen':'Open','Heute & überfällig':'Today & overdue','Erledigt':'Done','Alle':'All','Aktiv':'Active','Abgeschlossen':'Completed',
  'Neue Aufgabe eintippen und Enter drücken':'Type a new task and press Enter','Neue Quest eintippen und Enter drücken':'Type a new quest and press Enter',
  // Formulare
  'Neuer Termin':'New event','Termin bearbeiten':'Edit event','Neues To-do':'New to-do','To-do bearbeiten':'Edit to-do','Neue Gewohnheit':'New habit','Gewohnheit bearbeiten':'Edit habit',
  'Neue Notiz':'New note','Notiz':'Note','Neue Quest':'New quest','Quest bearbeiten':'Edit quest','Neue Routine':'New routine','Routine bearbeiten':'Edit routine','Neuer Eintrag':'New entry','Logbuch-Eintrag':'Logbook entry',
  'Titel':'Title','Datum':'Date','Von':'From','Bis':'To','Kategorie':'Category','Wiederholen':'Repeat','Ort':'Location','Text':'Text','Details':'Details','Name':'Name',
  'Was ist zu tun?':'What needs to be done?','Fällig am':'Due on','Priorität':'Priority','Sticker':'Sticker','Symbol':'Icon','Unteraufgaben':'Subtasks','Neue Unteraufgabe':'New subtask',
  'Nie':'Never','Täglich':'Daily','Wöchentlich':'Weekly','Monatlich':'Monthly','Jährlich':'Yearly','Jährlich (z. B. Geburtstag)':'Yearly (e.g. birthday)','Werktags (Mo–Fr)':'Weekdays (Mon–Fri)',
  'Vierteljährlich':'Quarterly','Halbjährlich':'Half-yearly',
  'Wichtig':'Important','Normal':'Normal','Irgendwann':'Someday','Wichtig · +40 XP':'Important · +40 XP','Normal · +20 XP':'Normal · +20 XP','Irgendwann · +20 XP':'Someday · +20 XP',
  'wichtig':'important','Erinnerung':'Reminder','Keine':'None','Zur Startzeit':'At start time','10 Min. vorher':'10 min before','15 Min. vorher':'15 min before','30 Min. vorher':'30 min before','1 Std. vorher':'1 hour before','2 Std. vorher':'2 hours before','1 Tag vorher':'1 day before',
  'z. B. Zahnarzt':'e.g. dentist','z. B. 30 Min. Training':'e.g. 30 min training','z. B. 30 Min. Bewegung':'e.g. 30 min exercise',
  'Arbeit':'Work','Privat':'Personal','Gesundheit':'Health','Familie':'Family','Sonstiges':'Other',
  'täglich':'daily','wöchentlich':'weekly','monatlich':'monthly','jährlich':'yearly','ganztägig':'all day','ganz-':'all','tägig':'day',
  // Speichern-Meldungen
  'Termin angelegt 🌸':'Event created 🌸','Aufgabe angelegt 🌸':'Task created 🌸','Gewohnheit angelegt 🌸':'Habit created 🌸','Notiz angelegt 🌸':'Note created 🌸','Gespeichert ✨':'Saved ✨',
  'Termin eingetragen':'Event added','Quest angenommen':'Quest accepted','Routine angelegt':'Routine created','Eintrag gespeichert':'Entry saved','Gespeichert':'Saved','Gelöscht':'Deleted',
  'Log aufgeräumt':'Log cleaned up','Erledigte gelöscht':'Completed deleted','Abgemeldet':'Signed out',
  // Startseite
  'Gute Nacht':'Good night','Guten Morgen':'Good morning','Hallo':'Hello','Guten Abend':'Good evening','Noch wach?':'Still awake?','Willkommen zurück':'Welcome back',
  'Termine heute':'Events today','offene Aufgaben':'open tasks','Routinen heute':'Routines today','Beste Serie':'Best streak','Level':'Level',
  'Kleine Schritte sind auch Schritte.':'Small steps are still steps.','Du schaffst das – einen Tag nach dem anderen.':'You\u2019ve got this – one day at a time.',
  'Heute ist ein guter Tag für einen guten Tag.':'Today is a good day for a good day.','Sei lieb zu dir selbst.':'Be kind to yourself.','Fortschritt, nicht Perfektion.':'Progress, not perfection.',
  'Atme durch. Du hast Zeit.':'Breathe. You have time.','Mach heute etwas, worüber dein zukünftiges Ich sich freut.':'Do something today your future self will thank you for.',
  'Ruhe ist auch produktiv.':'Rest is productive too.','Glaub an dich, so wie deine beste Freundin an dich glaubt.':'Believe in yourself the way your best friend does.','Jeder Haken zählt.':'Every tick counts.',
  'Jeder Tag ist ein neues Level.':'Every day is a new level.','Kleine Siege summieren sich.':'Small wins add up.','Disziplin schlägt Motivation.':'Discipline beats motivation.',
  'Heute trainieren, morgen stärker.':'Train today, stronger tomorrow.','Fokus. Eine Quest nach der anderen.':'Focus. One quest at a time.','Dein zukünftiges Ich zählt auf dich.':'Your future self is counting on you.',
  'Fortschritt ist eine Entscheidung.':'Progress is a decision.','Auch Pausen laden Energie auf.':'Breaks recharge you too.','Wer dranbleibt, levelt auf.':'Keep going and you level up.','Mach den ersten Schritt – der Rest folgt.':'Take the first step – the rest will follow.',
  'Neuling':'Novice','Abenteurer':'Adventurer','Pfadfinder':'Pathfinder','Veteran':'Veteran','Meister':'Master','Champion':'Champion','Legende':'Legend',
  'Level aufgestiegen':'Level up','Tippen zum Fortfahren':'Tap to continue','Erfolg freigeschaltet':'Achievement unlocked',
  'Leg z.\u00a0B. „2 Liter Wasser“ oder „10 Min. lesen“ an.':'Add e.g. “2 litres of water” or “read 10 min”.',
  'Lege eine Routine an, z.\u00a0B. „Training“ oder „10 Min. lesen“. Jedes Abhaken bringt +10 XP.':'Create a routine, e.g. “training” or “read 10 min”. Every tick gives +10 XP.',
  'Nächste Abbuchungen':'Upcoming payments','Übrig':'Left','Minus':'Deficit','Ausgaben':'Expenses','Einnahmen':'Income','Budget frei':'Budget left',
  'Dein Wochenrückblick':'Your weekly review','Deine letzte Woche':'Your last week','Routinen-Quote':'Routine rate','Quests erledigt':'Quests done','Termine':'Events','Fokus-Runden':'Focus sessions',
  // Kalender
  'Zahlungen':'Payments','Quest':'Quest',
  // Finanzen
  'Fixkosten / Monat':'Fixed costs / month','Kategorien':'Categories','Fixkosten & Abos':'Fixed costs & subscriptions','Buchungen':'Transactions','Sparziele':'Savings goals','Verlauf (6 Monate)':'History (6 months)',
  'Noch keine Ausgaben in diesem Monat.':'No expenses this month yet.','In diesem Monat gibt es noch keine Buchungen.':'No transactions this month yet.',
  'Trag hier regelmäßige Zahlungen ein – Miete, Handyvertrag, Versicherungen, Streaming-Abos, Fitnessstudio, aber auch dein Gehalt. Sie erscheinen dann automatisch in jedem Monat.':'Add regular payments here – rent, phone contract, insurance, streaming, gym, and also your salary. They then appear automatically every month.',
  'Spar auf etwas hin – Urlaub, Führerschein, neues Handy. Du siehst, wie viel noch fehlt und wie viel du pro Monat zurücklegen musst.':'Save up for something – a holiday, driving licence, new phone. You\u2019ll see how much is missing and how much to put aside each month.',
  'Wohnen':'Housing','Lebensmittel':'Groceries','Mobilität':'Transport','Versicherung':'Insurance','Abos & Medien':'Subscriptions & media','Handy & Internet':'Phone & internet','Freizeit':'Leisure','Kleidung':'Clothing','Sparen':'Savings',
  'Gehalt':'Salary','Nebenjob':'Side job','Kindergeld':'Child benefit','Geschenk':'Gift',
  'Ausgabe':'Expense','Einnahme':'Income','Betrag (€)':'Amount (€)','Neue Buchung':'New transaction','Buchung bearbeiten':'Edit transaction','Buchung eingetragen':'Transaction added','Einnahme eingetragen':'Income added',
  'Fixkosten / Abo / Einkommen':'Fixed cost / subscription / income','Fixkosten bearbeiten':'Edit fixed cost','Fixkosten angelegt':'Fixed cost created','Wie oft?':'How often?',
  'Nächste / erste Zahlung':'Next / first payment','Endet am (optional)':'Ends on (optional)','Kündbar bis (optional) – Erinnerung 7 Tage vorher':'Cancellable until (optional) – reminder 7 days before',
  'z. B. Miete, Netflix, Handyvertrag, Gehalt':'e.g. rent, Netflix, phone contract, salary','z. B. Wocheneinkauf':'e.g. weekly shopping','z. B. Vertragsnummer, kündbar bis …':'e.g. contract number, cancellable until …',
  'Neues Sparziel':'New savings goal','Sparziel bearbeiten':'Edit savings goal','Sparziel angelegt':'Savings goal created','Wofür sparst du?':'What are you saving for?','Zielbetrag (€)':'Target amount (€)','Schon gespart (€)':'Already saved (€)','Bis wann? (optional)':'By when? (optional)',
  'z. B. Urlaub, Führerschein, Notgroschen':'e.g. holiday, driving licence, emergency fund','Gespart:':'Saved:','Sparziel erreicht!':'Savings goal reached!',
  'Monatsbudgets':'Monthly budgets','Wie viel möchtest du pro Monat höchstens ausgeben? Leer lassen = kein Budget.':'How much do you want to spend at most per month? Leave empty = no budget.','Budgets gespeichert':'Budgets saved',
  'Bitte einen gültigen Betrag eingeben':'Please enter a valid amount','Bitte einen gültigen Zielbetrag eingeben':'Please enter a valid target amount','geplant':'planned','beendet':'ended',
  // Profil, Shop, Erfolge
  'Dein Profil':'Your profile','🏆 Dein Profil':'🏆 Your profile','Münzen':'coins','Wochenrückblick':'Weekly review','Belohnungs-Shop':'Reward shop','Erfolge':'Achievements','Zuletzt eingelöst':'Recently redeemed',
  'Leg Belohnungen an, die du dir mit Münzen „kaufen“ kannst – zum Beispiel Pizza bestellen, einen Gaming-Abend oder ein neues Spiel. Für jede 10 XP bekommst du 1 Münze.':'Create rewards you can “buy” with coins – e.g. ordering pizza, a gaming night or a new game. You get 1 coin for every 10 XP.',
  'Neue Belohnung':'New reward','Belohnung bearbeiten':'Edit reward','Belohnung':'Reward','Preis in Münzen':'Price in coins','Belohnung angelegt':'Reward created','Bitte einen Preis eingeben':'Please enter a price',
  'Was gönnst du dir, wenn du genug Münzen gesammelt hast? Für jede 10 XP bekommst du 1 Münze.':'What will you treat yourself to once you have enough coins? You get 1 coin for every 10 XP.',
  'z. B. Pizza bestellen, Gaming-Abend, Kino':'e.g. order pizza, gaming night, cinema','freigeschaltet':'unlocked',
  'Erste Quest':'First quest','Schließe deine erste Quest ab':'Complete your first quest','Quest-Jäger':'Quest hunter','Schließe 10 Quests ab':'Complete 10 quests','Unermüdlich':'Tireless','Schließe 50 Quests ab':'Complete 50 quests',
  'Legendär fleißig':'Legendary hard worker','Schließe 100 Quests ab':'Complete 100 quests','Dranbleiber':'Sticker-to-it','Halte eine Routine 3 Tage am Stück':'Keep a routine 3 days in a row',
  'Eine Woche stark':'One strong week','Halte eine Routine 7 Tage am Stück':'Keep a routine 7 days in a row','Eiserner Wille':'Iron will','Halte eine Routine 30 Tage am Stück':'Keep a routine 30 days in a row',
  'Gewohnheitstier':'Creature of habit','Hake 100 Mal eine Routine ab':'Tick off a routine 100 times','Aufsteiger':'Climber','Erreiche Level 5':'Reach level 5','Erreiche Level 10':'Reach level 10','Erreiche Level 20':'Reach level 20',
  'Gut organisiert':'Well organised','Trage 10 Termine ein':'Add 10 events','Erster Fokus':'First focus','Schließe eine Fokus-Runde ab':'Complete a focus session','Tiefer Fokus':'Deep focus','Schließe 10 Fokus-Runden ab':'Complete 10 focus sessions',
  'Sparfuchs':'Smart saver','Erreiche dein erstes Sparziel':'Reach your first savings goal','Budget-Meister':'Budget master','Halte einen ganzen Monat alle Budgets ein':'Stay within all budgets for a whole month',
  'Gönn dir':'Treat yourself','Löse deine erste Belohnung ein':'Redeem your first reward','Alle Unteraufgaben erledigt – jetzt die Quest abhaken!':'All subtasks done – now tick off the quest!',
  // Fokus
  'Fokus läuft':'Focus running','Woran arbeitest du? (optional)':'What are you working on? (optional)','Dauer':'Duration','Du kannst das Fenster schließen – der Timer läuft weiter.':'You can close this window – the timer keeps running.',
  'Fokus abgebrochen':'Focus cancelled','Arbeite konzentriert an einer Sache, ohne Ablenkung. Wenn die Zeit um ist, bekommst du':'Work on one thing without distractions. When time is up you get','und eine Benachrichtigung':'and a notification',
  // Erinnerungen
  'Erinnerungen':'Reminders','Erinnerungen einschalten':'Turn on reminders','Nur in der Android-App':'Only in the Android app','Erinnerungen kommen als Benachrichtigung aufs Handy. Die Einstellungen hier gelten auch dort.':'Reminders arrive as notifications on your phone. The settings here apply there too.',
  'Ganztägige Termine um':'All-day events at','Fällige Quests / Aufgaben um':'Due quests / tasks at','Abbuchungen (am Vortag) um':'Payments (the day before) at','Offene Routinen um':'Open routines at',
  'Kündigungsfristen von Abos erinnern dich immer 7 Tage vorher. Pro Termin kannst du die Erinnerung im Termin selbst ändern.':'Subscription cancellation deadlines always remind you 7 days before. You can change the reminder for each event in the event itself.',
  'Erinnerungen gespeichert':'Reminders saved','Test kommt in 5 Sekunden':'Test arrives in 5 seconds','Benachrichtigungen sind nicht erlaubt':'Notifications are not allowed','Konnte keine Erinnerung planen':'Could not schedule reminder',
  'Bitte Benachrichtigungen in den Android-Einstellungen erlauben':'Please allow notifications in Android settings',
  // Konto & Daten
  'Konto':'Account','Ohne Konto':'Without account','Abmelden':'Sign out','Anmelden / Konto erstellen':'Sign in / create account','Andere Geräte':'Other devices','Daten':'Data','Importieren':'Import','Exportieren':'Export',
  'Einstellungen':'Settings','Profil & Erfolge':'Profile & achievements','Kalender (.ics) importieren':'Import calendar (.ics)','Konto und alle Daten löschen':'Delete account and all data','Datenschutz':'Privacy',
  'Alles ist gespeichert und wird mit deinen anderen Geräten abgeglichen.':'Everything is saved and synced with your other devices.','Verbinde mit deinem Konto …':'Connecting to your account …',
  'Gerade offline – deine Änderungen werden gespeichert und automatisch abgeglichen, sobald du wieder online bist.':'Offline right now – your changes are saved and synced automatically once you\u2019re back online.',
  'Deine Einträge liegen nur auf diesem Gerät. Melde dich an, damit sie auch auf deinen anderen Geräten erscheinen.':'Your entries are only on this device. Sign in so they also appear on your other devices.',
  'Die Verbindung ist unterbrochen. Prüfe deine Internetverbindung.':'The connection was interrupted. Check your internet connection.',
  'Die Android-App bekommst du hier – danach mit demselben Konto anmelden:':'Get the Android app here – then sign in with the same account:','App herunterladen':'Download app','Am PC öffnest du':'On your PC, open','und meldest dich mit demselben Konto an.':'and sign in with the same account.',
  'Möchtest du sie in dein Konto übernehmen?':'Do you want to move them into your account?','Daten übernehmen?':'Transfer data?','Auf diesem Gerät sind':'There are','gespeichert, die noch nicht in deinem Konto sind. Sollen sie übernommen werden?':'saved on this device that aren\u2019t in your account yet. Transfer them?',
  'Hier sind alle deine Daten. Kopiere den Text und speichere ihn z. B. in einer Notiz oder Datei.':'Here is all your data. Copy the text and save it, e.g. in a note or file.','Als Datei speichern':'Save as file',
  'Wähle eine exportierte Datei (.json) oder füge den Text ein. Vorhandene Einträge bleiben erhalten.':'Choose an exported file (.json) or paste the text. Existing entries are kept.','… oder Text hier einfügen':'… or paste text here',
  'Das ist keine gültige Lebensplaner-Datei':'This is not a valid Life Planner file','Termine importieren':'Import events','Bitte eine .ics-Datei wählen':'Please choose an .ics file','Keine Termine in der Datei gefunden':'No events found in the file',
  'Exportiere deinen Kalender als':'Export your calendar as','-Datei (Outlook: Kalender → Freigeben/Veröffentlichen bzw. „Kalender speichern“; Google Kalender: Einstellungen → Importieren & Exportieren → Exportieren) und wähle sie hier aus.':' file (Outlook: Calendar → Share/Publish or “Save calendar”; Google Calendar: Settings → Import & export → Export) and choose it here.',
  'Dein Konto und':'Your account and','Termine, Aufgaben, Routinen und Notizen werden endgültig gelöscht. Zur Bestätigung gib dein Passwort ein.':'events, tasks, routines and notes will be permanently deleted. Enter your password to confirm.',
  'alle':'all','Endgültig löschen':'Delete permanently','Dein Konto wurde gelöscht':'Your account was deleted','Passwort':'Password','Bitte Text markieren und kopieren':'Please select and copy the text',
  'Konnte nicht speichern':'Could not save','Konnte nicht alles speichern':'Could not save everything','Speichern auf dem Gerät nicht möglich':'Saving on this device is not possible',
  'Speicher voll – bitte alte Einträge löschen':'Storage full – please delete old entries','Keine Berechtigung – Firestore-Regeln prüfen':'No permission – check Firestore rules',
  // Anmeldung
  'Willkommen':'Welcome','Willkommen!':'Welcome!','Mit einem Konto sind deine Termine auf Handy und PC immer gleich.':'With an account your events are always the same on phone and PC.',
  'Anmelden':'Sign in','Konto erstellen':'Create account','E-Mail':'Email','Passwort wiederholen':'Repeat password','Passwort vergessen?':'Forgot password?','Zurück zur Anmeldung':'Back to sign in',
  'Passwort zurücksetzen':'Reset password','Link zum Zurücksetzen senden':'Send reset link','Einen Moment …':'One moment …','Ohne Konto nutzen (nur dieses Gerät)':'Use without account (this device only)',
  'du@beispiel.de':'you@example.com','mindestens 6 Zeichen':'at least 6 characters','E-Mail zum Zurücksetzen wurde gesendet':'Reset email sent','Die Passwörter stimmen nicht überein.':'The passwords don\u2019t match.',
  'Diese E-Mail-Adresse ist ungültig.':'This email address is invalid.','Bitte gib ein Passwort ein.':'Please enter a password.','E-Mail oder Passwort ist falsch.':'Email or password is wrong.',
  'Zu dieser E-Mail gibt es kein Konto.':'There is no account for this email.','Für diese E-Mail gibt es schon ein Konto – melde dich an.':'An account already exists for this email – please sign in.',
  'Das Passwort muss mindestens 6 Zeichen haben.':'The password must have at least 6 characters.','Zu viele Versuche. Bitte warte kurz.':'Too many attempts. Please wait a moment.','Keine Internetverbindung.':'No internet connection.',
  'Bitte melde dich neu an und versuche es dann noch einmal.':'Please sign in again and then try once more.','E-Mail/Passwort-Anmeldung ist in Firebase noch nicht aktiviert.':'Email/password sign-in is not enabled in Firebase yet.',
  // Status
  'Lade …':'Loading …','Verbinde …':'Connecting …','Synchronisiert ☁️':'Synced ☁️','Nicht angemeldet':'Not signed in','Nur auf diesem Gerät gespeichert':'Saved on this device only',
  'Nur auf diesem Gerät · anmelden zum Synchronisieren':'This device only · sign in to sync','Offline – Änderungen werden später abgeglichen':'Offline – changes will sync later','Verbindung unterbrochen':'Connection interrupted','Sync-Fehler – nur auf diesem Gerät':'Sync error – this device only',
  // Design
  'Design':'Design','Stil':'Style','Leuchtfarbe':'Glow colour','Hintergrund':'Background','Sprache':'Language','Automatisch':'Automatic','Deutsch':'Deutsch','English':'English',
  'Quest-Modus ⚔️':'Quest mode ⚔️','Pastell 🌸':'Pastel 🌸','Gold':'Gold','Smaragd':'Emerald','Rubin':'Ruby',
  'Traum ✨':'Dream ✨','Wolken ☁️':'Clouds ☁️','Blümchen 🌼':'Flowers 🌼','Vichy-Karo 🎀':'Gingham 🎀','Herzen 💗':'Hearts 💗','Salbei 🌿':'Sage 🌿','Punktpapier 📓':'Dot grid 📓',
  'Konto & Sync':'Account & sync','Konto, Sync & Daten':'Account, sync & data','Design & Hintergrund':'Design & background','Design wählen':'Choose design','Profil, Shop & Erfolge':'Profile, shop & achievements',
  'erledigt':'done','voriger Monat':'previous month','nächster Monat':'next month','vorige Woche':'previous week','nächste Woche':'next week','voriger Tag':'previous day','nächster Tag':'next day','Termin hinzufügen':'Add event','entfernen':'remove',
  // Schichten
  'Schichten':'Shifts','Dienstplan':'Roster','Aufteilung':'Breakdown','Alle Schichten':'All shifts','Monate':'Months','Schichtarten':'Shift types','Jahr':'Year',
  'Schichtarten & Soll':'Shift types & target','Stunden gesamt':'Total hours','Ø pro Schicht':'Avg. per shift','Bis heute':'Up to today','≈ Brutto':'≈ Gross','Ø pro Monat':'Avg. per month',
  '+ Schicht':'+ Shift','Monat kopieren':'Copy month','Jahr kopieren':'Copy year','Entfernen':'Remove','Saldo':'Balance','Saldo Monat':'Month balance','Stunden':'Hours','Schicht':'Shift',
  'Tippe auf einen Tag, um seine Schicht zu entfernen.':'Tap a day to remove its shift.','Zum Beenden den Knopf nochmal antippen.':'Tap the button again to finish.',
  'Tipp: Wähle eine Schicht und tippe dann auf die Tage – so ist dein Dienstplan in Sekunden eingetragen.':'Tip: pick a shift, then tap the days – your roster is entered in seconds.',
  'Noch keine Schichten in diesem Zeitraum.':'No shifts in this period yet.','In diesem Monat ist noch nichts eingetragen.':'Nothing entered for this month yet.','feste Stunden':'fixed hours',
  'Schicht eintragen':'Add shift','Schicht bearbeiten':'Edit shift','Pause (Min.)':'Break (min)','Notiz (optional)':'Note (optional)','z. B. Vertretung, Station 3':'e.g. covering, ward 3',
  '+ Weitere Schicht am selben Tag':'+ Another shift that day','(endet am nächsten Tag)':'(ends the next day)','Bitte Beginn und Ende eintragen':'Please enter start and end',
  'Schicht eingetragen':'Shift added','Schichtart gespeichert':'Shift type saved','Schichtart gelöscht':'Shift type deleted','Bitte Name und Kürzel eingeben':'Please enter a name and abbreviation',
  'Deine Schichtarten':'Your shift types','+ Neue Schichtart':'+ New shift type','Soll-Stunden pro Monat':'Target hours per month','Stundenlohn € (optional)':'Hourly wage € (optional)',
  'z. B. 160':'e.g. 160','z. B. 15,50':'e.g. 15.50','Schicht-Karte auf der Übersicht zeigen':'Show shift card on the overview','Noch keine Schichtarten.':'No shift types yet.',
  'Mit Soll-Stunden siehst du Über- und Minusstunden für jeden Monat und fürs Jahr. Mit Stundenlohn zeigt die App einen ungefähren Brutto-Verdienst (ohne Zuschläge).':'With target hours you see overtime and undertime for every month and for the year. With an hourly wage the app shows approximate gross pay (without bonuses).',
  'Schichtart bearbeiten':'Edit shift type','Neue Schichtart':'New shift type','Kürzel':'Abbreviation','z. B. Frühschicht, Bereitschaft':'e.g. early shift, on-call','Farbe':'Colour','Art':'Type',
  'Mit Uhrzeit':'With times','Feste Stunden (z. B. Urlaub)':'Fixed hours (e.g. holiday)','Stunden pro Tag':'Hours per day','Zurück':'Back','zurück':'back','weiter':'next',
  'Frühschicht':'Early shift','Spätschicht':'Late shift','Nachtschicht':'Night shift','Urlaub':'Holiday','Krank':'Sick','Heute frei':'Day off today','Schichtbeginn':'Shift start',
  'Trag deinen Dienstplan ein – die Stunden werden automatisch für Monat und Jahr zusammengerechnet.':'Enter your roster – the hours are added up automatically for the month and the year.'
};
const trIn = x => tr1(x) ?? x;
const RX = [
  [/^([+−]?[\d.,]+) Std\.$/, '$1 h'],
  [/^noch ([\d.,]+) Std\.$/, '$1 h left'],
  [/^davon gearbeitet (.+)$/, (m, a) => 'of which worked ' + trIn(a)],
  [/^Gesamt (\d{4}): (.+)$/, (m, a, b) => 'Total ' + a + ': ' + trIn(b)],
  [/^Gesamt: (.+)$/, (m, a) => 'Total: ' + trIn(a)],
  [/^Soll: (.+)$/, (m, a) => 'Target: ' + trIn(a)], [/^Soll (.+)$/, (m, a) => 'Target ' + trIn(a)],
  [/^Saldo: (.+)$/, (m, a) => 'Balance: ' + trIn(a)], [/^Saldo ([^:·]+)$/, 'Balance $1'],
  [/^Jahr (\d{4})$/, 'Year $1'], [/^Schichten (\d{4})$/, 'Shifts $1'], [/^(\d+) Schichten$/, '$1 shifts'],
  [/^(\d+) Min\. Pause$/, '$1 min break'],
  [/^Tippe auf die Tage, um „(.+)“ einzutragen\.$/, (m, a) => 'Tap the days to enter “' + trIn(a) + '”.'],
  [/^(.+) läuft$/, (m, a) => trIn(a) + ' in progress'], [/^Heute: (.+)$/, (m, a) => 'Today: ' + trIn(a)],
  [/^Nächste Schicht: (.+)$/, 'Next shift: $1'],
  [/^(.+) um (\d\d:\d\d) Uhr$/, (m, a, b) => trIn(a) + ' at ' + b], [/^bis (\d\d:\d\d) Uhr$/, 'until $1'],
  [/^noch (\d+) XP bis Level (\d+)$/, '$1 XP to level $2'],
  [/^(\d+) Münzen$/, '$1 coins'],
  [/^(\d+) Münzen · Profil & Shop$/, '$1 coins · Profile & shop'],
  [/^(\d+) Münzen · noch (\d+)$/, '$1 coins · $2 to go'],
  [/^Level (\d+) · Profil ›$/, 'Level $1 · Profile ›'],
  [/^(.+) · Level (\d+)$/, (m, a, b) => (D[a] || a) + ' · Level ' + b],
  [/^noch (.+) frei$/, '$1 left'],
  [/^noch (.+) frei in deinen Budgets$/, '$1 left in your budgets'],
  [/^(.+) über deinen Budgets$/, '$1 over your budgets'],
  [/^(.+) über Budget$/, '$1 over budget'],
  [/^nächste: (.+)$/, 'next: $1'],
  [/^nächstes Mal (.+)$/, 'next time $1'],
  [/^Vorwoche: (.+)$/, 'Last week: $1'],
  [/^im Vergleich zur Vorwoche$/, 'compared to last week'],
  [/^[Kk]ündbar bis (.+?)( – noch 7 Tage)?$/, (m, a, b) => (m[0] === 'K' ? 'Cancel by ' : 'cancel by ') + a + (b ? ' – 7 days left' : '')],
  [/^seit (.+)$/, 'since $1'],
  [/^(\d+) Einträge importiert$/, '$1 entries imported'],
  [/^(\d+) Einträge übernommen$/, '$1 entries transferred'],
  [/^(\d+) Einträge$/, '$1 entries'],
  [/^(\d+) Einträge ohne Konto auf diesem Gerät$/, '$1 entries without account on this device'],
  [/^(\d+) Termine importiert$/, '$1 events imported'],
  [/^\+(\d+) XP$/, '+$1 XP'], [/^−(\d+) XP$/, '−$1 XP'],
  [/^Erledigt! nächstes Mal (.+)$/, 'Done! next time $1'],
  [/^Dir fehlen noch (\d+) Münzen$/, 'You need $1 more coins'],
  [/^Sicher\? −(\d+)$/, 'Sure? −$1'],
  [/^Gönn dir: (.+)$/, 'Enjoy: $1'],
  [/^(.+) eingezahlt$/, '$1 deposited'], [/^(.+) abgehoben$/, '$1 withdrawn'],
  [/^Fokus geschafft! \+(\d+) XP$/, 'Focus complete! +$1 XP'],
  [/^Fokus geschafft! ⏱$/, 'Focus complete! ⏱'],
  [/^\+(\d+) XP – Zeit für eine kurze Pause\.$/, '+$1 XP – time for a short break.'],
  [/^Angemeldet als (.+)$/, 'Signed in as $1'],
  [/^(\d+) Routinen noch offen$/, '$1 routines still open'],
  [/^Routine noch offen: (.+)$/, 'Routine still open: $1'],
  [/^Morgen wird abgebucht: (.+)$/, 'Due tomorrow: $1'],
  [/^Quest fällig: (.+)$/, 'Quest due: $1'], [/^Heute fällig: (.+)$/, 'Due today: $1'], [/^Kündigungsfrist: (.+)$/, 'Cancellation deadline: $1'],
  [/^\+(\d+) XP warten auf dich$/, '+$1 XP await you'],
  [/^In (\d+) Min\.$/, 'In $1 min'], [/^In (\d+(?:[.,]\d+)?) Std\.$/, 'In $1 h'], [/^(\d\d:\d\d) Uhr$/, '$1'],
  [/^Jetzt$/, 'Now'], [/^Morgen$/, 'Tomorrow'], [/^Heute · ganztägig$/, 'Today · all day'],
  [/^\+(\d+) weitere$/, '+$1 more'],
  [/^Standard \((\d+) Min\. vorher\)$/, 'Default ($1 min before)'],
  [/^(\d+) Min\.$/, '$1 min'],
  [/^Finanzen · (.+)$/, 'Finances · $1'],
  [/^≈ (.+) pro Monat$/, '≈ $1 per month'], [/^(.+) pro Jahr$/, '$1 per year'], [/^feste Einnahmen (.+) \/ Monat$/, 'fixed income $1 / month'],
  [/^(.+) pro Monat bis (.+)$/, '$1 per month until $2'],
  [/^(\S+ ?€|€\S+) von (\S+ ?€|€\S+)$/, '$1 of $2'], [/^von (.+)$/, 'of $1'],
  [/^Ø Ausgaben: (.+) \/ Monat$/, 'Avg. expenses: $1 / month'],
  [/^Einnahmen (.+)$/, 'Income $1'], [/^Ausgaben (.+)$/, 'Expenses $1'],
  [/^Tage$/, 'days'], [/^überfällig$/, 'overdue'],
  [/^(\d+) Min\. vorher$/, '$1 min before'],
  [/^Monatlich$/, 'Monthly']
];
function tr1(t){
  if (Object.prototype.hasOwnProperty.call(D, t)) return D[t];
  const qm = t.match(/^„([\s\S]+)“$/); if (qm) { const r = tr1(qm[1]); return r != null ? '“' + r + '”' : null; }
  for (const [re, f] of RX) { if (re.test(t)) return t.replace(re, f); }
  const pm = t.match(/^([^\p{L}\p{N}„"“]+)([\s\S]+)$/u);
  if (pm) { const r = tr1(pm[2]); if (r != null) return pm[1] + r; }
  const sm = t.match(/^([\s\S]+?)([^\p{L}\p{N})]+)$/u);
  if (sm && Object.prototype.hasOwnProperty.call(D, sm[1])) return D[sm[1]] + sm[2];
  if (t.includes(' · ')) { const parts = t.split(' · '), rs = parts.map(p => tr1(p)); if (rs.some(x => x != null)) return parts.map((p, i) => rs[i] ?? p).join(' · '); }
  if (t.includes(' – ')) { const parts = t.split(' – '), rs = parts.map(p => tr1(p)); if (rs.every(x => x != null)) return rs.join(' – '); }
  return null;
}
function trStr(raw){
  const t = raw.trim(); if (!t || !/[A-Za-zÄÖÜäöüß]/.test(t)) return raw;
  const out = tr1(t); if (out == null || out === t) return raw;
  return raw.slice(0, raw.indexOf(t)) + out + raw.slice(raw.indexOf(t) + t.length);
}
function trText(n){ const v = n.nodeValue; if (!v) return; const r = trStr(v); if (r !== v) n.nodeValue = r; }
function trNode(n){
  if (!n) return;
  if (n.nodeType === 3) { if (!n.parentElement || !n.parentElement.closest('textarea,script,style,.no-tr')) trText(n); return; }
  if (n.nodeType !== 1 || n.closest('script,style,.no-tr')) return;
  const els = [n, ...n.querySelectorAll('[placeholder],[title],[aria-label]')];
  els.forEach(el => ['placeholder', 'title', 'aria-label'].forEach(a => { const v = el.getAttribute && el.getAttribute(a); if (v) { const r = trStr(v); if (r !== v) el.setAttribute(a, r); } }));
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, { acceptNode: x => x.parentElement && x.parentElement.closest('textarea,script,style,.no-tr') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const list = []; while (w.nextNode()) list.push(w.currentNode);
  list.forEach(trText);
}
new MutationObserver(muts => {
  if (LANG !== 'en') return;
  for (const m of muts) { if (m.type === 'characterData') trText(m.target); else m.addedNodes.forEach(trNode); if (m.type === 'attributes') trNode(m.target); }
}).observe(document.body, {subtree: true, childList: true, characterData: true});
function langPicker(){
  const cur = langSetting();
  return `<label>Sprache / Language</label><div class="tabs-sub">${[['auto','Automatisch'],['de','Deutsch'],['en','English']].map(([k, l]) => `<button type="button" data-lp-lang="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

/* ---------- modal forms ---------- */
let editing = null;
function openModal(html){ $('#modal').innerHTML = html; $('#scrim').classList.add('open'); setTimeout(()=>{ const f = $('#modal input[type=text], #modal textarea'); f && f.focus(); }, 30); }
function closeModal(){ $('#scrim').classList.remove('open'); editing = null; }
const formIcon = {event:'kalender', task:'aufgaben', habit:'gewohnheiten', note:'notizen'};
const formTitle = (kind, edit) => { const t = T().form[kind][edit?1:0]; return Q() ? QI[formIcon[kind]] + `<span>${t}</span>` : t; };

function formFor(kind, it, date, ftype){
  if (FIN_KINDS.includes(kind)) return finForm(kind, it, date, ftype);
  if (kind === 'reward') return rewardForm(it);
  if (kind === 'shift') return shiftForm(it, date);
  editing = {kind, id: it ? it.id : null, cat: it?.cat || 'privat', emoji: it?.emoji || '🌱', confirmDel:false, subs: (it?.subs || []).map(x => ({...x}))};
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
    <label>Erinnerung</label><select name="remind">${[['','Standard (' + NS().eventMin + ' Min. vorher)'],['none','Keine'],['0','Zur Startzeit'],['10','10 Min. vorher'],['30','30 Min. vorher'],['60','1 Std. vorher'],['120','2 Std. vorher'],['1440','1 Tag vorher']].map(([v,l])=>`<option value="${v}" ${(it?.remind ?? '')===v?'selected':''}>${l}</option>`).join('')}</select>
    <label>Notiz</label><textarea name="note" style="min-height:60px">${esc(it?.note)}</textarea>${act}</form>`;
  if (kind==='task') return `<form id="f"><h2>${formTitle(kind, it)}</h2>
    <label>Was ist zu tun?</label><input type="text" name="title" required value="${esc(it?.title)}">
    <div class="f2"><div><label>Fällig am</label><input type="date" name="due" value="${esc(it ? it.due : (date||''))}"></div>
    <div><label>Priorität</label><select name="prio">${tx.prio.map(([v,l])=>`<option value="${v}" ${(it?.prio||'normal')===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
    <label>Wiederholen</label><select name="trepeat">${Object.entries(TREPEAT).map(([v,l])=>`<option value="${v}" ${(it?.repeat||'none')===v?'selected':''}>${l}</option>`).join('')}</select>
    <label>Unteraufgaben</label><div id="subsBox">${subsEditor()}</div>
    <div class="row sub-add"><input type="text" id="subNew" placeholder="Neue Unteraufgabe" autocomplete="off"><button type="button" class="btn" data-sub-add>+ Hinzufügen</button></div>
    <label>Details</label><textarea name="note" style="min-height:60px">${esc(it?.note)}</textarea>${act}</form>`;
  if (kind==='habit') return `<form id="f"><h2>${formTitle(kind, it)}</h2>
    <label>Name</label><input type="text" name="name" required value="${esc(it?.name)}" placeholder="z. B. 30 Min. Training">
    <label>${tx.form.icon}</label><div class="emojis">${HABIT_EMOJIS.map(e=>`<button type="button" data-emoji="${e}" class="${editing.emoji===e?'on':''}">${Q() ? QHAB[e] : e}</button>`).join('')}</div>${act}</form>`;
  if (kind==='note') return `<form id="f"><h2>${formTitle(kind, it)}</h2>
    <label>Titel</label><input type="text" name="title" value="${esc(it?.title)}">
    <label>Text</label><textarea name="body" style="min-height:220px">${esc(it?.body)}</textarea>${act}</form>`;
}

function submitForm(fd){
  if (editing && FIN_KINDS.includes(editing.kind)) return finSubmit(fd);
  if (editing && editing.kind === 'reward') { const old = editing.id ? items.get(editing.id) : null; const cost = Math.round(parseAmt((fd.get('cost')||'').toString())); if (!(cost > 0)) { toast('Bitte einen Preis eingeben'); return; } const it = {...(old || {id: newId('w'), kind: 'reward', created: Date.now()}), name: (fd.get('name')||'').toString().trim(), cost, emoji: editing.emoji}; closeModal(); put(it); toast(old ? 'Gespeichert' : 'Belohnung angelegt'); return; }
  if (editing && editing.kind === 'task') syncSubsFromDom();
  const {kind, id} = editing;
  const old = id ? items.get(id) : null;
  const base = old ? {...old} : {id: newId(kind[0]), kind, created: Date.now()};
  const g = k => (fd.get(k)||'').toString().trim();
  if (kind==='event') Object.assign(base, {title:g('title'), date:g('date'), start:g('start'), end:g('end'), cat:editing.cat, repeat:g('repeat'), place:g('place'), note:g('note'), remind:g('remind')});
  if (kind==='task') { Object.assign(base, {title:g('title'), due:g('due'), prio:g('prio'), note:g('note'), done: old?.done||false, repeat: g('trepeat') || 'none', subs: (editing.subs || []).map(x => ({...x, t: x.t.trim()})).filter(x => x.t)}); if (base.repeat !== 'none' && !base.due) base.due = today(); }
  if (kind==='habit') Object.assign(base, {name:g('name'), emoji:editing.emoji, done: old?.done||{}});
  if (kind==='note') { Object.assign(base, {title:g('title'), body:fd.get('body')||'', updated:Date.now()}); if(!base.title && !base.body.trim()) { closeModal(); return; } }
  closeModal(); put(base);
  toast(old ? T().saved.edit : T().saved[kind]);
}

/* ---------- events ---------- */
function refreshDesign(){ appliedKey = ''; render(); $('#modal').innerHTML = designPicker(); }
const CLICK_SEL = '[data-tab],[data-new],[data-edit],[data-toggle-task],[data-toggle-habit],[data-sel],[data-cal],[data-tf],[data-subtoggle],[data-sub-add],[data-sub-del],[data-redeem],[data-calview],[data-calnav],[data-dayopen],[data-focus-open],[data-focus-stop],[data-fdur],[data-notif-open],[data-notif-test],[data-ics-open],[data-fm],[data-fset],[data-fcat],[data-budget-open],[data-deposit],[data-dep],[data-cat],[data-emoji],[data-lp-bg],[data-lp-theme],[data-lp-acc],[data-lp-lang],[data-bgmenu],[data-accmenu],[data-close],[data-lvlclose],[data-auth-mode],[data-auth-local],[data-login],[data-logout],[data-migrate],[data-import-open],[data-export],[data-export-dl],[data-copy-export],[data-copy],[data-delacc-open],[data-shday],[data-shpaint],[data-shview],[data-shm],[data-shy],[data-shmonth],[data-shset],[data-shcopy],[data-shopen],[data-shtype],[data-shtedit],[data-shcolor],[data-shmode],[data-shtdel],[data-shset-back],#delBtn,#clearDone';
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
  if (t.hasAttribute('data-ics-open')) { showICSImport(); return; }
  if (t.hasAttribute('data-notif-open')) { openModal(notifForm()); return; }
  if (t.hasAttribute('data-notif-test')) { testNotif(); return; }
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
  if (t.dataset.subtoggle) { e.stopPropagation(); const [a, b] = t.dataset.subtoggle.split('|'); toggleSub(a, b); return; }
  if (t.hasAttribute('data-sub-add')) { addSub(); return; }
  if (t.dataset.subDel !== undefined) { syncSubsFromDom(); editing.subs.splice(+t.dataset.subDel, 1); $('#subsBox').innerHTML = subsEditor(); return; }
  if (t.dataset.redeem) { redeem(t.dataset.redeem, t); return; }
  if (t.dataset.calview) { ui.calView = t.dataset.calview; render(); return; }
  if (t.dataset.calnav) { calNav(+t.dataset.calnav); return; }
  if (t.dataset.dayopen) { ui.sel = t.dataset.dayopen; ui.calView = 'day'; render(); window.scrollTo(0,0); return; }
  if (t.hasAttribute('data-focus-open')) { openModal(focusForm()); return; }
  if (t.hasAttribute('data-focus-stop')) { stopFocus(); return; }
  if (t.dataset.fdur) { editing.fdur = +t.dataset.fdur; document.querySelectorAll('.ftime button').forEach(b => b.classList.toggle('on', b === t)); return; }
  /* Schichten */
  if (t.dataset.shday) { if (ui.shPaint) { paintDay(t.dataset.shday); return; } const ex = shiftsOn(t.dataset.shday); openModal(shiftForm(ex[0] || null, t.dataset.shday)); return; }
  if (t.dataset.shopen) { const ex = shiftsOn(t.dataset.shopen); openModal(shiftForm(ex[0] || null, t.dataset.shopen)); return; }
  if (t.dataset.shpaint) { ui.shPaint = ui.shPaint === t.dataset.shpaint ? '' : t.dataset.shpaint; render(); return; }
  if (t.dataset.shview) { ui.shView = t.dataset.shview; ui.shPaint = ''; render(); return; }
  if (t.dataset.shm) { const v = +t.dataset.shm, d = v === 0 ? new Date() : new Date(ui.shMonth[0], ui.shMonth[1] + v, 1); ui.shMonth = [d.getFullYear(), d.getMonth()]; render(); return; }
  if (t.dataset.shy) { const v = +t.dataset.shy; ui.shYear = v === 0 ? new Date().getFullYear() : ui.shYear + v; render(); return; }
  if (t.dataset.shmonth) { const [yy, mm] = t.dataset.shmonth.split('-').map(Number); ui.shMonth = [yy, mm]; ui.shView = 'month'; render(); window.scrollTo(0, 0); return; }
  if (t.hasAttribute('data-shset')) { shDraft = null; openModal(shSettings()); return; }
  if (t.hasAttribute('data-shcopy')) { copyText(shSummaryText(), t); return; }
  if (t.dataset.shtype) { pickShiftType(t.dataset.shtype); return; }
  if (t.dataset.shtedit) { const f = $('#shSetForm'); if (f) { const fd = new FormData(f); shDraft = {soll: (fd.get('soll') || '').toString(), wage: (fd.get('wage') || '').toString(), onToday: fd.get('onToday') === 'on' ? 'on' : ''}; } openModal(shTypeForm(t.dataset.shtedit)); return; }
  if (t.dataset.shcolor) { editing.color = t.dataset.shcolor; document.querySelectorAll('.swatches button').forEach(b => b.classList.toggle('on', b === t)); return; }
  if (t.dataset.shmode) { const f = $('#shTypeForm'), cur = editing.id ? shType(editing.id) : null; editing.tmode = t.dataset.shmode; document.querySelectorAll('.shmode button').forEach(b => b.classList.toggle('on', b === t)); $('#shTypeTimes').innerHTML = shTypeTimeFields(cur); return; }
  if (t.hasAttribute('data-shtdel')) { deleteShType(t); return; }
  if (t.hasAttribute('data-shset-back')) { openModal(shSettings()); return; }
  if (t.dataset.tab) { e.preventDefault(); if ($('#scrim').classList.contains('open')) closeModal(); ui.tab = t.dataset.tab; try{localStorage.setItem('lebensplaner.tab',ui.tab)}catch(_){} render(); window.scrollTo(0,0); return; }
  if (t.dataset.new) { openModal(formFor(t.dataset.new, null, t.dataset.date, t.dataset.ftype)); return; }
  if (t.dataset.edit) { const it = items.get(t.dataset.edit); if (it) openModal(formFor(it.kind, it)); return; }
  if (t.dataset.sel) { ui.sel = t.dataset.sel; const d = parse(ui.sel); if (d.getMonth()!==ui.calMonth[1]) ui.calMonth=[d.getFullYear(),d.getMonth()]; render(); return; }
  if (t.dataset.cal) { const v = +t.dataset.cal; if (v===0) { ui.sel = today(); const d=new Date(); ui.calMonth=[d.getFullYear(),d.getMonth()]; } else { const d = new Date(ui.calMonth[0], ui.calMonth[1]+v, 1); ui.calMonth=[d.getFullYear(),d.getMonth()]; } render(); return; }
  if (t.dataset.tf) { ui.taskFilter = t.dataset.tf; render(); return; }
  if (t.dataset.fm) { const v = +t.dataset.fm; const d = v === 0 ? new Date() : new Date(ui.finMonth[0], ui.finMonth[1] + v, 1); ui.finMonth = [d.getFullYear(), d.getMonth()]; render(); return; }
  if (t.dataset.fset) { editing.ftype = t.dataset.fset; editing.fcat = t.dataset.fset === 'income' ? 'gehalt' : (editing.kind === 'recurring' ? 'wohnen' : 'lebensmittel'); document.querySelectorAll('.ftype button').forEach(b => b.classList.toggle('on', b === t)); const fc = $('#fcats'); if (fc) fc.innerHTML = fcatButtons(); return; }
  if (t.dataset.fcat) { editing.fcat = t.dataset.fcat; document.querySelectorAll('#fcats button').forEach(b => b.classList.toggle('on', b === t)); return; }
  if (t.hasAttribute('data-budget-open')) { openModal(budgetForm()); return; }
  if (t.dataset.deposit) { openModal(depositForm(t.dataset.deposit)); return; }
  if (t.dataset.dep) { doDeposit(t.dataset.dep); return; }
  if (t.dataset.cat) { editing.cat = t.dataset.cat; document.querySelectorAll('.cats button').forEach(b=>b.classList.toggle('on', b===t)); return; }
  if (t.dataset.lpTheme) { const v = t.dataset.lpTheme; if (v === 'quest' || v === 'pastel') { theme = v; setSetting({theme}); refreshDesign(); } return; }
  if (t.dataset.lpAcc) { const v = t.dataset.lpAcc; if (ACCS.some(a => a[0] === v)) { accent = v; setSetting({accent}); refreshDesign(); } return; }
  if (t.dataset.lpLang) { const v = t.dataset.lpLang; if (['auto','de','en'].includes(v)) { setSetting({lang: v}); try { localStorage.setItem('lebensplaner.lang', v); } catch(_) {} applyLang(); refreshDesign(); setStatus($('#status').textContent); } return; }
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
    bankXP(done.reduce((s,x)=>s+taskXP(x),0)); setSetting({questsBank: (+(S().questsBank || 0)) + done.length});
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
  if (id === 'budgetForm') { saveBudgets(new FormData(e.target)); return; }
  if (id === 'focusForm') { startFocus(new FormData(e.target)); return; }
  if (id === 'notifForm') { saveNotif(e.target); return; }
  if (id === 'icsForm') { const f = $('#icsFile') && $('#icsFile').files[0]; if (!f) { toast('Bitte eine .ics-Datei wählen'); return; } const rd = new FileReader(); rd.onload = () => { const list = parseICS(String(rd.result || '')); if (!list.length) { toast('Keine Termine in der Datei gefunden'); return; } importItems(list); closeModal(); toast(list.length + ' Termine importiert'); }; rd.readAsText(f); return; }
  if (id === 'depositForm') { doDeposit('in'); return; }
  if (id === 'shiftForm') { saveShift(new FormData(e.target)); return; }
  if (id === 'shSetForm') { saveShSettings(new FormData(e.target)); return; }
  if (id === 'shTypeForm') { saveShType(new FormData(e.target)); return; }
  if (id === 'f') submitForm(new FormData(e.target));
  if (id === 'quickTask') {
    const v = $('#quickTitle').value.trim(); if (!v) return;
    put({id:newId('t'), kind:'task', title:v, due:'', prio:'normal', note:'', done:false, created:Date.now()});
    if (Q()) toast(T().saved.task);
    setTimeout(()=>{ const q=$('#quickTitle'); q && q.focus(); },0);
  }
});
document.addEventListener('input', e => { if (e.target && e.target.closest && e.target.closest('#shiftForm')) updateShCalc(); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'subNew') { e.preventDefault(); addSub(); return; } if (e.key==='Escape') { if ($('#scrim').classList.contains('open')) closeModal(); $('#lvlup').classList.remove('show'); } });
/* ---------- start ---------- */
function startLocal(msg){
  stopCloud();
  backend = 'local'; items = new Map(); loadLocal(); achReady = true;
  setStatus(msg || (FB_READY ? 'Nur auf diesem Gerät · anmelden zum Synchronisieren' : 'Nur auf diesem Gerät gespeichert'), 'local');
  render();
}
function stopCloud(){ achReady = false; if (fb.unsub) { fb.unsub(); fb.unsub = null; } }
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
    if (!snap.metadata.fromCache) { clearTimeout(timer); first = false; achReady = true; setStatus('Synchronisiert ☁️', 'ok'); }
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
  if (focus) tickFocus();
  if (IS_NATIVE) { let asked = false; try { asked = localStorage.getItem('lebensplaner.notifAsked') === '1'; localStorage.setItem('lebensplaner.notifAsked', '1'); } catch(e) {} if (!asked) setTimeout(() => askNotifPermission().then(ok => { if (ok) scheduleNotifications(); }), 2500); }
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
