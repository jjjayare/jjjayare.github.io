/* votes.js - likes/dislikes, owner-only play and download stats, recent/a-z sorting,
   approved-only comments, and a blog section. Type "ledger" on the page to open the owner panel. */
(async () => {
const CFG = {
  apiKey: "AIzaSyCbTTkwh6BEBRAgNxZxcZ-QaRqtVBIZdeM",
  authDomain: "jayare-d3dc4.firebaseapp.com",
  projectId: "jayare-d3dc4",
  storageBucket: "jayare-d3dc4.firebasestorage.app",
  messagingSenderId: "738612057691",
  appId: "1:738612057691:web:28d338a1e10c451313917e"
};
const ADMIN_UID = "PASTE_ADMIN_UID_HERE";
const V = "https://www.gstatic.com/firebasejs/10.12.2/";
const TAB_OK = ["beats","loops","kits"];
/* date each track was added, for "recent" sorting. key = tab:track name, value = YYYY-MM-DD */
const ADDED = {
  "beats:sega": "2026-10-20"
};
let FS, AU, db, auth, uid, mine = {}, sortMode = "recent", adminOpen = false;
const keyOf = it => (it.preview || "").replace(/[^A-Za-z0-9]+/g, "_");
const isAdmin = () => !!auth && !!auth.currentUser && auth.currentUser.uid === "hASu4ZEGlEezXCfgVRnWEu1rmDp2";

try {
  const { initializeApp } = await import(V + "firebase-app.js");
  AU = await import(V + "firebase-auth.js");
  FS = await import(V + "firebase-firestore.js");
  const app = initializeApp(CFG);
  db = FS.getFirestore(app);
  auth = AU.getAuth(app);
  uid = (await AU.signInAnonymously(auth)).user.uid;
  await loadMine();
  AU.onAuthStateChanged(auth, async u => {
    if (!u) { uid = (await AU.signInAnonymously(auth)).user.uid; await loadMine(); }
    else if (u.uid !== uid) { uid = u.uid; await loadMine(); }
    renderAdmin();
  });
} catch (e) { console.warn("votes off:", e); return; }

const st = document.createElement("style");
st.textContent = `
.row.v{grid-template-columns:auto auto 1fr auto}
.vote{display:flex;gap:4px;align-items:center}
.vote button{font:14px var(--f);background:var(--bg);border:1px solid var(--ink);padding:3px 8px;cursor:pointer;color:var(--ink)}
.vote button.on{background:var(--red);color:#fff;border-color:var(--red)}
.cm{grid-column:1/-1;justify-self:start;background:none;border:0;padding:0;font:15px var(--f);cursor:pointer;color:var(--link);text-decoration:underline}
.cbox{grid-column:1/-1;border:1px solid var(--ink);padding:8px;font-size:15px}
.cbox p{margin:0 0 8px}
.cbox input,.cbox textarea{display:block;font:15px var(--f);width:100%;margin:0 0 6px;border:1px solid var(--ink);background:#fff;padding:5px}
.cbox button{font:15px var(--f);padding:4px 12px;cursor:pointer}
.sortbar{font-size:15px;margin:0 0 8px}
.sortbar button{font:inherit;background:none;border:0;padding:0 6px;cursor:pointer;color:var(--link);text-decoration:underline}
.sortbar button[aria-pressed=true]{color:var(--ink);text-decoration:none;font-weight:600}
.post{border:2px solid var(--ink);background:#fff;padding:10px;margin-bottom:12px}
.ptext{white-space:pre-wrap;margin:6px 0 8px}
#adm{margin-top:14px;border:2px solid var(--ink);background:var(--paper);padding:12px;font:15px var(--f)}
#adm input,#adm textarea{display:block;width:100%;font:15px var(--f);margin:0 0 6px;border:1px solid var(--ink);padding:5px}
#adm button{font:15px var(--f);padding:4px 12px;margin:4px 6px 4px 0;cursor:pointer}
#adm table{width:100%;border-collapse:collapse;margin:8px 0}
#adm td,#adm th{border-bottom:1px dashed var(--ink);text-align:left;padding:3px 4px}`;
document.head.append(st);

async function loadMine() {
  mine = {};
  try {
    (await FS.getDocs(FS.query(FS.collection(db, "votes"), FS.where("uid", "==", uid))))
      .forEach(d => mine[d.data().item] = d.data().v);
  } catch (e) { console.warn(e); }
}

/* like/dislike toggle. Counts are stored in items/{key} and only you can read them. */
async function vote(key, title, dir) {
  const vref = FS.doc(db, "votes", uid + "_" + key), iref = FS.doc(db, "items", key);
  return FS.runTransaction(db, async tx => {
    const [vs, is] = await Promise.all([tx.get(vref), tx.get(iref)]);
    const old = vs.exists() ? vs.data().v : 0, nv = old === dir ? 0 : dir;
    const cur = is.exists() ? is.data() : {};
    const likes = (cur.likes || 0) + (nv === 1) - (old === 1);
    const dislikes = (cur.dislikes || 0) + (nv === -1) - (old === -1);
    tx.set(iref, { title, likes, dislikes }, { merge: true });
    tx.set(vref, { uid, item: key, v: nv });
    return nv;
  });
}
function bump(key, title, field) {
  FS.setDoc(FS.doc(db, "items", key), { title, [field]: FS.increment(1) }, { merge: true })
    .catch(e => console.warn(e));
}
function voteBox(key, title) {
  const like = el("button", { textContent: "like" }), dis = el("button", { textContent: "dislike" });
  const paint = () => { like.className = mine[key] === 1 ? "on" : ""; dis.className = mine[key] === -1 ? "on" : ""; };
  const go = async d => { try { mine[key] = await vote(key, title, d); paint(); } catch (e) { console.warn(e); } };
  like.onclick = () => go(1); dis.onclick = () => go(-1); paint();
  return el("div", { className: "vote" }, [like, dis]);
}

async function loadComments(key, panel) {
  panel.replaceChildren(el("p", { textContent: "loading..." }));
  const list = [];
  try {
    (await FS.getDocs(FS.query(FS.collection(db, "comments"), FS.where("item", "==", key), FS.where("approved", "==", true))))
      .forEach(d => list.push(d.data()));
  } catch (e) { console.warn(e); }
  list.sort((a, b) => ((a.t && a.t.seconds) || 0) - ((b.t && b.t.seconds) || 0));
  panel.replaceChildren();
  if (!list.length) panel.append(el("p", { textContent: "no comments yet." }));
  list.forEach(c => panel.append(el("p", {}, [el("b", { textContent: c.name + ": " }), c.text])));
  const name = el("input", { placeholder: "name", maxLength: 30 });
  const text = el("textarea", { placeholder: "say something (300 characters max)", maxLength: 300, rows: 2 });
  const go = el("button", { textContent: "post" }), msg = el("small");
  go.onclick = async () => {
    const t = text.value.trim(); if (!t) return; go.disabled = true;
    try {
      await FS.addDoc(FS.collection(db, "comments"), { item: key, name: (name.value.trim() || "anon").slice(0, 30), text: t.slice(0, 300), approved: false, t: FS.serverTimestamp() });
      text.value = ""; msg.textContent = " sent. it shows up once approved.";
    } catch (e) { msg.textContent = " couldn't send. try again later."; console.warn(e); }
    go.disabled = false;
  };
  panel.append(name, text, go, msg);
}

const origRow = window.row, origShow = window.show;
window.row = function (item, tab) {
  const r = origRow(item, tab);
  if (!item.preview || item.preview.startsWith("secret/")) return r;
  const key = keyOf(item), title = item.title;
  r.dataset.key = key;
  r.dataset.added = ADDED[tab + ":" + title] || "";
  r.classList.add("v");
  r.prepend(voteBox(key, title));
  const pb = r.querySelector(".play");
  pb.addEventListener("click", () => setTimeout(() => {
    if (pb.getAttribute("aria-pressed") === "true") bump(key, title, "plays");
  }, 0));
  r.querySelector("a").addEventListener("click", () => bump(key, title, "downloads"));
  const cm = el("button", { className: "cm", textContent: "comments" }), panel = el("div", { className: "cbox" });
  panel.hidden = true;
  cm.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden && !panel.dataset.l) { panel.dataset.l = 1; loadComments(key, panel); } };
  r.append(cm, panel);
  return r;
};

/* ---------- blog (everyone reads, only you post) ---------- */
async function renderPosts(v) {
  const box = el("div");
  v.append(box);
  box.append(el("p", { textContent: "loading..." }));
  const posts = [];
  try {
    (await FS.getDocs(FS.query(FS.collection(db, "posts"), FS.where("published", "==", true))))
      .forEach(d => posts.push({ id: d.id, ...d.data() }));
  } catch (e) { console.warn(e); }
  posts.sort((a, b) => ((b.t && b.t.seconds) || 0) - ((a.t && a.t.seconds) || 0));
  box.replaceChildren();
  if (!posts.length) box.append(el("p", { textContent: "nothing posted yet." }));
  posts.forEach(p => {
    const when = p.t ? new Date(p.t.seconds * 1000).toLocaleDateString() : "";
    box.append(el("div", { className: "post" }, [
      el("div", { className: "m", textContent: when }),
      el("p", { className: "ptext", textContent: p.text }),
      voteBox("post_" + p.id, p.text.slice(0, 40))
    ]));
  });
}

/* ---------- owner panel (type "ledger" on the page) ---------- */
async function loadStats(box) {
  box.replaceChildren(el("p", { textContent: "loading..." }));
  const rows = [];
  try {
    (await FS.getDocs(FS.collection(db, "items"))).forEach(d => rows.push({ id: d.id, ...d.data() }));
  } catch (e) { box.replaceChildren(el("p", { textContent: "couldn't load stats: " + e.message })); return; }
  rows.sort((a, b) => (b.plays || 0) - (a.plays || 0));
  const tbl = el("table");
  tbl.append(el("tr", {}, ["track", "plays", "downloads", "likes", "dislikes"].map(h => el("th", { textContent: h }))));
  rows.forEach(r => tbl.append(el("tr", {}, [
    el("td", { textContent: (r.title || r.id).slice(0, 40) }),
    el("td", { textContent: r.plays || 0 }),
    el("td", { textContent: r.downloads || 0 }),
    el("td", { textContent: r.likes || 0 }),
    el("td", { textContent: r.dislikes || 0 })
  ])));
  box.replaceChildren(tbl);
}
async function loadPending(box) {
  box.replaceChildren(el("p", { textContent: "loading..." }));
  const list = [];
  try {
    (await FS.getDocs(FS.query(FS.collection(db, "comments"), FS.where("approved", "==", false))))
      .forEach(d => list.push({ id: d.id, ...d.data() }));
  } catch (e) { box.replaceChildren(el("p", { textContent: "couldn't load comments." })); return; }
  box.replaceChildren();
  if (!list.length) box.append(el("p", { textContent: "no comments waiting." }));
  list.forEach(c => {
    const ok = el("button", { textContent: "approve" }), no = el("button", { textContent: "delete" });
    ok.onclick = async () => { await FS.updateDoc(FS.doc(db, "comments", c.id), { approved: true }); loadPending(box); };
    no.onclick = async () => { await FS.deleteDoc(FS.doc(db, "comments", c.id)); loadPending(box); };
    box.append(el("p", {}, [el("b", { textContent: c.name + " on " + c.item + ": " }), c.text]), ok, no);
  });
}
async function renderAdmin() {
  let p = document.getElementById("adm");
  if (!p) { p = el("div", { id: "adm" }); document.querySelector("main").append(p); }
  p.hidden = !adminOpen;
  if (!adminOpen) return;
  p.replaceChildren();
  if (!isAdmin()) {
    const em = el("input", { type: "email", placeholder: "email" }), pw = el("input", { type: "password", placeholder: "password" });
    const msg = el("small"), go = el("button", { textContent: "sign in" });
    go.onclick = async () => {
      try { await AU.signInWithEmailAndPassword(auth, em.value.trim(), pw.value); }
      catch (e) { msg.textContent = " that didn't work."; }
    };
    p.append(el("p", { textContent: "owner sign in" }), em, pw, go, msg);
    return;
  }
  const out = el("button", { textContent: "sign out" });
  out.onclick = () => AU.signOut(auth);
  const statsBox = el("div"), penBox = el("div");
  const refresh = el("button", { textContent: "refresh stats" }); refresh.onclick = () => loadStats(statsBox);
  const pen = el("button", { textContent: "check comments" }); pen.onclick = () => loadPending(penBox);
  const ta = el("textarea", { rows: 3, placeholder: "write a post" });
  const post = el("button", { textContent: "post" }), pm = el("small");
  post.onclick = async () => {
    const t = ta.value.trim(); if (!t) return;
    try {
      await FS.addDoc(FS.collection(db, "posts"), { text: t.slice(0, 1000), published: true, t: FS.serverTimestamp() });
      ta.value = ""; pm.textContent = " posted.";
    } catch (e) { pm.textContent = " couldn't post."; console.warn(e); }
  };
  p.append(el("p", { textContent: "signed in. only you can see this panel." }), out,
    el("h3", { textContent: "stats" }), refresh, statsBox,
    el("h3", { textContent: "new post" }), ta, post, pm,
    el("h3", { textContent: "comments waiting" }), pen, penBox);
  loadStats(statsBox);
}
let abuf = "";
document.addEventListener("keydown", e => {
  if (e.target.matches && e.target.matches("input,textarea")) return;
  abuf = (abuf + e.key).slice(-6).toLowerCase();
  if (abuf === "ledger") { adminOpen = !adminOpen; renderAdmin(); }
});

/* ---------- tabs, sorting ---------- */
window.show = function (tab) {
  origShow(tab);
  const v = document.getElementById("view");
  if (tab === "posts") {
    v.replaceChildren();
    renderPosts(v);
    v.append(el("div", { className: "note", textContent: ABOUT.license }));
    return;
  }
  if (!TAB_OK.includes(tab)) return;
  const bar = el("div", { className: "sortbar" }, ["sort:"]);
  ["recent", "a-z"].forEach(m => {
    const b = el("button", { textContent: m }); b.setAttribute("aria-pressed", sortMode === m);
    b.onclick = () => { sortMode = m; window.show(tab); }; bar.append(b);
  });
  v.prepend(bar);
  const rows = [...v.querySelectorAll(":scope > .row")], idx = new Map(rows.map((r, i) => [r, i]));
  rows.sort((a, b) => sortMode === "a-z"
    ? a.querySelector(".t").textContent.localeCompare(b.querySelector(".t").textContent, undefined, { sensitivity: "base" })
    : (b.dataset.added || "").localeCompare(a.dataset.added || "") || idx.get(a) - idx.get(b));
  const note = v.querySelector(":scope > .note");
  rows.forEach(r => v.insertBefore(r, note));
};
window.show(location.hash.slice(1));
})();
