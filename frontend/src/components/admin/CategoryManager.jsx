import React, { useEffect, useState } from 'react';
import {
  Box, Button, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, MenuItem, Select, InputLabel, FormControl, OutlinedInput, Alert, IconButton,
  Card, CardContent, CardActions, Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL as API } from '../../config/api';
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

export default function CategoryManager() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const adminHeaders = {
    'Content-Type': 'application/json',
    ...(user.id ? { 'x-user-id': user.id } : {}),
  };
  const [categories, setCategories] = useState([]);
  const [genres, setGenres] = useState([]);
  const [countries, setCountries] = useState([]);
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [form, setForm] = useState({ name: '', genreIds: [], countryIds: [] });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Lấy danh mục, thể loại và quốc gia
  useEffect(() => {
    fetchCategories();
    fetchGenres();
    fetchCountries();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API}/api/categories`);
      const data = await response.json();
      setCategories(data);
    } catch {
      setError('Lỗi khi tải danh mục');
    }
  };

  const fetchGenres = async () => {
    try {
      const response = await fetch(`${API}/api/genres`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setGenres(data);
    } catch (err) {
      console.error('Error fetching genres:', err);
      setError(`Lỗi khi tải thể loại: ${err.message}`);
    }
  };

  const fetchCountries = async () => {
    try {
      const response = await fetch(`${API}/api/countries`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setCountries(data);
    } catch (err) {
      console.error('Error fetching countries:', err);
      setError(`Lỗi khi tải quốc gia: ${err.message}`);
    }
  };

  const handleOpen = (category = null) => {
    if (category) {
      setForm({
        name: category.name,
        genreIds: [],
        countryIds: []
      });
      setEditMode(true);
      setEditingCategoryId(category.id);
      // Lấy thể loại và quốc gia của danh mục này
      fetchCategoryGenres(category.id);
      fetchCategoryCountries(category.id);
    } else {
      setForm({ name: '', genreIds: [], countryIds: [] });
      setEditMode(false);
      setEditingCategoryId(null);
    }
    setOpen(true);
    setError('');
    setSuccess('');
  };

  const fetchCategoryGenres = async (categoryId) => {
    try {
      const response = await fetch(`${API}/api/categories/${categoryId}/genres`);
      const data = await response.json();
      setForm(prev => ({ ...prev, genreIds: data.map(g => g.id) }));
    } catch (err) {
      console.error('Lỗi khi tải thể loại của danh mục:', err);
    }
  };

  const fetchCategoryCountries = async (categoryId) => {
    try {
      const response = await fetch(`${API}/api/categories/${categoryId}/countries`);
      const data = await response.json();
      setForm(prev => ({ ...prev, countryIds: data.map(c => c.id) }));
    } catch (err) {
      console.error('Lỗi khi tải quốc gia của danh mục:', err);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setEditMode(false);
    setEditingCategoryId(null);
    setForm({ name: '', genreIds: [], countryIds: [] });
    setError('');
    setSuccess('');
  };

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({
      ...f,
      [name]: name === 'genreIds' ? value : value
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('Tên danh mục không được để trống');
      return;
    }

    try {
      const url = editMode ? `${API}/api/categories/${editingCategoryId}` : `${API}/api/categories`;
      const method = editMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: adminHeaders,
        body: JSON.stringify(form)
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || (editMode ? 'Cập nhật thành công' : 'Thêm thành công'));
        fetchCategories();
        setTimeout(() => handleClose(), 1000);
      } else {
        setError(data.message || 'Có lỗi xảy ra');
      }
    } catch {
      setError('Lỗi kết nối');
    }
  };

  const handleDelete = async (categoryId) => {
    if (!window.confirm('Bạn có chắc muốn xóa danh mục này?')) return;

    try {
      const response = await fetch(`${API}/api/categories/${categoryId}`, {
        method: 'DELETE',
        headers: adminHeaders,
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || 'Xóa thành công');
        fetchCategories();
      } else {
        setError(data.message || 'Có lỗi xảy ra');
      }
    } catch {
      setError('Lỗi kết nối');
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Typography variant="h4" mb={3} sx={{ color: '#fff', fontWeight: 700 }}>
        Quản lý danh mục Custom
      </Typography>

      <Button 
        variant="contained" 
        startIcon={<AddIcon />}
        onClick={() => handleOpen()}
        sx={{ 
          bgcolor: 'var(--admin-accent)', 
          '&:hover': { bgcolor: 'var(--admin-accent-hover)' },
          fontWeight: 600,
          mb: 3
        }}
      >
        Thêm danh mục
      </Button>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {categories.length === 0 ? (
        <div className="admin-empty">
          <Typography>Chưa có danh mục nào.</Typography>
        </div>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {categories.map(category => (
            <Card key={category.id} className="admin-panel" sx={{ p: 0, mb: 0 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: 'var(--admin-accent)' }}>
                  {category.name}
                </Typography>
                
                {/* Hiển thị thể loại */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ color: 'var(--admin-text-muted)', mb: 1, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                    Thể loại:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {category.genres && category.genres.length > 0 ? (
                      category.genres.map((genre, index) => (
                        <Chip
                          key={index}
                          label={genre.name}
                          size="small"
                          sx={{
                            bgcolor: 'rgba(59, 130, 246, 0.15)',
                            color: '#60a5fa',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            border: '1px solid rgba(59, 130, 246, 0.3)'
                          }}
                        />
                      ))
                    ) : (
                      <Typography variant="body2" sx={{ color: '#666', fontStyle: 'italic' }}>
                        Chưa có thể loại
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Hiển thị quốc gia */}
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ color: 'var(--admin-text-muted)', mb: 1, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                    Quốc gia:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {category.countries && category.countries.length > 0 ? (
                      category.countries.map((country, index) => (
                        <Chip
                          key={index}
                          label={country.name}
                          size="small"
                          sx={{
                            bgcolor: 'rgba(34, 197, 94, 0.15)',
                            color: '#4ade80',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          }}
                        />
                      ))
                    ) : (
                      <Typography variant="body2" sx={{ color: '#666', fontStyle: 'italic' }}>
                        Chưa có quốc gia
                      </Typography>
                    )}
                  </Box>
                </Box>
              </CardContent>
              <CardActions sx={{ justifyContent: 'flex-end', p: 2, borderTop: '1px solid var(--admin-border)' }}>
                <Tooltip title="Sửa">
                  <IconButton
                    size="small"
                    onClick={() => handleOpen(category)}
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.05)',
                      color: 'var(--admin-text)',
                      '&:hover': { bgcolor: 'var(--admin-accent)', color: '#fff' }
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Xóa">
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(category.id)}
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.05)',
                      color: 'var(--admin-danger)',
                      '&:hover': { bgcolor: 'var(--admin-danger)', color: '#fff' }
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth className="admin-dialog">
        <DialogTitle>
          {editMode ? 'Sửa danh mục' : 'Thêm danh mục mới'}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Tên danh mục"
            name="name"
            value={form.name}
            onChange={handleChange}
            fullWidth
            margin="normal"
            sx={{ ...darkFieldSx, mt: 2 }}
          />
          <FormControl fullWidth margin="normal" sx={darkFieldSx}>
            <InputLabel>Chọn thể loại</InputLabel>
            <Select
              multiple
              name="genreIds"
              value={form.genreIds}
              onChange={handleChange}
              input={<OutlinedInput label="Chọn thể loại" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id) => {
                    const genre = genres.find(g => g.id === id);
                    return (
                      <Chip 
                        key={id} 
                        label={genre ? genre.name : id} 
                        size="small"
                        sx={{ bgcolor: 'var(--admin-accent)', color: '#fff' }}
                      />
                    );
                  })}
                </Box>
              )}
              MenuProps={{
                PaperProps: {
                  style: { maxHeight: 400, background: 'var(--admin-surface)', color: '#fff', border: '1px solid var(--admin-border)' },
                },
              }}
              sx={{ '& .MuiSelect-icon': { color: 'var(--admin-text-muted)' } }}
            >
              {genres.map((genre) => (
                <MenuItem key={genre.id} value={genre.id} sx={{ '&:hover': { background: 'var(--admin-card-hover)' }, '&.Mui-selected': { background: 'rgba(99, 102, 241, 0.15)' } }}>
                  {genre.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth margin="normal" sx={darkFieldSx}>
            <InputLabel>Chọn quốc gia</InputLabel>
            <Select
              multiple
              name="countryIds"
              value={form.countryIds}
              onChange={handleChange}
              input={<OutlinedInput label="Chọn quốc gia" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id) => {
                    const country = countries.find(c => c.id === id);
                    return (
                      <Chip 
                        key={id} 
                        label={country ? country.name : id} 
                        size="small"
                        sx={{ bgcolor: 'var(--admin-success)', color: '#fff' }}
                      />
                    );
                  })}
                </Box>
              )}
              MenuProps={{
                PaperProps: {
                  style: { maxHeight: 400, background: 'var(--admin-surface)', color: '#fff', border: '1px solid var(--admin-border)' },
                },
              }}
              sx={{ '& .MuiSelect-icon': { color: 'var(--admin-text-muted)' } }}
            >
              {countries.map((country) => (
                <MenuItem key={country.id} value={country.id} sx={{ '&:hover': { background: 'var(--admin-card-hover)' }, '&.Mui-selected': { background: 'rgba(99, 102, 241, 0.15)' } }}>
                  {country.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} sx={{ color: 'var(--admin-text-muted)' }}>Hủy</Button>
          <Button onClick={handleSubmit} variant="contained" sx={{ bgcolor: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent-hover)' } }}>
            {editMode ? 'Cập nhật' : 'Thêm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
