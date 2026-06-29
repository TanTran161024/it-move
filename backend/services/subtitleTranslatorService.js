const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TARGET_LANGUAGE = 'vi';
const MAX_SUBTITLE_CHARS = 80000;
const BATCH_SEGMENT_LIMIT = 45;
const BATCH_CHAR_LIMIT = 12000;

const LANGUAGE_LABELS = {
  auto: 'Auto detect',
  vi: 'Vietnamese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  th: 'Thai',
  fr: 'French',
  es: 'Spanish',
};

function getGeminiModel() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function normalizeLanguage(value, fallback = DEFAULT_TARGET_LANGUAGE) {
  const key = String(value || '').trim().toLowerCase();
  return LANGUAGE_LABELS[key] ? key : fallback;
}

function normalizeSubtitleContent(content) {
  return String(content || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function detectFormat(content, requestedFormat) {
  const requested = String(requestedFormat || '').trim().toLowerCase();
  if (['srt', 'vtt', 'ass', 'plain'].includes(requested)) return requested;
  if (/^\s*(?:\[Script Info\]|\[V4\+ Styles\]|\[Events\])/im.test(content) && /^\s*Dialogue\s*:/im.test(content)) return 'ass';
  if (/^\s*WEBVTT\b/i.test(content)) return 'vtt';
  if (/-->\s*\d{1,2}:\d{2}/.test(content) || /\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(content)) return 'srt';
  return 'plain';
}

function decodeAssText(text) {
  return String(text || '').replace(/\\N|\\n/g, '\n').trim();
}

function encodeAssText(text) {
  return String(text || '').replace(/\r?\n/g, '\\N');
}

function parseAssDialogueLine(line, formatFields) {
  const match = line.match(/^(Dialogue\s*:\s*)(.*)$/i);
  if (!match) return null;

  const textIndex = formatFields.findIndex((field) => field === 'text');
  if (textIndex === -1) return null;

  const parts = match[2].split(',');
  if (parts.length <= textIndex) return null;

  return {
    prefix: `${match[1]}${parts.slice(0, textIndex).join(',')},`,
    text: decodeAssText(parts.slice(textIndex).join(',')),
  };
}

function parseAssBlocks(content) {
  const lines = content.split('\n');
  const parsedBlocks = [];
  const segments = [];
  let inEventsSection = false;
  let formatFields = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    const section = trimmed.match(/^\[(.+)\]$/);

    if (section) {
      inEventsSection = section[1].toLowerCase() === 'events';
      parsedBlocks.push({ type: 'raw-line', text: line });
      return;
    }

    if (inEventsSection && /^Format\s*:/i.test(trimmed)) {
      formatFields = trimmed
        .replace(/^Format\s*:\s*/i, '')
        .split(',')
        .map((field) => field.trim().toLowerCase());
      parsedBlocks.push({ type: 'raw-line', text: line });
      return;
    }

    if (inEventsSection && /^Dialogue\s*:/i.test(trimmed) && formatFields.length) {
      const dialogue = parseAssDialogueLine(line, formatFields);
      if (dialogue?.text) {
        const segment = {
          id: segments.length + 1,
          text: dialogue.text,
        };
        segments.push(segment);
        parsedBlocks.push({
          type: 'ass-segment',
          segmentId: segment.id,
          originalText: segment.text,
          prefix: dialogue.prefix,
        });
        return;
      }
    }

    parsedBlocks.push({ type: 'raw-line', text: line });
  });

  return { blocks: parsedBlocks, segments, lineMode: true };
}

function parseSubtitleBlocks(content, format) {
  if (format === 'ass') return parseAssBlocks(content);

  const blocks = content.split(/\n{2,}/);
  const parsedBlocks = [];
  const segments = [];

  blocks.forEach((block, blockIndex) => {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => line.includes('-->'));

    if (timingIndex === -1) {
      if (format === 'plain' && block.trim()) {
        const segment = {
          id: segments.length + 1,
          text: block.trim(),
        };
        segments.push(segment);
        parsedBlocks.push({ type: 'segment', segmentId: segment.id, originalText: segment.text, prefix: [], suffix: [] });
        return;
      }
      parsedBlocks.push({ type: 'raw', text: block });
      return;
    }

    const textLines = lines.slice(timingIndex + 1);
    const text = textLines.join('\n').trim();
    if (!text) {
      parsedBlocks.push({ type: 'raw', text: block });
      return;
    }

    const segment = {
      id: segments.length + 1,
      text,
    };
    segments.push(segment);
    parsedBlocks.push({
      type: 'segment',
      segmentId: segment.id,
      originalText: segment.text,
      prefix: lines.slice(0, timingIndex + 1),
      suffix: [],
    });
  });

  return { blocks: parsedBlocks, segments, lineMode: false };
}

function buildOutputText(block, translatedById, bilingual) {
  const translatedText = translatedById.get(block.segmentId) || block.originalText || '';
  if (!bilingual) return translatedText;
  const originalText = block.originalText || '';
  return [translatedText, originalText].filter(Boolean).join('\n');
}

function rebuildSubtitle(blocks, translatedById, { bilingual = false, lineMode = false } = {}) {
  const separator = lineMode ? '\n' : '\n\n';
  return blocks.map((block) => {
    if (block.type === 'raw') return block.text;
    if (block.type === 'raw-line') return block.text;
    const text = buildOutputText(block, translatedById, bilingual);
    if (block.type === 'ass-segment') return `${block.prefix}${encodeAssText(text)}`;
    return [...block.prefix, text, ...block.suffix].join('\n').trimEnd();
  }).join(separator).trimEnd() + '\n';
}

function chunkSegments(segments) {
  const chunks = [];
  let current = [];
  let currentChars = 0;

  for (const segment of segments) {
    const nextChars = segment.text.length;
    if (
      current.length > 0
      && (current.length >= BATCH_SEGMENT_LIMIT || currentChars + nextChars > BATCH_CHAR_LIMIT)
    ) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(segment);
    currentChars += nextChars;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function safeParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text.trim());
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function buildPrompt({ segments, sourceLanguage, targetLanguage }) {
  const sourceLabel = LANGUAGE_LABELS[sourceLanguage] || LANGUAGE_LABELS.auto;
  const targetLabel = LANGUAGE_LABELS[targetLanguage] || targetLanguage;

  return `
You are translating subtitles for a movie streaming website.
Translate only the dialogue text from ${sourceLabel} to ${targetLabel}.
Keep timing, cue numbers, and file structure untouched because they are not included here.
Preserve names, numbers, punctuation intent, HTML/WebVTT tags, and line breaks when natural.
Preserve ASS override tags such as {\\i1}, {\\pos(...)} when they appear in the dialogue text.
Do not add explanations. Do not remove segment ids.

Return valid JSON only:
{
  "segments": [
    { "id": 1, "text": "translated subtitle text" }
  ]
}

SEGMENTS:
${JSON.stringify(segments, null, 2)}
`.trim();
}

function buildGenerationConfig(model) {
  const config = {
    temperature: 0.2,
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        segments: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              id: { type: 'INTEGER' },
              text: { type: 'STRING' },
            },
            required: ['id', 'text'],
          },
        },
      },
      required: ['segments'],
    },
  };

  if (/gemini-2\.5/i.test(model)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

async function callGeminiForSegments(segments, sourceLanguage, targetLanguage) {
  const model = getGeminiModel();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: buildPrompt({ segments, sourceLanguage, targetLanguage }) }],
          },
        ],
        generationConfig: buildGenerationConfig(model),
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const error = new Error(`Gemini subtitle translation failed: ${response.status}`);
    error.httpStatus = response.status;
    error.body = body.slice(0, 500);
    throw error;
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n') || '';
  const parsed = safeParseJson(text);
  if (!Array.isArray(parsed?.segments)) {
    throw new Error('Gemini subtitle translation returned invalid JSON');
  }
  return parsed.segments;
}

async function translateSegments(segments, sourceLanguage, targetLanguage) {
  const translatedById = new Map(segments.map((segment) => [segment.id, segment.text]));
  const chunks = chunkSegments(segments);

  for (const chunk of chunks) {
    const translated = await callGeminiForSegments(chunk, sourceLanguage, targetLanguage);
    for (const item of translated) {
      const id = Number(item?.id);
      const text = typeof item?.text === 'string' ? item.text.trim() : '';
      if (id && text) translatedById.set(id, text);
    }
  }

  return translatedById;
}

async function translateSubtitle({ content, target_language, source_language, format, bilingual }) {
  const normalizedContent = normalizeSubtitleContent(content);
  if (!normalizedContent.trim()) {
    const error = new Error('Thiếu nội dung phụ đề');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedContent.length > MAX_SUBTITLE_CHARS) {
    const error = new Error(`Phụ đề vượt quá ${MAX_SUBTITLE_CHARS} ký tự`);
    error.statusCode = 413;
    throw error;
  }

  const detectedFormat = detectFormat(normalizedContent, format);
  const sourceLanguage = normalizeLanguage(source_language, 'auto');
  const targetLanguage = normalizeLanguage(target_language, DEFAULT_TARGET_LANGUAGE);
  const bilingualOutput = Boolean(bilingual);
  const { blocks, segments, lineMode } = parseSubtitleBlocks(normalizedContent, detectedFormat);

  if (!segments.length) {
    return {
      translated_content: normalizedContent,
      format: detectedFormat,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      bilingual: bilingualOutput,
      segment_count: 0,
      translated_segment_count: 0,
      provider: 'none',
      fallback: true,
      message: 'Không có dòng thoại để dịch.',
    };
  }

  if (!hasGeminiKey()) {
    return {
      translated_content: normalizedContent,
      format: detectedFormat,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      bilingual: bilingualOutput,
      segment_count: segments.length,
      translated_segment_count: 0,
      provider: 'none',
      fallback: true,
      message: 'Chưa cấu hình khóa dịch, hệ thống giữ nguyên phụ đề gốc.',
    };
  }

  try {
    const translatedById = await translateSegments(segments, sourceLanguage, targetLanguage);
    return {
      translated_content: rebuildSubtitle(blocks, translatedById, { bilingual: bilingualOutput, lineMode }),
      format: detectedFormat,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      bilingual: bilingualOutput,
      segment_count: segments.length,
      translated_segment_count: segments.length,
      provider: 'gemini',
      model: getGeminiModel(),
      fallback: false,
      message: 'Dịch phụ đề thành công.',
    };
  } catch (error) {
    console.warn('[Subtitle translation fallback]', error.message);
    return {
      translated_content: normalizedContent,
      format: detectedFormat,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      bilingual: bilingualOutput,
      segment_count: segments.length,
      translated_segment_count: 0,
      provider: 'gemini',
      model: getGeminiModel(),
      fallback: true,
      ai_error: {
        message: 'Không thể dịch lúc này, hệ thống giữ nguyên phụ đề gốc.',
        http_status: error.httpStatus || null,
      },
      message: 'Không thể dịch lúc này, hệ thống giữ nguyên phụ đề gốc.',
    };
  }
}

module.exports = {
  translateSubtitle,
  detectFormat,
  parseSubtitleBlocks,
};
