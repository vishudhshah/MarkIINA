const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');

function player(disk = new Map()) {
  let initializing = true;
  let items = [], answer, seeks = [], syncs = 0;
  const events = {};
  const messages = [], handlers = {};
  const sidebar = { loadFile() { for (const name of Object.keys(handlers)) delete handlers[name]; }, show() {}, postMessage: (name, data) => messages.push({ name, data }), onMessage: (name, fn) => { handlers[name] = fn; } };
  const status = { idle: false, url: 'file:///a.mp4', position: 12.75 };
  const menu = {
    item(title, action, options) { return { title, action, ...options, items: [], addSubMenuItem(item) { this.items.push(item); } }; },
    addItem(item) { items.push(item); }, removeAllItems() { items = []; }, forceUpdate() { if (initializing) throw new Error("Native menu rebuild during IINA startup"); }
  };
  vm.runInNewContext(source, { iina: {
    core: { status, osd() {} }, menu, sidebar,
    preferences: { get: key => disk.get(key), set: (key, value) => disk.set(key, value), sync() { syncs++; } },
    utils: { prompt: () => answer }, event: { on: (name, fn) => { events[name] = fn; } },
    mpv: { command: (...args) => seeks.push(args) }, console: { error() {} }
  } });
  initializing = false;
  return { status, disk, events, seeks, messages, handlers, setAnswer(value) { answer = value; },
    get syncs() { return syncs; }, item: title => items.find(i => i.title === title) };
}

test('add, exact jump, per-video isolation, restart persistence, and deletion', () => {
  const p = player();
  p.item('Add Bookmark').action();
  assert.equal(p.syncs, 1);
  p.status.position = 3.5;
  p.setAnswer('  Intro  ');
  p.item('Add Named Bookmark…').action();
  assert.equal(p.item('Jump to Bookmark').items[0].title, 'Intro');
  p.item('Jump to Bookmark').items[0].action();
  assert.deepEqual(JSON.parse(JSON.stringify(p.seeks[0])), ['seek', ['3.5', 'absolute+exact']]);
  p.status.url = 'file:///b.mp4';
  p.events['iina.file-loaded']();
  assert.equal(p.item('Jump to Bookmark').enabled, false);
  const reopened = player(new Map(p.disk));
  assert.equal(reopened.item('Jump to Bookmark').items.length, 2);
  reopened.item('Delete Bookmark').items[0].action();
  assert.equal(reopened.syncs, 1);
  assert.equal(player(new Map(reopened.disk)).item('Jump to Bookmark').items.length, 1);
});

test('cancel, blank names, zero timestamp, idle state, and stale menu actions', () => {
  const p = player();
  p.item('Add Named Bookmark…').action();
  assert.equal(p.disk.size, 0);
  p.status.position = 0;
  p.setAnswer(' ');
  p.item('Add Named Bookmark…').action();
  assert.equal(p.item('Jump to Bookmark').items[0].title, '00:00');
  const stale = p.item('Delete Bookmark').items[0];
  p.status.url = 'file:///b.mp4';
  stale.action();
  assert.equal(player(p.disk).item('Jump to Bookmark').items.length, 1);
  p.status.idle = true;
  p.events['mpv.idle-active.changed']();
  assert.equal(p.item('Add Bookmark').enabled, false);
});

test('invalid saved data is reported without overwriting it', () => {
  const disk = new Map([['bookmarks.v1:file:///a.mp4', '{broken']]);
  const p = player(disk);
  p.item('Add Bookmark').action();
  assert.equal(p.syncs, 0);
  assert.equal(disk.get('bookmarks.v1:file:///a.mp4'), '{broken');
  assert.ok(p.item('Unable to read saved bookmarks'));
});


test('sidebar creates specific timestamps, names only, validates input, jumps and deletes', () => {
  const p = player();
  p.status.duration = 4000;
  p.events['iina.window-loaded']();
  p.handlers.ready();
  p.handlers.action({ type: 'add', url: p.status.url, timestamp: '1:02:03.5', name: 'Finale' });
  assert.equal(p.syncs, 1);
  const state = p.messages.filter(m => m.name === 'state').at(-1).data;
  assert.equal(state.entries[0].time, 3723.5);
  assert.equal(state.entries[0].label, 'Finale');
  p.handlers.action({ type: 'jump', url: p.status.url, id: state.entries[0].id });
  assert.equal(p.seeks[0][1][0], '3723.5');
  for (const timestamp of ['1:99', '-1', 'hello', '99999']) {
    p.handlers.action({ type: 'add', url: p.status.url, timestamp, name: '' });
    assert.equal(p.messages.at(-1).name, 'error');
  }
  assert.equal(p.syncs, 1);
  p.handlers.action({ type: 'delete', url: 'file:///wrong.mp4', id: state.entries[0].id });
  assert.equal(p.syncs, 1);
  p.handlers.action({ type: 'delete', url: p.status.url, id: state.entries[0].id });
  assert.equal(p.item('Jump to Bookmark').enabled, false);
  p.handlers.action({ type: 'add', url: p.status.url, timestamp: '', name: '' });
  assert.equal(p.item('Jump to Bookmark').items[0].title, '00:12');
});


test('startup registers menu without forcing a native rebuild', () => {
  const p = player();
  assert.ok(p.item('Show Bookmarks Panel'));
  p.events['iina.file-loaded']();
  assert.ok(p.item('Add Bookmark'));
});


test('sidebar listeners survive IINA loadFile clearing the message hub', () => {
  const p = player();
  p.item('Add Bookmark').action();
  assert.equal(p.handlers.ready, undefined);
  p.events['iina.window-loaded']();
  assert.equal(typeof p.handlers.ready, 'function');
  assert.equal(typeof p.handlers.action, 'function');
  p.handlers.ready();
  let state = p.messages.filter(m => m.name === 'state').at(-1).data;
  assert.equal(state.url, p.status.url);
  assert.equal(state.entries.length, 1);
  p.handlers.action({ type: 'add', url: p.status.url, timestamp: '25', name: 'Panel bookmark' });
  state = p.messages.filter(m => m.name === 'state').at(-1).data;
  assert.equal(state.entries.length, 2);
  assert.equal(state.entries[1].label, 'Panel bookmark');
  p.item('Show Bookmarks Panel').action();
  assert.equal(typeof p.handlers.action, 'function');
});
