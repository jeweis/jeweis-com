const $ = (id) => document.getElementById(id);
const dialog = $('detailDialog');
let speechTimer;
let catClicks = 0;
let lastFocus;
const catLines = ['喵。你也还没睡呀。', '今天的代码，就写到这里吧。', '这里的首席摸鱼官，是我。', '别点啦，再点就要踩键盘了。', '你发现了：小猫才是这个网站的管理员。'];
function say(text) {
  clearTimeout(speechTimer);
  $('speech').textContent = text;
  $('speech').classList.add('visible');
  speechTimer = setTimeout(() => $('speech').classList.remove('visible'), 4200);
}
function openDetail(content) {
  lastFocus = document.activeElement;
  $('dialogContent').innerHTML = content;
  dialog.showModal();
}
function closeDetail() { dialog.close(); }
$('closeDialog').addEventListener('click', closeDetail);
dialog.addEventListener('click', (event) => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeDetail();
});
dialog.addEventListener('close', () => {
  dialog.querySelector('iframe')?.remove();
  document.body.classList.remove('music-open');
  lastFocus?.focus();
});
$('themeButton').addEventListener('click', () => {
  const day = document.body.classList.toggle('day');
  $('themeButton').innerHTML = day ? '☀ <span>打开月亮</span>' : '☾ <span>关掉月亮</span>';
  $('themeButton').setAttribute('aria-label', day ? '切换到深夜' : '切换到白天');
  $('statusText').textContent = day ? '白日放空中' : '夜间营业中';
  document.title = `几未同学 · ${day ? '白日放空中' : '夜间营业中'}`;
});
$('lampButton').addEventListener('click', () => {
  const off = $('scene').classList.toggle('lamp-off');
  $('lampButton').setAttribute('aria-pressed', String(!off));
  say(off ? '让眼睛休息一下，也让灵感休息一下。' : '留一盏灯，给还没睡的想法。');
});
$('computerButton').addEventListener('click', () => {
  openDetail(`<div class="dialog-eyebrow">01 / THINGS I BUILD</div><h2 class="dialog-title">mcpcat<span style="font:16px monospace;color:#8a987e"> /ᐠ｡ꞈ｡ᐟ\\</span></h2><p class="dialog-copy">给 AI 工具找一个共同的入口。<br>这是我做的 MCP 聚合平台，把不同协议的服务放在一起管理、运行，也能把 OpenAPI 配置转成 MCP。</p><div class="tags"><span>STDIO</span><span>Streamable HTTP</span><span>SSE</span><span>OpenAPI → MCP</span></div><p class="dialog-copy">试着把下面三个插头接上：</p><div class="connection"><button data-plug="STDIO" aria-pressed="false">＋ STDIO</button><button data-plug="HTTP" aria-pressed="false">＋ HTTP</button><button data-plug="OpenAPI" aria-pressed="false">＋ OpenAPI</button><span>→ 🐈</span></div><p class="connection-output" id="connectionOutput" aria-live="polite">waiting for connections…</p><a class="dialog-link" href="https://github.com/jeweis/mcpcat" target="_blank" rel="noopener noreferrer">在 GitHub 看看 mcpcat ↗</a>`);
  const plugs = dialog.querySelectorAll('[data-plug]');
  plugs.forEach((plug) => plug.addEventListener('click', () => {
    const active = plug.classList.toggle('connected');
    plug.setAttribute('aria-pressed', String(active));
    plug.textContent = `${active ? '✓' : '＋'} ${plug.dataset.plug}`;
    const count = dialog.querySelectorAll('.connected').length;
    $('connectionOutput').textContent = count === 3 ? '● all systems purring. 喵，连起来了！' : `${count}/3 connected · ${count ? '再接一个试试？' : 'waiting for connections…'}`;
  }));
});
$('playerButton').addEventListener('click', () => {
  document.body.classList.add('music-open');
  openDetail(`<div class="dialog-eyebrow">02 / THINGS I MAKE</div><div class="music-record" aria-hidden="true"></div><h2 class="dialog-title">你爱的样子</h2><p class="dialog-copy">SHAPE OF YOUR LOVE<br>2017 · 单曲 · 03:58<br>词 / 曲 / 编曲 / 演唱</p><p class="dialog-copy">有些心情写进代码里，<br>有些，留在一首歌里。</p><iframe title="网易云音乐播放器：你爱的样子" src="https://music.163.com/outchain/player?type=2&amp;id=474447967&amp;auto=0&amp;height=66" width="330" height="86" style="display:block;clear:both;width:100%;max-width:330px;height:86px;border:0;margin:20px 0 10px" referrerpolicy="strict-origin-when-cross-origin"></iframe><a class="dialog-link" href="https://music.163.com/#/song?id=474447967" target="_blank" rel="noopener noreferrer">去网易云收听 ↗</a><a class="dialog-secondary" href="https://baike.baidu.com/item/%E4%BD%A0%E7%88%B1%E7%9A%84%E6%A0%B7%E5%AD%90/20648798" target="_blank" rel="noopener noreferrer">关于这首歌 ↗</a>`);
});
$('noteButton').addEventListener('click', () => openDetail(`<div class="dialog-eyebrow">A NOTE FOR YOU</div><h2 class="dialog-title">给路过的你。</h2><p class="note-copy">这里是几未同学的小角落。<br>有一个慢慢打磨的项目，<br>一首留在过去的歌，<br>还有一些没想好要做成什么的想法。</p><p class="note-copy">不必每一天都很有成果。<br>能做一点自己喜欢的事，就很好。</p><p class="dialog-copy">如果你也刚好路过，希望这里能让你放松一小会儿。</p><p class="note-copy" style="text-align:right">几未同学<br><small>写于某个不想睡的晚上</small></p>`));
$('catButton').addEventListener('click', () => {
  const cat = $('catButton');
  cat.classList.add('awake');
  cat.querySelector('.cat-face').textContent = '• ᴥ •';
  say(catLines[catClicks % catLines.length]);
  catClicks++;
  cat.classList.toggle('travel', catClicks % 4 === 0);
});
$('mugButton').addEventListener('click', () => say(['喝一口。事情可以慢慢来。', '咖啡已经凉了，想法还是热的。', '这杯之后，记得喝点水。'][Math.floor(Math.random() * 3)]));
function updateClock() {
  $('clock').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  $('year').textContent = new Date().getFullYear();
}
updateClock();
setInterval(updateClock, 30000);
