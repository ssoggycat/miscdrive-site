"use strict";

import {drive} from "./utils.js";
import {drivediscord} from "./login.js";

const {esc, thumburl} = drive;
const managebase = "https://api.soggy.cat";

const discordavatarbutton = document.querySelector(".discordavatarbutton"),
  discordmenu = document.querySelector(".discordmenu"),
  discordmenuavatar = document.querySelector(".discordmenuavatar"),
  discordmenuname = document.querySelector(".discordmenuname"),
  discordmenulogout = document.querySelector(".discordmenulogout"),
  managestatus = document.querySelector(".managestatus"),
  manageadmin = document.querySelector(".manageadmin"),
  managefolders = document.querySelector(".managefolders");

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

const staticbuttonicon = discordavatarbutton ? discordavatarbutton.innerHTML : "";
function syncavatarbutton() {
  discord.updatediscordavatar();
}
if (discordavatarbutton) {
  const avatarobserver = new MutationObserver(() => {
    if (discordavatarbutton.innerHTML !== staticbuttonicon) {
      avatarobserver.disconnect();
      discordavatarbutton.innerHTML = staticbuttonicon;
      avatarobserver.observe(discordavatarbutton, {childList: true, subtree: true});
    }
  });
  avatarobserver.observe(discordavatarbutton, {childList: true, subtree: true});
}

const discord = drivediscord({
  esc, setsetting, getsetting,
  commentslivebase: managebase, loginhint: null,
  discordavatarbutton, discordmenu,
  discordmenuavatar, discordmenuname,
  discordmenulogout, pfpdefault: staticbuttonicon,
  hidehint: () => {}
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

async function renderfolder(folder) {
  const section = document.createElement("section");
  section.className = "managefolder";
  section.innerHTML = `
    <h2 class="managefoldertitle">${esc(folder)}</h2>
    <div class="managegrid"></div>
    <label class="manageupload">
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,video/mp4,video/webm,video/quicktime,video/x-matroska" multiple hidden>
      + add photos
    </label>
    <div class="manageuploadstatus"></div>
  `;
  const grid = section.querySelector(".managegrid");
  const fileinput = section.querySelector("input[type=file]");
  const uploadstatus = section.querySelector(".manageuploadstatus");

  async function refresh() {
    grid.innerHTML = `<div class="managegridloading">loading..</div>`;
    const res = await apiget(`/manage/list?folder=${encodeURIComponent(folder)}`);
    if (!res.ok) {
      grid.innerHTML = `<div class="managegridloading">couldn't load files :(</div>`;
      return;
    }
    const files = Array.isArray(res.body?.files) ? res.body.files : [];
    grid.innerHTML = "";
    if (!files.length) {
      grid.innerHTML = `<div class="managegridloading">no photos here yet.</div>`;
      return;
    }
    for (const f of files) {
      const card = document.createElement("div");
      card.className = "managecard";
      card.innerHTML = `
        <img class="managethumb" src="${esc(thumburl(`${folder}/${f.name}`))}" alt="" loading="lazy">
        <div class="managecardname" title="${esc(f.name)}">${esc(f.name)}</div>
        <div class="managecardmeta">${esc(fmtbytes(f.size))}</div>
        <div class="managecardactions">
          <button type="button" class="managerenamebtn">rename</button>
          <button type="button" class="managedeletebtn">delete</button>
        </div>
      `;
      card.querySelector(".managerenamebtn").addEventListener("click", async () => {
        const next = window.prompt("new filename (keep the extension):", f.name);
        if (!next || next === f.name) return;
        card.style.opacity = "0.5";
        const r = await apipost("/manage/rename", {folder, oldname: f.name, newname: next.trim()});
        if (!r.ok) {alert(`rename failed: ${r.body?.error || r.status}`); card.style.opacity = ""; return}
        refresh();
      });
      card.querySelector(".managedeletebtn").addEventListener("click", async () => {
        if (!window.confirm(`delete ${f.name}? this can't be undone from here.`)) return;
        card.style.opacity = "0.5";
        const r = await apipost("/manage/delete", {folder, filename: f.name});
        if (!r.ok) {alert(`delete failed: ${r.body?.error || r.status}`); card.style.opacity = ""; return}
        refresh();
      });
      grid.appendChild(card);
    }
  }

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

async function renderadmin() {
  manageadmin.hidden = false;
  manageadmin.innerHTML = `<div class="managegridloading">loading admin panel..</div>`;
  const [peopleres, foldersres] = await Promise.all([
    apiget("/manage/admin/people"),
    apiget("/manage/admin/allfolders")
  ]);
  if (!peopleres.ok || !foldersres.ok) {
    manageadmin.innerHTML = `<div class="managegridloading">couldn't load admin panel :(</div>`;
    return;
  }
  const allfolders = Array.isArray(foldersres.body?.folders) ? foldersres.body.folders : [];
  const people = Array.isArray(peopleres.body?.people) ? peopleres.body.people : [];

  manageadmin.innerHTML = `
    <h2 class="managefoldertitle">whitelist (admin)</h2>
    <div class="adminpeoplelist"></div>
    <button type="button" class="adminaddbtn">+ add person</button>
    <div class="adminactions">
      <button type="button" class="adminsavebtn">save changes</button>
      <span class="adminsavestatus"></span>
    </div>
  `;
  const list = manageadmin.querySelector(".adminpeoplelist");

  function addrow(entry) {
    const row = document.createElement("div");
    row.className = "adminrow";
    const folderchips = allfolders.map((f) =>
      `<label class="adminchip"><input type="checkbox" value="${esc(f)}" ${entry.folders.includes(f) ? "checked" : ""}> ${esc(f)}</label>`
    ).join("");
    row.innerHTML = `
      <div class="adminrowtop">
        <input type="text" class="admininputid" placeholder="discord user id" value="${esc(entry.id || "")}">
        <input type="text" class="admininputlabel" placeholder="label (optional, e.g. username)" value="${esc(entry.label || "")}">
        <button type="button" class="adminremovebtn" title="remove person">x</button>
      </div>
      <div class="adminrowfolders">${folderchips}</div>
    `;
    row.querySelector(".adminremovebtn").addEventListener("click", () => row.remove());
    list.appendChild(row);
  }
  for (const entry of people) addrow(entry);

  manageadmin.querySelector(".adminaddbtn").addEventListener("click", () => addrow({id: "", label: "", folders: []}));

  manageadmin.querySelector(".adminsavebtn").addEventListener("click", async () => {
    const savestatus = manageadmin.querySelector(".adminsavestatus");
    const entries = [...list.querySelectorAll(".adminrow")].map((row) => ({
      id: row.querySelector(".admininputid").value.trim(),
      label: row.querySelector(".admininputlabel").value.trim(),
      folders: [...row.querySelectorAll(".adminrowfolders input:checked")].map((i) => i.value),
    })).filter((e) => e.id);
    savestatus.textContent = "saving..";
    const r = await apipost("/manage/admin/people", {people: entries});
    savestatus.textContent = r.ok ? "saved!" : `failed: ${r.body?.error || r.status}`;
  });
}

async function loadmanager() {
  const token = getsetting("discord_token", "");
  if (!token) {
    managestatus.textContent = "log in with discord to manage your folder!";
    managefolders.hidden = true;
    return;
  }
  managestatus.textContent = "loading your folders..";
  const res = await apiget("/manage/me");
  if (!res.ok) {
    managestatus.textContent = "couldn't check your account, try logging in again";
    return;
  }
  const folders = Array.isArray(res.body?.folders) ? res.body.folders : [];
  if (res.body?.isadmin) renderadmin();
  else manageadmin.hidden = true;
  if (res.body?.githuberror) {
    managestatus.textContent = `github api error (status ${res.body.githuberror.status}): ${res.body.githuberror.body?.message || JSON.stringify(res.body.githuberror.body)}`;
  }
  if (!folders.length) {
    if (!res.body?.githuberror)
      managestatus.textContent = "you're logged in but not set up to manage any folder here yet, ask cv to get added";
    managefolders.hidden = true;
    return;
  }
  managestatus.textContent = "";
  managefolders.hidden = false;
  managefolders.innerHTML = "";
  for (const folder of folders) renderfolder(folder);
}

discord.wireui({medialightbox: null, oncomments: () => {}});
syncavatarbutton();
discord.handlediscordoauthcallbackifpresent();
if (!(window.opener && window.opener !== window) && !getsetting("discord_token", "")) {
  discord.resolvediscorduser().then(loadmanager);
} else {
  loadmanager();
}
window.addEventListener("message", () => window.setTimeout(() => {syncavatarbutton(); loadmanager()}, 300));
