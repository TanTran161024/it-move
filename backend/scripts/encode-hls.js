const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
    args[key] = value;
    if (value !== 'true') i += 1;
  }
  return args;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

function printUsage() {
  console.log(`
Usage:
  npm run encode:hls -- --input ./input.mp4 --output ./public/hls/movie-1/ep-1 --base-url https://cdn.example.com/hls/movie-1/ep-1

Options:
  --input       Source MP4/MOV file.
  --output      Output directory for HLS package.
  --base-url    Public CDN/base URL for printed links.
  --skip-assets Skip thumbnail.jpg and preview.mp4 generation.
`);
}

function joinUrl(baseUrl, fileName) {
  if (!baseUrl) return '';
  return `${baseUrl.replace(/\/+$/, '')}/${fileName.replace(/^\/+/, '')}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input ? path.resolve(args.input) : '';
  const output = args.output ? path.resolve(args.output) : '';
  const baseUrl = args['base-url'] || '';
  const skipAssets = args['skip-assets'] === 'true';

  if (!input || !output) {
    printUsage();
    process.exit(1);
  }

  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  fs.mkdirSync(output, { recursive: true });
  ['360p', '720p', '1080p'].forEach((dir) => {
    fs.mkdirSync(path.join(output, dir), { recursive: true });
  });

  run('ffmpeg', [
    '-y',
    '-i', input,
    '-filter_complex',
    '[0:v]split=3[v360][v720][v1080];[v360]scale=w=640:h=-2[v360out];[v720]scale=w=1280:h=-2[v720out];[v1080]scale=w=1920:h=-2[v1080out]',
    '-map', '[v360out]',
    '-map', '0:a?',
    '-map', '[v720out]',
    '-map', '0:a?',
    '-map', '[v1080out]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-crf', '21',
    '-c:a', 'aac',
    '-ac', '2',
    '-b:a:0', '96k',
    '-b:a:1', '128k',
    '-b:a:2', '160k',
    '-b:v:0', '800k',
    '-maxrate:v:0', '950k',
    '-bufsize:v:0', '1200k',
    '-b:v:1', '2500k',
    '-maxrate:v:1', '3000k',
    '-bufsize:v:1', '4200k',
    '-b:v:2', '5200k',
    '-maxrate:v:2', '6200k',
    '-bufsize:v:2', '8000k',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(output, '%v', 'segment_%05d.ts'),
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', 'v:0,a:0,name:360p v:1,a:1,name:720p v:2,a:2,name:1080p',
    '-f', 'hls',
    path.join(output, '%v', 'index.m3u8'),
  ]);

  if (!skipAssets) {
    run('ffmpeg', [
      '-y',
      '-ss', '5',
      '-i', input,
      '-frames:v', '1',
      '-q:v', '3',
      path.join(output, 'thumbnail.jpg'),
    ]);

    run('ffmpeg', [
      '-y',
      '-ss', '5',
      '-t', '12',
      '-i', input,
      '-vf', 'scale=640:-2',
      '-an',
      '-movflags', '+faststart',
      path.join(output, 'preview.mp4'),
    ]);
  }

  const result = {
    hls_url: joinUrl(baseUrl, 'master.m3u8') || path.join(output, 'master.m3u8'),
    thumbnail_url: skipAssets ? '' : (joinUrl(baseUrl, 'thumbnail.jpg') || path.join(output, 'thumbnail.jpg')),
    preview_url: skipAssets ? '' : (joinUrl(baseUrl, 'preview.mp4') || path.join(output, 'preview.mp4')),
    output,
  };

  console.log('\nHLS package ready:');
  console.log(JSON.stringify(result, null, 2));
}

main();
