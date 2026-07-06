# Kokoro Vietnamese dubbing

IT Move uses a small Python service for Kokoro-Vietnamese inference. The Node
backend remains responsible for authentication, episode validation, and WAV
storage.

## Install

```powershell
npm run tts:setup
```

The first setup installs PyTorch and the Kokoro-Vietnamese package, so it can
take several minutes.

## Run

Start the TTS service in its own terminal:

```powershell
npm run tts:service
```

Then start the regular backend and frontend. In Admin, open a movie's episode
manager and use the voice button on an episode. The dialog supports:

- choosing one of 14 Vietnamese voices;
- selecting a stored VTT/SRT subtitle track;
- generating a short WAV preview;
- generating, monitoring, and cancelling a full-episode dubbing job;
- controlling the original soundtrack volume;
- playing or deleting the completed dubbed MP4.

The full pipeline synthesizes every subtitle cue, fits speech to its cue,
builds a timeline, mixes it with the original soundtrack, and publishes the
MP4 under `/media/dubbing/`. The watch player then exposes **Original audio**
and **Vietnamese dubbing** in its existing audio/subtitle menu.

The first synthesis downloads the model files from Hugging Face. Generated
previews and videos are stored under `backend/storage/dubbing/` and are ignored
by Git. FFmpeg is supplied by the backend's `ffmpeg-static` dependency.

## Configuration

```env
KOKORO_TTS_URL=http://127.0.0.1:8100
KOKORO_TTS_TIMEOUT_MS=180000
KOKORO_DEVICE=cpu
```

Use `KOKORO_DEVICE=cuda` only when a compatible NVIDIA CUDA installation is
available. CPU inference works but full episodes can take a long time.

## Source requirements

- The episode needs a direct MP4 or HLS URL that FFmpeg can read.
- The episode needs a valid subtitle track with timestamps.
- YouTube watch/embed pages are not direct media sources and cannot be mixed.
- One dubbing job can run per episode at a time.
