# Kokoro Vietnamese dubbing

IT Move uses a small Python service for Kokoro-Vietnamese inference. The Node
backend remains responsible for authentication, episode validation, subtitle
synchronization, audio mixing, and media storage.

## Install

```powershell
npm run tts:setup
```

The first setup installs PyTorch and the Kokoro-Vietnamese package, so it can
take several minutes.

## Run

Start the API and TTS service together:

```powershell
npm run backend
```

Then start the frontend. In Admin, open a movie's episode
manager and use the voice button on an episode. The dialog supports:

- choosing one of 14 Vietnamese voices;
- creating dubbing from an existing subtitle track or directly from the video;
- selecting a stored VTT/SRT subtitle track;
- generating a short WAV preview;
- generating, monitoring, and cancelling a full-episode dubbing job;
- synchronizing subtitles against the source dialogue with ffsubsync;
- reporting synchronization offset, drift, and speech timing warnings;
- controlling the original soundtrack volume while Vietnamese speech plays;
- playing or deleting the completed dubbed MP4.

The full pipeline synchronizes subtitle cues, validates the result, synthesizes
every cue, fits speech to its time slot, builds a timeline, dynamically ducks
the source audio only while Vietnamese speech is active, normalizes loudness,
and publishes the MP4 under `/media/dubbing/`. In **Chỉ từ video** mode, the
job extracts the episode audio, uses faster-whisper to create timestamped
dialogue, translates the transcript to Vietnamese when needed, stores that VTT,
and then uses it for Kokoro synthesis. The watch player then exposes **Original
audio** and **Vietnamese dubbing** in its existing audio/subtitle menu.

Automatic synchronization is enabled by default. A low-confidence result stops
before TTS generation so a wrong subtitle release does not waste processing
time. Select the matching subtitle release or disable synchronization only when
you have manually verified its timestamps.

Online subtitle imports use the same validation before they are saved. Search
results below the title/release relevance threshold are hidden. A valid import
stores the synchronized VTT plus the original provider file and its score,
offset, and drift report. If the downloaded subtitle belongs to a different cut
and cannot be aligned, faster-whisper listens to the episode audio and creates a
new timestamped transcript. Gemini then translates that transcript to the
selected subtitle language. Admin can also run this path directly with **Tạo từ
hội thoại** when no online subtitle is available.

The first synthesis downloads the model files from Hugging Face. Generated
previews and videos are stored under `backend/storage/dubbing/` and are ignored
by Git. FFmpeg is supplied by the backend's `ffmpeg-static` dependency.

## Configuration

```env
KOKORO_TTS_URL=http://localhost:8100
KOKORO_TTS_TIMEOUT_MS=180000
KOKORO_DEVICE=cpu
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WHISPER_CPU_THREADS=4
WHISPER_TRANSCRIBE_TIMEOUT_MS=7200000
```

Use `KOKORO_DEVICE=cuda` only when a compatible NVIDIA CUDA installation is
available. CPU inference works but full episodes can take a long time.
The first ASR run downloads the configured Whisper model. `small` with `int8`
is the default quality/performance balance for a CPU-only machine.

## Source requirements

- The episode needs a direct MP4 or HLS URL that FFmpeg can read.
- Subtitle mode needs a valid subtitle track with timestamps.
- Video-only mode does not need subtitles, but the source audio must contain
  clear dialogue for Whisper to transcribe.
- In subtitle mode, the subtitle track must belong to the same cut/release as
  the source video or pass automatic synchronization.
- YouTube watch/embed pages are not direct media sources and cannot be mixed.
- One dubbing job can run per episode at a time.
