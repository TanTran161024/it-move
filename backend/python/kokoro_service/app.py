import io
import os
import threading

import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from kokoro_vietnamese import KokoroVietnamese, SAMPLE_RATE, VOICES
from pydantic import BaseModel, Field


app = FastAPI(title='IT Move Kokoro Vietnamese TTS')
device = os.getenv('KOKORO_DEVICE', 'cpu')
model_lock = threading.Lock()
loaded_voice = None
loaded_model = None


class SynthesisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: str = 'diem_trinh'
    speed: float = Field(default=1.0, ge=0.7, le=1.3)


def get_model(voice: str) -> KokoroVietnamese:
    global loaded_model, loaded_voice
    if voice not in VOICES:
        raise HTTPException(status_code=400, detail='Giọng đọc không hợp lệ.')
    if loaded_model is None or loaded_voice != voice:
        loaded_model = KokoroVietnamese(device=device, voice=voice)
        loaded_voice = voice
    return loaded_model


@app.get('/health')
def health():
    return {
        'status': 'ready',
        'device': device,
        'model_loaded': loaded_model is not None,
        'loaded_voice': loaded_voice,
    }


@app.get('/voices')
def voices():
    return [{'id': voice_id, 'name': data['label']} for voice_id, data in VOICES.items()]


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
