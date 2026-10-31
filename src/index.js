/* MarkIINA: bookmarks belong to the exact media URL, not its display name. */
const { core, menu, preferences, utils, event, mpv, sidebar } = iina;

function videoURL() {
  return core.status.idle ? null : core.status.url || null;
}

function storageKey(url) {
  return 'bookmarks.v1:' + url;
}

function readBookmarks(url) {
  const saved = preferences.get(storageKey(url));
  if (saved === undefined || saved === null) return [];
  const entries = JSON.parse(saved);
  if (!Array.isArray(entries) || entries.some(b =>
    !b || typeof b.id !== 'string' || typeof b.name !== 'string' ||
    !Number.isFinite(b.time) || b.time < 0)) {
    throw new Error('Invalid bookmark data');
  }
  return entries.sort((a, b) => a.time - b.time);
}

function saveBookmarks(url, entries) {
  preferences.set(storageKey(url), JSON.stringify(entries));
  // Programmatic preference changes must be explicitly flushed to disk.
  preferences.sync();
}

function timestamp(seconds) {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const pad = value => String(value).padStart(2, '0');
  return (hours ? hours + ':' + pad(minutes) : pad(minutes)) + ':' + pad(total % 60);
}

function label(bookmark) {
  return bookmark.name || timestamp(bookmark.time);
}

function safely(action) {
  try { action(); }
  catch (error) {
    iina.console.error('MarkIINA: ' + String(error));
    core.osd('MarkIINA could not read or save bookmarks. See the plugin log.');
  }
}

function parseTimestamp(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text) && !/^\d+:\d{1,2}(?:\.\d+)?$/.test(text) && !/^\d+:\d{1,2}:\d{1,2}(?:\.\d+)?$/.test(text)) {
    throw new Error('Enter seconds, MM:SS, or HH:MM:SS.');
  }
  const parts = text.split(':').map(Number);
  if (parts.slice(1).some(part => part >= 60)) throw new Error('Minutes and seconds after a colon must be below 60.');
  const time = parts.reduce((total, part) => total * 60 + part, 0);
  if (!Number.isFinite(time)) throw new Error('Enter a valid timestamp.');
  return time;
}

function storeBookmark(url, time, name) {
  if (!url || videoURL() !== url) throw new Error('The video changed. Please try again.');
  if (!Number.isFinite(time) || time < 0) throw new Error('Enter a valid timestamp.');
  const duration = core.status.duration;
  if (Number.isFinite(duration) && duration > 0 && time > duration) throw new Error('Timestamp is past the end of this video.');
  const entries = readBookmarks(url);
  entries.push({ id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), time, name: name.trim() });
  saveBookmarks(url, entries);
  refreshMenu();
  core.osd('Bookmark added: ' + timestamp(time));
}

function addAtTimestamp() {
  const url = videoURL();
  if (!url) return;
  const value = utils.prompt('Timestamp (seconds, MM:SS, or HH:MM:SS)');
  if (value === undefined || value === null) return;
  let time;
  try { time = parseTimestamp(value); }
  catch (error) { core.osd(error.message); return; }
  const name = utils.prompt('Bookmark name (optional)');
  if (name === undefined || name === null || videoURL() !== url) return;
  storeBookmark(url, time, name);
}

function addBookmark(named) {
  const url = videoURL();
  const time = core.status.position;
  if (!url || !Number.isFinite(time) || time < 0) return;
  let name = '';
  if (named) {
    const answer = utils.prompt('Bookmark name (optional)');
    if (answer === undefined || answer === null) return;
    name = answer.trim();
  }
  // A prompt runs a native event loop; never attach its timestamp to a new file.
  if (videoURL() !== url) return;
  storeBookmark(url, time, name);
}

function refreshMenu(updateNativeMenu = true) {
  const url = videoURL();
  menu.removeAllItems();
  menu.addItem(menu.item('Show Bookmarks Panel', () => { loadPanel(); sidebar.show(); }));
  menu.addItem(menu.item('Add Bookmark at Timestamp…', () => safely(addAtTimestamp), { enabled: !!url }));
  menu.addItem(menu.item('Add Bookmark', () => safely(() => addBookmark(false)), { enabled: !!url }));
  menu.addItem(menu.item('Add Named Bookmark…', () => safely(() => addBookmark(true)), { enabled: !!url }));
  let entries = [];
  let failed = false;
  if (url) {
    try { entries = readBookmarks(url); }
    catch (error) {
      failed = true;
      iina.console.error('MarkIINA: ' + String(error));
    }
  }
  const jump = menu.item('Jump to Bookmark', null, { enabled: entries.length > 0 });
  const remove = menu.item('Delete Bookmark', null, { enabled: entries.length > 0 });
  entries.forEach(bookmark => {
    jump.addSubMenuItem(menu.item(label(bookmark), () => safely(() => {
      if (videoURL() !== url) return;
      mpv.command('seek', [String(bookmark.time), 'absolute+exact']);
    })));
    remove.addSubMenuItem(menu.item(label(bookmark), () => safely(() => {
      if (videoURL() !== url) return;
      saveBookmarks(url, readBookmarks(url).filter(b => b.id !== bookmark.id));
      refreshMenu();
      core.osd('Bookmark deleted: ' + timestamp(bookmark.time));
    })));
  });
  menu.addItem(jump);
  menu.addItem(remove);
  if (!entries.length) menu.addItem(menu.item(
    failed ? 'Unable to read saved bookmarks' : url ? 'No bookmarks for this video' : 'Open a video to add bookmarks',
    null, { enabled: false }
  ));
  // Never force a native menu rebuild while IINA is constructing its first player.
  if (updateNativeMenu === true) menu.forceUpdate();
  postPanel();
}

let panelLoaded = false;
let panelReady = false;
function loadPanel() {
  if (panelLoaded) return;
  panelReady = false;
  sidebar.loadFile('ui/sidebar.html');
  // IINA loadFile clears the message hub. Register handlers only after loading.
  registerPanelMessages();
  panelLoaded = true;
}
function postPanel() {
  if (!panelReady) return;
  const url = videoURL();
  try {
    sidebar.postMessage('state', { url, title: url ? core.status.title : '', entries: url ? readBookmarks(url).map(b => ({ ...b, label: label(b) })) : [] });
  } catch (error) { sidebar.postMessage('error', 'Unable to read bookmarks. Check the plugin log.'); }
}
function registerPanelMessages() {
  sidebar.onMessage('ready', () => { panelReady = true; postPanel(); });
  sidebar.onMessage('action', data => {
    try {
      if (!data || !data.url || data.url !== videoURL()) throw new Error('The video changed. Please try again.');
      if (data.type === 'add') {
        const time = data.timestamp.trim() ? parseTimestamp(data.timestamp) : core.status.position;
        storeBookmark(data.url, time, String(data.name || ''));
        sidebar.postMessage('saved', null);
      } else {
        const entries = readBookmarks(data.url);
        const bookmark = entries.find(b => b.id === data.id);
        if (!bookmark) { postPanel(); return; }
        if (data.type === 'jump') mpv.command('seek', [String(bookmark.time), 'absolute+exact']);
        if (data.type === 'delete') {
          saveBookmarks(data.url, entries.filter(b => b.id !== data.id));
          refreshMenu();
        }
      }
    } catch (error) { sidebar.postMessage('error', error.message); }
  });
}
event.on('iina.window-loaded', loadPanel);
if (core.window && core.window.loaded) loadPanel();
event.on('iina.file-loaded', () => refreshMenu());
event.on('iina.file-started', () => refreshMenu());
event.on('mpv.idle-active.changed', () => refreshMenu());
// Re-read shared preferences when switching between player windows.
event.on('iina.window-main.changed', active => { if (active) refreshMenu(); });
refreshMenu(false);
