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
