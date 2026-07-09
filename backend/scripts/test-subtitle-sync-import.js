require('dotenv').config({ quiet: true });

const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const mysql = require('mysql2/promise');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with ${code}: ${stderr}`));
    });
  });
}

async function synthesize(text, outputPath, fetchImpl) {
  const response = await fetchImpl('http://localhost:8100/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: 'diem_trinh', speed: 1 }),
  });
  if (!response.ok) throw new Error(`Kokoro responded ${response.status}`);
  await fsPromises.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function waitForDubbingJob(db, getJob, jobId, timeoutMs = 480000) {
  const deadline = Date.now() + timeoutMs;
  let job = null;
  while (Date.now() < deadline) {
    job = await getJob(db, jobId);
    if (job && ['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Dubbing job ${jobId} did not finish before timeout; last status: ${job?.status || 'unknown'}`);
}

async function main() {
  const nativeFetch = global.fetch;
  const workDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'itmove-import-sync-test-'));
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_website',
  });
  let episodeId = null;

  try {
    const speechFiles = ['speech-1.wav', 'speech-2.wav', 'speech-3.wav'].map((name) => path.join(workDir, name));
    await synthesize('Xin chào, đây là câu thoại đầu tiên.', speechFiles[0], nativeFetch);
    await synthesize('Phụ đề đang được đồng bộ với hội thoại.', speechFiles[1], nativeFetch);
    await synthesize('Đây là câu thoại cuối cùng của bài kiểm tra.', speechFiles[2], nativeFetch);

    const videoPath = path.join(workDir, 'source.mp4');
    await run(ffmpegPath, [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=640x360:d=28:r=24',
      '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=28',
      '-i', speechFiles[0], '-i', speechFiles[1], '-i', speechFiles[2],
      '-filter_complex',
      '[1:a]volume=0.02[bg];[2:a]adelay=5000|5000[s1];[3:a]adelay=12000|12000[s2];[4:a]adelay=20000|20000[s3];[bg][s1][s2][s3]amix=inputs=4:duration=longest:normalize=0[audio]',
      '-map', '0:v:0', '-map', '[audio]', '-c:v', 'libx264', '-preset', 'ultrafast',
      '-c:a', 'aac', '-shortest', '-movflags', '+faststart', videoPath,
    ]);

    const [movieRows] = await db.execute('SELECT id FROM movies ORDER BY id LIMIT 1');
    if (!movieRows.length) throw new Error('Database has no movie for the temporary episode');
    const [episodeResult] = await db.execute(
      `INSERT INTO episodes (movie_id, episode_number, title, video_url, duration_seconds)
       VALUES (?, ?, ?, ?, ?)`,
      [movieRows[0].id, 999999, 'Codex Subtitle Sync Import Test', videoPath, 28]
    );
    episodeId = episodeResult.insertId;

    const subtitle = [
      '1\n00:00:01,000 --> 00:00:03,500\nXin chào, đây là câu thoại đầu tiên.',
      '2\n00:00:08,000 --> 00:00:10,500\nPhụ đề đang được đồng bộ với hội thoại.',
      '3\n00:00:16,000 --> 00:00:18,500\nĐây là câu thoại cuối cùng của bài kiểm tra.',
    ].join('\n\n');

    let remoteSubtitle = subtitle;
    process.env.OPENSUBTITLES_API_KEY = 'integration-test';
    global.fetch = async (url, options) => {
      const value = String(url);
      if (value === 'https://api.opensubtitles.com/api/v1/download') {
        return new Response(JSON.stringify({ link: 'https://mock.itmove/subtitle.srt', file_name: 'test.srt' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (value === 'https://mock.itmove/subtitle.srt') {
        return new Response(remoteSubtitle, { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
      return nativeFetch(url, options);
    };

    const { generateSubtitleFromEpisodeAudio, importOnlineSubtitle } = require('../services/subtitleProviderService');
    const { createJob, getJob, removeEpisodeDubbing } = require('../services/dubbingService');
    const result = await importOnlineSubtitle(db, {
      movie_id: movieRows[0].id,
      episode_id: episodeId,
      provider: 'opensubtitles',
      language: 'vi',
      file_id: 1,
      release_name: 'integration-test.srt',
      sync_with_audio: true,
      is_default: true,
    });
    const [rows] = await db.execute(
      `SELECT format, content, original_content, sync_status, sync_score,
              sync_offset_seconds, sync_drift_seconds
       FROM episode_subtitles WHERE id = ?`,
      [result.subtitle.id]
    );
    const stored = rows[0];
    if (!stored || stored.sync_status !== 'verified') throw new Error('Subtitle was not marked verified');
    if (!String(stored.content).startsWith('WEBVTT')) throw new Error('Synchronized VTT was not stored');
    if (!String(stored.original_content).includes('00:00:01,000')) throw new Error('Original subtitle was not preserved');
    if (Math.abs(Number(stored.sync_offset_seconds) - 4) > 1.5) {
      throw new Error(`Unexpected synchronization offset: ${stored.sync_offset_seconds}`);
    }

    remoteSubtitle = '1\n00:00:00,000 --> 00:00:27,000\nNội dung phụ đề thuộc một bản phim hoàn toàn khác.';
    const regenerated = await importOnlineSubtitle(db, {
      movie_id: movieRows[0].id,
      episode_id: episodeId,
      provider: 'opensubtitles',
      language: 'vi',
      file_id: 2,
      release_name: 'invalid-test.srt',
      sync_with_audio: true,
      is_default: true,
    });
    const [regeneratedRows] = await db.execute(
      'SELECT content, sync_status FROM episode_subtitles WHERE id = ?',
      [regenerated.subtitle.id]
    );
    if (regeneratedRows[0]?.sync_status !== 'transcribed' || !String(regeneratedRows[0]?.content).startsWith('WEBVTT')) {
      throw new Error('Invalid subtitle did not fall back to ASR transcription');
    }

    const generated = await generateSubtitleFromEpisodeAudio(db, {
      movie_id: movieRows[0].id,
      episode_id: episodeId,
      language: 'vi',
      is_default: true,
    });
    if (generated.subtitle.sync_status !== 'transcribed' || generated.sync.mode !== 'asr_regenerated') {
      throw new Error('Direct audio subtitle generation did not complete');
    }

    await removeEpisodeDubbing(db, episodeId);
    const dubbingJob = await createJob(db, {
      episodeId,
      voice: 'diem_trinh',
      originalAudioVolume: 0.15,
      syncEnabled: false,
      sourceMode: 'video',
    });
    const completedJob = await waitForDubbingJob(db, getJob, dubbingJob.id);
    if (completedJob.status !== 'succeeded' || !completedJob.output_url) {
      throw new Error(`Video-only dubbing job failed: ${completedJob.error_message || completedJob.status}`);
    }
    await removeEpisodeDubbing(db, episodeId);

    console.log(JSON.stringify({
      status: stored.sync_status,
      score: Number(stored.sync_score),
      offset_seconds: Number(stored.sync_offset_seconds),
      drift_seconds: Number(stored.sync_drift_seconds),
      format: stored.format,
      asr_fallback_status: regeneratedRows[0].sync_status,
      direct_audio_generation_status: generated.subtitle.sync_status,
      video_only_dubbing_status: completedJob.status,
      video_only_dubbing_source_mode: completedJob.source_mode,
    }));
  } finally {
    global.fetch = nativeFetch;
    if (episodeId) await db.execute('DELETE FROM episodes WHERE id = ?', [episodeId]);
    await db.end();
    await fsPromises.rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
