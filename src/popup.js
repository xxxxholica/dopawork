// popup.js - Dopawork メインコントローラー
import { getApiKey } from "./storage.js";
import { setupAuth } from "./auth.js";
import { generateComicSvgs } from "./api.js";
import {
  setupGame,
  resetNewBoard,
  getValidatedScenarios,
  highlightEmptyPanels,
  renderLoading,
  applyGeneratedSvgs,
  renderErrors,
  exportComicImage,
  updateActionButton,
  toggleCurrentFavorite,
  renderHistoryList
} from "./game.js";

let currentApiKey = null;

function init() {
  console.log("[Dopawork] Controller initialized");

  // 1. 認証モジュールのイベントハンドラーを設定
  setupAuth({
    onLoginSuccess: (key) => {
      currentApiKey = key;
      showMainView();
    },
    onLogout: () => {
      currentApiKey = null;
      showSetupView();
    }
  });

  // 2. フッターに集約した操作ボタンを設定
  const btnReroll = document.getElementById("btn-reroll");
  if (btnReroll) {
    btnReroll.addEventListener("click", async (e) => {
      e.preventDefault();
      await resetNewBoard();
    });
  }

  const btnGenerate = document.getElementById("btn-generate");
  if (btnGenerate) {
    btnGenerate.addEventListener("click", async (e) => {
      e.preventDefault();
      // 生成完了後はこのボタンが「新しいキャンバスを開く」役割になる
      // （updateActionButtonがdataset.modeを"new"に切り替える）
      if (btnGenerate.dataset.mode === "new") {
        await resetNewBoard();
      } else {
        await handleGenerate();
      }
    });
  }

  const btnFavorite = document.getElementById("btn-favorite");
  if (btnFavorite) {
    btnFavorite.addEventListener("click", async (e) => {
      e.preventDefault();
      await handleFavorite();
    });
  }

  const btnSaveImage = document.getElementById("btn-save-image");
  if (btnSaveImage) {
    btnSaveImage.addEventListener("click", async (e) => {
      e.preventDefault();
      await exportComicImage();
    });
  }

  // 3. 右上：履歴（お気に入り一覧）の表示・戻る
  const btnHistory = document.getElementById("btn-history");
  if (btnHistory) {
    btnHistory.addEventListener("click", async (e) => {
      e.preventDefault();
      await showHistoryView();
    });
  }

  const btnHistoryBack = document.getElementById("btn-history-back");
  if (btnHistoryBack) {
    btnHistoryBack.addEventListener("click", (e) => {
      e.preventDefault();
      switchView("view-main");
    });
  }

  // 4. 起動時のAPIキー確認とボード復元
  initApp();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

async function initApp() {
  const key = await getApiKey();
  if (key) {
    currentApiKey = key;
    showMainView();
  } else {
    showSetupView();
  }
}

// 3画面（APIキー設定・メイン・履歴）の表示切り替えをまとめて行う
function switchView(viewId) {
  ["view-setup", "view-main", "view-history"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === viewId ? "flex" : "none";
  });
}

function showSetupView() {
  switchView("view-setup");

  const msg = document.getElementById("setup-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "setup-msg";
  }

  const input = document.getElementById("input-api-key");
  if (input) {
    input.value = "";
    setTimeout(() => input.focus(), 50);
  }
}

async function showMainView() {
  switchView("view-main");
  await setupGame();
}

async function showHistoryView() {
  switchView("view-history");
  const listEl = document.getElementById("history-list");
  await renderHistoryList(listEl, {
    onOpen: () => switchView("view-main")
  });
}

async function handleFavorite() {
  const result = await toggleCurrentFavorite();
  if (!result) return;
  // ハートの見た目（塗り/枠のみ）は現在の状態を正しく反映させ続ける必要があるため、
  // 一時的なフラッシュ表示ではなくupdateActionButtonで実際の状態を描画する
  updateActionButton();
}

async function handleGenerate() {
  if (!currentApiKey) {
    showSetupView();
    return;
  }

  // 空欄チェック
  const validation = getValidatedScenarios();
  if (!validation.valid) {
    highlightEmptyPanels(validation.emptyPanels);
    showBannerMessage(validation.message);
    return;
  }

  const btn = document.getElementById("btn-generate");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "描画中...";
  }

  renderLoading();

  try {
    const svgs = await generateComicSvgs(validation.scenarios, currentApiKey);
    await applyGeneratedSvgs(svgs);
  } catch (err) {
    console.error("[Dopawork] Generation failed:", err);
    renderErrors(err.message);
  }

  if (btn) {
    btn.disabled = false;
    updateActionButton();
  }
}

function showBannerMessage(msg) {
  let banner = document.getElementById("game-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "game-banner";
    banner.className = "game-banner";
    const header = document.querySelector("#view-main .header");
    if (header && header.parentNode) {
      header.parentNode.insertBefore(banner, header.nextSibling);
    }
  }
  banner.textContent = msg;
  banner.style.display = "block";
  setTimeout(() => {
    if (banner) banner.style.display = "none";
  }, 2500);
}
