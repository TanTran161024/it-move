import { Grid, Card, CardContent, CardActions, Typography, Tooltip, IconButton, Box, Zoom } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import { useState } from 'react';

export default function MovieTable({ movies, onEdit, onDelete, onManageEpisodes }) {
  const [hovered, setHovered] = useState(null);
  return (
    <Grid container spacing={3} justifyContent="flex-start">
      {movies.map(movie => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={movie.id} display="flex" justifyContent="center">
          <Zoom in>
            <Card
              sx={{
                width: 240,
                bgcolor: '#23242a',
                color: '#fff',
                borderRadius: 3,
                boxShadow: 6,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'transform 0.18s, box-shadow 0.18s',
                '&:hover': { transform: 'translateY(-8px) scale(1.04)', boxShadow: 12 }
              }}
              onMouseEnter={() => setHovered(movie.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <Box
                sx={{
                  width: 200,
                  height: 300,
                  m: '20px auto 0 auto',
                  borderRadius: 2.25,
                  overflow: 'hidden',
                  background: '#222',
                  boxShadow: hovered === movie.id ? 8 : 3,
                  position: 'relative',
                  transition: 'box-shadow 0.18s, transform 0.18s',
                  '&:hover img': { transform: 'scale(1.06)' }
                }}
              >
                <img
                  src={movie.poster_url}
                  alt={movie.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: 18,
                    display: 'block',
                    transition: 'transform 0.18s'
                  }}
                />
                {hovered === movie.id && (
                  <Box sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    bgcolor: 'rgba(0,0,0,0.18)',
                    zIndex: 2,
                    transition: 'background 0.18s',
                  }} />
                )}
              </Box>
              <CardContent sx={{ pb: 1, width: '100%', minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Tooltip title={movie.title.length > 22 ? movie.title : ''} arrow>
                  <Typography variant="h6" fontWeight={700} noWrap sx={{ fontSize: 18, mb: 0.5, textAlign: 'center', width: '100%' }}>
                    {movie.title}
                  </Typography>
                </Tooltip>
              </CardContent>
              <CardActions sx={{ justifyContent: 'center', width: '100%', pb: 2, pt: 0 }}>
                <Tooltip title="Sửa phim" arrow>
                  <IconButton color="primary" sx={{ mx: 1, bgcolor: '#222', '&:hover': { bgcolor: '#1976d2', color: '#fff' } }} onClick={() => onEdit(movie)}>
                    <EditIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Xóa phim" arrow>
                  <IconButton color="error" sx={{ mx: 1, bgcolor: '#222', '&:hover': { bgcolor: '#d32f2f', color: '#fff' } }} onClick={() => onDelete(movie.id)}>
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Quản lý tập phim" arrow>
                  <IconButton color="secondary" sx={{ mx: 1, bgcolor: '#222', '&:hover': { bgcolor: '#7c4dff', color: '#fff' } }} onClick={() => onManageEpisodes(movie)}>
                    <PlaylistPlayIcon />
                  </IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          </Zoom>
        </Grid>
      ))}
    </Grid>
  );
} 