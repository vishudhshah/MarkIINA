const element = id => document.getElementById(id);
let currentURL = null;
let pending = false;
function send(type, extra = {}) {
  iina.postMessage('action', { type, url: currentURL, ...extra });
}
iina.onMessage('state', state => {
  if (currentURL !== state.url) {
    element('form').reset();
    element('message').textContent = '';
    pending = false;
  }
  currentURL = state.url;
  element('video').textContent = state.title || (currentURL ? 'Current video' : 'Open a video to add bookmarks.');
  element('add').disabled = !currentURL || pending;
  element('name').disabled = element('time').disabled = !currentURL;
  element('count').textContent = 'Saved bookmarks (' + state.entries.length + ')';
  element('empty').hidden = state.entries.length > 0;
  element('bookmarks').replaceChildren();
  state.entries.forEach(bookmark => {
    const row = document.createElement('li');
    const jump = document.createElement('button');
    jump.type = 'button'; jump.className = 'jump'; jump.textContent = bookmark.label;
    jump.title = 'Jump to bookmark';
    jump.onclick = () => send('jump', { id: bookmark.id });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'delete'; remove.textContent = 'Delete';
    remove.setAttribute('aria-label', 'Delete ' + bookmark.label);
    remove.onclick = () => send('delete', { id: bookmark.id });
    row.append(jump, remove);
    element('bookmarks').append(row);
  });
});
iina.onMessage('saved', () => {
  pending = false;
  element('form').reset();
  element('add').disabled = !currentURL;
  element('message').textContent = 'Bookmark added.';
});
iina.onMessage('error', message => {
  pending = false;
  element('add').disabled = !currentURL;
  element('message').textContent = message;
});
element('form').addEventListener('submit', event => {
  event.preventDefault();
  if (!currentURL || pending) return;
  pending = true;
  element('add').disabled = true;
  element('message').textContent = '';
  send('add', { name: element('name').value, timestamp: element('time').value });
});
iina.postMessage('ready');
