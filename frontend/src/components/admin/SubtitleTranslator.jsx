import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import VisibilityIcon from '@mui/icons-material/Visibility';
import axios from 'axios';
import { API_BASE_URL as API } from '../../config/api';
import '../../pages/admin/AdminStyles.css';

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:03,000
I need something good to watch tonight.

2
00:00:03,500 --> 00:00:05,000
Make it exciting, but not too heavy.
`;

const LANGUAGES = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
  { value: 'th', label: 'ไทย' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
];

const SOURCE_LANGUAGES = [{ value: 'auto', label: 'Tự nhận diện' }, ...LANGUAGES];

const darkMenuPaperSx = {
  bgcolor: 'var(--admin-surface)',
  color: 'var(--admin-text)',
  border: '1px solid var(--admin-border)',
  borderRadius: 2,
  mt: 1,
  maxHeight: 360,
  boxShadow: 'var(--admin-shadow)',
  '& .MuiList-root': { py: 0.75 },
  '& .MuiMenuItem-root': {
    minHeight: 42,
    fontWeight: 700,
    borderRadius: 1.5,
    mx: 0.75,
    my: 0.25,
    color: 'var(--admin-text)',
    '&:hover': { bgcolor: 'var(--admin-card-hover)' },
    '&.Mui-selected': {
      bgcolor: 'var(--admin-accent-soft)',
      '&:hover': { bgcolor: 'var(--admin-accent-soft)' },
    },
  },
};

const darkMenuProps = {
  PaperProps: { sx: darkMenuPaperSx },
};

const darkFieldSx = {
  '& .MuiOutlinedInput-root': {
    color: 'var(--admin-text)',
    backgroundColor: 'var(--admin-input-bg)',
    '& fieldset': { borderColor: 'var(--admin-border)' },
    '&:hover fieldset': { borderColor: 'var(--admin-border-strong)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--admin-accent)' },
  },
  '& .MuiInputLabel-root': { color: 'var(--admin-text-muted)' },
  '& .MuiInputLabel-root.Mui-focused': { color: 'var(--admin-accent)' },
  '& .MuiSvgIcon-root': { color: 'var(--admin-text-muted)' },
  '& textarea': { color: 'var(--admin-text)', fontFamily: 'Consolas, monospace' },
};

const darkAutocompleteSlotProps = {
  paper: { sx: darkMenuPaperSx },
  popper: { sx: { zIndex: 1500 } },
  listbox: {
    sx: {
      py: 0.75,
      maxHeight: 360,
      '& .MuiAutocomplete-option': {
        minHeight: 52,
        alignItems: 'flex-start',
        borderRadius: 1.5,
        mx: 0.75,
        my: 0.25,
        color: 'var(--admin-text)',
        '&[aria-selected="true"]': { bgcolor: 'var(--admin-accent-soft)' },
        '&.Mui-focused': { bgcolor: 'var(--admin-card-hover)' },
      },
    },
  },
};

function detectDownloadExtension(format) {
  if (format === 'ass') return 'ass';
  if (format === 'vtt') return 'vtt';
  if (format === 'plain') return 'txt';
  return 'srt';
}

function subtitleResultId(result) {
  return `${result.provider}:${result.file_id || result.download_url || result.release_name}`;
}

function safeFileName(value, fallback = 'subtitle') {
  return String(value || fallback)
    .replace(/\.(srt|vtt|ass|txt)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .slice(0, 80) || fallback;
}

function shortPreview(content) {
  return String(content || '').split('\n').slice(0, 80).join('\n');
}

function getMovieOptionLabel(movie) {
  if (!movie) return '';
  return movie.original_title && movie.original_title !== movie.title
    ? `${movie.title} · ${movie.original_title}`
    : movie.title || '';
}

function getEpisodeOptionLabel(episode) {
  if (!episode) return '';
  return `Tập ${episode.episode_number}${episode.title ? ` · ${episode.title}` : ''}`;
}

export default function SubtitleTranslator() {
  const user = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const authHeaders = useMemo(() => (user.id ? { 'x-user-id': user.id } : {}), [user.id]);
  const [tab, setTab] = useState(0);

  const [content, setContent] = useState('');
  const [translatedContent, setTranslatedContent] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('vi');
  const [format, setFormat] = useState('auto');
  const [bilingual, setBilingual] = useState(false);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);

  const [movies, setMovies] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [movieId, setMovieId] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  const [providers, setProviders] = useState([]);
  const [onlineLanguage, setOnlineLanguage] = useState('vi');
  const [onlineResults, setOnlineResults] = useState([]);
  const [onlineErrors, setOnlineErrors] = useState([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineMessage, setOnlineMessage] = useState('');
  const [onlineError, setOnlineError] = useState('');
  const [storedSubtitles, setStoredSubtitles] = useState([]);
  const [storedLoading, setStoredLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoadingId, setPreviewLoadingId] = useState('');
  const [importingId, setImportingId] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  const canTranslate = content.trim().length > 0 && !loading;
  const selectedMovie = movies.find((movie) => String(movie.id) === String(movieId));
  const selectedEpisode = episodes.find((episode) => String(episode.id) === String(episodeId));
  const configuredProviders = providers.filter((provider) => provider.configured && provider.enabled);

  const loadProviders = useCallback(async () => {
    const response = await axios.get(`${API}/api/admin/subtitle-providers`, { headers: authHeaders });
    setProviders(response.data.providers || []);
    setOnlineError('');
  }, [authHeaders]);

  const loadMovies = useCallback(async () => {
    const response = await axios.get(`${API}/api/movies?include_hidden=true`, { headers: authHeaders });
    setMovies(response.data || []);
  }, [authHeaders]);

  const loadStoredSubtitles = useCallback(async (nextEpisodeId) => {
    if (!nextEpisodeId) {
      setStoredSubtitles([]);
      return;
    }

    setStoredLoading(true);
    try {
      const response = await axios.get(`${API}/api/subtitles/episodes/${nextEpisodeId}/manage`, { headers: authHeaders });
      setStoredSubtitles(response.data.subtitles || []);
    } catch {
      setStoredSubtitles([]);
    } finally {
      setStoredLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadProviders().catch(() => setOnlineError('Không thể tải danh sách provider phụ đề.'));
    loadMovies().catch(() => setOnlineError('Không thể tải danh sách phim.'));
  }, [loadMovies, loadProviders]);

  useEffect(() => {
    if (!movieId && movies.length) setMovieId(String(movies[0].id));
  }, [movieId, movies]);

  useEffect(() => {
    if (!movieId) {
      setEpisodes([]);
      setEpisodeId('');
      return;
    }

    let alive = true;
    axios.get(`${API}/api/movies/${movieId}/episodes`, { headers: authHeaders })
      .then((response) => {
        if (!alive) return;
        const nextEpisodes = response.data || [];
        setEpisodes(nextEpisodes);
        setEpisodeId(nextEpisodes[0]?.id ? String(nextEpisodes[0].id) : '');
      })
      .catch(() => {
        if (!alive) return;
        setEpisodes([]);
        setEpisodeId('');
        setOnlineError('Không thể tải danh sách tập phim.');
      });

    return () => {
      alive = false;
    };
  }, [authHeaders, movieId]);

  useEffect(() => {
    loadStoredSubtitles(episodeId);
  }, [episodeId, loadStoredSubtitles]);

  const handleRefresh = async () => {
    setOnlineError('');
    setOnlineMessage('');
    try {
      await Promise.all([loadProviders(), loadMovies()]);
      if (episodeId) await loadStoredSubtitles(episodeId);
    } catch {
      setOnlineError('Không thể làm mới dữ liệu phụ đề.');
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setTranslatedContent('');
    setFileName(file.name);
    setError('');
    setMessage('');

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['srt', 'vtt', 'ass'].includes(ext)) setFormat(ext);
    else setFormat('plain');
  };

  const handleTranslate = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    setMeta(null);

    try {
      const response = await axios.post(
        `${API}/api/ai/subtitles/translate`,
        {
          content,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          format: format === 'auto' ? undefined : format,
          bilingual,
        },
        { headers: authHeaders }
      );

      setTranslatedContent(response.data.translated_content || '');
      setMessage(response.data.message || 'Đã xử lý phụ đề.');
      setMeta(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể dịch phụ đề lúc này.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!translatedContent) return;
    await navigator.clipboard.writeText(translatedContent);
    setMessage('Đã sao chép phụ đề.');
  };

  const handleDownload = () => {
    if (!translatedContent) return;
    const extension = detectDownloadExtension(meta?.format || format);
    const baseName = safeFileName(fileName || 'subtitle');
    const blob = new Blob([translatedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}.${targetLanguage}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onlinePayload = (result, extra = {}) => ({
    movie_id: Number(movieId),
    episode_id: Number(episodeId),
    provider: result.provider,
    language: result.language || onlineLanguage,
    file_id: result.file_id,
    download_url: result.download_url,
    release_name: result.release_name,
    format: result.format,
    ...extra,
  });

  const handleSearchOnline = async () => {
    if (!movieId || !episodeId) {
      setOnlineError('Bạn cần chọn phim và tập trước khi tìm phụ đề.');
      return;
    }

    setOnlineLoading(true);
    setOnlineError('');
    setOnlineMessage('');
    setOnlineResults([]);
    setOnlineErrors([]);

    try {
      const response = await axios.post(
        `${API}/api/admin/subtitles/search-online`,
        {
          movie_id: Number(movieId),
          episode_id: Number(episodeId),
          language: onlineLanguage,
          providers: configuredProviders.map((provider) => provider.id),
        },
        { headers: authHeaders }
      );
      setOnlineResults(response.data.results || []);
      setOnlineErrors(response.data.errors || []);
      if (!(response.data.results || []).length) {
        setOnlineMessage('Chưa có phụ đề phù hợp. Thử đổi ngôn ngữ hoặc kiểm tra tên phim/tập.');
      }
    } catch (err) {
      setOnlineError(err.response?.data?.message || 'Không thể tìm phụ đề online.');
    } finally {
      setOnlineLoading(false);
    }
  };

  const handleToggleProvider = async (provider) => {
    setOnlineError('');
    try {
      const response = await axios.put(
        `${API}/api/admin/subtitle-providers/${provider.id}`,
        { enabled: !provider.enabled, priority: provider.priority },
        { headers: authHeaders }
      );
      setProviders((current) => current.map((item) => (item.id === provider.id ? response.data.provider : item)));
    } catch (err) {
      setOnlineError(err.response?.data?.message || 'Không thể cập nhật provider.');
    }
  };

  const handlePreviewOnline = async (result) => {
    const id = subtitleResultId(result);
    setPreviewLoadingId(id);
    setOnlineError('');
    try {
      const response = await axios.post(
        `${API}/api/admin/subtitles/import-online`,
        onlinePayload(result, { preview_only: true }),
        { headers: authHeaders }
      );
      setPreview({
        title: result.release_name,
        result,
        content: response.data.content || response.data.vtt_content || '',
      });
    } catch (err) {
      setOnlineError(err.response?.data?.message || 'Không thể preview phụ đề này.');
    } finally {
      setPreviewLoadingId('');
    }
  };

  const handleImportOnline = async (result) => {
    const id = subtitleResultId(result);
    setImportingId(id);
    setOnlineError('');
    setOnlineMessage('');
    try {
      await axios.post(
        `${API}/api/admin/subtitles/import-online`,
        onlinePayload(result, { is_default: true }),
        { headers: authHeaders }
      );
      setOnlineMessage('Đã import phụ đề vào tập phim.');
      await loadStoredSubtitles(episodeId);
    } catch (err) {
      setOnlineError(err.response?.data?.message || 'Không thể import phụ đề này.');
    } finally {
      setImportingId('');
    }
  };

  const handleDownloadOnline = async (result) => {
    const id = subtitleResultId(result);
    setDownloadingId(id);
    setOnlineError('');
    try {
      const response = await axios.post(
        `${API}/api/admin/subtitles/import-online`,
        onlinePayload(result, { preview_only: true }),
        { headers: authHeaders }
      );
      const contentToDownload = response.data.content || response.data.vtt_content || '';
      const extension = detectDownloadExtension(result.format);
      const blob = new Blob([contentToDownload], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeFileName(result.release_name, 'online-subtitle')}.${result.language || onlineLanguage}.${extension}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setOnlineError(err.response?.data?.message || 'Không thể tải phụ đề này.');
    } finally {
      setDownloadingId('');
    }
  };

  const handleDeleteStored = async (subtitleId) => {
    setOnlineError('');
    setOnlineMessage('');
    try {
      await axios.delete(`${API}/api/subtitles/${subtitleId}`, { headers: authHeaders });
      setOnlineMessage('Đã xóa phụ đề khỏi tập phim.');
      await loadStoredSubtitles(episodeId);
    } catch (err) {
      setOnlineError(err.response?.data?.message || 'Không thể xóa phụ đề.');
    }
  };

  return (
    <Box sx={{ color: 'var(--admin-text)', mt: 4, maxWidth: 1440, mx: 'auto', px: { xs: 1, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'var(--admin-text-strong)', display: 'flex', alignItems: 'center', gap: 1 }}>
            <SubtitlesIcon sx={{ color: 'var(--admin-accent)', fontSize: 32 }} /> Phụ đề theo tập
          </Typography>
          <Typography sx={{ color: 'var(--admin-text-muted)', mt: 1 }}>
            Upload, dịch hoặc tìm phụ đề online rồi lưu trực tiếp vào từng tập phim.
          </Typography>
        </Box>
        <Button variant="outlined" color="inherit" startIcon={<RefreshIcon />} onClick={handleRefresh}>
          Làm mới
        </Button>
      </Box>

      <Box className="admin-panel" sx={{ bgcolor: 'var(--admin-surface)', borderRadius: 3, border: '1px solid var(--admin-border)', p: 0, m: 0, overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          textColor="inherit"
          TabIndicatorProps={{ sx: { bgcolor: 'var(--admin-accent)', height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 } }}
          sx={{ 
            px: 2, 
            borderBottom: '1px solid var(--admin-border)',
            '& .MuiTab-root': { fontWeight: 700, opacity: 0.6 },
            '& .Mui-selected': { opacity: 1, color: 'var(--admin-accent) !important' }
          }}
        >
          <Tab label="Dịch / xử lý file" />
          <Tab label="Tìm online" />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {message && <Alert severity={meta?.fallback ? 'warning' : 'success'} sx={{ mb: 2 }}>{message}</Alert>}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
              <Box sx={{ bgcolor: 'var(--admin-card)', borderRadius: 3, p: 3, border: '1px solid var(--admin-border)' }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                  <Button variant="contained" component="label">
                    Tải file phụ đề
                    <input hidden type="file" accept=".srt,.vtt,.ass,.txt,text/plain,text/srt,text/vtt,text/x-ass" onChange={handleFile} />
                  </Button>
                  <Button variant="outlined" color="inherit" onClick={() => { setContent(SAMPLE_SRT); setTranslatedContent(''); setFormat('srt'); setFileName('sample.srt'); }}>
                    Dùng mẫu thử
                  </Button>
                  <FormControl size="small" sx={{ minWidth: 150, ...darkFieldSx }}>
                    <InputLabel>Định dạng</InputLabel>
                    <Select value={format} label="Định dạng" onChange={(event) => setFormat(event.target.value)} MenuProps={darkMenuProps}>
                      <MenuItem value="auto">Tự nhận diện</MenuItem>
                      <MenuItem value="srt">SRT</MenuItem>
                      <MenuItem value="vtt">VTT</MenuItem>
                      <MenuItem value="ass">ASS</MenuItem>
                      <MenuItem value="plain">Text</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 150, ...darkFieldSx }}>
                    <InputLabel>Nguồn</InputLabel>
                    <Select value={sourceLanguage} label="Nguồn" onChange={(event) => setSourceLanguage(event.target.value)} MenuProps={darkMenuProps}>
                      {SOURCE_LANGUAGES.map((language) => (
                        <MenuItem key={language.value} value={language.value}>{language.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 150, ...darkFieldSx }}>
                    <InputLabel>Dịch sang</InputLabel>
                    <Select value={targetLanguage} label="Dịch sang" onChange={(event) => setTargetLanguage(event.target.value)} MenuProps={darkMenuProps}>
                      {LANGUAGES.map((language) => (
                        <MenuItem key={language.value} value={language.value}>{language.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControlLabel
                    control={<Switch checked={bilingual} onChange={(event) => setBilingual(event.target.checked)} />}
                    label="Song ngữ"
                    sx={{ color: 'var(--admin-text)', ml: { xs: 0, md: 1 } }}
                  />
                </Box>

                <TextField
                  label="Phụ đề gốc"
                  multiline
                  minRows={20}
                  fullWidth
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Dán nội dung .srt, .vtt hoặc .ass vào đây"
                  sx={darkFieldSx}
                />

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ color: 'var(--admin-text-muted)' }}>
                    {content.length.toLocaleString('vi-VN')} ký tự {fileName ? `• ${fileName}` : ''}
                  </Typography>
                  <Button variant="contained" onClick={handleTranslate} disabled={!canTranslate}>
                    {loading ? 'Đang dịch...' : 'Dịch phụ đề'}
                  </Button>
                </Box>
              </Box>

              <Box sx={{ bgcolor: 'var(--admin-card)', borderRadius: 3, p: 3, border: '1px solid var(--admin-border)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {meta?.format && <Chip label={meta.format.toUpperCase()} size="small" />}
                    {meta?.segment_count >= 0 && <Chip label={`${meta.segment_count} cue`} size="small" />}
                    {meta?.bilingual && <Chip label="Song ngữ" size="small" color="info" />}
                    {meta?.provider && <Chip label={meta.provider === 'gemini' ? 'Gemini' : 'Chưa dịch'} size="small" color={meta.fallback ? 'warning' : 'success'} />}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopy} disabled={!translatedContent}>
                      Copy
                    </Button>
                    <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownload} disabled={!translatedContent}>
                      Tải xuống
                    </Button>
                  </Box>
                </Box>

                <TextField
                  label="Phụ đề đã xử lý"
                  multiline
                  minRows={20}
                  fullWidth
                  value={translatedContent}
                  onChange={(event) => setTranslatedContent(event.target.value)}
                  placeholder="Kết quả dịch sẽ hiển thị ở đây"
                  sx={darkFieldSx}
                />
              </Box>
            </Box>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            {onlineError && <Alert severity="error" sx={{ mb: 2 }}>{onlineError}</Alert>}
            {onlineMessage && <Alert severity={onlineResults.length ? 'success' : 'info'} sx={{ mb: 2 }}>{onlineMessage}</Alert>}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.2fr 0.8fr' }, gap: 3 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ bgcolor: 'var(--admin-card)', borderRadius: 3, p: 3, border: '1px solid var(--admin-border)' }}>
                  <Typography className="admin-panel-title" sx={{ mb: 2 }}><SearchIcon sx={{ color: 'var(--admin-accent)' }} /> Nguồn tìm phụ đề</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(auto-fit, minmax(260px, 1fr))' }, gap: 2 }}>
                    {providers.map((provider) => (
                      <Box
                        key={provider.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 2,
                          border: provider.enabled ? '1px solid var(--admin-accent)' : '1px solid var(--admin-border)',
                          borderRadius: 3,
                          px: 2.5,
                          py: 2,
                          bgcolor: provider.enabled ? 'var(--admin-accent-soft)' : 'var(--admin-surface)',
                          transition: 'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
                          boxShadow: provider.enabled ? 'var(--admin-shadow-soft)' : 'none'
                        }}
                      >
                        <Box>
                          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--admin-text-strong)' }}>{provider.name}</Typography>
                          <Typography variant="caption" sx={{ color: provider.configured ? 'var(--admin-success)' : 'var(--admin-warning)', fontWeight: 600 }}>
                            {provider.configured ? 'Đã cấu hình API key' : `Thiếu ${provider.env_key}`}
                          </Typography>
                        </Box>
                        <Switch
                          checked={Boolean(provider.enabled)}
                          onChange={() => handleToggleProvider(provider)}
                          disabled={!provider.configured}
                          color="secondary"
                        />
                      </Box>
                    ))}
                  </Box>
                </Box>

                <Box className="admin-panel" sx={{ bgcolor: 'var(--admin-surface)', borderRadius: 3, border: '1px solid var(--admin-border)', p: 3 }}>
                  <Typography className="admin-panel-title" sx={{ mb: 3 }}><CloudDownloadIcon sx={{ color: 'var(--admin-accent)' }} /> Tìm online</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, gap: 2, alignItems: 'center', mb: 2 }}>
                    <Autocomplete
                      size="small"
                      options={movies}
                      value={selectedMovie || null}
                      onChange={(_, value) => setMovieId(value ? String(value.id) : '')}
                      getOptionLabel={getMovieOptionLabel}
                      isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
                      noOptionsText="Không có phim phù hợp"
                      clearText="Xóa"
                      openText="Mở danh sách"
                      closeText="Đóng danh sách"
                      slotProps={darkAutocompleteSlotProps}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Phim"
                          placeholder="Gõ tên phim..."
                          sx={darkFieldSx}
                        />
                      )}
                      renderOption={(props, movie) => {
                        const { key, ...optionProps } = props;
                        return (
                          <Box component="li" key={key} {...optionProps}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>
                                {movie.title}
                              </Typography>
                              <Typography sx={{ color: 'var(--admin-text-muted)', fontSize: 12, mt: 0.25 }}>
                                {movie.original_title || 'Không có tên gốc'} · {movie.release_year || 'N/A'}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      }}
                    />
                    <Autocomplete
                      size="small"
                      options={episodes}
                      value={selectedEpisode || null}
                      onChange={(_, value) => setEpisodeId(value ? String(value.id) : '')}
                      getOptionLabel={getEpisodeOptionLabel}
                      isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
                      noOptionsText="Phim này chưa có tập"
                      disabled={!episodes.length}
                      clearText="Xóa"
                      openText="Mở danh sách"
                      closeText="Đóng danh sách"
                      slotProps={darkAutocompleteSlotProps}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Tập"
                          placeholder="Chọn tập..."
                          sx={darkFieldSx}
                        />
                      )}
                      renderOption={(props, episode) => {
                        const { key, ...optionProps } = props;
                        return (
                          <Box component="li" key={key} {...optionProps}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 900, fontSize: 14 }}>
                                Tập {episode.episode_number}
                              </Typography>
                              <Typography sx={{ color: 'var(--admin-text-muted)', fontSize: 12, mt: 0.25 }}>
                                {episode.title || 'Không có tiêu đề'}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      }}
                    />
                    <FormControl size="small" sx={darkFieldSx}>
                      <InputLabel>Ngôn ngữ</InputLabel>
                      <Select value={onlineLanguage} label="Ngôn ngữ" onChange={(event) => setOnlineLanguage(event.target.value)} MenuProps={darkMenuProps}>
                        {LANGUAGES.map((language) => (
                          <MenuItem key={language.value} value={language.value}>{language.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                      <Button
                        variant="contained"
                        startIcon={onlineLoading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
                        onClick={handleSearchOnline}
                        disabled={onlineLoading || !movieId || !episodeId || !configuredProviders.length}
                        sx={{ 
                          height: 40,
                          bgcolor: 'var(--admin-accent)',
                          '&:hover': { bgcolor: 'var(--admin-accent-hover)' },
                          boxShadow: 'none',
                          fontWeight: 'bold',
                          width: { xs: '100%', md: 'auto' },
                          gridColumn: { xs: '1 / -1', md: 'auto' }
                        }}
                      >
                        Tìm phụ đề
                      </Button>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', color: 'var(--admin-text-muted)', borderTop: '1px solid var(--admin-border)', pt: 2 }}>
                    {selectedMovie && <Chip size="small" label={selectedMovie.title} />}
                    {selectedEpisode && <Chip size="small" label={`Tập ${selectedEpisode.episode_number}`} />}
                    {!configuredProviders.length && <Chip size="small" color="warning" label="Chưa có provider khả dụng" />}
                  </Box>
                </Box>

                <Box sx={{ bgcolor: 'var(--admin-card)', borderRadius: 3, p: 3, border: '1px solid var(--admin-border)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
                    <Typography sx={{ fontWeight: 700 }}>Kết quả online</Typography>
                    <Chip size="small" label={`${onlineResults.length} kết quả`} />
                  </Box>

                  {onlineLoading && (
                    <Box sx={{ py: 5, textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                      <CircularProgress size={28} />
                      <Typography sx={{ mt: 1 }}>Đang tìm phụ đề...</Typography>
                    </Box>
                  )}

                  {!onlineLoading && !onlineResults.length && (
                    <Box sx={{ py: 5, textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                      <CloudDownloadIcon sx={{ fontSize: 42, opacity: 0.65 }} />
                      <Typography sx={{ mt: 1, fontWeight: 700 }}>Chưa có kết quả để hiển thị</Typography>
                      <Typography variant="body2">Chọn phim, tập, ngôn ngữ rồi bấm “Tìm phụ đề”.</Typography>
                    </Box>
                  )}

                  {!onlineLoading && onlineResults.map((result) => {
                    const id = subtitleResultId(result);
                    return (
                      <Box
                        key={id}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', md: '1fr auto' },
                          gap: 2,
                          alignItems: 'center',
                          borderTop: '1px solid var(--admin-border)',
                          py: 2,
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
                            <Chip size="small" label={result.provider_name || result.provider} color="info" />
                            <Chip size="small" label={(result.language || onlineLanguage).toUpperCase()} />
                            <Chip size="small" label={`${result.score || 0}% match`} color={(result.score || 0) >= 70 ? 'success' : 'default'} />
                            {result.format && <Chip size="small" label={result.format.toUpperCase()} />}
                          </Box>
                          <Typography sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {result.release_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)' }}>
                            {result.download_url ? 'Có link tải trực tiếp' : 'Tải qua provider API'}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' }, flexWrap: 'wrap' }}>
                          <Button
                            variant="outlined"
                            startIcon={previewLoadingId === id ? <CircularProgress size={16} color="inherit" /> : <VisibilityIcon />}
                            onClick={() => handlePreviewOnline(result)}
                            disabled={previewLoadingId === id || importingId === id}
                          >
                            Preview
                          </Button>
                          <Button
                            variant="outlined"
                            startIcon={downloadingId === id ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
                            onClick={() => handleDownloadOnline(result)}
                            disabled={downloadingId === id}
                          >
                            Download
                          </Button>
                          <Button
                            variant="contained"
                            startIcon={importingId === id ? <CircularProgress size={16} color="inherit" /> : <CloudDownloadIcon />}
                            onClick={() => handleImportOnline(result)}
                            disabled={importingId === id}
                          >
                            Import
                          </Button>
                        </Box>
                      </Box>
                    );
                  })}

                  {!!onlineErrors.length && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      {onlineErrors.map((item) => `${item.provider}: ${item.message}`).join(' · ')}
                    </Alert>
                  )}
                </Box>
              </Box>

              <Box className="admin-panel" sx={{ bgcolor: 'var(--admin-surface)', borderRadius: 3, border: '1px solid var(--admin-border)', p: 3, alignSelf: 'start' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography className="admin-panel-title" sx={{ mb: 0.5 }}><SubtitlesIcon sx={{ color: 'var(--admin-accent)', fontSize: 20 }} /> Phụ đề đã lưu</Typography>
                    <Typography variant="body2" sx={{ color: 'var(--admin-text-muted)' }}>
                      {selectedEpisode ? `Đang quản lý Tập ${selectedEpisode.episode_number}` : 'Chưa chọn tập'}
                    </Typography>
                  </Box>
                  {storedLoading && <CircularProgress size={22} color="secondary" />}
                </Box>
                <Divider sx={{ borderColor: 'var(--admin-border)', mb: 2 }} />

                {!storedLoading && !storedSubtitles.length && (
                  <Alert severity="info" sx={{ bgcolor: 'rgba(56, 189, 248, 0.1)', color: '#bae6fd', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                    Tập này chưa có phụ đề rời được lưu.
                  </Alert>
                )}

                {storedSubtitles.map((subtitle) => (
                  <Box
                    key={subtitle.id}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 1.5,
                      alignItems: 'center',
                      border: '1px solid var(--admin-border)',
                      borderRadius: 2,
                      p: 1.5,
                      mb: 1.25,
                      bgcolor: subtitle.is_default ? 'var(--admin-success-soft)' : 'var(--admin-surface)',
                      transition: 'background-color 160ms ease, border-color 160ms ease',
                      '&:hover': { bgcolor: 'var(--admin-card-hover)' }
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {subtitle.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)' }}>
                        {subtitle.srclang?.toUpperCase()} · {subtitle.format?.toUpperCase()} · {(subtitle.content_length || 0).toLocaleString('vi-VN')} ký tự
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        color="info"
                        component="a"
                        href={`${API}${subtitle.preview_url}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeleteStored(subtitle.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'var(--admin-surface)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>Preview phụ đề</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'var(--admin-text-muted)', mb: 2 }}>{preview?.title}</Typography>
          <Box
            component="pre"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 480,
              overflow: 'auto',
              bgcolor: 'var(--admin-bg-soft)',
              border: '1px solid var(--admin-border)',
              borderRadius: 2,
              p: 2,
              fontSize: 13,
              fontFamily: 'Consolas, monospace',
            }}
          >
            {shortPreview(preview?.content)}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setPreview(null)}>Đóng</Button>
          {preview?.result && (
            <Button variant="contained" onClick={() => handleImportOnline(preview.result)}>
              Import phụ đề này
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
