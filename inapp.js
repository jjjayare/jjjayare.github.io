/* inapp.js - helps visitors who arrive from Instagram's built-in browser, where downloads are blocked.
   Add ONE line to index.html just before </body>:   <script src="inapp.js"></script>
   In Safari, Chrome and every other normal browser this file does nothing at all. */
(() => {
if (!/Instagram/i.test(navigator.userAgent)) return;

const css = document.createElement("style");
css.textContent = `
#igbar{position:sticky;top:0;z-index:50;display:flex;gap:10px;align-items:center;justify-content:space-between;
background:var(--paper,#e6e8dc);color:var(--ink,#15151a);border-bottom:2px solid var(--red,#a4161a);
padding:8px 12px;font:15px/1.35 var(--f,sans-serif)}
#igbar[hidden]{display:none}
#igbar.flash{outline:3px solid var(--red,#a4161a);outline-offset:-3px}
#igbar .btns{display:flex;gap:6px;flex-shrink:0}
#igbar button{font:inherit;cursor:pointer;padding:3px 10px;border:2px outset #888;background:var(--bg,#cfd3c4);color:inherit}
.ig-dl{max-width:120px;text-align:right;font-size:14px;line-height:1.2}`;
document.head.append(css);

const b = t => { const n = document.createElement("b"); n.textContent = t; return n; };
const bar = document.createElement("div");
bar.id = "igbar"; bar.setAttribute("role", "note");
const msg = document.createElement("div");
msg.append(b("you can't download inside instagram. "), "open this page in an external browser (safari or chrome) to download. tap ", b("\u2022\u2022\u2022"), " at the top right, then ", b("open in browser"), ".");
const copy = document.createElement("button"); copy.textContent = "copy link";
const close = document.createElement("button"); close.textContent = "\u00D7"; close.setAttribute("aria-label", "close");
const btns = document.createElement("div"); btns.className = "btns"; btns.append(copy, close);
bar.append(msg, btns);
document.body.prepend(bar);

const url = () => location.href.split("#")[0];
copy.onclick = async () => {
  try { await navigator.clipboard.writeText(url()); }
  catch (e) {
    const t = document.createElement("textarea"); t.value = url(); document.body.append(t); t.select();
    try { document.execCommand("copy"); } catch (e2) {} t.remove();
  }
  copy.textContent = "copied";
  setTimeout(() => copy.textContent = "copy link", 2000);
};
close.onclick = () => { bar.hidden = true; };

function help() {
  bar.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  bar.classList.add("flash");
  setTimeout(() => bar.classList.remove("flash"), 1500);
}

const origRow = window.row;
if (typeof origRow === "function") {
  window.row = function (item, tab) {
    const r = origRow(item, tab), a = r.querySelector("a");
    if (a) {
      a.textContent = "open in browser to download"; a.className = "ig-dl";
      a.removeAttribute("download"); a.removeAttribute("target"); a.href = "#";
      a.onclick = e => { e.preventDefault(); help(); };
    }
    return r;
  };
  if (typeof window.show === "function") window.show(location.hash.slice(1));
}
})();
