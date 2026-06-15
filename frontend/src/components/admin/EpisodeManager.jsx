import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Typography, IconButton } from '@mui/material';
import { useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

export default function EpisodeManager({ open, onClose, movie, episodes, onAdd, onEdit, onDelete }) {
  const [form, setForm] = useState({ episode_number: '', title: '', video_url: '', subtitle_url: '' });
  const [editId, setEditId] = useState(null);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });
  const handleEdit = ep => {
    setEditId(ep.id);
    setForm({
      episode_number: ep.episode_number,
      title: ep.title,
      video_url: ep.video_url,
      subtitle_url: ep.subtitle_url || ''
    });
  };
  const handleCancelEdit = () => {
    setEditId(null);
    setForm({ episode_number: '', title: '', video_url: '', subtitle_url: '' });
  };
  const handleSubmit = () => {
    if (editId) {
      onEdit(editId, form);
    } else {
      onAdd(form);
    }
    handleCancelEdit();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Quản lý tập phim: {movie?.title}</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1976d2', mb: 1 }}>Danh sách tập phim</Typography>
          {episodes.length === 0 && (
            <Typography sx={{ color: '#aaa', fontStyle: 'italic', mb: 1 }}>Chưa có tập phim nào.</Typography>
          )}
          {episodes.map(ep => (
            <Box
              key={ep.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                mb: 1.5,
                bgcolor: '#23242a',
                borderRadius: 2,
                p: 1.5,
                boxShadow: 2,
                transition: 'transform 0.15s, box-shadow 0.15s',
                '&:hover': {
                  transform: 'translateY(-2px) scale(1.01)',
                  boxShadow: 6,
                  background: '#23243a',
                },
                gap: 2,
                flexWrap: { xs: 'wrap', sm: 'nowrap' },
              }}
            >
              {editId === ep.id ? (
                <>
                  <TextField label="Số tập" name="episode_number" type="number" value={form.episode_number} onChange={handleChange} sx={{ width: 100, input: { color: '#fff' }, label: { color: '#bbb' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' }, '&:hover fieldset': { borderColor: '#2196f3' }, '&.Mui-focused fieldset': { borderColor: '#2196f3' } }, '& .MuiInputBase-input::placeholder': { color: '#fff', opacity: 1 } }} size="small" />
                  <TextField label="Tiêu đề" name="title" value={form.title} onChange={handleChange} sx={{ flex: 1, minWidth: 120, input: { color: '#fff' }, label: { color: '#bbb' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' }, '&:hover fieldset': { borderColor: '#2196f3' }, '&.Mui-focused fieldset': { borderColor: '#2196f3' } }, '& .MuiInputBase-input::placeholder': { color: '#fff', opacity: 1 } }} size="small" />
                  <TextField label="Video URL" name="video_url" value={form.video_url} onChange={handleChange} sx={{ flex: 1, minWidth: 120, input: { color: '#fff' }, label: { color: '#bbb' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' }, '&:hover fieldset': { borderColor: '#2196f3' }, '&.Mui-focused fieldset': { borderColor: '#2196f3' } }, '& .MuiInputBase-input::placeholder': { color: '#fff', opacity: 1 } }} size="small" />
                  <TextField label="Subtitle URL" name="subtitle_url" value={form.subtitle_url} onChange={handleChange} sx={{ flex: 1, minWidth: 120, input: { color: '#fff' }, label: { color: '#bbb' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' }, '&:hover fieldset': { borderColor: '#2196f3' }, '&.Mui-focused fieldset': { borderColor: '#2196f3' } }, '& .MuiInputBase-input::placeholder': { color: '#fff', opacity: 1 } }} size="small" />
                  <Button variant="contained" color="primary" onClick={handleSubmit} sx={{ ml: 1, minWidth: 80 }}>Lưu</Button>
                  <Button onClick={handleCancelEdit} sx={{ ml: 1, minWidth: 60 }}>Hủy</Button>
                </>
              ) : (
                <>
                  <Typography sx={{ width: 60, fontWeight: 700, color: '#FFD600', fontSize: 18, textAlign: 'center' }}>Tập {ep.episode_number}</Typography>
                  <Typography sx={{ flex: 2, fontWeight: 600, color: '#fff', fontSize: 16, ml: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{ep.title}</Typography>
                  <Box sx={{ flex: 3, display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
                    <a href={ep.video_url} target="_blank" rel="noopener noreferrer" style={{ color: '#90caf9', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center' }}>
                      <svg style={{ marginRight: 4 }} width="18" height="18" fill="#90caf9" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.video_url}</span>
                    </a>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
                    <IconButton color="primary" onClick={() => handleEdit(ep)} sx={{ bgcolor: '#222', borderRadius: 2, '&:hover': { bgcolor: '#1976d2', color: '#fff' } }}><EditIcon /></IconButton>
                    <IconButton color="error" onClick={() => onDelete(ep.id)} sx={{ bgcolor: '#222', borderRadius: 2, '&:hover': { bgcolor: '#d32f2f', color: '#fff' } }}><DeleteIcon /></IconButton>
                  </Box>
                </>
              )}
            </Box>
          ))}
        </Box>
        <Box component="form" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField label="Số tập" name="episode_number" type="number" value={form.episode_number} onChange={handleChange} sx={{ width: 100 }} disabled={!!editId} />
          <TextField label="Tiêu đề" name="title" value={form.title} onChange={handleChange} sx={{ flex: 1, minWidth: 200 }} disabled={!!editId} />
          <TextField label="Video URL" name="video_url" value={form.video_url} onChange={handleChange} sx={{ flex: 1, minWidth: 200 }} disabled={!!editId} />
          <TextField label="Subtitle URL" name="subtitle_url" value={form.subtitle_url} onChange={handleChange} sx={{ flex: 1, minWidth: 200 }} disabled={!!editId} />
          <Button variant="contained" onClick={handleSubmit} disabled={!!editId}>{editId ? 'Cập nhật' : 'Thêm mới'}</Button>
          {editId && <Button onClick={handleCancelEdit} disabled>Hủy</Button>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
} 