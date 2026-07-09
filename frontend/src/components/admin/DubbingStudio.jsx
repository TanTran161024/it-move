import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Slider,
  Switch,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import MovieIcon from '@mui/icons-material/Movie';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import axios from 'axios';
import { API_BASE_URL as API } from '../../config/api';
import '../../pages/admin/AdminStyles.css';

const fieldSx = {
  '& .MuiInputBase-input': { color: 'var(--admin-text)' },
  '& .MuiInputLabel-root': { color: 'var(--admin-text-muted)' },
  '& .MuiOutlinedInput-root': {
    background: 'var(--admin-input-bg)',
    '& fieldset': { borderColor: 'var(--admin-border)' },
    '&:hover fieldset': { borderColor: 'var(--admin-border-strong)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--admin-accent)' },
  },
};

const menuProps = {
  PaperProps: {
    sx: {
      bgcolor: 'var(--admin-surface)',
      color: 'var(--admin-text)',
      border: '1px solid var(--admin-border)',
      '& .MuiMenuItem-root': {
        fontWeight: 700,
        color: 'var(--admin-text)',
        '&:hover': { bgcolor: 'var(--admin-card-hover)' },
        '&.Mui-selected': { bgcolor: 'var(--admin-accent-soft)' },
      },
    },
  },
};

const jobStageLabel = {
  queued: 'Đang chờ',
  preparing: 'Chuẩn bị dữ liệu',
  transcribing: 'Nghe hội thoại video',
  translating: 'Dịch hội thoại',
  synchronizing: 'Đồng bộ phụ đề',
  synthesizing: 'Tạo giọng Việt',
  mixing: 'Ghép âm thanh',
  completed: 'Hoàn thành',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
};

const jobStatusColor = {
  queued: 'warning',
  running: 'info',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'default',
};

function normalizeDubbingJob(job) {
  if (!job) return null;
  return {
    ...job,
    playback_url: job.output_url
      ? (job.output_url.startsWith('http') ? job.output_url : `${API}${job.output_url}`)
      : '',
  };
}

function qualityReportOf(job) {
  if (!job?.quality_report_json) return null;
  if (typeof job.quality_report_json === 'object') return job.quality_report_json;
  try {
    return JSON.parse(job.quality_report_json);
  } catch {
    return null;
  }
}

function jobStageText(job) {
  if (!job) return 'Chưa có job';
  const terminal = { succeeded: 'Hoàn thành', failed: 'Thất bại', cancelled: 'Đã hủy' };
  return terminal[job.status] || jobStageLabel[job.stage] || (job.status === 'running' ? 'Đang xử lý' : 'Đang chờ');
}

function sourceModeLabel(value) {
  if (value === 'video') return 'Chỉ từ video';
  if (value === 'subtitle') return 'Từ phụ đề';
  return 'Tự động';
}

function StatusChip({ label, tone = 'default' }) {
  return (
    <Chip
      size="small"
      label={label}
      color={tone}
      variant={tone === 'default' ? 'outlined' : 'filled'}
      sx={{ fontWeight: 800 }}
    />
  );
}

function PipelineStep({ icon, title, value, tone = 'default', detail }) {
  return (
    <Box
      sx={{
        p: 2,
        border: '1px solid var(--admin-border)',
        borderRadius: 2,
        bgcolor: 'var(--admin-card)',
        display: 'grid',
        gap: 1,
        minHeight: 118,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Box component={icon} sx={{ color: 'var(--admin-accent)', fontSize: 22 }} />
          <Typography sx={{ color: 'var(--admin-text-strong)', fontWeight: 900, fontSize: '0.95rem' }}>
            {title}
          </Typography>
        </Box>
        <StatusChip label={value} tone={tone} />
      </Box>
      {detail && (
        <Typography sx={{ color: 'var(--admin-text-muted)', fontSize: '0.82rem', lineHeight: 1.55 }}>
          {detail}
        </Typography>
      )}
    </Box>
  );
}

export default function DubbingStudio() {
  const [movies, setMovies] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [subtitles, setSubtitles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [voices, setVoices] = useState([]);
  const [service, setService] = useState({ available: false });
  const [selectedMovieId, setSelectedMovieId] = useState('');
  const [selectedEpisodeId, setSelectedEpisodeId] = useState('');
  const [sourceMode, setSourceMode] = useState('auto');
  const [subtitleId, setSubtitleId] = useState('');
  const [voice, setVoice] = useState('diem_trinh');
  const [originalVolume, setOriginalVolume] = useState(0.25);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const selectedMovie = useMemo(
    () => movies.find((movie) => String(movie.id) === String(selectedMovieId)) || null,
    [movies, selectedMovieId]
  );
  const selectedEpisode = useMemo(
    () => episodes.find((episode) => String(episode.id) === String(selectedEpisodeId)) || null,
    [episodes, selectedEpisodeId]
  );
  const latestJob = jobs[0] || null;
  const qualityReport = qualityReportOf(latestJob);
  const hasVideoSource = Boolean(selectedEpisode?.hls_url || selectedEpisode?.video_url);
  const hasSubtitleSource = subtitles.length > 0 || Boolean(selectedEpisode?.subtitle_url);
  const effectiveSourceMode = sourceMode === 'auto'
    ? (hasSubtitleSource ? 'subtitle' : 'video')
    : sourceMode;
  const canRunDubbing = selectedEpisode && service.available && (
    effectiveSourceMode === 'video' ? hasVideoSource : hasSubtitleSource
  );
  const hasActiveJob = ['queued', 'running'].includes(latestJob?.status);
  const hasOutput = Boolean(latestJob?.output_url || selectedEpisode?.dubbed_video_url);

  const loadMovies = useCallback(async () => {
    const res = await axios.get(`${API}/api/movies?include_hidden=true`);
    const nextMovies = Array.isArray(res.data) ? res.data : [];
    setMovies(nextMovies);
    setSelectedMovieId((current) => current || (nextMovies[0]?.id ? String(nextMovies[0].id) : ''));
  }, []);

  const loadVoices = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/admin/dubbing/voices`);
      const nextVoices = res.data.voices || [];
      setVoices(nextVoices);
      setVoice((current) => current || nextVoices[0]?.id || 'diem_trinh');
      setService(res.data.service || { available: false });
    } catch {
      setVoices([]);
      setService({ available: false });
    }
  }, []);

  const loadEpisodes = useCallback(async (movieId) => {
    if (!movieId) {
      setEpisodes([]);
      setSelectedEpisodeId('');
      return;
    }
    setEpisodeLoading(true);
    try {
      const res = await axios.get(`${API}/api/movies/${movieId}/episodes`);
      const nextEpisodes = Array.isArray(res.data) ? res.data : [];
      setEpisodes(nextEpisodes);
      setSelectedEpisodeId((current) => (
        nextEpisodes.some((episode) => String(episode.id) === String(current))
          ? current
          : (nextEpisodes[0]?.id ? String(nextEpisodes[0].id) : '')
      ));
    } catch (err) {
      setEpisodes([]);
      setSelectedEpisodeId('');
      setError(err.response?.data?.message || 'Không thể tải danh sách tập.');
    } finally {
      setEpisodeLoading(false);
    }
  }, []);

  const loadEpisodeDubbingData = useCallback(async (episodeId) => {
    if (!episodeId) {
      setSubtitles([]);
      setJobs([]);
      return;
    }
    const [subtitleRes, jobRes] = await Promise.all([
      axios.get(`${API}/api/subtitles/episodes/${episodeId}/manage`),
      axios.get(`${API}/api/admin/dubbing/jobs`, { params: { episode_id: episodeId } }),
    ]);
    const nextSubtitles = subtitleRes.data.subtitles || [];
    setSubtitles(nextSubtitles);
    setSubtitleId((current) => (
      nextSubtitles.some((subtitle) => String(subtitle.id) === String(current))
        ? current
        : (nextSubtitles.find((subtitle) => subtitle.is_default)?.id || nextSubtitles[0]?.id || '')
    ));
    setJobs((jobRes.data || []).map(normalizeDubbingJob));
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([loadMovies(), loadVoices()])
      .catch((err) => {
        if (mounted) setError(err.response?.data?.message || 'Không thể tải dữ liệu xưởng lồng tiếng.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [loadMovies, loadVoices]);

  useEffect(() => {
    loadEpisodes(selectedMovieId);
  }, [loadEpisodes, selectedMovieId]);

  useEffect(() => {
    setNotice('');
    setError('');
    loadEpisodeDubbingData(selectedEpisodeId).catch((err) => {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu lồng tiếng của tập.');
    });
  }, [loadEpisodeDubbingData, selectedEpisodeId]);

  useEffect(() => {
    if (!latestJob || !['queued', 'running'].includes(latestJob.status)) return undefined;
    const timer = setInterval(async () => {
      try {
        await loadEpisodeDubbingData(selectedEpisodeId);
        if (selectedMovieId) await loadEpisodes(selectedMovieId);
      } catch {
        // Keep polling on transient failures; the next tick can recover.
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [latestJob, loadEpisodeDubbingData, loadEpisodes, selectedEpisodeId, selectedMovieId]);

  useEffect(() => {
    if (sourceMode !== 'auto') return;
    if (!hasSubtitleSource && hasVideoSource) {
      setSourceMode('video');
    }
  }, [hasSubtitleSource, hasVideoSource, sourceMode]);

  const refreshAll = async () => {
    setActionLoading('refresh');
    setError('');
    try {
      await Promise.all([
        loadVoices(),
        selectedMovieId ? loadEpisodes(selectedMovieId) : Promise.resolve(),
        selectedEpisodeId ? loadEpisodeDubbingData(selectedEpisodeId) : Promise.resolve(),
      ]);
      setNotice('Đã làm mới dữ liệu lồng tiếng.');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể làm mới dữ liệu.');
    } finally {
      setActionLoading('');
    }
  };

  const generateSubtitleFromVideo = async () => {
    if (!selectedMovie || !selectedEpisode) return;
    setActionLoading('transcribe');
    setError('');
    setNotice('');
    try {
      await axios.post(`${API}/api/admin/subtitles/generate-from-audio`, {
        movie_id: selectedMovie.id,
        episode_id: selectedEpisode.id,
        language: 'vi',
        is_default: true,
      });
      await loadEpisodeDubbingData(selectedEpisode.id);
      setSourceMode('subtitle');
      setNotice('Đã tạo phụ đề tiếng Việt từ hội thoại video.');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tạo phụ đề từ hội thoại video.');
    } finally {
      setActionLoading('');
    }
  };

  const createDubbingJob = async () => {
    if (!selectedEpisode) return;
    setActionLoading('dub');
    setError('');
    setNotice('');
    try {
      const res = await axios.post(`${API}/api/admin/episodes/${selectedEpisode.id}/dubbing/jobs`, {
        source_mode: effectiveSourceMode,
        subtitle_id: effectiveSourceMode === 'subtitle' ? (subtitleId || null) : null,
        voice,
        original_audio_volume: originalVolume,
        sync_enabled: effectiveSourceMode === 'subtitle' && syncEnabled,
      });
      setJobs((current) => [normalizeDubbingJob(res.data), ...current]);
      setNotice(`Đã tạo job lồng tiếng bằng chế độ ${sourceModeLabel(effectiveSourceMode)}.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể bắt đầu job lồng tiếng.');
    } finally {
      setActionLoading('');
    }
  };

  const cancelJob = async () => {
    if (!latestJob) return;
    setActionLoading('cancel');
    try {
      const res = await axios.post(`${API}/api/admin/dubbing/jobs/${latestJob.id}/cancel`);
      setJobs((current) => current.map((job) => (job.id === latestJob.id ? normalizeDubbingJob(res.data) : job)));
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể hủy job.');
    } finally {
      setActionLoading('');
    }
  };

  const deleteDubbing = async () => {
    if (!selectedEpisode || !window.confirm('Xóa dữ liệu lồng tiếng của tập này?')) return;
    setActionLoading('delete');
    try {
      await axios.delete(`${API}/api/admin/episodes/${selectedEpisode.id}/dubbing`);
      await Promise.all([
        loadEpisodeDubbingData(selectedEpisode.id),
        selectedMovieId ? loadEpisodes(selectedMovieId) : Promise.resolve(),
      ]);
      setNotice('Đã xóa dữ liệu lồng tiếng của tập.');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể xóa dữ liệu lồng tiếng.');
    } finally {
      setActionLoading('');
    }
  };

  const pipelineSteps = [
    {
      icon: MovieIcon,
      title: 'Nguồn video',
      value: hasVideoSource ? 'Sẵn sàng' : 'Thiếu',
      tone: hasVideoSource ? 'success' : 'error',
      detail: hasVideoSource ? (selectedEpisode?.hls_url ? 'Tập có HLS/CDN để FFmpeg xử lý.' : 'Tập có MP4 fallback để xử lý.') : 'Cần thêm HLS hoặc MP4 trước khi lồng tiếng.',
    },
    {
      icon: SubtitlesIcon,
      title: 'Lời thoại',
      value: hasSubtitleSource ? 'Có phụ đề' : 'Từ video',
      tone: hasSubtitleSource ? 'success' : (hasVideoSource ? 'warning' : 'default'),
      detail: hasSubtitleSource ? `${subtitles.length || 1} nguồn phụ đề có thể dùng.` : 'Có thể để Whisper nghe trực tiếp hội thoại video.',
    },
    {
      icon: RecordVoiceOverIcon,
      title: 'Job lồng tiếng',
      value: latestJob ? jobStageText(latestJob) : 'Chưa chạy',
      tone: latestJob ? (jobStatusColor[latestJob.status] || 'default') : 'default',
      detail: latestJob ? `Job #${latestJob.id} · ${sourceModeLabel(latestJob.source_mode || effectiveSourceMode)}` : `Chế độ hiện tại: ${sourceModeLabel(effectiveSourceMode)}.`,
    },
    {
      icon: PlayCircleIcon,
      title: 'Xuất bản',
      value: hasOutput ? 'Đã có MP4' : 'Chưa có',
      tone: hasOutput ? 'success' : 'default',
      detail: hasOutput ? 'Player có thể hiển thị lựa chọn lồng tiếng Việt.' : 'Chạy job thành công để tạo bản lồng tiếng.',
    },
  ];

  return (
    <Box className="admin-content-section" sx={{ display: 'grid', gap: 2.5 }}>
      <div className="admin-section-header">
        <div>
          <h2 className="admin-section-title">Xưởng lồng tiếng</h2>
          <p className="admin-section-subtitle">Điều phối nguồn video, phụ đề, Whisper và Kokoro theo từng tập phim.</p>
        </div>
        <Button
          variant="outlined"
          onClick={refreshAll}
          disabled={Boolean(actionLoading)}
          startIcon={actionLoading === 'refresh' ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
        >
          Làm mới
        </Button>
      </div>

      {!service.available && (
        <Alert severity="warning">
          Dịch vụ Kokoro/Whisper chưa sẵn sàng. Chạy npm run backend để bật API và TTS trên localhost.
        </Alert>
      )}
      {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1.1fr 0.9fr' },
          gap: 2,
        }}
      >
        <Box className="admin-panel" sx={{ display: 'grid', gap: 2 }}>
          <Typography className="admin-panel-title">Chọn tập xử lý</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 220px' }, gap: 2 }}>
            <FormControl size="small" sx={fieldSx} disabled={loading || !movies.length}>
              <InputLabel id="dubbing-studio-movie-label">Phim</InputLabel>
              <Select
                labelId="dubbing-studio-movie-label"
                value={selectedMovieId}
                label="Phim"
                onChange={(event) => setSelectedMovieId(event.target.value)}
                MenuProps={menuProps}
              >
                {movies.map((movie) => (
                  <MenuItem key={movie.id} value={String(movie.id)}>
                    {movie.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={fieldSx} disabled={episodeLoading || !episodes.length}>
              <InputLabel id="dubbing-studio-episode-label">Tập</InputLabel>
              <Select
                labelId="dubbing-studio-episode-label"
                value={selectedEpisodeId}
                label="Tập"
                onChange={(event) => setSelectedEpisodeId(event.target.value)}
                MenuProps={menuProps}
              >
                {episodes.map((episode) => (
                  <MenuItem key={episode.id} value={String(episode.id)}>
                    Tập {episode.episode_number} · {episode.title || `ID ${episode.id}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {loading || episodeLoading ? (
            <LinearProgress sx={{ height: 7, borderRadius: 1 }} />
          ) : !selectedEpisode ? (
            <Box className="admin-empty">Chọn một phim có tập để bắt đầu.</Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.5 }}>
              {pipelineSteps.map((step) => <PipelineStep key={step.title} {...step} />)}
            </Box>
          )}
        </Box>

        <Box className="admin-panel" sx={{ display: 'grid', gap: 1.75 }}>
          <Typography className="admin-panel-title">Cấu hình chạy</Typography>
          <FormControl size="small" sx={fieldSx}>
            <InputLabel id="dubbing-studio-source-label">Nguồn lồng tiếng</InputLabel>
            <Select
              labelId="dubbing-studio-source-label"
              value={sourceMode}
              label="Nguồn lồng tiếng"
              onChange={(event) => setSourceMode(event.target.value)}
              disabled={hasActiveJob}
              MenuProps={menuProps}
            >
              <MenuItem value="auto">Tự động</MenuItem>
              <MenuItem value="subtitle">Từ phụ đề đã khớp</MenuItem>
              <MenuItem value="video">Chỉ từ video</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={fieldSx} disabled={effectiveSourceMode !== 'subtitle' || !subtitles.length}>
            <InputLabel id="dubbing-studio-subtitle-label">Phụ đề nguồn</InputLabel>
            <Select
              labelId="dubbing-studio-subtitle-label"
              value={subtitleId}
              label="Phụ đề nguồn"
              onChange={(event) => setSubtitleId(event.target.value)}
              displayEmpty
              MenuProps={menuProps}
              renderValue={(value) => {
                const selected = subtitles.find((subtitle) => String(subtitle.id) === String(value));
                if (selected) return `${selected.label} (${String(selected.srclang || 'vi').toUpperCase()})`;
                if (selectedEpisode?.subtitle_url) return 'Phụ đề mặc định của tập';
                return 'Chưa có phụ đề';
              }}
            >
              {!subtitles.length && (
                <MenuItem value="" disabled={!selectedEpisode?.subtitle_url}>
                  {selectedEpisode?.subtitle_url ? 'Phụ đề mặc định của tập' : 'Chưa có phụ đề'}
                </MenuItem>
              )}
              {subtitles.map((subtitle) => (
                <MenuItem key={subtitle.id} value={subtitle.id}>
                  {subtitle.label} · {subtitle.sync_status || 'unchecked'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={fieldSx} disabled={!voices.length}>
            <InputLabel id="dubbing-studio-voice-label">Giọng Việt</InputLabel>
            <Select
              labelId="dubbing-studio-voice-label"
              value={voice}
              label="Giọng Việt"
              onChange={(event) => setVoice(event.target.value)}
              MenuProps={menuProps}
            >
              {voices.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
            </Select>
          </FormControl>

          {effectiveSourceMode === 'subtitle' && (
            <FormControlLabel
              control={<Switch checked={syncEnabled} onChange={(event) => setSyncEnabled(event.target.checked)} disabled={hasActiveJob} />}
              label="Tự đồng bộ phụ đề với hội thoại trước khi lồng tiếng"
              sx={{ color: 'var(--admin-text)' }}
            />
          )}

          <Box sx={{ px: 0.5 }}>
            <Typography sx={{ color: 'var(--admin-text)', fontWeight: 800, fontSize: '0.85rem' }}>
              Âm lượng nền gốc khi có lời Việt: {Math.round(originalVolume * 100)}%
            </Typography>
            <Slider
              value={originalVolume}
              min={0}
              max={1}
              step={0.05}
              onChange={(_, value) => setOriginalVolume(value)}
              disabled={hasActiveJob}
              sx={{ color: 'var(--admin-accent)' }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              onClick={generateSubtitleFromVideo}
              disabled={!selectedEpisode || !hasVideoSource || Boolean(actionLoading)}
              startIcon={actionLoading === 'transcribe' ? <CircularProgress size={16} color="inherit" /> : <SubtitlesIcon />}
            >
              Tạo phụ đề từ video
            </Button>
            <Button
              variant="contained"
              onClick={createDubbingJob}
              disabled={!canRunDubbing || hasActiveJob || Boolean(actionLoading)}
              startIcon={actionLoading === 'dub' ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
              sx={{ bgcolor: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent-hover)' } }}
            >
              Lồng tiếng tự động
            </Button>
          </Box>
        </Box>
      </Box>

      <Box className="admin-panel" sx={{ display: 'grid', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography className="admin-panel-title">Job & kiểm tra kết quả</Typography>
          {latestJob && <StatusChip label={`${jobStageText(latestJob)} · ${latestJob.progress || 0}%`} tone={jobStatusColor[latestJob.status] || 'default'} />}
        </Box>

        {!latestJob ? (
          <Box className="admin-empty">Chưa có job lồng tiếng cho tập đang chọn.</Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, color: 'var(--admin-text)' }}>
              <Typography sx={{ fontWeight: 900 }}>Job #{latestJob.id}</Typography>
              <Typography sx={{ color: 'var(--admin-text-muted)', fontWeight: 800 }}>
                {latestJob.completed_segments || 0}/{latestJob.total_segments || 0} câu thoại
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={latestJob.progress || 0} sx={{ height: 8, borderRadius: 1 }} />

            {qualityReport?.sync?.mode === 'video_transcribed' && (
              <Alert severity="info">
                Whisper đã nghe {qualityReport.sync.asr?.segment_count || 0} câu từ video,
                ngôn ngữ gốc {String(qualityReport.sync.asr?.language || 'auto').toUpperCase()}.
              </Alert>
            )}
            {qualityReport?.sync?.warning && qualityReport.sync.mode !== 'video_transcribed' && (
              <Alert severity="warning">{qualityReport.sync.warning}</Alert>
            )}
            {latestJob.error_message && <Alert severity="error">{latestJob.error_message}</Alert>}

            {latestJob.status === 'succeeded' && latestJob.playback_url && (
              <Box component="video" src={latestJob.playback_url} controls sx={{ width: '100%', maxHeight: 360, bgcolor: '#000', borderRadius: 2 }} />
            )}

            <Divider sx={{ borderColor: 'var(--admin-border)' }} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
              {hasActiveJob && (
                <Button
                  color="warning"
                  onClick={cancelJob}
                  disabled={Boolean(actionLoading)}
                >
                  Hủy job
                </Button>
              )}
              {['succeeded', 'failed', 'cancelled'].includes(latestJob.status) && (
                <Button
                  color="error"
                  onClick={deleteDubbing}
                  disabled={Boolean(actionLoading)}
                  startIcon={actionLoading === 'delete' ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
                >
                  Xóa dữ liệu lồng tiếng
                </Button>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
