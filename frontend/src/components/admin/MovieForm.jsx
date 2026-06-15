import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Alert, Box, Autocomplete } from '@mui/material';

export default function MovieForm({ open, form, editMovie, error, onChange, onClose, onSubmit, genres, countries, actors, directors, selectedGenres, selectedCountries, selectedActors, selectedDirectors, onSelectChange }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editMovie ? 'Sửa phim' : 'Thêm phim'}</DialogTitle>
      <DialogContent>
        <TextField label="Tên phim" name="title" fullWidth margin="normal" value={form.title} onChange={onChange} />
        <TextField label="Tên tiếng Anh" name="original_title" fullWidth margin="normal" value={form.original_title || ''} onChange={onChange} />
        <TextField label="Giới hạn tuổi" name="age_limit" fullWidth margin="normal" value={form.age_limit || ''} onChange={onChange} />
        <TextField label="Năm phát hành" name="release_year" type="number" fullWidth margin="normal" value={form.release_year || ''} onChange={onChange} />
        <TextField label="Chất lượng (VD: 4K, HD)" name="quality" fullWidth margin="normal" value={form.quality || ''} onChange={onChange} />
        <TextField label="IMDb Rating" name="imdb_rating" type="number" fullWidth margin="normal" value={form.imdb_rating || ''} onChange={onChange} inputProps={{ step: 0.1, min: 0, max: 10 }} />
        <TextField label="Phim bộ? (1 = Có, 0 = Không)" name="is_series" type="number" fullWidth margin="normal" value={form.is_series || 0} onChange={onChange} inputProps={{ min: 0, max: 1 }} />
        <TextField label="Thời lượng (VD: 2h10m)" name="duration" fullWidth margin="normal" value={form.duration || ''} onChange={onChange} />
        <Autocomplete
          multiple
          options={genres}
          getOptionLabel={option => option.name}
          value={selectedGenres}
          onChange={(_, value) => onSelectChange('genres', value)}
          renderInput={params => <TextField {...params} label="Thể loại" margin="normal" fullWidth />}
        />
        <Autocomplete
          multiple
          options={countries}
          getOptionLabel={option => option.name}
          value={selectedCountries}
          onChange={(_, value) => onSelectChange('countries', value)}
          renderInput={params => <TextField {...params} label="Quốc gia" margin="normal" fullWidth />}
        />
        <Autocomplete
          multiple
          options={actors}
          getOptionLabel={option => option.name}
          value={selectedActors}
          onChange={(_, value) => onSelectChange('actors', value)}
          renderInput={params => <TextField {...params} label="Diễn viên" margin="normal" fullWidth />}
        />
        <Autocomplete
          multiple
          options={directors}
          getOptionLabel={option => option.name}
          value={selectedDirectors}
          onChange={(_, value) => onSelectChange('directors', value)}
          renderInput={params => <TextField {...params} label="Đạo diễn" margin="normal" fullWidth />}
        />
        <TextField label="Ngày chiếu" name="release_date" type="date" fullWidth margin="normal" value={form.release_date} onChange={onChange} InputLabelProps={{ shrink: true }} />
        <TextField label="Poster URL" name="poster_url" fullWidth margin="normal" value={form.poster_url} onChange={onChange} />
        <TextField label="Mô tả" name="description" fullWidth margin="normal" multiline rows={3} value={form.description} onChange={onChange} />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button onClick={onSubmit} variant="contained">Lưu</Button>
      </DialogActions>
    </Dialog>
  );
} 