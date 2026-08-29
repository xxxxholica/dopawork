// api.js - Google Gemini API との通信管理

// 利用可能な最新モデルのフォールバックリスト
const CANDIDATE_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview"
];

export async function validateApiKey(key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 400 || response.status === 403 || response.status === 401) {
      throw new Error("無効なAPIキーです");
    }
    throw new Error(`接続エラー (${response.status})`);
  }

  const data = await response.json();
  if (!data.models) {
    throw new Error("APIレスポンスが不正です");
  }
  return true;
}

export async function generateComicSvgs(scenarios, apiKey) {
  const prompt = `You are a minimalist manga illustrator drawing ONE continuous 4-panel comic strip (起・承・転・結) about a single protagonist's unbroken journey through 4 story beats. The 4 panels will be viewed together, so they must read as one connected visual story, not 4 unrelated sketches.

Storyline:
Panel 1 (起): ${scenarios[1]}
Panel 2 (承): ${scenarios[2]}
Panel 3 (転): ${scenarios[3]}
Panel 4 (結): ${scenarios[4]}

Character & Style Continuity (CRITICAL — read carefully before drawing):
- Design ONE simple protagonist first (e.g. a plain circle head + minimal line body/limbs, no face details beyond at most two dot eyes), then reuse that EXACT same design, proportions, and line weight in all 4 panels. Same head size, same body construction, same species (human, not an animal or bird) in every panel.
- Do NOT redesign, re-costume, or add new accessories (crowns, hats, masks, etc.) to the protagonist between panels unless a scenario line explicitly describes it.
- Keep a consistent overall drawing style across all 4 panels: identical stroke width, identical level of detail/minimalism, identical use of negative space. Only the pose, camera framing, and background elements should change to reflect each story beat.
- Avoid introducing new unrelated characters or objects that break visual continuity unless the scenario text explicitly requires them.

Strict SVG Requirements:
- Aspect Ratio: STRICTLY 1:1 SQUARE.
- Each panel MUST be an inline <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#37352f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">...</svg>.
- Minimalist black/charcoal single-stroke line art on transparent/white background. No background rects, no filled colors.
- Use vector primitives: <path>, <line>, <circle>, <rect>, <ellipse>, <polygon>, <polyline>, <g>.
- Draw clear, witty, expressive, and minimalist shapes centered nicely within the 200x200 square viewport.

Respond ONLY with a valid JSON object matching this schema:
{
  "panel1": "<svg ...>...</svg>",
  "panel2": "<svg ...>...</svg>",
  "panel3": "<svg ...>...</svg>",
  "panel4": "<svg ...>...</svg>"
}`;

  const MAX_ATTEMPTS_PER_MODEL = 2; // 応答が途中で切れた場合、同じモデルで1回だけ再試行
  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.6,
              // 4コマ分のSVGをまとめて返すため、出力上限が低いと
              // JSONが途中で切れて JSON.parse に失敗することがある。明示的に余裕を持たせる。
              maxOutputTokens: 8192
            }
          })
        });

        if (!response.ok) {
          let errMsg = `APIエラー (${response.status})`;
          try {
            const errData = await response.json();
            if (errData.error && errData.error.message) {
              errMsg = errData.error.message;
            }
          } catch (_) {}

          // モデルが利用不可/未提供の場合は次候補モデルへ自動フォールバック（このモデルでの再試行はしない）
          if (response.status === 404 || errMsg.includes("no longer available") || errMsg.includes("not found")) {
            console.warn(`[Dopawork] Model ${model} unavailable, trying next candidate...`, errMsg);
            lastError = new Error(errMsg);
            break;
          }

          throw new Error(errMsg);
        }

        const data = await response.json();

        // 出力上限に達して途中で切れた場合、後段のJSON.parseが必ず失敗するため先に検知する
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason === "MAX_TOKENS") {
          throw new Error("TRUNCATED_RESPONSE: 応答が生成上限で途中に切れました");
        }

        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textContent) {
          throw new Error("応答データが取得できませんでした");
        }

        let jsonStr = textContent.trim();
        const nl = String.fromCharCode(10);
        if (jsonStr.startsWith("```")) {
          const firstNewline = jsonStr.indexOf(nl);
          if (firstNewline !== -1) {
            jsonStr = jsonStr.substring(firstNewline + 1);
          }
          const lastBackticks = jsonStr.lastIndexOf("```");
          if (lastBackticks !== -1) {
            jsonStr = jsonStr.substring(0, lastBackticks);
          }
          jsonStr = jsonStr.trim();
        }

        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (parseErr) {
          // ここで投げていた生のJSON.parseエラーがそのままユーザーに表示されてしまっていたため、
          // 「応答が途中で切れた」ことが分かる専用エラーに変換して再試行対象にする
          throw new Error("TRUNCATED_RESPONSE: 生成データの解析に失敗しました");
        }

        const svgs = {};
        for (let i = 1; i <= 4; i++) {
          let rawSvg = parsed[`panel${i}`] || parsed[`panel_${i}`] || parsed[i] || "";
          if (rawSvg && typeof rawSvg === "string") {
            const match = rawSvg.match(/<svg[\s\S]*<\/svg>/i);
            svgs[i] = match ? match[0] : rawSvg;
          }
        }

        // 4コマ分そろっていない場合も不完全な応答とみなし再試行する
        if (Object.keys(svgs).length < 4) {
          throw new Error("TRUNCATED_RESPONSE: 4コマ分のデータが揃いませんでした");
        }

        return svgs;
      } catch (err) {
        lastError = err;

        if (err.message && (err.message.includes("no longer available") || err.message.includes("not found"))) {
          break; // 次のモデルへ
        }

        if (err.message && err.message.startsWith("TRUNCATED_RESPONSE")) {
          console.warn(`[Dopawork] ${model} attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL} truncated, retrying...`, err.message);
          if (attempt < MAX_ATTEMPTS_PER_MODEL) {
            continue; // 同じモデルでもう一度だけ試す
          }
          break; // 再試行上限に達したので次のモデルへ
        }

        // 想定外のエラーはそのまま投げる
        throw err;
      }
    }
  }

  const isTruncationFailure = lastError && lastError.message && lastError.message.startsWith("TRUNCATED_RESPONSE");
  if (isTruncationFailure) {
    throw new Error("AIの応答が生成途中で切れてしまいました。もう一度「スケッチを生成する」をお試しください。");
  }

  throw lastError || new Error("利用可能なモデルが見つかりませんでした");
}
