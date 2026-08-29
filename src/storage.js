// storage.js - 拡張機能のローカルストレージ管理 (Firefox / Chrome 互換)

export async function getApiKey() {
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      const res = await browser.storage.local.get(["gemini_api_key"]);
      return res.gemini_api_key || null;
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await new Promise((resolve) => chrome.storage.local.get(["gemini_api_key"], resolve));
      return res?.gemini_api_key || null;
    }
  } catch (e) {
    console.warn("[Dopawork] Storage get error:", e);
  }
  return null;
}

export async function setApiKey(key) {
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      await browser.storage.local.set({ gemini_api_key: key });
      return;
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await new Promise((resolve) => chrome.storage.local.set({ gemini_api_key: key }, resolve));
      return;
    }
  } catch (e) {
    console.warn("[Dopawork] Storage set error:", e);
  }
}

export async function removeApiKey() {
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      await browser.storage.local.remove(["gemini_api_key", "dopawork_board_state"]);
      return;
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await new Promise((resolve) => chrome.storage.local.remove(["gemini_api_key", "dopawork_board_state"], resolve));
      return;
    }
  } catch (e) {
    console.warn("[Dopawork] Storage remove error:", e);
  }
}

export async function getBoardState() {
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      const res = await browser.storage.local.get(["dopawork_board_state"]);
      return res.dopawork_board_state || null;
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await new Promise((resolve) => chrome.storage.local.get(["dopawork_board_state"], resolve));
      return res?.dopawork_board_state || null;
    }
  } catch (e) {
    console.warn("[Dopawork] Board state get error:", e);
  }
  return null;
}

export async function setBoardState(state) {
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      await browser.storage.local.set({ dopawork_board_state: state });
      return;
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await new Promise((resolve) => chrome.storage.local.set({ dopawork_board_state: state }, resolve));
      return;
    }
  } catch (e) {
    console.warn("[Dopawork] Board state set error:", e);
  }
}

export async function removeBoardState() {
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      await browser.storage.local.remove("dopawork_board_state");
      return;
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await new Promise((resolve) => chrome.storage.local.remove("dopawork_board_state", resolve));
      return;
    }
  } catch (e) {
    console.warn("[Dopawork] Board state remove error:", e);
  }
}

// --- お気に入り履歴（♥ボタンで登録した過去の4コマ）---
const HISTORY_KEY = "dopawork_history";
const HISTORY_LIMIT = 20; // SVGを含むため際限なく貯めないよう上限を設ける

export async function getHistory() {
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      const res = await browser.storage.local.get([HISTORY_KEY]);
      return res[HISTORY_KEY] || [];
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await new Promise((resolve) => chrome.storage.local.get([HISTORY_KEY], resolve));
      return res?.[HISTORY_KEY] || [];
    }
  } catch (e) {
    console.warn("[Dopawork] History get error:", e);
  }
  return [];
}

async function saveHistoryList(list) {
  try {
    if (typeof browser !== "undefined" && browser.storage?.local) {
      await browser.storage.local.set({ [HISTORY_KEY]: list });
      return;
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await new Promise((resolve) => chrome.storage.local.set({ [HISTORY_KEY]: list }, resolve));
      return;
    }
  } catch (e) {
    console.warn("[Dopawork] History set error:", e);
  }
}

// 上限を超えた分を削る際、お気に入り登録済みのエントリはなるべく残し、
// お気に入りでない古いものから優先的に削除する
function trimHistoryList(list) {
  while (list.length > HISTORY_LIMIT) {
    let removeIdx = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].favorite) {
        removeIdx = i;
        break;
      }
    }
    if (removeIdx === -1) {
      // 全件お気に入りの場合はやむを得ず末尾（最も古いもの）を削除する
      list.pop();
    } else {
      list.splice(removeIdx, 1);
    }
  }
}

export async function addHistoryEntry(entry) {
  const list = await getHistory();
  list.unshift(entry);
  trimHistoryList(list);
  await saveHistoryList(list);
  return list;
}

export async function removeHistoryEntry(id) {
  const list = await getHistory();
  const next = list.filter((item) => item.id !== id);
  await saveHistoryList(next);
  return next;
}

// 履歴の1件を部分更新する（お気に入りのON/OFF切り替え等に使用）
export async function updateHistoryEntry(id, patch) {
  const list = await getHistory();
  const idx = list.findIndex((item) => item.id === id);
  if (idx === -1) return list;
  list[idx] = { ...list[idx], ...patch };
  await saveHistoryList(list);
  return list;
}
