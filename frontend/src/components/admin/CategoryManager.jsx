import React, { useEffect, useState } from 'react';
import {
  Box, Button, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, MenuItem, Select, InputLabel, FormControl, OutlinedInput, Alert, IconButton,
  Card, CardContent, CardActions, Tooltip, Divider
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CategoryManager() {
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
    } catch (err) {
      setError('Lỗi khi tải danh mục');
    }
  };

  const fetchGenres = async () => {
    try {
      console.log('Fetching genres from:', `${API}/api/genres`);
      const response = await fetch(`${API}/api/genres`);
      console.log('Genres response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Genres data:', data);
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

      console.log('Submitting form:', { editMode, editingCategoryId, url, method, form });

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (response.ok) {
        setSuccess(data.message || (editMode ? 'Cập nhật thành công' : 'Thêm thành công'));
        fetchCategories();
        setTimeout(() => handleClose(), 1000);
      } else {
        setError(data.message || 'Có lỗi xảy ra');
      }
    } catch (err) {
      console.error('Submit error:', err);
      setError('Lỗi kết nối');
    }
  };

  const handleDelete = async (categoryId) => {
    if (!window.confirm('Bạn có chắc muốn xóa danh mục này?')) return;

    try {
      const response = await fetch(`${API}/api/categories/${categoryId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || 'Xóa thành công');
        fetchCategories();
      } else {
        setError(data.message || 'Có lỗi xảy ra');
      }
    } catch (err) {
      setError('Lỗi kết nối');
    }
  };

  return (
    <Box sx={{ p: 4, pl: 12, pt: 0 }}>
      <Typography variant="h4" mb={3} sx={{ color: '#fff', fontWeight: 700 }}>
        Quản lý danh mục
      </Typography>

      <Button 
        variant="contained" 
        startIcon={<AddIcon />}
        onClick={() => handleOpen()}
        sx={{ 
          bgcolor: '#1976d2', 
          '&:hover': { bgcolor: '#1565c0' },
          fontWeight: 600,
          mb: 3
        }}
      >
        Thêm danh mục
      </Button>

      {/* {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>} */}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {categories.map(category => (
          <Card key={category.id} sx={{
            bgcolor: '#23242a',
            color: '#fff',
            '&:hover': {
              transform: 'translateY(-4px)',
              boxShadow: 8,
              bgcolor: '#23243a'
            },
            transition: 'all 0.3s ease'
          }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {category.name}
              </Typography>
              
              {/* Hiển thị thể loại */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ color: '#bbb', mb: 1, fontWeight: 500 }}>
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
                          bgcolor: '#1976d2',
                          color: '#fff',
                          fontSize: '0.7rem',
                          height: 20
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
                <Typography variant="body2" sx={{ color: '#bbb', mb: 1, fontWeight: 500 }}>
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
                          bgcolor: '#4caf50',
                          color: '#fff',
                          fontSize: '0.7rem',
                          height: 20
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
            <CardActions sx={{ justifyContent: 'flex-end', p: 2 }}>
              <Tooltip title="Sửa">
                <IconButton
                  color="primary"
                  onClick={() => handleOpen(category)}
                  sx={{
                    bgcolor: '#333',
                    '&:hover': { bgcolor: '#1976d2' }
                  }}
                >
                  <EditIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Xóa">
                <IconButton
                  color="error"
                  onClick={() => handleDelete(category.id)}
                  sx={{
                    bgcolor: '#333',
                    '&:hover': { bgcolor: '#d32f2f' }
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </CardActions>
          </Card>
        ))}
      </Box>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#23242a', color: '#fff' }}>
          {editMode ? 'Sửa danh mục' : 'Thêm danh mục mới'}
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#23242a', color: '#fff' }}>
          <TextField
            label="Tên danh mục"
            name="name"
            value={form.name}
            onChange={handleChange}
            fullWidth
            margin="normal"
            sx={{
              '& .MuiInputBase-input': { color: '#fff' },
              '& .MuiInputLabel-root': { color: '#bbb' },
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: '#444' },
                '&:hover fieldset': { borderColor: '#2196f3' },
                '&.Mui-focused fieldset': { borderColor: '#2196f3' }
              }
            }}
          />
          <FormControl fullWidth margin="normal">
            <InputLabel sx={{ color: '#bbb' }}>Chọn thể loại</InputLabel>
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
                        sx={{
                          bgcolor: '#fff',
                          color: '#333',
                          '&:hover': {
                            bgcolor: '#f5f5f5'
                          }
                        }}
                      />
                    );
                  })}
                </Box>
              )}
              MenuProps={{
                PaperProps: {
                  style: {
                    maxHeight: 400,
                  },
                },
                sx: {
                  '& .MuiMenu-paper': {
                    bgcolor: '#fff',
                    color: '#111',
                  }
                }
              }}
              sx={{
                '& .MuiInputBase-input': { color: '#fff' },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: '#444' },
                  '&:hover fieldset': { borderColor: '#2196f3' },
                  '&.Mui-focused fieldset': { borderColor: '#2196f3' }
                }
              }}
            >
              {genres.map((genre) => (
                <MenuItem key={genre.id} value={genre.id} sx={{ color: '#111' }}>
                  {genre.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth margin="normal">
            <InputLabel sx={{ color: '#bbb' }}>Chọn quốc gia</InputLabel>
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
                        sx={{
                          bgcolor: '#fff',
                          color: '#333',
                          '&:hover': {
                            bgcolor: '#f5f5f5'
                          }
                        }}
                      />
                    );
                  })}
                </Box>
              )}
              MenuProps={{
                PaperProps: {
                  style: {
                    maxHeight: 400,
                  },
                },
                sx: {
                  '& .MuiMenu-paper': {
                    bgcolor: '#fff',
                    color: '#111',
                  }
                }
              }}
              sx={{
                '& .MuiInputBase-input': { color: '#fff' },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: '#444' },
                  '&:hover fieldset': { borderColor: '#2196f3' },
                  '&.Mui-focused fieldset': { borderColor: '#2196f3' }
                }
              }}
            >
              {countries.map((country) => (
                <MenuItem key={country.id} value={country.id} sx={{ color: '#111' }}>
                  {country.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#23242a', p: 3, gap: 2 }}>
          <Button
            onClick={handleClose}
            variant="outlined"
            sx={{
              color: '#fff',
              borderColor: '#666',
              '&:hover': {
                borderColor: '#999',
                bgcolor: 'rgba(255,255,255,0.1)'
              },
              minWidth: 100,
              fontWeight: 600
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            sx={{
              bgcolor: '#1976d2',
              '&:hover': { bgcolor: '#1565c0' },
              minWidth: 100,
              fontWeight: 600
            }}
          >
            {editMode ? 'Cập nhật' : 'Thêm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 