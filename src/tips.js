// tips.js - 生成待ち時間を楽しくするための雑学Tips表示コントローラー
// 生成開始直後は「他のタブに移動するとポップアップが閉じて中断される」という
// 実用的な注意メッセージを表示し、その後は暇つぶしの雑学を一定間隔でランダム表示する。

const TRIVIA_TIPS = [
  "🐙 タコの心臓は3つある。2つはエラへ、残り1つが全身へ血液を送っている。",
  "🍯 はちみつはほぼ腐らない。数千年前の遺跡から見つかったものが、今でも食べられる状態だったという報告もある。",
  "🦒 キリンの首の骨は人間と同じ7個。1つ1つがとても長いだけ。",
  "🍌 バナナは植物学上「果実」で、バナナの木は木本ではなく多年草に分類される。",
  "🐧 ペンギンにはひざがある。羽毛の下に隠れているだけで、しっかり曲がる関節がある。",
  "🧠 脳自体には痛みを感じる神経がない。開頭手術は局所麻酔だけで行えることがある。",
  "🌕 満月は地球との距離によって、見た目の大きさが最大で1割以上変わる。",
  "🐌 カタツムリの歯（歯舌）は種類によっては数千本にもなる。",
  "🐝 ミツバチは「8の字ダンス」で仲間に花の方向と距離を伝える。",
  "🦈 サメの祖先は、木が地球に現れるより前から existed していたとされる。",
  "🦦 ラッコは眠るとき流されないよう、海藻を体に巻き付けたり仲間と手をつないだりする。",
  "🌈 虹は本当は輪っか状（円形）。地面があるため、地上からは半分しか見えない。",
  "⏱ 「1分＝60秒」という単位は、古代バビロニアの60進法に由来する。",
  "🐘 ゾウは低周波の音を足で感じ取り、遠くの仲間とやり取りしていると考えられている。"
];

const TAB_WARNING_TEXT =
  "他のタブをクリックするとポップアップが閉じて生成が中断されてしまいます。このままコーヒーブレイクでもどうぞ。";

let timeoutId = null;
let intervalId = null;
let timerIntervalId = null;
let timerStartMs = null;
let lastTipIndex = -1;

function pickNextTip() {
  if (TRIVIA_TIPS.length <= 1) return TRIVIA_TIPS[0] || "";
  let next;
  do {
    next = Math.floor(Math.random() * TRIVIA_TIPS.length);
  } while (next === lastTipIndex);
  lastTipIndex = next;
  return TRIVIA_TIPS[next];
}

// 経過時間を "00:00" 形式に整形する（履歴画面の「休憩した時間」表示でも再利用する）
export function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const ss = (totalSec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// 現在計測中の経過ミリ秒を取得する（stopTipsBannerでリセットされる前に呼び出すこと）。
// 生成完了時に「何分休憩できたか」を履歴へ記録するために使う。
export function getElapsedMs() {
  return timerStartMs != null ? Date.now() - timerStartMs : null;
}

// icon省略時（雑学Tips）はアイコンを出さず、テキストだけ表示する。
// コーヒーブレイクの案内も雑学Tipsも同じ .tips-message-box の配色に統一しているので、
// 「注意メッセージだけ色が違う」という状態にはならない。
function setBannerContent(container, icon, text) {
  const iconEl = container.querySelector(".tips-icon");
  const textEl = container.querySelector(".tips-text");
  if (!textEl) return;

  textEl.classList.add("tips-fade");

  setTimeout(() => {
    if (iconEl) {
      if (icon) {
        iconEl.textContent = icon;
        iconEl.style.display = "";
      } else {
        iconEl.textContent = "";
        iconEl.style.display = "none";
      }
    }
    textEl.textContent = text;
    textEl.classList.remove("tips-fade");
  }, 180);
}

// 生成開始時に呼び出す：警告メッセージ→雑学の順にメッセージボックスを回し始める
export function startTipsBanner(container) {
  if (!container) return;
  stopTipsBanner(container);

  container.innerHTML =
    '<span class="spinner"></span>' +
    '<div class="tips-timer-block">' +
    '<span class="tips-timer">00:00</span>' +
    '<span class="tips-timer-label">休憩できている時間</span>' +
    '</div>' +
    '<div class="tips-message-box">' +
    '<span class="tips-icon">☕</span><span class="tips-text"></span>' +
    '</div>';
  container.style.display = "flex";

  const textEl = container.querySelector(".tips-text");
  if (textEl) textEl.textContent = TAB_WARNING_TEXT;

  lastTipIndex = -1;

  // 「待ち時間」ではなく「休憩できている時間」としてカウントアップ表示する
  timerStartMs = Date.now();
  const timerEl = container.querySelector(".tips-timer");
  if (timerEl) timerEl.textContent = "00:00";
  timerIntervalId = setInterval(() => {
    if (timerEl) timerEl.textContent = formatElapsed(Date.now() - timerStartMs);
  }, 1000);

  // 最初の警告メッセージをしばらく表示した後、雑学のローテーションへ切り替える（アイコンなし）
  timeoutId = setTimeout(() => {
    setBannerContent(container, "", pickNextTip());
    intervalId = setInterval(() => {
      setBannerContent(container, "", pickNextTip());
    }, 4200);
  }, 4800);
}

// 生成完了・失敗・画面遷移時に呼び出す：タイマーを止めてボックスを隠す
export function stopTipsBanner(container) {
  if (timeoutId) clearTimeout(timeoutId);
  if (intervalId) clearInterval(intervalId);
  if (timerIntervalId) clearInterval(timerIntervalId);
  timeoutId = null;
  intervalId = null;
  timerIntervalId = null;
  timerStartMs = null;

  if (container) {
    container.style.display = "none";
    container.innerHTML = "";
  }
}
