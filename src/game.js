// game.js - 4コマパズルのゲームルール・お題管理・描画・画像エクスポート
import {
  getBoardState,
  setBoardState,
  getHistory,
  addHistoryEntry,
  removeHistoryEntry,
  updateHistoryEntry
} from "./storage.js";
import { startTipsBanner, stopTipsBanner, getElapsedMs, formatElapsed } from "./tips.js";

const POOL = {
  1: [
    "深夜のオフィスで、デスクに向かい一人考え込む人物。",
    "朝の静かな部屋で、湯気の立つカップを手に佇む人物。",
    "荒野の真ん中に、ぽつんと置かれた一つの四角い箱。"
  ],
  2: [
    "突如、空間に歪んだ亀裂が現れる。",
    "手元の小さな物体が重力を失い、静かに浮き上がる。",
    "足元が崩れ、そのまま下へと滑り落ちていく。"
  ],
  3: [
    "周囲の世界が幾何学的な破片となって飛び散る。",
    "遠くの地平線に、巨大で抽象的な影が立ち上がる。",
    "どうすることもできず、ただその場に静かに座り込む。"
  ],
  4: [
    "星々の浮かぶ宇宙空間で、未知の存在と向き合い佇んでいる。",
    "広大な白い空間で、何もない場所を見つめている。",
    "すべてが収まり、元の静寂な日常へと静かに戻る。"
  ]
};

export let currentBoard = {
  panels: {},
  status: "idle", // "idle" | "generating" | "generated"
  historyId: null, // この生成結果に対応する履歴エントリのID（お気に入り切り替えに使う）
  favorite: false,
  elapsedMs: 0 // 生成にかかった＝休憩できた時間
};

// キャプション欄に入力できる最大文字数。字幕風オーバーレイ（2行まで）に
// 収まる範囲でなるべく多く書けるようにしつつ、はみ出しを防ぐための上限。
const CAPTION_MAX_CHARS = 40;

// テキストを最大文字数に丸め、超過分は「…」で省略する（サロゲートペアも考慮）
function truncateCaption(text, limit = CAPTION_MAX_CHARS) {
  const chars = Array.from(text || "");
  if (chars.length <= limit) return chars.join("");
  return chars.slice(0, limit).join("") + "…";
}

// Geminiが返すSVG文字列をinnerHTMLで描画する前にサニタイズする。
// <script>やイベントハンドラ属性（onload等）、javascript:リンク、
// <foreignObject>（任意HTMLの埋め込み経路）を取り除き、インジェクションを防ぐ。
function sanitizeSvgMarkup(svgStr) {
  if (!svgStr || typeof svgStr !== "string") return "";
  let s = svgStr;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  s = s.replace(/\son\w+\s*=\s*"(?:[^"\\]|\\.)*"/gi, "");
  s = s.replace(/\son\w+\s*=\s*'(?:[^'\\]|\\.)*'/gi, "");
  s = s.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  s = s.replace(/(href|xlink:href)\s*=\s*"(\s*javascript:[^"]*)"/gi, '$1="#"');
  s = s.replace(/(href|xlink:href)\s*=\s*'(\s*javascript:[^']*)'/gi, "$1='#'");
  return s;
}

// Geminiが返すSVGはwidth/height/viewBoxの有無や値がまちまちなため、外部CSSだけに頼らず
// 挿入直後にJSでも明示的にコンテナへフィットさせる（キャッシュ未反映等でCSSが効かない場合の保険にもなる）
function fitSvgToContainer(wrapEl) {
  const svgEl = wrapEl.querySelector("svg");
  if (!svgEl) return;
  svgEl.setAttribute("width", "100%");
  svgEl.setAttribute("height", "100%");
  svgEl.style.width = "100%";
  svgEl.style.height = "100%";
  svgEl.style.display = "block";
  if (!svgEl.getAttribute("preserveAspectRatio")) {
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }
}

// 生成中はcomic-grid（4コマ）を隠し、代わりに同じ場所へtips-stageを表示する。
// #comic-gridのCSS上のdisplayは"grid"のため、表示に戻すときはそれに合わせる。
function setComicGridVisible(visible) {
  const gridEl = document.getElementById("comic-grid");
  if (gridEl) {
    gridEl.style.display = visible ? "grid" : "none";
  }
}

export async function setupGame() {
  const saved = await getBoardState();
  if (saved && saved.panels && Object.keys(saved.panels).length === 4) {
    currentBoard = saved;
    renderCurrentState();
  } else {
    await resetNewBoard();
  }
}

export async function resetNewBoard() {
  const fixedCount = 2;
  const indices = [1, 2, 3, 4].sort(() => 0.5 - Math.random());
  const fixedIndices = indices.slice(0, fixedCount);

  currentBoard = {
    panels: {},
    status: "idle",
    historyId: null,
    favorite: false,
    elapsedMs: 0
  };

  for (let i = 1; i <= 4; i++) {
    const isFixed = fixedIndices.includes(i);
    let text = "";
    if (isFixed) {
      const items = POOL[i];
      text = items[Math.floor(Math.random() * items.length)];
    }

    currentBoard.panels[i] = {
      fixed: isFixed,
      text: text,
      userInput: "",
      svg: null
    };
  }

  await setBoardState(currentBoard);
  renderDraftBoard();
}

function renderCurrentState() {
  if (currentBoard.status === "generated") {
    renderGeneratedView();
  } else {
    renderDraftBoard();
  }
}

export function renderDraftBoard() {
  // 生成中に「お題を引く」等で画面が切り替わった場合に備え、Tipsボックスを確実に止めてコマを再表示する
  stopTipsBanner(document.getElementById("tips-stage"));
  setComicGridVisible(true);

  for (let i = 1; i <= 4; i++) {
    const panel = currentBoard.panels[i];
    const panelEl = document.querySelector(`#panel-${i} .panel-content`);
    if (!panelEl) continue;
    panelEl.innerHTML = "";
    panelEl.className = "panel-content";

    if (panel.fixed) {
      const div = document.createElement("div");
      div.className = "fixed-text";
      div.textContent = panel.text;
      panelEl.appendChild(div);
    } else {
      const textarea = document.createElement("textarea");
      textarea.placeholder = "シチュエーションを記述...";
      textarea.id = `input-${i}`;
      textarea.maxLength = CAPTION_MAX_CHARS;
      textarea.value = panel.userInput || "";

      const counter = document.createElement("div");
      counter.className = "char-counter";
      const updateCounter = () => {
        counter.textContent = `${Array.from(textarea.value).length}/${CAPTION_MAX_CHARS}`;
      };
      updateCounter();

      textarea.addEventListener("input", (e) => {
        panel.userInput = e.target.value;
        updateCounter();
        setBoardState(currentBoard);
      });

      panelEl.appendChild(textarea);
      panelEl.appendChild(counter);
    }
  }

  updateActionButton();
}

export function getValidatedScenarios() {
  const scenarios = {};
  const emptyPanels = [];

  for (let i = 1; i <= 4; i++) {
    const panel = currentBoard.panels[i];
    if (panel.fixed) {
      scenarios[i] = panel.text;
    } else {
      const inputEl = document.getElementById(`input-${i}`);
      let val = inputEl ? inputEl.value.trim() : (panel.userInput || "").trim();
      // maxlength属性を経由しない保存データ等に備え、ここでも文字数上限を保証する
      const valChars = Array.from(val);
      if (valChars.length > CAPTION_MAX_CHARS) {
        val = valChars.slice(0, CAPTION_MAX_CHARS).join("");
      }
      if (!val) {
        emptyPanels.push(i);
      } else {
        scenarios[i] = val;
        panel.userInput = val;
      }
    }
  }

  if (emptyPanels.length > 0) {
    return {
      valid: false,
      emptyPanels,
      message: `空いているコマ（${emptyPanels.join("・")}コマ目）にテキストを入力してください`
    };
  }

  return {
    valid: true,
    scenarios
  };
}

export function highlightEmptyPanels(emptyPanels) {
  emptyPanels.forEach((i) => {
    const textarea = document.getElementById(`input-${i}`);
    if (textarea) {
      textarea.classList.add("input-error");
      setTimeout(() => textarea.classList.remove("input-error"), 1500);
    }
  });
  if (emptyPanels.length > 0) {
    const first = document.getElementById(`input-${emptyPanels[0]}`);
    if (first) first.focus();
  }
}

export function renderLoading() {
  currentBoard.status = "generating";
  // 4コマ（comic-grid）自体を非表示にし、同じ場所にTipsボックスを表示する。
  // tips-stageはcomic-gridと同じ高さ・幅で作ってあるため、ウィンドウ全体はリサイズされない。
  setComicGridVisible(false);
  startTipsBanner(document.getElementById("tips-stage"));
}

export async function applyGeneratedSvgs(svgs) {
  // stopTipsBannerでタイマーがリセットされる前に、休憩できた時間を取得しておく
  const elapsedMs = getElapsedMs();
  stopTipsBanner(document.getElementById("tips-stage"));
  setComicGridVisible(true);
  currentBoard.status = "generated";
  for (let i = 1; i <= 4; i++) {
    if (svgs[i]) {
      currentBoard.panels[i].svg = sanitizeSvgMarkup(svgs[i]);
    }
  }

  // お気に入りに関わらず、生成に成功したものは自動的に履歴へ積む
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    favorite: false,
    elapsedMs: elapsedMs || 0,
    panels: JSON.parse(JSON.stringify(currentBoard.panels))
  };
  await addHistoryEntry(entry);
  currentBoard.historyId = entry.id;
  currentBoard.favorite = false;
  currentBoard.elapsedMs = entry.elapsedMs;

  await setBoardState(currentBoard);
  renderGeneratedView();
}

export function renderGeneratedView() {
  for (let i = 1; i <= 4; i++) {
    const panel = currentBoard.panels[i];
    const panelEl = document.querySelector(`#panel-${i} .panel-content`);
    if (!panelEl) continue;

    panelEl.innerHTML = "";
    panelEl.className = "panel-content generated";

    // 1:1 SVGイラスト表示領域（念のためここでもサニタイズしてから描画する）
    const svgWrap = document.createElement("div");
    svgWrap.className = "panel-svg-wrap";
    const safeSvg = sanitizeSvgMarkup(panel.svg);
    svgWrap.innerHTML = safeSvg || '<div class="loading" style="color:#eb5757;">生成エラー</div>';
    if (safeSvg) fitSvgToContainer(svgWrap);
    panelEl.appendChild(svgWrap);

    // キャプション（プロンプト・シチュエーション文）: イラストの上に字幕風に重ねる
    // 表示は2行に収まるよう文字数を丸め、全文はtitle（ホバー時のツールチップ）で確認できる
    const captionEl = document.createElement("div");
    captionEl.className = "panel-caption";
    const scenarioText = panel.fixed ? panel.text : panel.userInput;
    captionEl.textContent = truncateCaption(scenarioText) || "静寂な空間";
    captionEl.title = scenarioText || "";
    svgWrap.appendChild(captionEl);
  }

  updateActionButton();
}

export function renderErrors(errorMessage) {
  stopTipsBanner(document.getElementById("tips-stage"));
  setComicGridVisible(true);
  currentBoard.status = "idle";
  for (let i = 1; i <= 4; i++) {
    const panelEl = document.querySelector(`#panel-${i} .panel-content`);
    if (panelEl) {
      // errorMessageは外部由来（API応答等）を含みうるため、innerHTML文字列結合ではなく
      // textContent/setAttributeで組み立ててHTMLタグが解釈されないようにする
      panelEl.innerHTML = "";
      panelEl.className = "panel-content";
      const div = document.createElement("div");
      div.className = "loading";
      div.style.color = "#eb5757";
      div.style.fontSize = "9px";
      div.style.padding = "4px";
      div.style.wordBreak = "break-word";
      div.textContent = errorMessage || "エラー";
      div.title = errorMessage || "";
      panelEl.appendChild(div);
    }
  }
  updateActionButton();
}

export function updateActionButton() {
  const btn = document.getElementById("btn-generate");
  const rerollBtn = document.getElementById("btn-reroll");
  const favBtn = document.getElementById("btn-favorite");
  const saveBtn = document.getElementById("btn-save-image");
  const isGenerated = currentBoard.status === "generated";

  if (btn) {
    // 生成完了後は「再生成」ではなく新しいキャンバスを開く導線にする。
    // 実際の挙動切り替えはdataset.modeを見てpopup.js側で行う
    btn.textContent = isGenerated ? "新しいキャンバスを開く" : "スケッチを生成する";
    btn.dataset.mode = isGenerated ? "new" : "generate";
  }

  // 生成完了後は「新しいキャンバスを開く」ボタンが同じ役割を兼ねるため、
  // 単独の「お題を引く」（リロード）ボタンは不要になり非表示にする
  if (rerollBtn) rerollBtn.style.display = isGenerated ? "none" : "";

  // お気に入り・画像保存ボタンは、生成が完了しているときだけ表示する
  if (favBtn) {
    favBtn.style.display = isGenerated ? "" : "none";
    const isFav = !!currentBoard.favorite;
    favBtn.textContent = isFav ? "♥" : "♡";
    favBtn.classList.toggle("is-active", isFav);
    favBtn.title = isFav ? "お気に入りから外す" : "お気に入りに登録";
  }
  if (saveBtn) saveBtn.style.display = isGenerated ? "" : "none";
}

// 現在表示中の4コマに対応する履歴エントリの、お気に入りON/OFFを切り替える。
// 履歴は生成のたびに自動で積まれているので、ここでは新規登録ではなく既存エントリを更新する。
export async function toggleCurrentFavorite() {
  if (currentBoard.status !== "generated") return null;

  if (!currentBoard.historyId) {
    // 何らかの理由で履歴IDが無い場合（古い保存データ等）は、ここで登録してからお気に入りにする
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      favorite: true,
      elapsedMs: currentBoard.elapsedMs || 0,
      panels: JSON.parse(JSON.stringify(currentBoard.panels))
    };
    await addHistoryEntry(entry);
    currentBoard.historyId = entry.id;
    currentBoard.favorite = true;
    await setBoardState(currentBoard);
    return { id: entry.id, favorite: true };
  }

  const nextFavorite = !currentBoard.favorite;
  await updateHistoryEntry(currentBoard.historyId, { favorite: nextFavorite });
  currentBoard.favorite = nextFavorite;
  await setBoardState(currentBoard);
  return { id: currentBoard.historyId, favorite: nextFavorite };
}

// 履歴一覧を指定のコンテナへ描画する（履歴画面が開かれたときに呼び出す）
// onOpen: 「開く」が押されて読み込みが終わった後に呼ばれるコールバック（画面をメインへ戻す等に使う）
export async function renderHistoryList(containerEl, { onOpen } = {}) {
  if (!containerEl) return;
  const list = await getHistory();

  containerEl.innerHTML = "";

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.innerHTML = "まだ生成した作品がありません。<br>4コマを生成すると、ここに履歴として残ります。";
    containerEl.appendChild(empty);
    return;
  }

  // 履歴の各行は「プレビュー → タイトル（起のテキスト・省略あり） → ハート → 休憩した時間 → 削除」の1行で構成する。
  // 開くボタンは廃止し、削除ボタン以外のブロックをクリック／Enterキーで開けるようにする。
  list.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.setAttribute("role", "button");
    item.tabIndex = 0;

    const openEntry = async () => {
      await loadHistoryEntry(entry);
      if (typeof onOpen === "function") onOpen(entry);
    };

    item.addEventListener("click", () => {
      openEntry();
    });
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openEntry();
      }
    });

    const thumb = document.createElement("div");
    thumb.className = "history-thumb";
    const firstSvg =
      entry.panels?.[1]?.svg || entry.panels?.[2]?.svg || entry.panels?.[3]?.svg || entry.panels?.[4]?.svg;
    const safeThumbSvg = sanitizeSvgMarkup(firstSvg);
    thumb.innerHTML = safeThumbSvg;
    if (safeThumbSvg) fitSvgToContainer(thumb);

    const titleEl = document.createElement("div");
    titleEl.className = "history-title";
    const titleText = getEntryCaption(entry, 1) || getEntryCaption(entry, 2) || "";
    titleEl.textContent = truncateCaption(titleText);
    titleEl.title = titleText;

    // コーヒーの絵文字は横に並べると幅が足りないため、時間の数字だけをボックスに入れて表示する
    const timeEl = document.createElement("span");
    timeEl.className = "history-time";
    timeEl.textContent = formatElapsed(entry.elapsedMs || 0);
    timeEl.title = "この生成中に休憩できた時間";

    const heartEl = document.createElement("span");
    const isFav = !!entry.favorite;
    heartEl.className = `history-heart${isFav ? " is-favorite" : ""}`;
    heartEl.textContent = isFav ? "♥" : "♡";
    heartEl.title = isFav ? "お気に入り登録済み" : "お気に入り未登録";

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "history-del-btn";
    delBtn.title = "削除";
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation(); // カード自体の「開く」クリックへ伝播させない
      await removeHistoryEntry(entry.id);
      renderHistoryList(containerEl, { onOpen });
    });

    item.appendChild(thumb);
    item.appendChild(titleEl);
    item.appendChild(heartEl);
    item.appendChild(timeEl);
    item.appendChild(delBtn);
    containerEl.appendChild(item);
  });
}

function getEntryCaption(entry, i) {
  const p = entry.panels?.[i];
  if (!p) return "";
  return p.fixed ? p.text : p.userInput;
}

// 履歴の1件を現在のボードとして読み込み、生成済み表示に戻す
export async function loadHistoryEntry(entry) {
  currentBoard = {
    panels: JSON.parse(JSON.stringify(entry.panels)),
    status: "generated",
    historyId: entry.id,
    favorite: !!entry.favorite,
    elapsedMs: entry.elapsedMs || 0
  };
  await setBoardState(currentBoard);
  setComicGridVisible(true);
  renderGeneratedView();
}

// 4コマ漫画画像をCanvasで組み立ててダウンロード（画像全体も、各コマも1:1正方形）
export async function exportComicImage() {
  // ヘッダー・フッターは縦方向にしかスペースを取らないため、
  // 「コマを正方形」にしつつ「画像全体も正方形」にするには、
  // グリッドを左右中央寄せにして余白（マット）を均等に置く。
  const panelSize = 280; // 1:1 正方形（各コマ）
  const padding = 20;
  const headerHeight = 70;
  const footerHeight = 40;
  const gap = 16;
  const columns = 2;
  const rows = 2;

  const panelWidth = panelSize;
  const panelHeight = panelSize;
  const gridSize = (panelSize * 2) + gap; // 正方形グリッド（幅=高さ）

  const canvasHeight = padding + headerHeight + gridSize + footerHeight + padding;
  const canvasSize = canvasHeight; // 画像全体も1:1正方形
  const gridTop = padding + headerHeight;
  const gridLeft = (canvasSize - gridSize) / 2; // 左右均等の余白で中央寄せ

  const canvas = document.createElement("canvas");
  const scale = 2; // Retina Crisp 2x
  canvas.width = canvasSize * scale;
  canvas.height = canvasSize * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = "#fbfbfa";
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // ヘッダー
  ctx.fillStyle = "#37352f";
  ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("✦ Dopawork", canvasSize / 2, padding + 30);

  ctx.fillStyle = "#787774";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("作業ドーパミン中毒のための知的な息抜き穴埋めパズル", canvasSize / 2, padding + 50);

  const labels = { 1: "01 起", 2: "02 承", 3: "03 転", 4: "04 結" };
  const svgSize = 225; // 1:1 正方形（各コマのイラスト本体）
  const svgTopOffset = 28;

  for (let i = 1; i <= 4; i++) {
    const panel = currentBoard.panels[i];
    const text = (panel.fixed ? panel.text : panel.userInput) || "静寂な空間";

    const col = (i - 1) % columns;
    const row = Math.floor((i - 1) / columns);
    const panelX = gridLeft + col * (panelWidth + gap);
    const panelY = gridTop + row * (panelHeight + gap);

    // コマの白い背景と枠線
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 8, true, false);

    ctx.strokeStyle = "#37352f";
    ctx.lineWidth = 1.8;
    roundRect(ctx, panelX, panelY, panelWidth, panelHeight, 8, false, true);

    // コマ番号バッジ (01, 02, 03, 04)
    ctx.fillStyle = "#787774";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "left";
    ctx.fillText(labels[i], panelX + 12, panelY + 20);

    // 1:1 正方形 SVGイラストの描画
    if (panel.svg) {
      try {
        const img = await loadSvgImage(panel.svg);
        const svgX = panelX + (panelWidth - svgSize) / 2;
        const svgY = panelY + svgTopOffset;
        ctx.drawImage(img, svgX, svgY, svgSize, svgSize);
      } catch (err) {
        console.warn(`Panel ${i} SVG draw failed:`, err);
      }
    }

    // キャプション（YouTube字幕風：イラストの上に黒ボックスを重ねる）
    ctx.font = "11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const maxCaptionWidth = panelWidth - 28;
    const lines = wrapCaptionLines(ctx, text, maxCaptionWidth);
    const lineHeight = 14;
    const captionPaddingY = 6;
    const captionBoxHeight = (lines.length * lineHeight) + (captionPaddingY * 2);
    const widestLine = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const captionBoxWidth = Math.min(panelWidth - 20, widestLine + 20);
    const captionBoxX = panelX + (panelWidth - captionBoxWidth) / 2;
    const captionBoxY = panelY + panelHeight - captionBoxHeight - 12;

    ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
    roundRect(ctx, captionBoxX, captionBoxY, captionBoxWidth, captionBoxHeight, 5, true, false);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    lines.forEach((line, idx) => {
      ctx.fillText(
        line,
        panelX + panelWidth / 2,
        captionBoxY + captionPaddingY + (lineHeight * (idx + 1)) - 3
      );
    });
  }

  // フッター
  ctx.fillStyle = "#a8a7a4";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("Created with Dopawork", canvasSize / 2, canvasSize - 15);

  // ダウンロード処理
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
    a.href = url;
    a.download = `dopawork_4koma_${timestamp}.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }, "image/png");
}

// キャプション文を最大2行までの折り返し配列に変換（収まらない場合は末尾を「…」で省略）
function wrapCaptionLines(ctx, text, maxWidth) {
  const str = text || "";
  if (ctx.measureText(str).width <= maxWidth) return [str];

  const chars = Array.from(str);
  let splitIdx = chars.length;
  for (let i = 1; i <= chars.length; i++) {
    if (ctx.measureText(chars.slice(0, i).join("")).width > maxWidth) {
      splitIdx = i - 1;
      break;
    }
  }
  const line1 = chars.slice(0, Math.max(splitIdx, 1)).join("");
  let line2 = chars.slice(Math.max(splitIdx, 1)).join("");

  if (ctx.measureText(line2).width > maxWidth) {
    const truncated = Array.from(line2);
    while (truncated.length > 0 && ctx.measureText(truncated.join("") + "…").width > maxWidth) {
      truncated.pop();
    }
    line2 = truncated.join("") + "…";
  }

  return [line1, line2];
}

function loadSvgImage(svgStr) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const cleanSvg = svgStr.replace(/xmlns="[^"]*"/g, "").replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const blob = new Blob([cleanSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
