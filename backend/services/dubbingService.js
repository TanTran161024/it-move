const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { loadEpisodeSubtitleAsVtt, loadStoredSubtitleAsVtt } = require('./subtitleService');
const { KOKORO_VOICES, synthesizeSpeech } = require('./kokoroTtsService');

const SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2;
const activeJobs = new Set();
const outputRoot = path.join(__dirname, '..', 'storage', 'dubbing');
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

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-12000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg thất bại (${code}): ${stderr.trim().slice(-3000)}`));
    });
  });
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
  return rows[0] || null;
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
  return rows;
}

async function updateProgress(db, jobId, completed, total) {
  const progress = total ? Math.min(85, Math.round((completed / total) * 80) + 5) : 5;
  await db.execute(
    'UPDATE dubbing_jobs SET completed_segments = ?, total_segments = ?, progress = ? WHERE id = ?',
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

  try {
    for (let index = 0; index < cues.length; index += 1) {
      if (await isCancelled(db, job.id)) throw Object.assign(new Error('Job đã được hủy.'), { cancelled: true });
      const cue = cues[index];
      const targetSeconds = Math.max(0.25, cue.end - cue.start);
      const synthesis = await synthesizeSpeech({ text: cue.text, voice: job.voice });
      const wavPath = path.join(workDir, `segment-${index}.wav`);
      const rawPath = path.join(workDir, `segment-${index}.raw`);
      await fsPromises.writeFile(wavPath, synthesis.audio);

      const speed = synthesis.durationSeconds > targetSeconds
        ? synthesis.durationSeconds / targetSeconds
        : 1;
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
  return wavPath;
}

async function renderDubbedVideo(source, dubbingWav, outputPath, originalVolume) {
  const parsedVolume = Number(originalVolume);
  const volume = Number.isFinite(parsedVolume) ? Math.max(0, Math.min(1, parsedVolume)) : 0.25;
  const common = ['-y', '-i', source, '-i', dubbingWav];
  try {
    await runFfmpeg([
      ...common,
      '-filter_complex', `[0:a:0]volume=${volume}[original];[1:a:0]volume=1[dub];[original][dub]amix=inputs=2:duration=first:dropout_transition=0[audio]`,
      '-map', '0:v:0', '-map', '[audio]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath,
    ]);
  } catch (error) {
    await runFfmpeg([
      ...common,
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-af', 'apad', '-shortest', '-movflags', '+faststart', outputPath,
    ]).catch(() => { throw error; });
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
      `UPDATE dubbing_jobs SET status = 'running', progress = 2, started_at = NOW(), error_message = NULL
       WHERE id = ? AND status = 'queued'`,
      [jobId]
    );
    if (!claim.affectedRows) return;

    const source = job.hls_url || job.video_url;
    if (!source) throw new Error('Tập phim chưa có nguồn HLS hoặc MP4.');
    const subtitle = job.subtitle_id
      ? await loadStoredSubtitleAsVtt(db, job.episode_id, job.subtitle_id)
      : await loadEpisodeSubtitleAsVtt(db, job.episode_id);
    const cues = parseWebVtt(subtitle.content);
    if (!cues.length) throw new Error('Phụ đề không có câu thoại hợp lệ.');

    workDir = path.join(outputRoot, String(job.episode_id), `job-${job.id}`);
    await fsPromises.mkdir(workDir, { recursive: true });
    await db.execute('UPDATE dubbing_jobs SET total_segments = ? WHERE id = ?', [cues.length, job.id]);
    const dubbingWav = await buildDubbingTrack(db, job, workDir, cues);
    if (await isCancelled(db, job.id)) throw Object.assign(new Error('Job đã được hủy.'), { cancelled: true });

    await db.execute('UPDATE dubbing_jobs SET progress = 90 WHERE id = ?', [job.id]);
    const outputPath = path.join(workDir, 'dubbed.mp4');
    await renderDubbedVideo(source, dubbingWav, outputPath, job.original_audio_volume);
    const outputUrl = `/media/dubbing/${job.episode_id}/job-${job.id}/dubbed.mp4`;
    await db.execute('UPDATE episodes SET dubbed_video_url = ? WHERE id = ?', [outputUrl, job.episode_id]);
    await db.execute(
      `UPDATE dubbing_jobs SET status = 'succeeded', progress = 100, output_url = ?, finished_at = NOW() WHERE id = ?`,
      [outputUrl, job.id]
    );
  } catch (error) {
    const cancelled = error.cancelled || await isCancelled(db, jobId).catch(() => false);
    if (!cancelled) {
      await db.execute(
        `UPDATE dubbing_jobs SET status = 'failed', error_message = ?, finished_at = NOW() WHERE id = ?`,
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

async function createJob(db, { episodeId, subtitleId, voice, originalAudioVolume, requestedBy }) {
  if (!KOKORO_VOICES.some((item) => item.id === voice)) {
    const error = new Error('Giọng đọc không hợp lệ.');
    error.statusCode = 400;
    throw error;
  }
  const [episodes] = await db.execute('SELECT id FROM episodes WHERE id = ? LIMIT 1', [episodeId]);
  if (!episodes.length) {
    const error = new Error('Tập phim không tồn tại.');
    error.statusCode = 404;
    throw error;
  }
  if (subtitleId) {
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
    `INSERT INTO dubbing_jobs (episode_id, subtitle_id, voice, original_audio_volume, requested_by)
     VALUES (?, ?, ?, ?, ?)`,
    [episodeId, subtitleId || null, voice, volume, requestedBy || null]
  );
  setImmediate(() => enqueueJob(db, result.insertId));
  return getJob(db, result.insertId);
}

async function cancelJob(db, jobId) {
  await db.execute(
    `UPDATE dubbing_jobs SET status = 'cancelled', finished_at = NOW()
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
     SET status = 'cancelled', output_url = NULL, finished_at = NOW(),
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
    `UPDATE dubbing_jobs SET status = 'queued', progress = 0, completed_segments = 0,
      error_message = 'Backend restarted; job was queued again.' WHERE status = 'running'`
  ).catch(() => {});
  const [rows] = await db.execute(`SELECT id FROM dubbing_jobs WHERE status = 'queued' ORDER BY id ASC`).catch(() => [[]]);
  rows.forEach((row) => setImmediate(() => enqueueJob(db, row.id)));
}

module.exports = {
  cancelJob,
  createJob,
  getJob,
  listJobs,
  parseWebVtt,
  processJob,
  removeEpisodeDubbing,
  renderDubbedVideo,
  resumeDubbingJobs,
};
