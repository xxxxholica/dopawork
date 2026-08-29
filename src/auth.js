// auth.js - 認証・APIキー設定画面のUIインタラクション管理
import { validateApiKey } from "./api.js";
import { setApiKey, removeApiKey } from "./storage.js";

export function setupAuth({ onLoginSuccess, onLogout }) {
  const btnVerify = document.getElementById("btn-verify-key");
  if (btnVerify) {
    btnVerify.addEventListener("click", (e) => {
      e.preventDefault();
      handleVerify(onLoginSuccess);
    });
  }

  const inputKey = document.getElementById("input-api-key");
  if (inputKey) {
    inputKey.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleVerify(onLoginSuccess);
      }
    });
  }

  const btnGetKey = document.getElementById("btn-get-key");
  if (btnGetKey) {
    btnGetKey.addEventListener("click", (e) => {
      e.preventDefault();
      openAiStudioPage();
    });
  }

  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async (e) => {
      e.preventDefault();
      await removeApiKey();
      if (typeof onLogout === "function") onLogout();
    });
  }
}

async function handleVerify(onLoginSuccess) {
  const input = document.getElementById("input-api-key");
  const key = input ? input.value.trim() : "";
  const btn = document.getElementById("btn-verify-key");
  const msg = document.getElementById("setup-msg");

  if (!key) {
    if (msg) {
      msg.textContent = "APIキーを入力してください";
      msg.className = "setup-msg error";
    }
    if (input) input.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "検証中...";
  }
  if (msg) {
    msg.textContent = "";
    msg.className = "setup-msg";
  }

  try {
    await validateApiKey(key);
    await setApiKey(key);

    if (btn) {
      btn.disabled = false;
      btn.textContent = "APIキーを検証して始める";
    }

    if (typeof onLoginSuccess === "function") {
      onLoginSuccess(key);
    }
  } catch (err) {
    console.error("[Dopawork] Key validation failed:", err);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "APIキーを検証して始める";
    }
    if (msg) {
      msg.textContent = err.message || "キーの検証に失敗しました";
      msg.className = "setup-msg error";
    }
  }
}

export function openAiStudioPage() {
  const url = "https://aistudio.google.com/app/apikey";
  try {
    if (typeof browser !== "undefined" && browser.tabs?.create) {
      browser.tabs.create({ url });
      return;
    }
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url });
      return;
    }
  } catch (e) {
    console.warn("tabs.create failed:", e);
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
