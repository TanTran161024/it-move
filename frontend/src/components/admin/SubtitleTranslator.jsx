import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import axios from 'axios';
import { API_BASE_URL as API } from '../../config/api';

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

function detectDownloadExtension(format) {
  if (format === 'ass') return 'ass';
  if (format === 'vtt') return 'vtt';
  if (format === 'plain') return 'txt';
  return 'srt';
}

export default function SubtitleTranslator() {
  const user = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
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

  const canTranslate = content.trim().length > 0 && !loading;

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
        {
          headers: user.id ? { 'x-user-id': user.id } : {},
        }
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
    const baseName = (fileName || 'subtitle').replace(/\.(srt|vtt|ass|txt)$/i, '');
    const blob = new Blob([translatedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}.${targetLanguage}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ color: '#fff', mt: 4, maxWidth: 1400, mx: 'auto', px: { xs: 1, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SubtitlesIcon /> Dịch phụ đề
          </Typography>
          <Typography sx={{ color: '#aeb6c7', mt: 1 }}>
            Dán hoặc tải file SRT/VTT/ASS, hệ thống giữ nguyên timeline và dịch phần thoại.
          </Typography>
        </Box>
        <Button variant="outlined" color="inherit" onClick={() => { setContent(SAMPLE_SRT); setTranslatedContent(''); setFormat('srt'); setFileName('sample.srt'); }}>
          Dùng mẫu thử
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity={meta?.fallback ? 'warning' : 'success'} sx={{ mb: 2 }}>{message}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <Box sx={{ bgcolor: '#23242a', borderRadius: 2, p: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Button variant="contained" component="label">
              Tải file phụ đề
              <input hidden type="file" accept=".srt,.vtt,.ass,.txt,text/plain,text/srt,text/vtt,text/x-ass" onChange={handleFile} />
            </Button>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Định dạng</InputLabel>
              <Select value={format} label="Định dạng" onChange={(event) => setFormat(event.target.value)}>
                <MenuItem value="auto">Tự nhận diện</MenuItem>
                <MenuItem value="srt">SRT</MenuItem>
                <MenuItem value="vtt">VTT</MenuItem>
                <MenuItem value="ass">ASS</MenuItem>
                <MenuItem value="plain">Text</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Nguồn</InputLabel>
              <Select value={sourceLanguage} label="Nguồn" onChange={(event) => setSourceLanguage(event.target.value)}>
                {SOURCE_LANGUAGES.map((language) => (
                  <MenuItem key={language.value} value={language.value}>{language.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Dịch sang</InputLabel>
              <Select value={targetLanguage} label="Dịch sang" onChange={(event) => setTargetLanguage(event.target.value)}>
                {LANGUAGES.map((language) => (
                  <MenuItem key={language.value} value={language.value}>{language.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Switch checked={bilingual} onChange={(event) => setBilingual(event.target.checked)} />}
              label="Song ngữ"
              sx={{ color: '#fff', ml: { xs: 0, md: 1 } }}
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
            sx={{
              '& textarea': { color: '#fff', fontFamily: 'Consolas, monospace' },
              '& .MuiInputLabel-root': { color: '#c6cad5' },
            }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mt: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ color: '#aeb6c7' }}>
              {content.length.toLocaleString('vi-VN')} ký tự {fileName ? `• ${fileName}` : ''}
            </Typography>
            <Button variant="contained" onClick={handleTranslate} disabled={!canTranslate}>
              {loading ? 'Đang dịch...' : 'Dịch phụ đề'}
            </Button>
          </Box>
        </Box>

        <Box sx={{ bgcolor: '#23242a', borderRadius: 2, p: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
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
            sx={{
              '& textarea': { color: '#fff', fontFamily: 'Consolas, monospace' },
              '& .MuiInputLabel-root': { color: '#c6cad5' },
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
