const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const KOKORO_VOICES = [
  { id: 'diem_trinh', name: 'Diễm Trinh' },
  { id: 'hung_thinh', name: 'Hưng Thịnh' },
  { id: 'mai_linh', name: 'Mai Linh' },
  { id: 'mai_loan', name: 'Mai Loan' },
  { id: 'manh_dung', name: 'Mạnh Dũng' },
  { id: 'my_yen', name: 'Mỹ Yến' },
  { id: 'ngoc_huyen', name: 'Ngọc Huyền' },
  { id: 'phat_tai', name: 'Phát Tài' },
  { id: 'thanh_dat', name: 'Thành Đạt' },
  { id: 'thuc_trinh', name: 'Thục Trinh' },
  { id: 'tuan_ngoc', name: 'Tuấn Ngọc' },
  { id: 'storyvert', name: 'Storyvert' },
  { id: 'duc_an', name: 'Đức An' },
  { id: 'duc_duy', name: 'Đức Duy' },
];

const voiceIds = new Set(KOKORO_VOICES.map((voice) => voice.id));
const serviceUrl = (process.env.KOKORO_TTS_URL || 'http://localhost:8100').replace(/\/+$/, '');
const requestTimeoutMs = Number(process.env.KOKORO_TTS_TIMEOUT_MS || 180000);
const transcriptionTimeoutMs = Number(process.env.WHISPER_TRANSCRIBE_TIMEOUT_MS || 7200000);
const outputRoot = path.join(__dirname, '..', 'storage', 'dubbing');

async function requestKokoro(endpoint, options = {}, timeoutMs = requestTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${serviceUrl}${endpoint}`, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Kokoro TTS xử lý quá thời gian cho phép.');
    }
    throw new Error('Không thể kết nối Kokoro TTS. Hãy khởi động npm run tts:service.');
  } finally {
    clearTimeout(timeout);
  }
}

async function getKokoroStatus() {
  try {
    const response = await requestKokoro('/health', {}, 3000);
    if (!response.ok) return { available: false };
    const data = await response.json();
    return { available: true, ...data };
  } catch {
    return { available: false };
  }
}

async function synthesizeEpisodePreview({ episodeId, text, voice }) {
  const normalizedText = String(text || '').trim();
  const normalizedVoice = String(voice || 'diem_trinh').trim();

  if (!normalizedText) {
    const error = new Error('Vui lòng nhập lời thoại tiếng Việt.');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedText.length > 2000) {
    const error = new Error('Bản nghe thử chỉ hỗ trợ tối đa 2.000 ký tự.');
    error.statusCode = 400;
    throw error;
  }
  if (!voiceIds.has(normalizedVoice)) {
    const error = new Error('Giọng đọc không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }

  const synthesis = await synthesizeSpeech({ text: normalizedText, voice: normalizedVoice });

  const episodeDirectory = path.join(outputRoot, String(episodeId));
  await fs.mkdir(episodeDirectory, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomUUID()}.wav`;
  await fs.writeFile(path.join(episodeDirectory, filename), synthesis.audio);

  return {
    audio_url: `/media/dubbing/${episodeId}/${filename}`,
    voice: normalizedVoice,
    sample_rate: synthesis.sampleRate,
    duration_seconds: synthesis.durationSeconds,
  };
}

async function synthesizeSpeech({ text, voice = 'diem_trinh', speed = 1 }) {
  const response = await requestKokoro('/synthesize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, voice, speed }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || 'Kokoro TTS không thể tạo âm thanh.');
  }

  return {
    audio: Buffer.from(await response.arrayBuffer()),
    sampleRate: Number(response.headers.get('x-sample-rate')) || 24000,
    durationSeconds: Number(response.headers.get('x-duration-seconds')) || 0,
  };
}

async function transcribeAudio({ audioPath, language = null }) {
  const response = await requestKokoro('/transcribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audio_path: audioPath, language }),
  }, transcriptionTimeoutMs);

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || 'Whisper không thể nhận diện hội thoại.');
  }
  return response.json();
}

module.exports = {
  KOKORO_VOICES,
  getKokoroStatus,
  synthesizeSpeech,
  synthesizeEpisodePreview,
  transcribeAudio,
};
