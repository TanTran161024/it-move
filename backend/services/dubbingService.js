const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const {
  ensureWebVtt,
  loadEpisodeSubtitleAsVtt,
  loadStoredSubtitleAsVtt,
  saveEpisodeSubtitle,
} = require('./subtitleService');
const { KOKORO_VOICES, synthesizeSpeech, transcribeAudio } = require('./kokoroTtsService');
const { translateSubtitle } = require('./subtitleTranslatorService');

const SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2;
const activeJobs = new Set();
const outputRoot = path.join(__dirname, '..', 'storage', 'dubbing');
const ffsubsyncPath = process.env.FFSUBSYNC_PATH || path.join(
  __dirname,
  '..',
  'python',
  'kokoro_service',
  '.venv',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'ffsubsync.exe' : 'ffsubsync'
);
let jobQueue = Promise.resolve();

function enqueueJob(db, jobId) {
  jobQueue = jobQueue
    .then(() => processJob(db, jobId))
    .catch((error) => console.error(`Dubbing job ${jobId} queue error: ${error.message}`));
}

function parseTimestamp(value) {
  const parts = String(value).trim().replace(',', '.').split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number.NaN;
}

function cleanCueText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWebVtt(content) {
  const lines = String(content || '').replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const cues = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes('-->')) continue;
    const [rawStart, rawEnd] = lines[index].split('-->');
    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(String(rawEnd).trim().split(/\s+/)[0]);
    const textLines = [];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      textLines.push(lines[index]);
      index += 1;
    }
    const text = cleanCueText(textLines.join(' '));
    if (text && Number.isFinite(start) && Number.isFinite(end) && end > start) {
      cues.push({ start, end, text });
    }
  }

  return cues;
}

function formatSrtTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const secs = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatVttTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const secs = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function cuesToSrt(cues) {
  return cues.map((cue, index) => (
    `${index + 1}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}\n${cue.text}\n`
  )).join('\n');
}

function transcriptToVtt(segments) {
  const cues = segments
    .map((segment, index) => {
      const text = cleanCueText(segment.text);
      if (!text) return null;
      return `${index + 1}\n${formatVttTimestamp(segment.start)} --> ${formatVttTimestamp(segment.end)}\n${text}`;
    })
    .filter(Boolean);
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function normalizeLanguage(value) {
  return String(value || 'auto').trim().toLowerCase().replace(/[^a-z-]/g, '').slice(0, 12) || 'auto';
}

function normalizeSourceMode(value) {
  const normalized = String(value || 'subtitle').trim().toLowerCase();
  return ['video', 'audio'].includes(normalized) ? 'video' : 'subtitle';
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-20000);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-20000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(`${path.basename(command)} thất bại (${code}): ${(stderr || stdout).trim().slice(-3000)}`), { stdout, stderr }));
    });
  });
}

function runFfmpeg(args) {
  return runCommand(ffmpegPath, args).then(() => undefined).catch((error) => {
    throw new Error(`FFmpeg thất bại: ${error.message}`);
  });
}

function resolveMediaSource(value) {
  let source = String(value || '').trim();
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const parsed = new URL(source);
      const nested = parsed.searchParams.get('url');
      const isPlayerWrapper = /(^|\.)phimapi\.com$/i.test(parsed.hostname) && parsed.pathname.startsWith('/player');
      if (!isPlayerWrapper || !nested || nested === source) break;
      source = nested;
    } catch {
      break;
    }
  }
  return source;
}

function mediaInputArgs(source) {
  const resolved = resolveMediaSource(source);
  if (!/^https?:\/\//i.test(resolved)) return ['-i', resolved];
  return [
    '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ITMove/1.0',
    '-referer', 'https://player.phimapi.com/',
    '-i', resolved,
  ];
}

async function synchronizeCues(source, cues, workDir) {
  const inputPath = path.join(workDir, 'subtitle-original.srt');
  const outputPath = path.join(workDir, 'subtitle-synced.srt');
  await fsPromises.writeFile(inputPath, cuesToSrt(cues), 'utf8');

  const baseArgs = [
    resolveMediaSource(source),
    '-i', inputPath,
    '-o', outputPath,
    '--ffmpeg-path', ffmpegPath,
    '--encoding', 'utf-8',
    '--output-encoding', 'utf-8',
    '--max-offset-seconds', '180',
    '--skip-sync-on-low-quality',
    '--quality-max-offset-seconds', '120',
  ];

  let commandOutput = '';
  try {
    const result = await runCommand(ffsubsyncPath, [
      ...baseArgs,
      '--multi-segment-sync',
      '--segment-count', '8',
      '--skip-intro-outro',
      '--parallel-workers', '2',
    ]);
    commandOutput = `${result.stdout}\n${result.stderr}`;
  } catch (multiSegmentError) {
    const result = await runCommand(ffsubsyncPath, [...baseArgs, '--extract-audio-first']);
    commandOutput = `${result.stdout}\n${result.stderr}\nFallback: ${multiSegmentError.message}`;
  }

  const syncedContent = await fsPromises.readFile(outputPath, 'utf8');
  const syncedCues = parseWebVtt(syncedContent);
  if (!syncedCues.length || syncedCues.length !== cues.length) {
    return {
      cues,
      report: {
        applied: false,
        reliable: false,
        warning: 'Không thể xác nhận kết quả đồng bộ; job đã dừng trước khi tạo giọng.',
      },
    };
  }

  const offsets = cues.map((cue, index) => syncedCues[index].start - cue.start);
  const offset = median(offsets);
  const drift = offsets.length > 1 ? offsets[offsets.length - 1] - offsets[0] : 0;
  const changedCues = offsets.filter((value) => Math.abs(value) >= 0.05).length;
  const scoreMatch = commandOutput.match(/score[^\d-]*(-?\d+(?:\.\d+)?)/i);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;
  const lowQuality = /low[ -]?quality|untrustworthy|skip(?:ping|ped)? sync/i.test(commandOutput) || (score !== null && score < 0);

  return {
    cues: syncedCues,
    synced_content: syncedContent,
    report: {
      applied: changedCues > 0,
      reliable: !lowQuality,
      offset_seconds: Number(offset.toFixed(3)),
      drift_seconds: Number(drift.toFixed(3)),
      changed_cues: changedCues,
      total_cues: cues.length,
      score,
      warning: lowQuality
        ? 'Độ tin cậy đồng bộ thấp; phụ đề có thể không thuộc đúng bản phim.'
        : null,
    },
  };
}

async function extractSpeechAudio(source, outputPath) {
  await runFfmpeg([
    '-y',
    ...mediaInputArgs(source),
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    outputPath,
  ]);
  return outputPath;
}

async function buildCuesFromVideoAudio(db, job, source, workDir) {
  await updateStage(db, job.id, 'transcribing', 4);
  const transcribeDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), `itmove-dubbing-${job.id}-`));
  const audioPath = path.join(transcribeDir, 'dialogue-16khz.wav');
  await extractSpeechAudio(source, audioPath);

  try {
    const transcription = await transcribeAudio({ audioPath });
    const transcriptSegments = (transcription.segments || []).filter((segment) => cleanCueText(segment.text));
    if (!transcriptSegments.length) {
      throw new Error('Whisper không nhận diện được câu thoại nào từ video.');
    }

    const transcriptVtt = transcriptToVtt(transcriptSegments);
    const sourceLanguage = normalizeLanguage(transcription.language);
    const targetLanguage = 'vi';
    let content = transcriptVtt;
    let translation = {
      provider: 'none',
      model: null,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      fallback: false,
    };

    if (sourceLanguage !== targetLanguage) {
      await updateStage(db, job.id, 'translating', 8);
      translation = await translateSubtitle({
        content: transcriptVtt,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        format: 'vtt',
        bilingual: false,
      });
      if (translation.fallback) {
        const error = new Error(translation.message || 'Không thể dịch hội thoại video sang tiếng Việt.');
        error.statusCode = 502;
        throw error;
      }
      content = ensureWebVtt(translation.translated_content, 'subtitle.vtt');
    }

    const cues = parseWebVtt(content);
    if (!cues.length) {
      throw new Error('Transcript từ video không tạo được câu thoại hợp lệ.');
    }

    const confidences = transcriptSegments
      .map((segment) => Number(segment.confidence))
      .filter(Number.isFinite);
    const averageConfidence = confidences.length
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : null;
    const report = {
      mode: 'video_transcribed',
      applied: true,
      reliable: true,
      warning: 'Lồng tiếng được tạo trực tiếp từ hội thoại trong video, không dùng phụ đề nguồn.',
      asr: {
        model: transcription.model,
        language: transcription.language,
        language_probability: transcription.language_probability,
        segment_count: transcriptSegments.length,
        average_confidence: averageConfidence === null ? null : Number(averageConfidence.toFixed(4)),
      },
      translation: {
        provider: translation.provider,
        model: translation.model || null,
        source_language: sourceLanguage,
        target_language: targetLanguage,
      },
    };

    const subtitle = await saveEpisodeSubtitle(db, job.episode_id, {
      content,
      original_content: transcriptVtt,
      srclang: targetLanguage,
      label: `Whisper VI · ${job.episode_title || `Tập ${job.episode_number}`}`,
      format: 'vtt',
      is_default: true,
      sync_status: 'transcribed',
      sync_score: averageConfidence === null ? null : Number((averageConfidence * 100).toFixed(3)),
      sync_report: report,
    });
    await db.execute('UPDATE dubbing_jobs SET subtitle_id = ? WHERE id = ?', [subtitle.id, job.id]);

    return { cues, report, subtitle };
  } finally {
    await fsPromises.rm(transcribeDir, { recursive: true, force: true }).catch(() => {});
  }
}

function atempoFilter(speed) {
  const filters = [];
  let remaining = speed;
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  if (remaining > 1.01) filters.push(`atempo=${remaining.toFixed(5)}`);
  return filters;
}

async function writeSilence(handle, samples) {
  let remaining = Math.max(0, Math.floor(samples)) * BYTES_PER_SAMPLE;
  const zeroes = Buffer.alloc(1024 * 1024);
  while (remaining > 0) {
    const size = Math.min(remaining, zeroes.length);
    await handle.write(zeroes, 0, size);
    remaining -= size;
  }
}

async function appendFileSlice(handle, filePath, maxBytes) {
  const input = await fsPromises.open(filePath, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  let total = 0;
  try {
    while (total < maxBytes) {
      const requested = Math.min(buffer.length, maxBytes - total);
      const { bytesRead } = await input.read(buffer, 0, requested, null);
      if (!bytesRead) break;
      await handle.write(buffer, 0, bytesRead);
      total += bytesRead;
    }
  } finally {
    await input.close();
  }
  return total;
}

async function getJob(db, jobId) {
  const [rows] = await db.execute(
    `SELECT j.*, e.movie_id, e.episode_number, e.title AS episode_title,
            e.hls_url, e.video_url
     FROM dubbing_jobs j
     JOIN episodes e ON e.id = j.episode_id
     WHERE j.id = ? LIMIT 1`,
    [jobId]
  );
  return normalizeJob(rows[0] || null);
}

function normalizeJob(job) {
  if (!job) return null;
  if (typeof job.quality_report_json === 'string') {
    try {
      job.quality_report_json = JSON.parse(job.quality_report_json);
    } catch {
      job.quality_report_json = null;
    }
  }
  return job;
}

async function listJobs(db, episodeId) {
  const params = [];
  let where = '';
  if (episodeId) {
    where = 'WHERE j.episode_id = ?';
    params.push(episodeId);
  }
  const [rows] = await db.execute(
    `SELECT j.*, e.movie_id, e.episode_number, e.title AS episode_title
     FROM dubbing_jobs j
     JOIN episodes e ON e.id = j.episode_id
     ${where}
     ORDER BY j.created_at DESC, j.id DESC LIMIT 100`,
    params
  );
  return rows.map(normalizeJob);
}

async function updateStage(db, jobId, stage, progress) {
  await db.execute('UPDATE dubbing_jobs SET stage = ?, progress = ? WHERE id = ?', [stage, progress, jobId]);
}

async function updateProgress(db, jobId, completed, total) {
  const progress = total ? Math.min(88, Math.round((completed / total) * 78) + 10) : 10;
  await db.execute(
    `UPDATE dubbing_jobs SET completed_segments = ?, total_segments = ?, progress = ?, stage = 'synthesizing'
     WHERE id = ?`,
    [completed, total, progress, jobId]
  );
}

async function isCancelled(db, jobId) {
  const [rows] = await db.execute('SELECT status FROM dubbing_jobs WHERE id = ? LIMIT 1', [jobId]);
  return rows[0]?.status === 'cancelled';
}

async function buildDubbingTrack(db, job, workDir, cues) {
  const timelinePath = path.join(workDir, 'dubbing.raw');
  const output = await fsPromises.open(timelinePath, 'w');
  let cursorSamples = 0;
  const speedFactors = [];
  let shortCueCount = 0;
  let overlapCount = 0;

  try {
    for (let index = 0; index < cues.length; index += 1) {
      if (await isCancelled(db, job.id)) throw Object.assign(new Error('Job đã được hủy.'), { cancelled: true });
      const cue = cues[index];
      const targetSeconds = Math.max(0.25, cue.end - cue.start);
      if (cue.end - cue.start < 0.7) shortCueCount += 1;
      if (index > 0 && cue.start < cues[index - 1].end) overlapCount += 1;
      const synthesis = await synthesizeSpeech({ text: cue.text, voice: job.voice });
      const wavPath = path.join(workDir, `segment-${index}.wav`);
      const rawPath = path.join(workDir, `segment-${index}.raw`);
      await fsPromises.writeFile(wavPath, synthesis.audio);

      const speed = synthesis.durationSeconds > targetSeconds
        ? synthesis.durationSeconds / targetSeconds
        : 1;
      speedFactors.push(speed);
      const filters = [...atempoFilter(speed), 'aresample=24000', 'aformat=sample_fmts=s16:channel_layouts=mono'];
      await runFfmpeg(['-y', '-i', wavPath, '-vn', '-af', filters.join(','), '-f', 's16le', rawPath]);

      const cueStartSamples = Math.max(cursorSamples, Math.round(cue.start * SAMPLE_RATE));
      await writeSilence(output, cueStartSamples - cursorSamples);
      cursorSamples = cueStartSamples;
      const maxBytes = Math.round(targetSeconds * SAMPLE_RATE) * BYTES_PER_SAMPLE;
      const written = await appendFileSlice(output, rawPath, maxBytes);
      cursorSamples += Math.floor(written / BYTES_PER_SAMPLE);
      await fsPromises.rm(wavPath, { force: true });
      await fsPromises.rm(rawPath, { force: true });
      await updateProgress(db, job.id, index + 1, cues.length);
    }
  } finally {
    await output.close();
  }

  const wavPath = path.join(workDir, 'dubbing.wav');
  await runFfmpeg(['-y', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', timelinePath, wavPath]);
  return {
    wavPath,
    report: {
      max_speed: Number(Math.max(1, ...speedFactors).toFixed(3)),
      average_speed: Number((speedFactors.reduce((sum, value) => sum + value, 0) / Math.max(1, speedFactors.length)).toFixed(3)),
      fast_cues: speedFactors.filter((value) => value > 1.2).length,
      very_fast_cues: speedFactors.filter((value) => value > 1.4).length,
      short_cues: shortCueCount,
      overlapping_cues: overlapCount,
    },
  };
}

async function renderDubbedVideo(source, dubbingWav, outputPath, originalVolume) {
  const parsedVolume = Number(originalVolume);
  const volume = Number.isFinite(parsedVolume) ? Math.max(0, Math.min(1, parsedVolume)) : 0.25;
  const common = ['-y', ...mediaInputArgs(source), '-i', dubbingWav];
  const ratio = Math.max(1, 1 + ((1 - volume) * 5));
  const audioFilter = [
    '[1:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,asplit=2[dub_sc][dub_mix]',
    '[0:a:0]aresample=48000,aformat=sample_fmts=fltp[original]',
    `[original][dub_sc]sidechaincompress=threshold=0.030:ratio=${ratio.toFixed(2)}:attack=20:release=450[ducked]`,
    '[ducked][dub_mix]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]',
    '[mixed]loudnorm=I=-16:LRA=11:TP=-1.5,alimiter=limit=0.95[audio]',
  ].join(';');
  try {
    await runFfmpeg([
      ...common,
      '-filter_complex', audioFilter,
      '-map', '0:v:0', '-map', '[audio]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath,
    ]);
  } catch (error) {
    const sourceHasNoAudio = /matches no streams|stream specifier[^\n]*a:0|does not contain any audio stream/i.test(error.message);
    if (!sourceHasNoAudio) throw error;

    await runFfmpeg([
      ...common,
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-af', 'apad', '-shortest', '-movflags', '+faststart', outputPath,
    ]);
  }
}

async function processJob(db, jobId) {
  if (activeJobs.has(Number(jobId))) return;
  activeJobs.add(Number(jobId));
  let workDir;
  try {
    const job = await getJob(db, jobId);
    if (!job || job.status !== 'queued') return;
    const [claim] = await db.execute(
      `UPDATE dubbing_jobs SET status = 'running', stage = 'preparing', progress = 2, started_at = NOW(), error_message = NULL
       WHERE id = ? AND status = 'queued'`,
      [jobId]
    );
    if (!claim.affectedRows) return;

    const source = job.hls_url || job.video_url;
    if (!source) throw new Error('Tập phim chưa có nguồn HLS hoặc MP4.');
    workDir = path.join(outputRoot, String(job.episode_id), `job-${job.id}`);
    await fsPromises.mkdir(workDir, { recursive: true });

    let cues = [];
    let syncReport = { applied: false, disabled: !Boolean(job.sync_enabled) };
    if (normalizeSourceMode(job.source_mode) === 'video') {
      const generated = await buildCuesFromVideoAudio(db, job, source, workDir);
      cues = generated.cues;
      syncReport = generated.report;
    } else {
      const subtitle = job.subtitle_id
        ? await loadStoredSubtitleAsVtt(db, job.episode_id, job.subtitle_id)
        : await loadEpisodeSubtitleAsVtt(db, job.episode_id);
      const originalCues = parseWebVtt(subtitle.content);
      if (!originalCues.length) throw new Error('Phụ đề không có câu thoại hợp lệ.');

      cues = originalCues;
      if (job.sync_enabled) {
        await updateStage(db, job.id, 'synchronizing', 4);
        try {
          const synchronized = await synchronizeCues(source, originalCues, workDir);
          cues = synchronized.cues;
          syncReport = synchronized.report;
        } catch (syncError) {
          syncReport = {
            applied: false,
            reliable: false,
            warning: `Đồng bộ tự động thất bại; job đã dừng trước khi tạo giọng. ${syncError.message}`.slice(0, 1000),
          };
        }
      }
    }
    await db.execute(
      `UPDATE dubbing_jobs
       SET sync_offset_seconds = ?, sync_drift_seconds = ?, quality_report_json = ?, stage = 'synthesizing', progress = 10
       WHERE id = ?`,
      [syncReport.offset_seconds ?? null, syncReport.drift_seconds ?? null, JSON.stringify({ sync: syncReport }), job.id]
    );
    if (normalizeSourceMode(job.source_mode) === 'subtitle' && job.sync_enabled && syncReport.reliable === false) {
      throw new Error('Không thể đồng bộ phụ đề với độ tin cậy đủ cao. Hãy chọn phụ đề đúng bản phim hoặc tắt tự đồng bộ để ép chạy.');
    }
    await db.execute('UPDATE dubbing_jobs SET total_segments = ? WHERE id = ?', [cues.length, job.id]);
    const dubbingTrack = await buildDubbingTrack(db, job, workDir, cues);
    if (await isCancelled(db, job.id)) throw Object.assign(new Error('Job đã được hủy.'), { cancelled: true });

    const qualityReport = { sync: syncReport, speech: dubbingTrack.report };
    await db.execute(
      `UPDATE dubbing_jobs SET stage = 'mixing', progress = 92, quality_report_json = ? WHERE id = ?`,
      [JSON.stringify(qualityReport), job.id]
    );
    const outputPath = path.join(workDir, 'dubbed.mp4');
    await renderDubbedVideo(source, dubbingTrack.wavPath, outputPath, job.original_audio_volume);
    const outputUrl = `/media/dubbing/${job.episode_id}/job-${job.id}/dubbed.mp4`;
    await db.execute('UPDATE episodes SET dubbed_video_url = ? WHERE id = ?', [outputUrl, job.episode_id]);
    await db.execute(
      `UPDATE dubbing_jobs SET status = 'succeeded', stage = 'completed', progress = 100, output_url = ?, finished_at = NOW() WHERE id = ?`,
      [outputUrl, job.id]
    );
  } catch (error) {
    const cancelled = error.cancelled || await isCancelled(db, jobId).catch(() => false);
    if (!cancelled) {
      await db.execute(
        `UPDATE dubbing_jobs SET status = 'failed', stage = 'failed', error_message = ?, finished_at = NOW() WHERE id = ?`,
        [String(error.message || error).slice(0, 5000), jobId]
      ).catch(() => {});
    }
  } finally {
    activeJobs.delete(Number(jobId));
    if (workDir) {
      const finalJob = await getJob(db, jobId).catch(() => null);
      if (finalJob?.status === 'succeeded') {
        await fsPromises.rm(path.join(workDir, 'dubbing.raw'), { force: true }).catch(() => {});
      } else {
        await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}

async function createJob(db, { episodeId, subtitleId, voice, originalAudioVolume, syncEnabled = true, sourceMode = 'subtitle', requestedBy }) {
  const normalizedSourceMode = normalizeSourceMode(sourceMode);
  if (!KOKORO_VOICES.some((item) => item.id === voice)) {
    const error = new Error('Giọng đọc không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }
  const [episodes] = await db.execute('SELECT id, hls_url, video_url FROM episodes WHERE id = ? LIMIT 1', [episodeId]);
  if (!episodes.length) {
    const error = new Error('Tập phim không tồn tại.');
    error.statusCode = 404;
    throw error;
  }
  const episode = episodes[0];
  if (normalizedSourceMode === 'video') {
    if (!String(episode.hls_url || episode.video_url || '').trim()) {
      const error = new Error('Tập phim chưa có nguồn MP4/HLS để lồng tiếng từ video.');
      error.statusCode = 400;
      throw error;
    }
  } else if (subtitleId) {
    const [subtitles] = await db.execute(
      'SELECT id FROM episode_subtitles WHERE id = ? AND episode_id = ? LIMIT 1',
      [subtitleId, episodeId]
    );
    if (!subtitles.length) {
      const error = new Error('Phụ đề nguồn không thuộc tập phim này.');
      error.statusCode = 400;
      throw error;
    }
  } else {
    const [subtitleSources] = await db.execute(
      `SELECT e.subtitle_url,
              EXISTS(SELECT 1 FROM episode_subtitles s WHERE s.episode_id = e.id) AS has_stored_subtitle
       FROM episodes e WHERE e.id = ? LIMIT 1`,
      [episodeId]
    );
    const source = subtitleSources[0];
    if (!source?.has_stored_subtitle && !String(source?.subtitle_url || '').trim()) {
      const error = new Error('Tập phim chưa có phụ đề. Hãy dán phụ đề VTT hoặc SRT trước khi lồng tiếng.');
      error.statusCode = 400;
      throw error;
    }
  }
  const [running] = await db.execute(
    `SELECT id FROM dubbing_jobs WHERE episode_id = ? AND status IN ('queued', 'running') LIMIT 1`,
    [episodeId]
  );
  if (running.length) {
    const error = new Error('Tập phim đang có một job lồng tiếng.');
    error.statusCode = 409;
    throw error;
  }
  const parsedVolume = Number(originalAudioVolume);
  const volume = Number.isFinite(parsedVolume) ? Math.max(0, Math.min(1, parsedVolume)) : 0.25;
  const [result] = await db.execute(
    `INSERT INTO dubbing_jobs (episode_id, subtitle_id, voice, source_mode, sync_enabled, original_audio_volume, requested_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      episodeId,
      normalizedSourceMode === 'video' ? null : (subtitleId || null),
      voice,
      normalizedSourceMode,
      normalizedSourceMode === 'subtitle' && syncEnabled ? 1 : 0,
      volume,
      requestedBy || null,
    ]
  );
  setImmediate(() => enqueueJob(db, result.insertId));
  return getJob(db, result.insertId);
}

async function cancelJob(db, jobId) {
  await db.execute(
    `UPDATE dubbing_jobs SET status = 'cancelled', stage = 'cancelled', finished_at = NOW()
     WHERE id = ? AND status IN ('queued', 'running')`,
    [jobId]
  );
  return getJob(db, jobId);
}

async function removeEpisodeDubbing(db, episodeId) {
  const [activeRows] = await db.execute(
    `SELECT id FROM dubbing_jobs WHERE episode_id = ? AND status IN ('queued', 'running')`,
    [episodeId]
  );
  await db.execute(
    `UPDATE dubbing_jobs
     SET status = 'cancelled', stage = 'cancelled', output_url = NULL, finished_at = NOW(),
         error_message = CASE WHEN status = 'succeeded' THEN 'Output removed by admin.' ELSE error_message END
     WHERE episode_id = ? AND status IN ('queued', 'running', 'succeeded')`,
    [episodeId]
  );
  if (activeRows.length) {
    const placeholders = activeRows.map(() => '?').join(',');
    await db.execute(
      `DELETE FROM dubbing_jobs WHERE episode_id = ? AND id NOT IN (${placeholders})`,
      [episodeId, ...activeRows.map((row) => row.id)]
    );
  } else {
    await db.execute('DELETE FROM dubbing_jobs WHERE episode_id = ?', [episodeId]);
  }
  await db.execute('UPDATE episodes SET dubbed_video_url = NULL WHERE id = ?', [episodeId]);
  await fsPromises.rm(path.join(outputRoot, String(episodeId)), { recursive: true, force: true });
  return { success: true };
}

async function resumeDubbingJobs(db) {
  await db.execute(
    `UPDATE dubbing_jobs SET status = 'queued', stage = 'queued', progress = 0, completed_segments = 0,
      error_message = 'Backend restarted; job was queued again.' WHERE status = 'running'`
  ).catch(() => {});
  const [rows] = await db.execute(`SELECT id FROM dubbing_jobs WHERE status = 'queued' ORDER BY id ASC`).catch(() => [[]]);
  rows.forEach((row) => setImmediate(() => enqueueJob(db, row.id)));
}

module.exports = {
  cancelJob,
  createJob,
  extractSpeechAudio,
  getJob,
  listJobs,
  parseWebVtt,
  processJob,
  removeEpisodeDubbing,
  renderDubbedVideo,
  resolveMediaSource,
  resumeDubbingJobs,
  synchronizeCues,
};
