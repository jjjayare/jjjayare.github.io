/* votes.js - upvote/downvote ranking and approved-only comments for jayare.xyz
   Add ONE line to index.html just before </body>:   <script src="votes.js"></script>
   If anything fails (Firebase off, offline), the site simply works without votes. */
(async () => {
const CFG = {
  apiKey: "AIzaSyCbTTkwh6BEBRAgNxZxcZ-QaRqtVBIZdeM",
  authDomain: "jayare-d3dc4.firebaseapp.com",
  projectId: "jayare-d3dc4",
  storageBucket: "jayare-d3dc4.firebasestorage.app",
  messagingSenderId: "738612057691",
  appId: "1:738612057691:web:28d338a1e10c451313917e"
};
const V = "https://www.gstatic.com/firebasejs/10.12.2/";
const TAB_OK = ["beats","loops","kits"];
let FS, db, uid, scores = {}, mine = {}, sortMode = "top";
const keyOf = it => (it.preview || "").replace(/[^A-Za-z0-9]+/g, "_");

try {
  const { initializeApp } = await import(V + "firebase-app.js");
  const { getAuth, signInAnonymously } = await import(V + "firebase-auth.js");
  FS = await import(V + "firebase-firestore.js");
  const app = initializeApp(CFG);
  db = FS.getFirestore(app);
  uid = (await signInAnonymously(getAuth(app))).user.uid;
  (await FS.getDocs(FS.collection(db, "items"))).forEach(d => scores[d.id] = d.data().score || 0);
  (await FS.getDocs(FS.query(FS.collection(db, "votes"), FS.where("uid", "==", uid))))
    .forEach(d => mine[d.data().item] = d.data().v);
} catch (e) { console.warn("votes off:", e); return; }

const st = document.createElement("style");
st.textContent = `
.row.v{grid-template-columns:auto auto 1fr auto}
.vote{display:flex;flex-direction:column;align-items:center;min-width:30px;font:600 15px var(--f)}
.vote button{background:none;border:0;cursor:pointer;font-size:16px;line-height:1;padding:3px 6px;color:var(--ink)}
.vote button.on{color:var(--red)}
.cm{grid-column:1/-1;justify-self:start;background:none;border:0;padding:0;font:15px var(--f);cursor:pointer;color:var(--link);text-decoration:underline}
.cbox{grid-column:1/-1;border:1px solid var(--ink);padding:8px;font-size:15px}
.cbox p{margin:0 0 8px}
.cbox input,.cbox textarea{display:block;font:15px var(--f);width:100%;margin:0 0 6px;border:1px solid var(--ink);background:#fff;padding:5px}
.cbox button{font:15px var(--f);padding:4px 12px;cursor:pointer}
.sortbar{font-size:15px;margin:0 0 8px}
.sortbar button{font:inherit;background:none;border:0;padding:0 6px;cursor:pointer;color:var(--link);text-decoration:underline}
.sortbar button[aria-pressed=true]{color:var(--ink);text-decoration:none;font-weight:600}`;
document.head.append(st);

async function vote(key, dir) {
  const vref = FS.doc(db, "votes", uid + "_" + key), iref = FS.doc(db, "items", key);
  return FS.runTransaction(db, async tx => {
    const [vs, is] = await Promise.all([tx.get(vref), tx.get(iref)]);
    const old = vs.exists() ? vs.data().v : 0, nv = old === dir ? 0 : dir;
    const cur = is.exists() ? (is.data().score || 0) : 0;
    tx.set(iref, { score: cur + nv - old });
    tx.set(vref, { uid, item: key, v: nv });
    return { nv, score: cur + nv - old };
  });
}
function voteBox(key) {
  const up = el("button", { textContent: "\u25B2" }), dn = el("button", { textContent: "\u25BC" }), n = el("span");
  up.setAttribute("aria-label", "upvote"); dn.setAttribute("aria-label", "downvote");
  const paint = () => { up.className = mine[key] === 1 ? "on" : ""; dn.className = mine[key] === -1 ? "on" : ""; n.textContent = scores[key] || 0; };
  const go = async d => { try { const r = await vote(key, d); mine[key] = r.nv; scores[key] = r.score; paint(); } catch (e) { console.warn(e); } };
  up.onclick = () => go(1); dn.onclick = () => go(-1); paint();
  return el("div", { className: "vote" }, [up, n, dn]);
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
  const key = keyOf(item);
  r.dataset.key = key; r.classList.add("v"); r.prepend(voteBox(key));
  const cm = el("button", { className: "cm", textContent: "comments" }), panel = el("div", { className: "cbox" });
  panel.hidden = true;
  cm.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden && !panel.dataset.l) { panel.dataset.l = 1; loadComments(key, panel); } };
  r.append(cm, panel);
  return r;
};
window.show = function (tab) {
  origShow(tab);
  if (!TAB_OK.includes(tab)) return;
  const v = document.getElementById("view");
  const bar = el("div", { className: "sortbar" }, ["sort:"]);
  ["top", "a-z"].forEach(m => {
    const b = el("button", { textContent: m }); b.setAttribute("aria-pressed", sortMode === m);
    b.onclick = () => { sortMode = m; window.show(tab); }; bar.append(b);
  });
  v.prepend(bar);
  const rows = [...v.querySelectorAll(":scope > .row")], idx = new Map(rows.map((r, i) => [r, i]));
  rows.sort((a, b) => sortMode === "a-z"
    ? a.querySelector(".t").textContent.localeCompare(b.querySelector(".t").textContent, undefined, { sensitivity: "base" })
    : ((scores[b.dataset.key] || 0) - (scores[a.dataset.key] || 0)) || idx.get(a) - idx.get(b));
  const note = v.querySelector(":scope > .note");
  rows.forEach(r => v.insertBefore(r, note));
};
window.show(location.hash.slice(1));
})();
