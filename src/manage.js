"use strict";

import {drive} from "./utils.js";
import {drivediscord} from "./login.js";
import {drivemedia} from "./media.js";

const {esc, basename, extname, formatbytes, formattimecompact, iconfor, imageext, videoext, audioext, rawurl, thumburlsmall} = drive;
const managebase = "https://api.soggy.cat";

const discordmenu = document.querySelector(".discordmenu"),
  discordmenuavatar = document.querySelector(".discordmenuavatar"),
  discordmenuname = document.querySelector(".discordmenuname"),
  discordmenulogout = document.querySelector(".discordmenulogout"),
  manageloginbtn = document.querySelector(".managelogin"),
  managewhitelistbtn = document.querySelector(".managewhitelistbtn"),
  managestatus = document.querySelector(".managestatus"),
  managefolders = document.querySelector(".managefolders"),
  manageoverlay = document.querySelector(".manageoverlay"),
  manageoverlayclose = document.querySelector(".manageoverlayclose"),
  manageadmin = document.querySelector(".manageadmin"),
  medialightbox = document.querySelector(".medialightbox"),
  mediabackdrop = document.querySelector(".mediabackdrop"),
  mediaclose = document.querySelector(".mediaclose"),
  mediacontent = document.querySelector(".mediacontent"),
  medianavleft = document.querySelector(".medianavleft"),
  medianavright = document.querySelector(".medianavright"),
  mediaregionlayer = document.querySelector(".mediaregionlayer"),
  mediatoolbar = document.querySelector(".mediatoolbar"),
  mediadownload = document.querySelector(".mediadownload"),
  mediacopylink = document.querySelector(".mediacopylink"),
  mediacopyimagelink = document.querySelector(".mediacopyimagelink"),
  mediacommentbtn = document.querySelector(".mediacommentbtn"),
  medicomments = document.querySelector(".mediacomments"),
  medicommentslist = document.querySelector(".mediacommentslist"),
  mediainfo = document.querySelector(".mediainfo");

function loadsettings() {
  try {
    const s = JSON.parse(localStorage.getItem("settings") || "{}");
    return s && typeof s === "object" ? s : {};
  } catch {return {}}
}
function setsetting(key, value) {
  const s = loadsettings();
  s[key] = value;
  try {localStorage.setItem("settings", JSON.stringify(s))} catch (_) {}
}
function getsetting(key, fallback) {
  const s = loadsettings();
  return s[key] === undefined ? fallback : s[key];
}

const discord = drivediscord({
  esc, setsetting, getsetting,
  commentslivebase: managebase, loginhint: null,
  discordavatarbutton: null, discordmenu,
  discordmenuavatar, discordmenuname,
  discordmenulogout, pfpdefault: "",
  hidehint: () => {}
});

const state = {tree: [], cwd: "", commentsopen: true};
const folderfiles = new Map();
function synctree() {
  const items = [];
  for (const [folder, files] of folderfiles) {
    for (const f of files) items.push({type: "blob", path: `${folder}/${f.name}`, sha: f.sha, size: f.size});
  }
  state.tree = items;
}
function listchildren(prefix) {
  const files = folderfiles.get(prefix) || [];
  return files.map((f) => ({kind: "file", name: f.name, path: `${prefix}/${f.name}`}));
}

const media = drivemedia({
  state, getsetting, setsetting,
  esc, basename, extname,
  formatbytes, formattimecompact,
  imageext, videoext, audioext,
  rawurl, listchildren,
  sethash: () => {}, hidehint: () => {},
  commentslivebase: managebase,
  medialightbox, mediabackdrop, mediaclose,
  mediacontent, medianavleft, medianavright, mediaregionlayer,
  medicomments, medicommentslist, mediainfo, mediacommentbtn
});

if (mediaclose) mediaclose.addEventListener("click", media.closelightbox);
if (mediabackdrop) mediabackdrop.addEventListener("click", () => {
  if (media.hasfocus()) media.clearcommentfocus();
  else media.closelightbox();
});
{
  const box = document.querySelector(".mediabox");
  if (box) box.addEventListener("click", (e) => {
    if (!medialightbox || medialightbox.hidden) return;
    const t = e.target;
    if (mediacontent?.contains(t) || medicomments?.contains(t) || mediaregionlayer?.contains(t)) return;
    if (mediatoolbar?.contains?.(t) || mediainfo?.contains?.(t)) return;
    if (medianavleft?.contains?.(t) || medianavright?.contains?.(t)) return;
    if (media.hasfocus()) {media.clearcommentfocus(); return}
    media.closelightbox();
  });
}
if (mediadownload) mediadownload.addEventListener("click", async () => {
  const p = media.currentpath();
  if (!p) return;
  const url = rawurl(p);
  try {
    const res = await fetch(url, {cache: "force-cache"});
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);
    const blob = await res.blob();
    const objurl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objurl;
    a.rel = "noopener noreferrer";
    a.download = basename(p) || "file";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objurl), 30_000);
  } catch {window.open(url, "_blank", "noopener,noreferrer")}
});
if (mediacopylink) mediacopylink.addEventListener("click", () => {
  const p = media.currentpath();
  if (p) try {navigator.clipboard?.writeText?.(location.href)} catch (_) {}
});
if (mediacopyimagelink) mediacopyimagelink.addEventListener("click", () => {
  const p = media.currentpath();
  if (p) try {navigator.clipboard?.writeText?.(rawurl(p))} catch (_) {}
});
if (mediacommentbtn) mediacommentbtn.addEventListener("click", () => media.startcomment());
if (medianavleft) medianavleft.addEventListener("click", () => media.steplightboximage(-1));
if (medianavright) medianavright.addEventListener("click", () => media.steplightboximage(1));
document.addEventListener("keydown", (e) => {
  if (!medialightbox || medialightbox.hidden) return;
  if (e.key === "Escape") {media.closelightbox(); return}
  if (e.key === "ArrowLeft") {media.steplightboximage(-1); return}
  if (e.key === "ArrowRight") {media.steplightboximage(1); return}
});

function fmtbytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n}b`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}kb`;
  return `${(n / (1024 * 1024)).toFixed(1)}mb`;
}

function fileaspreview(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function apiget(pathandquery) {
  const token = getsetting("discord_token", "");
  const sep = pathandquery.includes("?") ? "&" : "?";
  const res = await fetch(`${managebase}${pathandquery}${sep}token=${encodeURIComponent(token)}`, {cache: "no-store"});
  const body = await res.json().catch(() => null);
  return {ok: res.ok, status: res.status, body};
}
async function apipost(path, payload) {
  const token = getsetting("discord_token", "");
  const res = await fetch(`${managebase}${path}`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({...payload, token})
  });
  const body = await res.json().catch(() => null);
  return {ok: res.ok, status: res.status, body};
}

/*//////////////////////////////////////////////////////////////////////*/

async function renderfolder(folder) {
  const section = document.createElement("section");
  section.className = "managefolder";
  section.innerHTML = `
    <div class="managefolderhead">
      <h2 class="managefoldertitle">${esc(folder)}</h2>
      <div class="manageselectbar" hidden>
        <span class="manageselectcount"></span>
        <button type="button" class="manageselectdeletebtn">delete selected</button>
        <button type="button" class="manageselectclearbtn">cancel</button>
      </div>
      <label class="manageupload">
        + add photos
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,video/mp4,video/webm,video/quicktime,video/x-matroska" multiple hidden>
      </label>
    </div>
    <div class="managegrid"></div>
    <div class="manageuploadstatus"></div>
  `;
  const grid = section.querySelector(".managegrid");
  const fileinput = section.querySelector("input[type=file]");
  const uploadstatus = section.querySelector(".manageuploadstatus");
  const selectbar = section.querySelector(".manageselectbar");
  const selectcount = section.querySelector(".manageselectcount");
  const selected = new Set();

  function syncselectbar() {
    selectbar.hidden = selected.size === 0;
    selectcount.textContent = `${selected.size} selected`;
  }

  async function refresh() {
    grid.innerHTML = `<div class="managegridloading">loading..</div>`;
    selected.clear();
    syncselectbar();
    const res = await apiget(`/manage/list?folder=${encodeURIComponent(folder)}`);
    if (!res.ok) {
      grid.innerHTML = `<div class="managegridloading">couldn't load files :(</div>`;
      return;
    }
    const files = Array.isArray(res.body?.files) ? res.body.files : [];
    folderfiles.set(folder, files);
    synctree();
    grid.innerHTML = "";
    if (!files.length) {
      grid.innerHTML = `<div class="managegridloading">no photos here yet.</div>`;
      return;
    }
    for (const f of files) {
      const path = `${folder}/${f.name}`;
      const card = document.createElement("div");
      card.className = "managecard";
      const isvid = videoext.test(f.name);
      card.innerHTML = `
        <div class="managethumbwrap">
          <input type="checkbox" class="managecardcheck">
          <img class="managethumb" src="${esc(thumburlsmall(path))}" alt="" loading="lazy">
          ${isvid ? `<div class="managecardvidicon">${iconfor(f.name)}</div>` : ""}
        </div>
        <div class="managecardinfo">
          <span class="managecardname" title="${esc(f.name)}">${esc(f.name)}</span>
          <span class="managecardmeta">${esc(fmtbytes(f.size))}</span>
          <div class="managecardactions">
            <button type="button" class="managerenamebtn" title="rename">rename</button>
            <button type="button" class="managedeletebtn" title="delete">delete</button>
          </div>
        </div>
      `;
      const check = card.querySelector(".managecardcheck");
      check.addEventListener("click", (e) => {
        e.stopPropagation();
        if (check.checked) selected.add(f.name); else selected.delete(f.name);
        card.classList.toggle("managecardselected", check.checked);
        syncselectbar();
      });
      card.querySelector(".managerenamebtn").addEventListener("click", async (e) => {
        e.stopPropagation();
        const next = window.prompt("new filename (keep the extension):", f.name);
        if (!next || next === f.name) return;
        card.style.opacity = "0.5";
        const r = await apipost("/manage/rename", {folder, oldname: f.name, newname: next.trim()});
        if (!r.ok) {alert(`rename failed: ${r.body?.error || r.status}`); card.style.opacity = ""; return}
        refresh();
      });
      card.querySelector(".managedeletebtn").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!window.confirm(`delete ${f.name}? this can't be undone from here.`)) return;
        card.style.opacity = "0.5";
        const r = await apipost("/manage/delete", {folder, filename: f.name});
        if (!r.ok) {alert(`delete failed: ${r.body?.error || r.status}`); card.style.opacity = ""; return}
        refresh();
      });
      card.addEventListener("click", (e) => {
        if (e.target.closest(".managethumbwrap") === null) return;
        if (selected.size > 0) {
          check.checked = !check.checked;
          check.dispatchEvent(new Event("click", {bubbles: false}));
          return;
        }
        media.openlightbox(rawurl(path), path, isvid);
      });
      grid.appendChild(card);
    }
  }

  section.querySelector(".manageselectclearbtn").addEventListener("click", () => {
    selected.clear();
    for (const c of grid.querySelectorAll(".managecardcheck")) c.checked = false;
    for (const c of grid.querySelectorAll(".managecard")) c.classList.remove("managecardselected");
    syncselectbar();
  });
  section.querySelector(".manageselectdeletebtn").addEventListener("click", async () => {
    if (!window.confirm(`delete ${selected.size} file(s)? this can't be undone from here.`)) return;
    const names = [...selected];
    selectbar.hidden = true;
    uploadstatus.textContent = `deleting ${names.length} file(s)..`;
    for (const filename of names) {
      const r = await apipost("/manage/delete", {folder, filename});
      if (!r.ok) uploadstatus.textContent = `failed on ${filename}: ${r.body?.error || r.status}`;
    }
    uploadstatus.textContent = "";
    refresh();
  });

  fileinput.addEventListener("change", async () => {
    const chosen = [...fileinput.files || []];
    fileinput.value = "";
    if (!chosen.length) return;
    for (const file of chosen) {
      uploadstatus.textContent = `uploading ${file.name}..`;
      try {
        const dataurl = await fileaspreview(file);
        const contentbase64 = dataurl.split(",")[1] || "";
        const r = await apipost("/manage/upload", {folder, filename: file.name, contentBase64: contentbase64});
        if (!r.ok) uploadstatus.textContent = `failed on ${file.name}: ${r.body?.error || r.status}`;
      } catch (e) {
        uploadstatus.textContent = `failed on ${file.name}: ${e.message || e}`;
      }
    }
    uploadstatus.textContent = "";
    refresh();
  });

  managefolders.appendChild(section);
  refresh();
}

/*//////////////////////////////////////////////////////////////////////*/

let saveddebounce = null;
async function renderadmin() {
  manageadmin.innerHTML = `<div class="managegridloading">loading whitelist..</div>`;
  const [peopleres, foldersres] = await Promise.all([
    apiget("/manage/admin/people"),
    apiget("/manage/admin/allfolders")
  ]);
  if (!peopleres.ok || !foldersres.ok) {
    manageadmin.innerHTML = `<div class="managegridloading">couldn't load whitelist :(</div>`;
    return;
  }
  const allfolders = Array.isArray(foldersres.body?.folders) ? foldersres.body.folders : [];
  const people = Array.isArray(peopleres.body?.people) ? peopleres.body.people : [];

  manageadmin.innerHTML = `
    <div class="adminpeoplelist"></div>
    <button type="button" class="adminaddbtn">+ add person</button>
    <span class="adminsavestatus"></span>
  `;
  const list = manageadmin.querySelector(".adminpeoplelist");
  const savestatus = manageadmin.querySelector(".adminsavestatus");

  function scheduleautosave() {
    savestatus.textContent = "saving..";
    window.clearTimeout(saveddebounce);
    saveddebounce = window.setTimeout(async () => {
      const entries = [...list.querySelectorAll(".adminrow")].map((row) => ({
        id: row.querySelector(".admininputid").value.trim(),
        label: row.querySelector(".admininputlabel").value.trim(),
        folders: [...row.querySelectorAll(".adminrowfolders input:checked")].map((i) => i.value),
      })).filter((e) => e.id);
      const r = await apipost("/manage/admin/people", {people: entries});
      savestatus.textContent = r.ok ? "saved" : `failed: ${r.body?.error || r.status}`;
    }, 600);
  }

  function addrow(entry) {
    const row = document.createElement("div");
    row.className = "adminrow";
    const folderchips = allfolders.map((f) =>
      `<label class="adminchip"><input type="checkbox" value="${esc(f)}" ${entry.folders.includes(f) ? "checked" : ""}> ${esc(f)}</label>`
    ).join("");
    row.innerHTML = `
      <div class="adminrowtop">
        <input type="text" class="admininputid" placeholder="discord user id" value="${esc(entry.id || "")}">
        <input type="text" class="admininputlabel" placeholder="label (optional)" value="${esc(entry.label || "")}">
        <button type="button" class="adminremovebtn" title="remove person">x</button>
      </div>
      <div class="adminrowfolders">${folderchips}</div>
    `;
    row.addEventListener("input", scheduleautosave);
    row.addEventListener("change", scheduleautosave);
    row.querySelector(".adminremovebtn").addEventListener("click", () => {row.remove(); scheduleautosave()});
    list.appendChild(row);
  }
  for (const entry of people) addrow(entry);
  manageadmin.querySelector(".adminaddbtn").addEventListener("click", () => addrow({id: "", label: "", folders: []}));
}

if (managewhitelistbtn) managewhitelistbtn.addEventListener("click", () => {
  manageoverlay.hidden = false;
  renderadmin();
});
if (manageoverlayclose) manageoverlayclose.addEventListener("click", () => {manageoverlay.hidden = true});
if (manageoverlay) manageoverlay.querySelector(".manageoverlaybackdrop").addEventListener("click", () => {manageoverlay.hidden = true});

/*//////////////////////////////////////////////////////////////////////*/

async function loadmanager() {
  const token = getsetting("discord_token", "");
  if (!token) {
    managestatus.textContent = "log in with discord to manage your folder.";
    managefolders.hidden = true;
    if (managewhitelistbtn) managewhitelistbtn.hidden = true;
    return;
  }
  managestatus.textContent = "loading your folders..";
  const res = await apiget("/manage/me");
  if (!res.ok) {
    managestatus.textContent = "couldn't check your account, try logging in again.";
    return;
  }
  const folders = Array.isArray(res.body?.folders) ? res.body.folders : [];
  if (managewhitelistbtn) managewhitelistbtn.hidden = !res.body?.isadmin;
  if (res.body?.githuberror) {
    managestatus.textContent = `github api error (status ${res.body.githuberror.status}): ${res.body.githuberror.body?.message || JSON.stringify(res.body.githuberror.body)}`;
  }
  if (!folders.length) {
    if (!res.body?.githuberror)
      managestatus.textContent = "you're logged in but not set up to manage any folder here yet, ask cv to get added!";
    managefolders.hidden = true;
    return;
  }
  managestatus.textContent = "";
  managefolders.hidden = false;
  managefolders.innerHTML = "";
  folderfiles.clear();
  for (const folder of folders) renderfolder(folder);
}

function synclogindisplay() {
  discord.updatediscordavatar();
  const loggedin = !!discord.getdiscorduser();
  if (manageloginbtn) manageloginbtn.hidden = loggedin;
  if (discordmenuavatar) discordmenuavatar.hidden = !loggedin;
  if (discordmenuname) discordmenuname.hidden = !loggedin;
  if (discordmenulogout) discordmenulogout.hidden = !loggedin;
}

discord.wireui({medialightbox: null, oncomments: () => {}});
synclogindisplay();
discord.handlediscordoauthcallbackifpresent();

if (manageloginbtn) manageloginbtn.addEventListener("click", () => {
  location.href = discord.discordauthurl(`${location.origin}${location.pathname}`);
});
if (discordmenulogout) discordmenulogout.addEventListener("click", synclogindisplay);

if (!(window.opener && window.opener !== window) && !getsetting("discord_token", "")) {
  discord.resolvediscorduser().then(() => {synclogindisplay(); loadmanager()});
} else {
  loadmanager();
}

window.addEventListener("message", (e) => {
  if (e.origin !== location.origin) return;
  if (e.data?.type !== "discord_oauth_code") return;
  window.setTimeout(() => {synclogindisplay(); loadmanager()}, 300);
});
