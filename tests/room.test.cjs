const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

// A deterministic clock verifies recovery/cleanup boundaries without waiting
// minutes or loading a third-party music frame. Browser layout is checked apart.
function room({ reduced = false, storageBlocked = false, stored = null } = {}) {
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
  const shortcuts = ['project', 'music', 'note'].map((name) => {
    const button = new Element();
    button.dataset.open = name;
    return button;
  });
  document.querySelectorAll = (selector) => selector === '[data-plug]' ? plugs : selector === '[data-open]' ? shortcuts : [];
  elements.hub.lights = Array.from({ length: 3 }, () => new Element());
  for (const name of ['project', 'music', 'note']) elements[`${name}Dialog`].closeButton = new Element();
  const media = { reduced: { matches: reduced, addEventListener() {} }, hover: { matches: true, addEventListener() {} } };
  const localStorage = {
    value: stored,
    getItem() { if (storageBlocked) throw Error('denied'); return this.value; },
    setItem(key, value) { if (storageBlocked) throw Error('denied'); this.value = value; },
  };
  const context = vm.createContext({
    document, window: { matchMedia: (query) => query.includes('reduced-motion') ? media.reduced : media.hover },
    localStorage, performance: { now: () => now }, setTimeout: setTimer, clearTimeout: (id) => timers.delete(id),
    setInterval: () => 0, requestAnimationFrame: (fn) => setTimer(fn, 16), cancelAnimationFrame: (id) => timers.delete(id),
    console, Intl, Date,
  });
  vm.runInContext(readFileSync(resolve(__dirname, '../app.js'), 'utf8'), context);
  return { elements, advance, document, localStorage, plugs, shortcuts };
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
  assert.deepEqual(JSON.parse(localStorage.value), { day: true, lampOn: false });
});
