require('dotenv').config({ quiet: true });

const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const apiKey = process.env.GEMINI_API_KEY;

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function explainError(statusCode, bodyText) {
  const parsed = safeParseJson(bodyText);
  const googleStatus = parsed?.error?.status || '';
  const googleMessage = parsed?.error?.message || bodyText || '';
  const combined = `${googleStatus} ${googleMessage}`;

  if (statusCode === 403 && /denied access|access restricted|terms of service|supported region/i.test(combined)) {
    return [
      'Gemini check failed: PROJECT_DENIED',
      'Google đang chặn project/API key này.',
      'Cách xử lý: tạo API key mới ở Google AI Studio bằng project khác, hoặc xử lý cảnh báo/quyền truy cập trong Google Cloud/AI Studio.',
    ];
  }

  if (statusCode === 403) {
    return [
      'Gemini check failed: PERMISSION_DENIED',
      'API key không có quyền gọi Gemini API/model này.',
      'Cách xử lý: kiểm tra key, project, quyền API và restriction của API key.',
    ];
  }

  if (statusCode === 404 || /model.*not found|not found/i.test(combined)) {
    return [
      'Gemini check failed: MODEL_NOT_FOUND',
      `Model "${model}" không tồn tại hoặc key chưa có quyền dùng model này.`,
      'Cách xử lý: đổi GEMINI_MODEL sang model đang được Google hỗ trợ, ví dụ gemini-2.5-flash.',
    ];
  }

  if (statusCode === 429) {
    return [
      'Gemini check failed: RATE_LIMITED',
      'Key/project đang hết quota hoặc bị giới hạn tốc độ.',
      'Cách xử lý: kiểm tra quota/billing hoặc đợi quota reset.',
    ];
  }

  return [
    `Gemini check failed: HTTP_${statusCode}`,
    googleMessage.slice(0, 300),
  ];
}

async function main() {
  if (!apiKey) {
    console.error('Gemini check failed: GEMINI_API_KEY chưa được cấu hình trong backend/.env');
    process.exitCode = 1;
    return;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Reply with JSON: {"ok":true}' }],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 64,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    explainError(response.status, body).forEach((line) => console.error(line));
    process.exitCode = 1;
    return;
  }

  console.log(`Gemini OK: model=${model}`);
}

main().catch((error) => {
  console.error(`Gemini check failed: ${error.message}`);
  process.exitCode = 1;
});
