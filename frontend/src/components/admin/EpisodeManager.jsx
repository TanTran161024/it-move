import { Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Typography, IconButton, FormControl, InputLabel, Select, MenuItem, CircularProgress, LinearProgress, Slider, Switch, FormControlLabel } from '@mui/material';
import { useEffect, useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import '../../pages/admin/AdminStyles.css';

const darkFieldSx = {
  '& .MuiInputBase-input': { color: 'var(--admin-text)' },
  '& .MuiInputLabel-root': { color: 'var(--admin-text-muted)' },
  '& .MuiOutlinedInput-root': {
    background: 'var(--admin-input-bg)',
    '& fieldset': { borderColor: 'var(--admin-border)' },
    '&:hover fieldset': { borderColor: 'var(--admin-border-strong)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--admin-accent)' },
  },
};

const emptyEpisodeForm = {
  episode_number: '',
  title: '',
  video_url: '',
  hls_url: '',
  thumbnail_url: '',
  preview_url: '',
  duration_seconds: '',
  description: '',
  subtitle_url: '',
};

function readableDubbingError(message) {
  if (message === 'Subtitle not configured') {
    return 'Tập phim chưa có phụ đề. Hãy thêm phụ đề có timestamp trước khi lồng tiếng.';
  }
  if (String(message || '').startsWith('FFmpeg thất bại')) {
    return 'Không thể đọc hoặc ghép nguồn video. Hãy kiểm tra URL MP4/HLS trực tiếp rồi chạy lại.';
  }
  return message;
}

const dubbingStageLabel = {
  queued: 'Đang chờ',
  preparing: 'Chuẩn bị dữ liệu',
  transcribing: 'Nghe hội thoại video',
  translating: 'Dịch hội thoại sang tiếng Việt',
  synchronizing: 'Đồng bộ phụ đề',
  synthesizing: 'Tạo giọng Việt',
  mixing: 'Ghép và chuẩn hóa âm thanh',
  completed: 'Hoàn thành',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
};

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
  const terminal = { succeeded: 'Hoàn thành', failed: 'Thất bại', cancelled: 'Đã hủy' };
  return terminal[job?.status] || dubbingStageLabel[job?.stage] || (job?.status === 'running' ? 'Đang xử lý' : 'Đang chờ');
}

export default function EpisodeManager({
  open,
  onClose,
  movie,
  episodes,
  onAdd,
  onEdit,
  onDelete,
  dubbingVoices = [],
  dubbingService = { available: false },
  onGenerateDubbingPreview,
  onLoadDubbingData,
  onCreateDubbingJob,
  onGetDubbingJob,
  onCancelDubbingJob,
  onDeleteDubbing,
  onSaveDubbingSubtitle,
  onDubbingCompleted,
}) {
  const [form, setForm] = useState(emptyEpisodeForm);
  const [editId, setEditId] = useState(null);
  const [dubbingEpisode, setDubbingEpisode] = useState(null);
  const [dubbingText, setDubbingText] = useState('');
  const [dubbingVoice, setDubbingVoice] = useState('diem_trinh');
  const [dubbingAudioUrl, setDubbingAudioUrl] = useState('');
  const [dubbingError, setDubbingError] = useState('');
  const [dubbingLoading, setDubbingLoading] = useState(false);
  const [dubbingSubtitles, setDubbingSubtitles] = useState([]);
  const [dubbingSubtitleId, setDubbingSubtitleId] = useState('');
  const [originalAudioVolume, setOriginalAudioVolume] = useState(0.25);
  const [dubbingJob, setDubbingJob] = useState(null);
  const [dubbingDataLoading, setDubbingDataLoading] = useState(false);
  const [newSubtitleContent, setNewSubtitleContent] = useState('');
  const [subtitleSaving, setSubtitleSaving] = useState(false);
  const [autoSyncSubtitle, setAutoSyncSubtitle] = useState(true);
  const [dubbingSourceMode, setDubbingSourceMode] = useState('subtitle');

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });
  const handleEdit = ep => {
    setEditId(ep.id);
    setForm({
      episode_number: ep.episode_number,
      title: ep.title,
      video_url: ep.video_url || '',
      hls_url: ep.hls_url || '',
      thumbnail_url: ep.thumbnail_url || '',
      preview_url: ep.preview_url || '',
      duration_seconds: ep.duration_seconds || '',
      description: ep.description || '',
      subtitle_url: ep.subtitle_url || ''
    });
  };
  const handleCancelEdit = () => {
    setEditId(null);
    setForm(emptyEpisodeForm);
  };
  const handleSubmit = () => {
    if (editId) {
      onEdit(editId, form);
    } else {
      onAdd(form);
    }
    handleCancelEdit();
  };

  const loadDubbingData = async (episodeId, episodeContext = dubbingEpisode) => {
    setDubbingDataLoading(true);
    try {
      const data = await onLoadDubbingData(episodeId);
      const subtitles = data.subtitles || [];
      setDubbingSubtitles(subtitles);
      setDubbingSubtitleId(subtitles.find((item) => item.is_default)?.id || subtitles[0]?.id || '');
      if (!subtitles.length && !episodeContext?.subtitle_url) {
        setDubbingSourceMode('video');
      }
      setDubbingJob((data.jobs || [])[0] || null);
    } catch (error) {
      setDubbingError(error.response?.data?.message || 'Không thể tải dữ liệu lồng tiếng.');
    } finally {
      setDubbingDataLoading(false);
    }
  };

  const openDubbing = (episode) => {
    setDubbingEpisode(episode);
    setDubbingText('');
    setDubbingVoice(dubbingVoices[0]?.id || 'diem_trinh');
    setDubbingAudioUrl('');
    setDubbingError('');
    setDubbingJob(null);
    setDubbingSubtitles([]);
    setDubbingSubtitleId('');
    setOriginalAudioVolume(0.25);
    setNewSubtitleContent('');
    setAutoSyncSubtitle(true);
    setDubbingSourceMode('subtitle');
    loadDubbingData(episode.id, episode);
  };

  const closeDubbing = () => {
    if (dubbingLoading) return;
    setDubbingEpisode(null);
    setDubbingAudioUrl('');
    setDubbingError('');
  };

  const generateDubbingPreview = async () => {
    setDubbingLoading(true);
    setDubbingError('');
    setDubbingAudioUrl('');
    try {
      const result = await onGenerateDubbingPreview(dubbingEpisode.id, {
        text: dubbingText,
        voice: dubbingVoice,
      });
      setDubbingAudioUrl(result.audio_url);
    } catch (error) {
      setDubbingError(error.response?.data?.message || error.message || 'Không thể tạo giọng đọc.');
    } finally {
      setDubbingLoading(false);
    }
  };

  const createFullDubbing = async () => {
    setDubbingLoading(true);
    setDubbingError('');
    try {
      const job = await onCreateDubbingJob(dubbingEpisode.id, {
        source_mode: dubbingSourceMode,
        subtitle_id: dubbingSourceMode === 'subtitle' ? (dubbingSubtitleId || null) : null,
        voice: dubbingVoice,
        original_audio_volume: originalAudioVolume,
        sync_enabled: dubbingSourceMode === 'subtitle' && autoSyncSubtitle,
      });
      setDubbingJob(job);
    } catch (error) {
      setDubbingError(error.response?.data?.message || 'Không thể bắt đầu lồng tiếng.');
    } finally {
      setDubbingLoading(false);
    }
  };

  const cancelFullDubbing = async () => {
    if (!dubbingJob) return;
    try {
      setDubbingJob(await onCancelDubbingJob(dubbingJob.id));
    } catch (error) {
      setDubbingError(error.response?.data?.message || 'Không thể hủy job.');
    }
  };

  const deleteFullDubbing = async () => {
    if (!window.confirm('Xóa bản lồng tiếng đã tạo?')) return;
    try {
      await onDeleteDubbing(dubbingEpisode.id);
      setDubbingJob(null);
      setDubbingError('');
      await loadDubbingData(dubbingEpisode.id);
    } catch (error) {
      setDubbingError(error.response?.data?.message || 'Không thể xóa bản lồng tiếng.');
    }
  };

  const saveDubbingSubtitle = async () => {
    if (!newSubtitleContent.trim()) return;
    setSubtitleSaving(true);
    setDubbingError('');
    try {
      await onSaveDubbingSubtitle(dubbingEpisode.id, newSubtitleContent);
      setNewSubtitleContent('');
      await loadDubbingData(dubbingEpisode.id);
    } catch (error) {
      setDubbingError(error.response?.data?.message || 'Không thể lưu phụ đề.');
    } finally {
      setSubtitleSaving(false);
    }
  };

  useEffect(() => {
    if (!dubbingJob || !['queued', 'running'].includes(dubbingJob.status)) return undefined;
    const timer = setInterval(async () => {
      try {
        const job = await onGetDubbingJob(dubbingJob.id);
        setDubbingJob(job);
        if (job.status === 'succeeded') onDubbingCompleted?.();
      } catch {
        // Keep the last visible job state when a transient poll fails.
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [dubbingJob, onDubbingCompleted, onGetDubbingJob]);

  const hasSubtitleSource = dubbingSubtitles.length > 0 || Boolean(dubbingEpisode?.subtitle_url);
  const hasVideoSource = Boolean(dubbingEpisode?.hls_url || dubbingEpisode?.video_url);
  const needsSubtitleSource = dubbingSourceMode === 'subtitle';
  const canCreateDubbing = dubbingSourceMode === 'video' ? hasVideoSource : hasSubtitleSource;
  const qualityReport = qualityReportOf(dubbingJob);

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth className="admin-dialog">
      <DialogTitle>Quản lý tập phim: <span style={{ color: 'var(--admin-accent)' }}>{movie?.title}</span></DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 4, mt: 1 }}>
          <div className="admin-form-section">Danh sách tập phim</div>
          {episodes.length === 0 && (
            <div className="admin-empty" style={{ padding: '24px 12px' }}>
              <Typography>Chưa có tập phim nào.</Typography>
            </div>
          )}
          {episodes.map(ep => (
            <Box
              key={ep.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                mb: 1.5,
                bgcolor: editId === ep.id ? 'var(--admin-accent-soft)' : 'var(--admin-card)',
                borderRadius: 2,
                p: 1.5,
                border: editId === ep.id ? '1px solid var(--admin-accent)' : '1px solid var(--admin-border)',
                transition: 'background-color 160ms ease, border-color 160ms ease',
                '&:hover': {
                  background: 'var(--admin-card-hover)',
                  borderColor: 'var(--admin-border-strong)',
                },
                gap: 2,
                flexWrap: { xs: 'wrap', sm: 'nowrap' },
              }}
            >
              {editId === ep.id ? (
                <>
                  <TextField label="Số tập" name="episode_number" type="number" value={form.episode_number} onChange={handleChange} sx={{ ...darkFieldSx, width: 100 }} size="small" />
                  <TextField label="Tiêu đề" name="title" value={form.title} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 120 }} size="small" />
                  <TextField label="MP4 URL fallback" name="video_url" value={form.video_url} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 150 }} size="small" />
                  <TextField label="HLS/CDN URL (.m3u8)" name="hls_url" value={form.hls_url} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1.2, minWidth: 180 }} size="small" />
                  <TextField label="Thumbnail URL" name="thumbnail_url" value={form.thumbnail_url} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 150 }} size="small" />
                  <TextField label="Preview URL" name="preview_url" value={form.preview_url} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 150 }} size="small" />
                  <TextField label="Duration (s)" name="duration_seconds" type="number" value={form.duration_seconds} onChange={handleChange} sx={{ ...darkFieldSx, width: 120 }} size="small" />
                  <TextField label="Subtitle URL" name="subtitle_url" value={form.subtitle_url} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 150 }} size="small" />
                  <TextField label="Episode description" name="description" value={form.description} onChange={handleChange} sx={{ ...darkFieldSx, flexBasis: '100%' }} size="small" multiline minRows={2} />
                  <Button variant="contained" onClick={handleSubmit} sx={{ ml: 1, minWidth: 80, bgcolor: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent-hover)' } }}>Lưu</Button>
                  <Button onClick={handleCancelEdit} sx={{ ml: 1, minWidth: 60, color: 'var(--admin-text-muted)' }}>Hủy</Button>
                </>
              ) : (
                <>
                  <Typography sx={{ width: 60, fontWeight: 700, color: 'var(--admin-accent)', fontSize: '1.1rem', textAlign: 'center' }}>Tập {ep.episode_number}</Typography>
                  <Typography sx={{ width: 54, color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 600, textAlign: 'center' }}>ID {ep.id}</Typography>
                  <Typography sx={{ flex: 2, fontWeight: 700, color: 'var(--admin-text-strong)', fontSize: '1rem', ml: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{ep.title}</Typography>
                  <Box sx={{ flex: 3, display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
                    <a href={ep.hls_url || ep.video_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--admin-accent-hover)', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center' }}>
                      <svg style={{ marginRight: 6 }} width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.hls_url || ep.video_url}</span>
                    </a>
                    {ep.hls_url && <Typography sx={{ color: '#22c55e', fontSize: '0.72rem', fontWeight: 800 }}>HLS</Typography>}
                    {ep.dubbed_video_url && <Typography sx={{ color: '#38bdf8', fontSize: '0.72rem', fontWeight: 800 }}>LỒNG TIẾNG VI</Typography>}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
                    <IconButton
                      size="small"
                      onClick={() => openDubbing(ep)}
                      sx={{ bgcolor: 'var(--admin-bg-soft)', color: 'var(--admin-accent-hover)', '&:hover': { bgcolor: 'var(--admin-accent)', color: '#fff' } }}
                      title="Tạo giọng đọc tiếng Việt"
                    >
                      <RecordVoiceOverIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleEdit(ep)} sx={{ bgcolor: 'var(--admin-bg-soft)', color: 'var(--admin-text)', '&:hover': { bgcolor: 'var(--admin-accent)', color: '#fff' } }}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => onDelete(ep.id)} sx={{ bgcolor: 'var(--admin-bg-soft)', color: 'var(--admin-danger)', '&:hover': { bgcolor: 'var(--admin-danger)', color: '#fff' } }}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                </>
              )}
            </Box>
          ))}
        </Box>
        
        <div className="admin-form-section">Thêm tập mới</div>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '100px 1fr 1.3fr' }, gap: 2, alignItems: 'center', bgcolor: 'var(--admin-card)', p: 2, borderRadius: 2, border: '1px solid var(--admin-border)' }}>
          <TextField label="Số tập" name="episode_number" type="number" value={form.episode_number} onChange={handleChange} sx={darkFieldSx} disabled={!!editId} size="small" />
          <TextField label="Tiêu đề" name="title" value={form.title} onChange={handleChange} sx={darkFieldSx} disabled={!!editId} size="small" />
          <TextField label="HLS/CDN URL (.m3u8)" name="hls_url" value={form.hls_url} onChange={handleChange} sx={darkFieldSx} disabled={!!editId} size="small" />
          <TextField label="MP4 URL fallback" name="video_url" value={form.video_url} onChange={handleChange} sx={darkFieldSx} disabled={!!editId} size="small" />
          <TextField label="Thumbnail URL" name="thumbnail_url" value={form.thumbnail_url} onChange={handleChange} sx={darkFieldSx} disabled={!!editId} size="small" />
          <TextField label="Preview URL" name="preview_url" value={form.preview_url} onChange={handleChange} sx={darkFieldSx} disabled={!!editId} size="small" />
          <TextField label="Thời lượng (giây)" name="duration_seconds" type="number" value={form.duration_seconds} onChange={handleChange} sx={darkFieldSx} disabled={!!editId} size="small" />
          <TextField label="Subtitle URL" name="subtitle_url" value={form.subtitle_url} onChange={handleChange} sx={darkFieldSx} disabled={!!editId} size="small" />
          <TextField label="Mô tả tập" name="description" value={form.description} onChange={handleChange} sx={{ ...darkFieldSx, gridColumn: { xs: 'auto', md: '1 / -1' } }} disabled={!!editId} size="small" multiline minRows={2} />
          <Button variant="contained" onClick={handleSubmit} disabled={!!editId} sx={{ bgcolor: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent-hover)' } }}>
            {editId ? 'Đang sửa...' : 'Thêm mới'}
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: 'var(--admin-text-muted)' }}>Đóng</Button>
      </DialogActions>
      </Dialog>

      <Dialog open={Boolean(dubbingEpisode)} onClose={closeDubbing} maxWidth="md" fullWidth className="admin-dialog">
        <DialogTitle>Lồng tiếng Việt: Tập {dubbingEpisode?.episode_number}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
          {!dubbingService.available && (
            <Alert severity="warning">
              Dịch vụ Kokoro chưa chạy. Mở terminal và chạy npm run tts:service.
            </Alert>
          )}
          <FormControl size="small" sx={darkFieldSx}>
            <InputLabel id="dubbing-voice-label">Giọng Việt</InputLabel>
            <Select
              labelId="dubbing-voice-label"
              value={dubbingVoice}
              label="Giọng Việt"
              onChange={(event) => setDubbingVoice(event.target.value)}
            >
              {dubbingVoices.map((voice) => (
                <MenuItem key={voice.id} value={voice.id}>{voice.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={darkFieldSx}>
            <InputLabel id="dubbing-source-mode-label">Nguồn lồng tiếng</InputLabel>
            <Select
              labelId="dubbing-source-mode-label"
              value={dubbingSourceMode}
              label="Nguồn lồng tiếng"
              onChange={(event) => setDubbingSourceMode(event.target.value)}
              disabled={Boolean(dubbingJob && ['queued', 'running'].includes(dubbingJob.status))}
            >
              <MenuItem value="subtitle">Từ phụ đề có sẵn</MenuItem>
              <MenuItem value="video">Chỉ từ video</MenuItem>
            </Select>
          </FormControl>

          {dubbingSourceMode === 'video' && (
            <Alert severity="info">
              Chế độ này chỉ cần nguồn MP4/HLS: hệ thống sẽ nghe hội thoại trong video, dịch sang tiếng Việt nếu cần, tạo giọng Kokoro rồi ghép vào video.
            </Alert>
          )}

          {dubbingSourceMode === 'video' && !hasVideoSource && (
            <Alert severity="warning">
              Tập này chưa có nguồn MP4/HLS nên chưa thể lồng tiếng trực tiếp từ video.
            </Alert>
          )}

          <FormControl size="small" sx={darkFieldSx} disabled={dubbingDataLoading || dubbingSourceMode === 'video'}>
            <InputLabel id="dubbing-subtitle-label">Phụ đề nguồn</InputLabel>
            <Select
              labelId="dubbing-subtitle-label"
              value={dubbingSubtitleId}
              label="Phụ đề nguồn"
              onChange={(event) => setDubbingSubtitleId(event.target.value)}
              displayEmpty
              renderValue={(value) => {
                const selected = dubbingSubtitles.find((subtitle) => subtitle.id === value);
                if (selected) return `${selected.label} (${String(selected.srclang || 'vi').toUpperCase()})`;
                if (dubbingEpisode?.subtitle_url) return 'Phụ đề mặc định của tập';
                return 'Chưa có phụ đề';
              }}
            >
              {!dubbingSubtitles.length && (
                <MenuItem value="" disabled={!dubbingEpisode?.subtitle_url}>
                  {dubbingEpisode?.subtitle_url ? 'Phụ đề mặc định của tập' : 'Chưa có phụ đề'}
                </MenuItem>
              )}
              {dubbingSubtitles.map((subtitle) => (
                <MenuItem key={subtitle.id} value={subtitle.id}>
                  {subtitle.label} ({String(subtitle.srclang || 'vi').toUpperCase()})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {needsSubtitleSource && !hasSubtitleSource && (
            <Box sx={{ display: 'grid', gap: 1.25 }}>
              <Alert severity="warning">
                Tập này chưa có phụ đề. Dán nội dung VTT hoặc SRT có timestamp để tiếp tục lồng tiếng.
              </Alert>
              <TextField
                label="Dán phụ đề VTT hoặc SRT"
                value={newSubtitleContent}
                onChange={(event) => setNewSubtitleContent(event.target.value)}
                multiline
                minRows={6}
                placeholder={'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nNội dung lời thoại tiếng Việt.'}
                sx={darkFieldSx}
              />
              <Button
                variant="outlined"
                onClick={saveDubbingSubtitle}
                disabled={subtitleSaving || !newSubtitleContent.trim()}
                startIcon={subtitleSaving ? <CircularProgress size={16} color="inherit" /> : null}
                sx={{ justifySelf: 'start' }}
              >
                {subtitleSaving ? 'Đang lưu...' : 'Lưu phụ đề tiếng Việt'}
              </Button>
            </Box>
          )}

          {dubbingSourceMode === 'subtitle' && (
            <FormControlLabel
              control={(
                <Switch
                  checked={autoSyncSubtitle}
                  onChange={(event) => setAutoSyncSubtitle(event.target.checked)}
                  disabled={Boolean(dubbingJob && ['queued', 'running'].includes(dubbingJob.status))}
                />
              )}
              label="Tự đồng bộ phụ đề với hội thoại trước khi lồng tiếng"
              sx={{ color: 'var(--admin-text)' }}
            />
          )}

          <Box sx={{ px: 0.5 }}>
            <Typography sx={{ color: 'var(--admin-text)', fontWeight: 700, fontSize: '0.85rem' }}>
              Âm lượng gốc khi có lời Việt: {Math.round(originalAudioVolume * 100)}%
            </Typography>
            <Slider
              value={originalAudioVolume}
              min={0}
              max={1}
              step={0.05}
              onChange={(_, value) => setOriginalAudioVolume(value)}
              disabled={Boolean(dubbingJob && ['queued', 'running'].includes(dubbingJob.status))}
              sx={{ color: 'var(--admin-accent)' }}
            />
          </Box>

          {dubbingJob && (
            <Box sx={{ borderTop: '1px solid var(--admin-border)', pt: 2, display: 'grid', gap: 1.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Typography sx={{ color: 'var(--admin-text-strong)', fontWeight: 800 }}>
                  Job #{dubbingJob.id} - {jobStageText(dubbingJob)}
                </Typography>
                <Typography sx={{ color: 'var(--admin-text-muted)', fontWeight: 700 }}>{dubbingJob.progress || 0}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={dubbingJob.progress || 0} sx={{ height: 7, borderRadius: 1 }} />
              <Typography sx={{ color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
                {dubbingJob.completed_segments || 0}/{dubbingJob.total_segments || 0} câu thoại
              </Typography>
              {qualityReport?.sync?.warning && <Alert severity="warning">{qualityReport.sync.warning}</Alert>}
              {qualityReport?.sync?.applied && qualityReport.sync.mode !== 'video_transcribed' && (
                <Alert severity="info">
                  Đã đồng bộ phụ đề: lệch trung vị {Number(qualityReport.sync.offset_seconds || 0).toFixed(2)} giây,
                  độ trôi {Number(qualityReport.sync.drift_seconds || 0).toFixed(2)} giây.
                </Alert>
              )}
              {qualityReport?.sync?.mode === 'video_transcribed' && (
                <Alert severity="info">
                  Đã tạo lời Việt từ video: Whisper nhận diện {qualityReport.sync.asr?.segment_count || 0} câu,
                  ngôn ngữ gốc {String(qualityReport.sync.asr?.language || 'auto').toUpperCase()}
                  {Number.isFinite(Number(qualityReport.sync.asr?.average_confidence))
                    ? `, độ tin cậy trung bình ${(Number(qualityReport.sync.asr.average_confidence) * 100).toFixed(1)}%.`
                    : '.'}
                </Alert>
              )}
              {qualityReport?.speech?.fast_cues > 0 && (
                <Alert severity={qualityReport.speech.very_fast_cues > 0 ? 'warning' : 'info'}>
                  Có {qualityReport.speech.fast_cues} câu cần đọc nhanh hơn 1.2x
                  {qualityReport.speech.very_fast_cues > 0 ? `; ${qualityReport.speech.very_fast_cues} câu vượt 1.4x.` : '.'}
                </Alert>
              )}
              {dubbingJob.error_message && <Alert severity="error">{readableDubbingError(dubbingJob.error_message)}</Alert>}
              {dubbingJob.status === 'succeeded' && dubbingJob.playback_url && (
                <Box component="video" src={dubbingJob.playback_url} controls sx={{ width: '100%', maxHeight: 300, bgcolor: '#000' }} />
              )}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                {['queued', 'running'].includes(dubbingJob.status) && (
                  <Button color="warning" onClick={cancelFullDubbing}>Hủy xử lý</Button>
                )}
                {['succeeded', 'failed', 'cancelled'].includes(dubbingJob.status) && (
                  <Button color="error" onClick={deleteFullDubbing}>Xóa dữ liệu lồng tiếng</Button>
                )}
              </Box>
            </Box>
          )}

          <Box sx={{ borderTop: '1px solid var(--admin-border)', pt: 2 }}>
            <Typography sx={{ color: 'var(--admin-text-strong)', fontWeight: 800, mb: 1 }}>Nghe thử một đoạn</Typography>
          <TextField
            label="Lời thoại tiếng Việt"
            value={dubbingText}
            onChange={(event) => setDubbingText(event.target.value)}
            multiline
            minRows={5}
            inputProps={{ maxLength: 2000 }}
            helperText={`${dubbingText.length}/2000 ký tự`}
            sx={darkFieldSx}
          />
            <Button
              onClick={generateDubbingPreview}
              disabled={dubbingLoading || !dubbingService.available || !dubbingText.trim()}
              startIcon={dubbingLoading ? <CircularProgress size={16} color="inherit" /> : <RecordVoiceOverIcon />}
              sx={{ mt: 1.5 }}
            >
              Tạo đoạn nghe thử
            </Button>
          </Box>
          {dubbingError && <Alert severity="error">{dubbingError}</Alert>}
          {dubbingAudioUrl && (
            <Box component="audio" src={dubbingAudioUrl} controls autoPlay sx={{ width: '100%' }} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDubbing} disabled={dubbingLoading} sx={{ color: 'var(--admin-text-muted)' }}>Đóng</Button>
          <Button
            variant="contained"
            onClick={createFullDubbing}
            disabled={dubbingLoading || dubbingDataLoading || subtitleSaving || !dubbingService.available || !canCreateDubbing || Boolean(dubbingJob && ['queued', 'running', 'succeeded'].includes(dubbingJob.status))}
            startIcon={dubbingLoading ? <CircularProgress size={16} color="inherit" /> : <RecordVoiceOverIcon />}
            sx={{ bgcolor: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent-hover)' } }}
          >
            {dubbingLoading ? 'Đang tạo...' : (dubbingSourceMode === 'video' ? 'Lồng tiếng từ video' : 'Lồng tiếng toàn bộ tập')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
