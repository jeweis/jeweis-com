'use strict';

const $ = (id) => document.getElementById(id);
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const hoverPreference = window.matchMedia('(hover: hover) and (pointer: fine)');

// Only two local preferences are stored; no accounts, requests or visitor tracking.
const preferenceKey = 'jw-room-preferences-v1';
let preferences = { day: false, lampOn: true };
try {
  const saved = JSON.parse(localStorage.getItem(preferenceKey));
  if (saved && typeof saved === 'object') {
    if (typeof saved.day === 'boolean') preferences.day = saved.day;
    if (typeof saved.lampOn === 'boolean') preferences.lampOn = saved.lampOn;
  }
} catch { /* The room also works when browser storage is unavailable. */ }

function applyPreferences() {
  document.body.classList.toggle('day', preferences.day);
  $('scene').classList.toggle('lamp-off', !preferences.lampOn);
  $('themeButton').setAttribute('aria-pressed', String(preferences.day));
  $('themeButton').setAttribute('aria-label', '白天模式');
  $('themeText').textContent = preferences.day ? '切到深夜' : '切到白天';
  $('themeIcon').textContent = preferences.day ? '☀' : '☾';
  $('statusText').textContent = preferences.day ? '白日放空中' : '夜间营业中';
  $('lampButton').setAttribute('aria-pressed', String(preferences.lampOn));
  $('lampButton').setAttribute('aria-label', '台灯');
  document.title = `几未同学 · ${preferences.day ? '白日放空中' : '夜间营业中'}`;
  document.querySelector('meta[name="theme-color"]').content = '#f3f1e9';
}
function savePreferences() {
  applyPreferences();
  try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Optional. */ }
}
applyPreferences();
$('themeButton').addEventListener('click', () => {
  preferences.day = !preferences.day;
  savePreferences();
});
$('lampButton').addEventListener('click', () => {
  preferences.lampOn = !preferences.lampOn;
  savePreferences();
});

// Each detail panel has its own accessible title, close control and focus return.
const panels = {
  project: { dialog: $('projectDialog'), trigger: $('computerButton') },
  music: { dialog: $('musicDialog'), trigger: $('playerButton') },
  note: { dialog: $('noteDialog'), trigger: $('noteButton') },
};
let activePanel = null;
let returnFocus = null;

function openPanel(name, trigger) {
  if (activePanel) return;
  const panel = panels[name];
  returnFocus = trigger || panel.trigger;
  activePanel = panel;
  panel.trigger.setAttribute('aria-expanded', 'true');
  if (name === 'music') {
    const iframe = document.createElement('iframe');
    iframe.title = '网易云音乐播放器：你爱的样子';
    iframe.src = 'https://music.163.com/outchain/player?type=2&id=474447967&auto=0&height=66';
    iframe.width = '330';
    iframe.height = '86';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    $('musicEmbed').replaceChildren(iframe);
  }
  catController.pause();
  panel.dialog.showModal();
  panel.dialog.querySelector('[data-close]').focus({ preventScroll: true });
}
Object.entries(panels).forEach(([name, panel]) => {
  panel.trigger.setAttribute('aria-expanded', 'false');
  panel.trigger.addEventListener('click', () => openPanel(name, panel.trigger));
  panel.dialog.querySelector('[data-close]').addEventListener('click', () => panel.dialog.close());
  panel.dialog.addEventListener('click', (event) => {
    if (event.target !== panel.dialog) return;
    const rect = panel.dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) panel.dialog.close();
  });
  panel.dialog.addEventListener('close', () => {
    // Removing the frame also stops playback; no hidden audio remains.
    if (name === 'music') $('musicEmbed').replaceChildren();
    panel.trigger.setAttribute('aria-expanded', 'false');
    activePanel = null;
    returnFocus?.focus({ preventScroll: true });
    catController.resume();
  });
});
document.querySelectorAll('[data-open]').forEach((button) => {
  button.addEventListener('click', () => openPanel(button.dataset.open, button));
});

// A patchboard demo: the wire and its matching hub light share the same state.
const plugs = [...document.querySelectorAll('[data-plug]')];
const hubLights = [...$('hub').querySelectorAll('i')];
plugs.forEach((button, index) => {
  button.addEventListener('click', () => {
    const connected = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(connected));
    button.classList.toggle('connected', connected);
    hubLights[index].classList.toggle('lit', connected);
    const count = plugs.filter((plug) => plug.getAttribute('aria-pressed') === 'true').length;
    $('hub').classList.toggle('complete', count === plugs.length);
    $('connectionOutput').textContent = count === 3
      ? '● all systems purring. 喵，连起来了！'
      : `${count} / 3 connected · ${count ? '再接一个试试？' : '等待连接'}`;
  });
});

let speechTimer;
function whisper(text) {
  clearTimeout(speechTimer);
  $('speech').textContent = text;
  $('speech').classList.add('visible');
  speechTimer = setTimeout(() => $('speech').classList.remove('visible'), 3200);
}
let coffeeCount = 0;
const coffeeNotes = ['喝一口。事情可以慢慢来。', '咖啡已经凉了，想法还是热的。', '这杯之后，记得喝点水。'];
$('mugButton').addEventListener('click', () => whisper(coffeeNotes[coffeeCount++ % coffeeNotes.length]));

// Cat state is explicit: timers belong to a single behavior, so rapid taps cannot
// leave the cat stuck halfway through an earlier animation.
const catController = (() => {
  const cat = $('catButton');
  const hint = $('catHint');
  const labels = {
    sleeping: ['它好像睡着了。轻轻摸一下？', '摸摸小猫，它正在睡觉'],
    alert: ['耳朵动了一下。它发现你了。', '摸摸小猫，它正看着你'],
    awake: ['醒了。要再伸个懒腰吗？', '再摸一下，让小猫伸懒腰'],
    stretching: ['一个很长——的懒腰。', '小猫正在伸懒腰'],
    turned: ['好吧，给它留一点独处时间。', '小猫背过身去了，等它休息'],
    shifting: ['它找到了一个更舒服的位置。', '小猫正在换姿势'],
  };
  let state = 'sleeping';
  let behaviorTimer;
  let idleTimer;
  let pointerTimer;
  let clickCount = 0;
  let lastClick = -Infinity;
  let paused = false;
  let headFrame = 0;

  function resetHead() {
    if (headFrame) cancelAnimationFrame(headFrame);
    headFrame = 0;
    cat.style.removeProperty('--head-x');
    cat.style.removeProperty('--head-y');
    cat.style.removeProperty('--head-rotation');
  }
  function setState(next) {
    clearTimeout(behaviorTimer);
    state = next;
    cat.dataset.state = next;
    hint.textContent = labels[next][0];
    cat.setAttribute('aria-label', labels[next][1]);
    if (!['alert', 'awake'].includes(next)) resetHead();
  }
  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (paused || document.hidden || motionPreference.matches) return;
    idleTimer = setTimeout(() => {
      if (state === 'sleeping') {
        setState(Math.random() > .5 ? 'shifting' : 'stretching');
        behaviorTimer = setTimeout(sleep, 2300);
      } else scheduleIdle();
    }, 40000 + Math.random() * 18000);
  }
  function sleep() {
    setState('sleeping');
    clickCount = 0;
    scheduleIdle();
  }
  function wake() {
    if (paused || ['stretching', 'turned', 'shifting'].includes(state)) return;
    clearTimeout(idleTimer);
    clearTimeout(pointerTimer);
    if (state === 'sleeping') setState('alert');
  }
  function leave() {
    clearTimeout(pointerTimer);
    resetHead();
    if (state === 'alert') pointerTimer = setTimeout(sleep, 1100);
  }
  function tap() {
    if (paused) return;
    clearTimeout(pointerTimer);
    clearTimeout(idleTimer);
    const now = performance.now();
    if (state === 'turned') return; // Extra taps never prolong the grumpy state.
    if (now - lastClick > 4500) clickCount = 0;
    clickCount++;
    lastClick = now;
    if (clickCount === 1) {
      setState('awake');
      behaviorTimer = setTimeout(sleep, 4200);
    } else if (clickCount === 2) {
      setState('stretching');
      behaviorTimer = setTimeout(() => {
        setState('awake');
        behaviorTimer = setTimeout(sleep, 2500);
      }, 1900);
    } else {
      setState('turned');
      whisper('让我再睡五分钟嘛。');
      behaviorTimer = setTimeout(sleep, 4000);
    }
  }
  cat.addEventListener('click', tap);
  cat.addEventListener('focus', wake);
  cat.addEventListener('blur', leave);
  $('scene').addEventListener('pointermove', (event) => {
    if (!hoverPreference.matches || motionPreference.matches || paused || event.pointerType === 'touch') return;
    const rect = cat.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width * .35);
    const dy = event.clientY - (rect.top + rect.height * .6);
    const near = event.clientX >= rect.left - 60 && event.clientX <= rect.right + 60
      && event.clientY >= rect.top - 70 && event.clientY <= rect.bottom + 45;
    if (!near) { leave(); return; }
    wake();
    if (!['alert', 'awake'].includes(state) || headFrame) return;
    headFrame = requestAnimationFrame(() => {
      const clamp = (n, max) => Math.max(-max, Math.min(max, n));
      cat.style.setProperty('--head-x', `${clamp(dx / 35, 3)}px`);
      cat.style.setProperty('--head-y', `${clamp(dy / 40, 2)}px`);
      cat.style.setProperty('--head-rotation', `${clamp(dx / 35, 4)}deg`);
      headFrame = 0;
    });
  });
  $('scene').addEventListener('pointerleave', leave);
  motionPreference.addEventListener('change', () => { resetHead(); scheduleIdle(); });
  function pause() {
    paused = true;
    clearTimeout(idleTimer);
    clearTimeout(pointerTimer);
    sleep();
  }
  function resume() { paused = false; scheduleIdle(); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (!activePanel) resume();
  });
  scheduleIdle();
  return { pause, resume };
})();

function updateClock() {
  const now = new Date();
  $('clock').textContent = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  $('clock').dateTime = now.toISOString();
  $('year').textContent = now.getFullYear();
}
updateClock();
setInterval(updateClock, 30000);
