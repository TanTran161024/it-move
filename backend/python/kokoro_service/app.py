import io
import os
import tempfile
import threading
from pathlib import Path

import soundfile as sf
from dotenv import load_dotenv
from faster_whisper import WhisperModel
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from kokoro_vietnamese import KokoroVietnamese, SAMPLE_RATE, VOICES
from pydantic import BaseModel, Field


load_dotenv(Path(__file__).resolve().parents[2] / '.env')
app = FastAPI(title='IT Move Kokoro Vietnamese TTS')
device = os.getenv('KOKORO_DEVICE', 'cpu')
model_lock = threading.Lock()
whisper_lock = threading.Lock()
loaded_voice = None
loaded_model = None
loaded_whisper_model = None
whisper_model_name = os.getenv('WHISPER_MODEL', 'small')
whisper_device = os.getenv('WHISPER_DEVICE', 'cpu')
whisper_compute_type = os.getenv('WHISPER_COMPUTE_TYPE', 'int8')


class SynthesisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: str = 'diem_trinh'
    speed: float = Field(default=1.0, ge=0.7, le=1.3)


class TranscriptionRequest(BaseModel):
    audio_path: str = Field(min_length=1, max_length=4096)
    language: str | None = Field(default=None, max_length=12)


def get_model(voice: str) -> KokoroVietnamese:
    global loaded_model, loaded_voice
    if voice not in VOICES:
        raise HTTPException(status_code=400, detail='Giọng đọc không hợp lệ.')
    if loaded_model is None or loaded_voice != voice:
        loaded_model = KokoroVietnamese(device=device, voice=voice)
        loaded_voice = voice
    return loaded_model


def get_whisper_model() -> WhisperModel:
    global loaded_whisper_model
    if loaded_whisper_model is None:
        loaded_whisper_model = WhisperModel(
            whisper_model_name,
            device=whisper_device,
            compute_type=whisper_compute_type,
            cpu_threads=max(1, int(os.getenv('WHISPER_CPU_THREADS', '4'))),
        )
    return loaded_whisper_model


def resolve_audio_path(value: str) -> Path:
    audio_path = Path(value).expanduser().resolve()
    temp_root = Path(tempfile.gettempdir()).resolve()
    try:
        audio_path.relative_to(temp_root)
    except ValueError as error:
        raise HTTPException(status_code=400, detail='Audio phải nằm trong thư mục tạm cục bộ.') from error
    if not audio_path.is_file() or audio_path.suffix.lower() not in {'.wav', '.mp3', '.m4a', '.flac'}:
        raise HTTPException(status_code=400, detail='File audio không hợp lệ.')
    return audio_path


@app.get('/health')
def health():
    return {
        'status': 'ready',
        'device': device,
        'model_loaded': loaded_model is not None,
        'loaded_voice': loaded_voice,
        'whisper_model': whisper_model_name,
        'whisper_loaded': loaded_whisper_model is not None,
        'whisper_device': whisper_device,
    }


@app.get('/voices')
def voices():
    return [{'id': voice_id, 'name': data['label']} for voice_id, data in VOICES.items()]


@app.post('/transcribe')
def transcribe(payload: TranscriptionRequest):
    audio_path = resolve_audio_path(payload.audio_path)
    requested_language = (payload.language or '').strip().lower() or None
    try:
        with whisper_lock:
            model = get_whisper_model()
            segments, info = model.transcribe(
                str(audio_path),
                language=requested_language,
                beam_size=5,
                word_timestamps=True,
                vad_filter=True,
                vad_parameters={
                    'min_silence_duration_ms': 350,
                    'speech_pad_ms': 180,
                },
                condition_on_previous_text=False,
            )
            transcript = [
                {
                    'start': round(float(segment.start), 3),
                    'end': round(float(segment.end), 3),
                    'text': segment.text.strip(),
                    'confidence': round(float(max(0.0, min(1.0, 1.0 + segment.avg_logprob))), 4),
                }
                for segment in segments
                if segment.text.strip() and segment.end > segment.start
            ]
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f'Không thể nhận diện hội thoại: {error}') from error

    if not transcript:
        raise HTTPException(status_code=422, detail='Không phát hiện được hội thoại trong video.')
    return {
        'language': info.language,
        'language_probability': round(float(info.language_probability), 4),
        'duration_seconds': round(float(info.duration), 3),
        'model': whisper_model_name,
        'segments': transcript,
    }


@app.post('/synthesize')
def synthesize(payload: SynthesisRequest):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail='Vui lòng nhập lời thoại tiếng Việt.')

    try:
        with model_lock:
            model = get_model(payload.voice)
            audio, _ = model.synthesize(text, speed=payload.speed, normalize_peak=0.95)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f'Không thể tạo âm thanh: {error}') from error

    output = io.BytesIO()
    sf.write(output, audio, SAMPLE_RATE, format='WAV', subtype='PCM_16')
    output.seek(0)
    duration_seconds = len(audio) / SAMPLE_RATE
    return StreamingResponse(
        output,
        media_type='audio/wav',
        headers={
            'Content-Disposition': 'inline; filename="kokoro-preview.wav"',
            'X-Sample-Rate': str(SAMPLE_RATE),
            'X-Duration-Seconds': f'{duration_seconds:.6f}',
        },
    )
