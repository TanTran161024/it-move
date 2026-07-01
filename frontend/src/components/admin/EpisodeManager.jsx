import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Typography, IconButton } from '@mui/material';
import { useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth className="admin-dialog">
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
                bgcolor: editId === ep.id ? 'rgba(99, 102, 241, 0.05)' : 'var(--admin-card)',
                borderRadius: 2,
                p: 1.5,
                border: editId === ep.id ? '1px solid var(--admin-accent)' : '1px solid var(--admin-border)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  background: 'var(--admin-card-hover)',
                  borderColor: 'rgba(255,255,255,0.15)',
                },
                gap: 2,
                flexWrap: { xs: 'wrap', sm: 'nowrap' },
              }}
            >
              {editId === ep.id ? (
                <>
                  <TextField label="Số tập" name="episode_number" type="number" value={form.episode_number} onChange={handleChange} sx={{ ...darkFieldSx, width: 100 }} size="small" />
                  <TextField label="Tiêu đề" name="title" value={form.title} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 120 }} size="small" />
                  <TextField label="Video URL" name="video_url" value={form.video_url} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 120 }} size="small" />
                  <TextField label="Subtitle URL" name="subtitle_url" value={form.subtitle_url} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 120 }} size="small" />
                  <Button variant="contained" onClick={handleSubmit} sx={{ ml: 1, minWidth: 80, bgcolor: 'var(--admin-success)', '&:hover': { bgcolor: '#16a34a' } }}>Lưu</Button>
                  <Button onClick={handleCancelEdit} sx={{ ml: 1, minWidth: 60, color: 'var(--admin-text-muted)' }}>Hủy</Button>
                </>
              ) : (
                <>
                  <Typography sx={{ width: 60, fontWeight: 700, color: 'var(--admin-accent)', fontSize: '1.1rem', textAlign: 'center' }}>Tập {ep.episode_number}</Typography>
                  <Typography sx={{ width: 54, color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 600, textAlign: 'center' }}>ID {ep.id}</Typography>
                  <Typography sx={{ flex: 2, fontWeight: 600, color: '#fff', fontSize: '1rem', ml: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{ep.title}</Typography>
                  <Box sx={{ flex: 3, display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
                    <a href={ep.video_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--admin-accent-hover)', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center' }}>
                      <svg style={{ marginRight: 6 }} width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.video_url}</span>
                    </a>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
                    <IconButton size="small" onClick={() => handleEdit(ep)} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'var(--admin-text)', '&:hover': { bgcolor: 'var(--admin-accent)', color: '#fff' } }}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => onDelete(ep.id)} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'var(--admin-danger)', '&:hover': { bgcolor: 'var(--admin-danger)', color: '#fff' } }}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                </>
              )}
            </Box>
          ))}
        </Box>
        
        <div className="admin-form-section">Thêm tập mới</div>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', bgcolor: 'var(--admin-card)', p: 2, borderRadius: 2, border: '1px solid var(--admin-border)' }}>
          <TextField label="Số tập" name="episode_number" type="number" value={form.episode_number} onChange={handleChange} sx={{ ...darkFieldSx, width: 100 }} disabled={!!editId} size="small" />
          <TextField label="Tiêu đề" name="title" value={form.title} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 150 }} disabled={!!editId} size="small" />
          <TextField label="Video URL" name="video_url" value={form.video_url} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 200 }} disabled={!!editId} size="small" />
          <TextField label="Subtitle URL" name="subtitle_url" value={form.subtitle_url} onChange={handleChange} sx={{ ...darkFieldSx, flex: 1, minWidth: 200 }} disabled={!!editId} size="small" />
          <Button variant="contained" onClick={handleSubmit} disabled={!!editId} sx={{ bgcolor: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent-hover)' } }}>
            {editId ? 'Đang sửa...' : 'Thêm mới'}
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: 'var(--admin-text-muted)' }}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
