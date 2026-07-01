import { useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { API_URL } from '../../config/api';
import { getProfileHeaders } from '../../utils/profile';
import '../../pages/admin/AdminStyles.css';

const darkFieldSx = {
  '& .MuiInputBase-input': { color: '#fff' },
  '& .MuiInputLabel-root': { color: 'var(--admin-text-muted)' },
  '& .MuiOutlinedInput-root': {
    '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.25)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--admin-accent)' },
  },
};

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function listText(items, limit = 4) {
  return items.map((item) => cleanText(item?.name || item)).filter(Boolean).slice(0, limit).join(', ');
}

function buildLocalDescription(movie) {
  const title = cleanText(movie.title || movie.original_title);
  const originalTitle = cleanText(movie.original_title);
  const genres = listText(movie.genres);
  const countries = listText(movie.countries, 3);
  const actors = listText(movie.actors, 4);
  const directors = listText(movie.directors, 2);
  const releaseYear = cleanText(movie.release_year);
  const duration = cleanText(movie.duration);
  const quality = cleanText(movie.quality);
  const type = movie.is_series === true || movie.is_series === 1 || movie.is_series === '1' ? 'phim bộ' : 'phim';

  const intro = `${title}${originalTitle && originalTitle !== title ? ` (${originalTitle})` : ''} là ${type}${countries ? ` đến từ ${countries}` : ''}${releaseYear ? `, ra mắt năm ${releaseYear}` : ''}${genres ? `, thuộc thể loại ${genres}` : ''}.`;
  const people = [directors ? `đạo diễn ${directors}` : null, actors ? `dàn diễn viên gồm ${actors}` : null].filter(Boolean).join(' cùng ');
  const tech = [duration ? `thời lượng ${duration}` : null, quality ? `chất lượng ${quality}` : null].filter(Boolean).join(', ');

  return [
    intro,
    people ? `Tác phẩm có ${people}, phù hợp để giới thiệu tới người xem đang tìm một lựa chọn rõ gu và dễ theo dõi.` : 'Tác phẩm phù hợp để giới thiệu tới người xem đang tìm một lựa chọn rõ gu và dễ theo dõi.',
    tech ? `Bản phim hiện có ${tech}, thuận tiện để người xem bắt đầu thưởng thức ngay trên hệ thống.` : 'Phần mô tả được viết gọn để dùng trực tiếp trên trang chi tiết phim.',
  ].join(' ');
}

export default function MovieForm({
  open,
  form,
  editMovie,
  error,
  onChange,
  onClose,
  onSubmit,
  genres,
  countries,
  actors,
  directors,
  selectedGenres,
  selectedCountries,
  selectedActors,
  selectedDirectors,
  onSelectChange,
}) {
  const visible = form.is_visible !== 0 && form.is_visible !== false;
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiDescription, setAiDescription] = useState('');
  const [aiMeta, setAiMeta] = useState(null);
  const [copied, setCopied] = useState(false);

  const buildMoviePayload = () => ({
    title: form.title,
    original_title: form.original_title,
    release_year: form.release_year,
    duration: form.duration,
    quality: form.quality,
    age_limit: form.age_limit,
    imdb_rating: form.imdb_rating,
    is_series: form.is_series,
    existing_description: form.description,
    genres: selectedGenres.map((item) => item.name),
    countries: selectedCountries.map((item) => item.name),
    actors: selectedActors.map((item) => item.name),
    directors: selectedDirectors.map((item) => item.name),
  });

  const applyGeneratedDescription = (description, meta = {}) => {
    setAiDescription(description || '');
    setAiMeta({
      provider: meta.provider || 'template',
      fallback: meta.fallback !== false,
      note: meta.note || '',
    });
  };

  const handleGenerateDescription = async () => {
    if (!String(form.title || form.original_title || '').trim()) {
      setAiError('Nhập tên phim trước khi tạo mô tả.');
      return;
    }

    setAiLoading(true);
    setAiError('');
    setCopied(false);
    const moviePayload = buildMoviePayload();
    const localDescription = buildLocalDescription(moviePayload);
    try {
      const response = await fetch(`${API_URL}/admin/movies/description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getProfileHeaders(),
        },
        body: JSON.stringify({ movie: moviePayload }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 400 || response.status === 403) {
          throw new Error(body.message || (response.status === 403 ? 'Admin only' : 'Không thể tạo mô tả.'));
        }

        applyGeneratedDescription(localDescription, {
          provider: 'template',
          fallback: true,
          note: body.message || 'Backend chưa sẵn sàng, đã dùng bản dự phòng.',
        });
        return;
      }

      applyGeneratedDescription(body.description || localDescription, {
        provider: body.provider,
        fallback: Boolean(body.fallback),
        note: body.ai_error?.message || '',
      });
    } catch (err) {
      if (err.message === 'Admin only' || err.message.includes('Vui lòng')) {
        setAiError(err.message);
        return;
      }

      applyGeneratedDescription(localDescription, {
        provider: 'template',
        fallback: true,
        note: err.message || 'Không thể gọi backend, đã dùng bản dự phòng.',
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyDescription = () => {
    if (!aiDescription) return;
    onChange({ target: { name: 'description', value: aiDescription } });
  };

  const handleCopyDescription = async () => {
    if (!aiDescription) return;
    try {
      await navigator.clipboard.writeText(aiDescription);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setAiError('Không thể copy tự động. Bạn có thể chọn và copy mô tả thủ công.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth className="admin-dialog">
      <DialogTitle>{editMovie ? 'Sửa phim' : 'Thêm phim'}</DialogTitle>
      <DialogContent>
        {/* Hiển thị */}
        <div className="admin-form-section">Hiển thị</div>
        <FormControlLabel
          sx={{ mt: 1, mb: 1 }}
          control={
            <Switch
              checked={visible}
              onChange={(event) => onChange({ target: { name: 'is_visible', value: event.target.checked ? 1 : 0 } })}
              sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--admin-accent)' }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { backgroundColor: 'var(--admin-accent)' } }}
            />
          }
          label={
            <span style={{ color: visible ? '#4ade80' : '#f87171', fontWeight: 600, fontSize: '0.88rem' }}>
              {visible ? 'Đang hiển thị trên web' : 'Đang ẩn khỏi người dùng'}
            </span>
          }
        />

        {/* Thông tin cơ bản */}
        <div className="admin-form-section">Thông tin cơ bản</div>
        <TextField label="Tên phim" name="title" fullWidth margin="normal" value={form.title || ''} onChange={onChange} sx={darkFieldSx} />
        <TextField label="Tên tiếng Anh" name="original_title" fullWidth margin="normal" value={form.original_title || ''} onChange={onChange} sx={darkFieldSx} />
        <TextField label="Mô tả" name="description" fullWidth margin="normal" multiline rows={3} value={form.description || ''} onChange={onChange} sx={darkFieldSx} />
        <div className="admin-ai-description-box">
          <div className="admin-ai-description-head">
            <div>
              <strong>AI viết mô tả tiếng Việt</strong>
              <span>Dựa trên tên phim, thể loại, quốc gia, diễn viên và dữ liệu bạn đã nhập.</span>
            </div>
            <Button
              startIcon={<AutoAwesomeIcon />}
              onClick={handleGenerateDescription}
              disabled={aiLoading}
              variant="contained"
              sx={{ bgcolor: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent-hover)' }, flexShrink: 0 }}
            >
              {aiLoading ? 'Đang viết...' : 'AI viết mô tả'}
            </Button>
          </div>

          {aiError && <Alert severity="error" sx={{ mt: 2 }}>{aiError}</Alert>}

          {aiDescription && (
            <div className="admin-ai-description-result">
              <div className="admin-ai-description-meta">
                <span>{aiMeta?.fallback ? 'Bản gợi ý dự phòng' : 'Bản gợi ý AI'}</span>
                <span>{aiDescription.length}/1200</span>
              </div>
              {aiMeta?.note && <div className="admin-ai-description-note">{aiMeta.note}</div>}
              <p>{aiDescription}</p>
              <div className="admin-ai-description-actions">
                <Button
                  startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
                  onClick={handleCopyDescription}
                  variant="outlined"
                  size="small"
                  sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.18)' }}
                >
                  {copied ? 'Đã copy' : 'Copy'}
                </Button>
                <Button
                  startIcon={<CheckIcon />}
                  onClick={handleApplyDescription}
                  variant="contained"
                  size="small"
                  sx={{ bgcolor: 'var(--admin-success)', '&:hover': { bgcolor: '#16a34a' } }}
                >
                  Áp dụng vào mô tả
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Phân loại */}
        <div className="admin-form-section">Phân loại</div>
        <Autocomplete
          multiple
          options={genres}
          getOptionLabel={(option) => option.name}
          value={selectedGenres}
          onChange={(_, value) => onSelectChange('genres', value)}
          renderInput={(params) => <TextField {...params} label="Thể loại" margin="normal" fullWidth sx={darkFieldSx} />}
        />
        <Autocomplete
          multiple
          options={countries}
          getOptionLabel={(option) => option.name}
          value={selectedCountries}
          onChange={(_, value) => onSelectChange('countries', value)}
          renderInput={(params) => <TextField {...params} label="Quốc gia" margin="normal" fullWidth sx={darkFieldSx} />}
        />
        <Autocomplete
          multiple
          options={actors}
          getOptionLabel={(option) => option.name}
          value={selectedActors}
          onChange={(_, value) => onSelectChange('actors', value)}
          renderInput={(params) => <TextField {...params} label="Diễn viên" margin="normal" fullWidth sx={darkFieldSx} />}
        />
        <Autocomplete
          multiple
          options={directors}
          getOptionLabel={(option) => option.name}
          value={selectedDirectors}
          onChange={(_, value) => onSelectChange('directors', value)}
          renderInput={(params) => <TextField {...params} label="Đạo diễn" margin="normal" fullWidth sx={darkFieldSx} />}
        />

        {/* Chi tiết */}
        <div className="admin-form-section">Chi tiết</div>
        <TextField label="Năm phát hành" name="release_year" type="number" fullWidth margin="normal" value={form.release_year || ''} onChange={onChange} sx={darkFieldSx} />
        <TextField label="Chất lượng (VD: 4K, HD)" name="quality" fullWidth margin="normal" value={form.quality || ''} onChange={onChange} sx={darkFieldSx} />
        <TextField label="IMDb Rating" name="imdb_rating" type="number" fullWidth margin="normal" value={form.imdb_rating || ''} onChange={onChange} inputProps={{ step: 0.1, min: 0, max: 10 }} sx={darkFieldSx} />
        <TextField label="Phim bộ? (1 = Có, 0 = Không)" name="is_series" type="number" fullWidth margin="normal" value={form.is_series || 0} onChange={onChange} inputProps={{ min: 0, max: 1 }} sx={darkFieldSx} />
        <TextField label="Thời lượng (VD: 2h10m)" name="duration" fullWidth margin="normal" value={form.duration || ''} onChange={onChange} sx={darkFieldSx} />
        <TextField label="Giới hạn tuổi" name="age_limit" fullWidth margin="normal" value={form.age_limit || ''} onChange={onChange} sx={darkFieldSx} />
        <TextField label="Ngày chiếu" name="release_date" type="date" fullWidth margin="normal" value={form.release_date || ''} onChange={onChange} InputLabelProps={{ shrink: true }} sx={darkFieldSx} />

        {/* Media */}
        <div className="admin-form-section">Media</div>
        <TextField label="Poster URL" name="poster_url" fullWidth margin="normal" value={form.poster_url || ''} onChange={onChange} sx={darkFieldSx} />
        <TextField label="Trailer URL" name="trailer_url" fullWidth margin="normal" value={form.trailer_url || ''} onChange={onChange} sx={darkFieldSx} />

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: 'var(--admin-text-muted)' }}>Hủy</Button>
        <Button onClick={onSubmit} variant="contained" sx={{ bgcolor: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent-hover)' } }}>Lưu</Button>
      </DialogActions>
    </Dialog>
  );
}
