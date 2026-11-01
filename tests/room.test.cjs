const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

// A deterministic clock verifies recovery/cleanup boundaries without waiting
// minutes or loading a third-party music frame. Browser layout is checked apart.
function room({ reduced = false, storageBlocked = false, stored = null, discovered = false, hash = '', random = .5, observeWindow = false } = {}) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const setTimer = (callback, delay) => {
    const id = ++nextId;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const entry = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      const [id, timer] = entry;
      timers.delete(id);
      now = timer.at;
      timer.callback();
    }
    now = end;
  }
  class Element {
    constructor() {
      this.attributes = {};
      this.dataset = {};
      this.listeners = {};
      this.children = [];
      this.textContent = '';
      const classes = new Set();
      this.classList = {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        toggle(name, force) {
          const on = force === undefined ? !classes.has(name) : force;
          if (on) classes.add(name); else classes.delete(name);
          return on;
        },
      };
      this.style = { removeProperty() {}, setProperty() {} };
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(name, callback) { (this.listeners[name] ??= []).push(callback); }
    fire(name, props = {}) { for (const callback of this.listeners[name] || []) callback({ target: this, ...props }); }
    click() { this.fire('click'); }
    focus() { document.activeElement = this; this.fire('focus'); }
    replaceChildren(...children) { this.children = children; }
    contains(element) { return element === this || this.children.some((child) => child.contains(element)); }
    querySelector(selector) { if (selector === '[data-close]') return this.closeButton; }
    querySelectorAll(selector) { if (selector === 'i') return this.lights; return []; }
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
    getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 }; }
  }
  const ids = [...readFileSync(resolve(__dirname, '../index.html'), 'utf8').matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  const document = new Element();
  document.body = new Element();
  document.hidden = false;
  document.getElementById = (id) => elements[id];
  document.createElement = () => new Element();
  document.querySelector = () => new Element();
  const plugs = ['STDIO', 'HTTP', 'OpenAPI'].map((name) => {
    const plug = new Element();
    plug.dataset.plug = name;
    plug.setAttribute('aria-pressed', 'false');
    return plug;
  });
  const shortcuts = ['project', 'music', 'note', 'stickers'].map((name) => {
    const button = new Element();
    button.dataset.open = name;
    return button;
  });
  const stickerTabs = [elements.stickerTab0, elements.stickerTab1];
  document.querySelectorAll = (selector) => selector === '[data-plug]' ? plugs
    : selector === '[data-open]' ? shortcuts
      : selector === '[data-sticker-pack]' ? stickerTabs : [];
  elements.catSecret.hidden = true;
  elements.catSecret.children = [shortcuts[3], elements.closeCatSecret];
  elements.hub.lights = Array.from({ length: 3 }, () => new Element());
  for (const name of ['project', 'music', 'note', 'stickers']) elements[`${name}Dialog`].closeButton = new Element();
  const media = { reduced: { matches: reduced, addEventListener() {} }, hover: { matches: true, addEventListener() {} } };
  const localStorage = {
    value: stored,
    flags: new Map(discovered ? [['jw-dixi-discovered-v1', 'true']] : []),
    getItem(key) {
      if (storageBlocked) throw Error('denied');
      return key === 'jw-room-preferences-v1' ? this.value : (this.flags.get(key) ?? null);
    },
    setItem(key, value) {
      if (storageBlocked) throw Error('denied');
      if (key === 'jw-room-preferences-v1') this.value = value;
      else this.flags.set(key, value);
    },
  };
  let observationCallback;
  let observedWindow;
  class FakeIntersectionObserver {
    constructor(callback) { observationCallback = callback; }
    observe(target) { observedWindow = target; }
  }
  const context = vm.createContext({
    document, window: {
      location: { hash },
      matchMedia: (query) => query.includes('reduced-motion') ? media.reduced : media.hover,
      ...(observeWindow ? { IntersectionObserver: FakeIntersectionObserver } : {}),
    },
    IntersectionObserver: FakeIntersectionObserver,
    Math: Object.assign(Object.create(Math), { random: () => random }),
    localStorage, performance: { now: () => now }, setTimeout: setTimer, clearTimeout: (id) => timers.delete(id),
    setInterval: () => 0, requestAnimationFrame: (fn) => setTimer(fn, 16), cancelAnimationFrame: (id) => timers.delete(id),
    console, Intl, Date,
  });
  vm.runInContext(readFileSync(resolve(__dirname, '../app.js'), 'utf8'), context);
  return { elements, advance, document, localStorage, plugs, shortcuts, stickerTabs,
    setWindowVisible: (visible) => observationCallback?.((Array.isArray(visible) ? visible : [visible]).map((value) => ({ isIntersecting: value }))),
    getObservedWindow: () => observedWindow,
  };
}

test('cat: tap, stretch, turn away, recover; extra taps do not extend refusal', () => {
  const { elements, advance } = room();
  const cat = elements.catButton;
  cat.click();
  assert.equal(cat.dataset.state, 'awake');
  cat.click();
  assert.equal(cat.dataset.state, 'stretching');
  cat.click();
  assert.equal(cat.dataset.state, 'turned');
  advance(3000);
  cat.click();
  advance(1000);
  assert.equal(cat.dataset.state, 'sleeping');
  advance(5000);
  assert.equal(cat.dataset.state, 'sleeping');
});

test('cat: finishing a stretch cannot interrupt a later turn-away', () => {
  const { elements, advance } = room();
  elements.catButton.click();
  advance(100);
  elements.catButton.click();
  advance(100);
  elements.catButton.click();
  advance(2000);
  assert.equal(elements.catButton.dataset.state, 'turned');
  advance(2000);
  assert.equal(elements.catButton.dataset.state, 'sleeping');
});

test('reduced motion: no autonomous idle behavior is scheduled', () => {
  const { elements, advance } = room({ reduced: true });
  elements.catButton.click();
  advance(4200);
  advance(120000);
  assert.equal(elements.catButton.dataset.state, 'sleeping');
});

test('hidden page cancels an active cat behavior and restores safe sleep', () => {
  const { elements, document, advance } = room();
  elements.catButton.click();
  elements.catButton.click();
  document.hidden = true;
  document.fire('visibilitychange');
  advance(120000);
  assert.equal(elements.catButton.dataset.state, 'sleeping');
  document.hidden = false;
  document.fire('visibilitychange');
  elements.catButton.click();
  assert.equal(elements.catButton.dataset.state, 'awake');
});

test('music: lazy frame, manual playback URL, teardown on any close, focus return', () => {
  const { elements, shortcuts, document } = room();
  assert.equal(elements.musicEmbed.children.length, 0);
  shortcuts[1].click();
  assert.equal(elements.musicDialog.open, true);
  assert.equal(elements.musicEmbed.children.length, 1);
  assert.match(elements.musicEmbed.children[0].src, /id=474447967&auto=0/);
  assert.equal(elements.playerButton.getAttribute('aria-expanded'), 'true');
  elements.musicDialog.close();
  assert.equal(elements.musicEmbed.children.length, 0);
  assert.equal(elements.playerButton.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, shortcuts[1]);
});

test('patchboard lights correspond to connected plugs, including disconnect', () => {
  const { elements, plugs } = room();
  plugs.forEach((plug) => plug.click());
  assert.equal(elements.hub.classList.contains('complete'), true);
  assert.match(elements.connectionOutput.textContent, /all systems purring/);
  plugs[1].click();
  assert.equal(elements.hub.classList.contains('complete'), false);
  assert.equal(elements.hub.lights[1].classList.contains('lit'), false);
  assert.match(elements.connectionOutput.textContent, /^2 \/ 3/);
});

test('preferences: invalid data and denied storage never break controls', () => {
  const { elements, document } = room({ stored: '{broken', storageBlocked: true });
  elements.themeButton.click();
  assert.equal(document.body.classList.contains('day'), true);
  assert.equal(elements.themeButton.getAttribute('aria-label'), '白天模式');
  assert.equal(elements.themeButton.getAttribute('aria-pressed'), 'true');
  elements.lampButton.click();
  assert.equal(elements.scene.classList.contains('lamp-off'), true);
  assert.equal(elements.lampButton.getAttribute('aria-label'), '台灯');
});

test('preferences: saved booleans restore independently of malformed fields', () => {
  const { elements, document, localStorage } = room({ stored: '{"day":true,"lampOn":"false"}' });
  assert.equal(document.body.classList.contains('day'), true);
  assert.equal(elements.lampButton.getAttribute('aria-pressed'), 'true');
  elements.lampButton.click();
  assert.deepEqual(JSON.parse(localStorage.value), { day: true, lampOn: false, weather: 'clear' });
});

test('Dixi discovery: first tap reveals invitation without opening a dialog or interrupting petting', () => {
  const { elements, document, localStorage, advance } = room();
  assert.equal(elements.stickerButton.hidden, true);
  elements.catButton.focus();
  elements.catButton.click();
  assert.equal(elements.catSecret.hidden, false);
  assert.equal(elements.stickerButton.hidden, false);
  assert.equal(document.activeElement, elements.catButton);
  assert.equal(elements.stickersDialog.open, undefined);
  assert.equal(localStorage.flags.get('jw-dixi-discovered-v1'), 'true');
  elements.catButton.click();
  assert.equal(elements.catButton.dataset.state, 'stretching');
  elements.catButton.click();
  assert.equal(elements.catButton.dataset.state, 'turned');
  assert.equal(elements.catSecret.hidden, true);
  assert.equal(elements.stickerButton.hidden, false);
  advance(4000);
  elements.catButton.click();
  assert.equal(elements.catSecret.hidden, true);
});

test('Dixi discovery: remembered discovery shows a quiet reusable link, not another pop-up', () => {
  const { elements } = room({ discovered: true });
  assert.equal(elements.stickerButton.hidden, false);
  elements.catButton.click();
  assert.equal(elements.catSecret.hidden, true);
});

test('Dixi discovery: denied storage does not break the secret or room preferences', () => {
  const { elements } = room({ storageBlocked: true });
  elements.catButton.click();
  assert.equal(elements.catSecret.hidden, false);
  elements.closeCatSecret.click();
  assert.equal(elements.catSecret.hidden, true);
  elements.stickerButton.click();
  assert.equal(elements.stickersDialog.open, true);
});

test('sticker packs: native preview is lazy; QR, artwork and external URL switch together', () => {
  const { elements, stickerTabs } = room({ discovered: true });
  assert.equal(elements.stickerPreviewGrid.children.length, 0);
  assert.equal(elements.stickerEmbed.children.length, 0);
  elements.stickerButton.click();
  assert.equal(elements.stickerPreviewGrid.children.length, 4);
  assert.equal(elements.stickerEmbed.children.length, 0);
  assert.equal(elements.stickerPackTitle.textContent, '迪西有话说');
  const firstLink = elements.stickerExternalLink.href;
  stickerTabs[1].click();
  assert.equal(elements.stickerPackTitle.textContent, '迪西有点皮');
  assert.match(elements.stickerQr.src, /pack-2-qr.png$/);
  assert.match(elements.stickerCover.src, /pack-2-cover.png$/);
  assert.match(elements.stickerPreviewGrid.children[0].src, /pack-2-preview-1.png$/);
  assert.notEqual(elements.stickerExternalLink.href, firstLink);
  assert.equal(stickerTabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(stickerTabs[0].tabIndex, -1);
});

test('sticker iframe: explicit opt-in, only one active frame, removed on collapse and close', () => {
  const { elements, stickerTabs } = room({ discovered: true });
  elements.stickerButton.click();
  elements.stickerEmbedButton.click();
  const firstFrame = elements.stickerEmbed.children[0];
  assert.equal(elements.stickerEmbed.children.length, 1);
  assert.equal(firstFrame.title, '微信表情商店：迪西有话说');
  stickerTabs[1].click();
  assert.equal(elements.stickerEmbed.children.length, 1);
  assert.notEqual(elements.stickerEmbed.children[0], firstFrame);
  assert.equal(elements.stickerEmbed.children[0].src, elements.stickerExternalLink.href);
  elements.stickerEmbedButton.click();
  assert.equal(elements.stickerEmbed.children.length, 0);
  elements.stickerEmbedButton.click();
  elements.stickersDialog.close();
  assert.equal(elements.stickerEmbed.children.length, 0);
  assert.equal(elements.stickerEmbedButton.getAttribute('aria-expanded'), 'false');
});

test('secret-triggered dialog closes back to visible persistent link; direct sharing also works', () => {
  const { elements, shortcuts, document } = room();
  elements.catButton.click();
  shortcuts[3].focus();
  shortcuts[3].click();
  assert.equal(elements.catSecret.hidden, true);
  elements.stickersDialog.close();
  assert.equal(document.activeElement, elements.stickerButton);
  assert.equal(elements.stickerButton.hidden, false);
  const direct = room({ hash: '#dixi' });
  assert.equal(direct.elements.stickersDialog.open, true);
  assert.equal(direct.elements.stickerButton.hidden, false);
});

test('sticker tabs: keyboard navigation selects pack and moves tab focus', () => {
  const { elements, stickerTabs, document } = room({ discovered: true });
  elements.stickerButton.click();
  let prevented = false;
  stickerTabs[0].fire('keydown', { key: 'ArrowRight', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(document.activeElement, stickerTabs[1]);
  assert.equal(elements.stickerPackContent.getAttribute('aria-labelledby'), 'stickerTab1');
});

test('weather: legacy settings restore with clear weather; invalid weather is ignored', () => {
  for (const weather of [undefined, 'storm', '__proto__', 12, null]) {
    const { elements, document } = room({ stored: JSON.stringify({ day: true, lampOn: false, weather }) });
    assert.equal(elements.weatherSelect.value, 'clear');
    assert.equal(elements.scene.dataset.weather, 'clear');
    assert.equal(document.body.classList.contains('day'), true);
    assert.equal(elements.scene.classList.contains('lamp-off'), true);
  }
});

test('weather: saved weather, day and lamp restore independently; toggles preserve weather', () => {
  const { elements, localStorage, document } = room({ stored: '{"day":true,"lampOn":false,"weather":"snow"}' });
  assert.equal(elements.weatherSelect.value, 'snow');
  assert.equal(elements.scene.dataset.weather, 'snow');
  elements.themeButton.click();
  elements.lampButton.click();
  assert.equal(document.body.classList.contains('day'), false);
  assert.equal(elements.scene.dataset.weather, 'snow');
  assert.deepEqual(JSON.parse(localStorage.value), { day: false, lampOn: true, weather: 'snow' });
});

test('weather: selecting each weather updates the window and persists; invalid input is rejected', () => {
  const { elements, localStorage } = room();
  for (const weather of ['rain', 'snow', 'fog', 'clear']) {
    elements.weatherSelect.value = weather;
    elements.weatherSelect.fire('change');
    assert.equal(elements.scene.dataset.weather, weather);
    assert.equal(JSON.parse(localStorage.value).weather, weather);
    assert.ok(elements.windowCaption.textContent.length > 0);
  }
  elements.weatherSelect.value = 'invalid';
  elements.weatherSelect.fire('change');
  assert.equal(elements.weatherSelect.value, 'clear');
  assert.equal(elements.scene.dataset.weather, 'clear');
});

test('weather: storage denial and reduced motion still allow all weather choices without cat motion', () => {
  const { elements, advance } = room({ storageBlocked: true, reduced: true, random: .1 });
  for (const weather of ['rain', 'snow', 'fog']) {
    elements.weatherSelect.value = weather;
    elements.weatherSelect.fire('change');
    assert.equal(elements.scene.dataset.weather, weather);
  }
  assert.notEqual(elements.catButton.dataset.state, 'watching');
  assert.notEqual(elements.catButton.dataset.state, 'shifting');
  advance(60000);
  assert.notEqual(elements.catButton.dataset.state, 'watching');
});

test('weather: snow occasionally interests Dixi, with recovery and cooldown, without revealing the secret', () => {
  const { elements, advance } = room({ random: .1 });
  elements.weatherSelect.value = 'snow';
  elements.weatherSelect.fire('change');
  assert.equal(elements.catButton.dataset.state, 'watching');
  assert.equal(elements.catSecret.hidden, true);
  assert.equal(elements.stickerButton.hidden, true);
  advance(2500);
  assert.equal(elements.catButton.dataset.state, 'sleeping');
  elements.weatherSelect.value = 'rain';
  elements.weatherSelect.fire('change');
  assert.equal(elements.catButton.dataset.state, 'sleeping');
  advance(20000);
  elements.weatherSelect.value = 'clear';
  elements.weatherSelect.fire('change');
  elements.weatherSelect.value = 'snow';
  elements.weatherSelect.fire('change');
  assert.equal(elements.catButton.dataset.state, 'watching');
});

test('weather: rain can cause a small reposition; normal petting takes priority and cancels recovery', () => {
  const { elements, advance } = room({ random: .1 });
  elements.weatherSelect.value = 'rain';
  elements.weatherSelect.fire('change');
  assert.equal(elements.catButton.dataset.state, 'shifting');
  elements.catButton.click();
  assert.equal(elements.catButton.dataset.state, 'awake');
  elements.catButton.click();
  elements.catButton.click();
  elements.weatherSelect.value = 'snow';
  elements.weatherSelect.fire('change');
  assert.equal(elements.catButton.dataset.state, 'turned');
  advance(2500);
  assert.equal(elements.catButton.dataset.state, 'turned');
  advance(1500);
  assert.equal(elements.catButton.dataset.state, 'sleeping');
});

test('weather: reactions remain occasional and do not run behind an open dialog', () => {
  const quiet = room({ random: .9 });
  quiet.elements.weatherSelect.value = 'snow';
  quiet.elements.weatherSelect.fire('change');
  assert.notEqual(quiet.elements.catButton.dataset.state, 'watching');
  const { elements } = room({ random: .1 });
  elements.computerButton.click();
  elements.weatherSelect.value = 'snow';
  elements.weatherSelect.fire('change');
  assert.equal(elements.catButton.dataset.state, 'sleeping');
});

test('weather: offscreen and hidden-page pauses combine without resuming too early', () => {
  const { elements, document, setWindowVisible, getObservedWindow } = room({ observeWindow: true });
  assert.equal(getObservedWindow(), elements.roomWindow);
  setWindowVisible(false);
  assert.equal(elements.scene.classList.contains('weather-paused'), true);
  document.hidden = true;
  document.fire('visibilitychange');
  setWindowVisible(true);
  assert.equal(elements.scene.classList.contains('weather-paused'), true);
  document.hidden = false;
  document.fire('visibilitychange');
  assert.equal(elements.scene.classList.contains('weather-paused'), false);
  setWindowVisible([true, false]);
  assert.equal(elements.scene.classList.contains('weather-paused'), true);
  setWindowVisible([false, true]);
  assert.equal(elements.scene.classList.contains('weather-paused'), false);
});
