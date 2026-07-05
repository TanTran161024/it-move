import { Box, Card, CardActions, CardContent, CircularProgress, Grid, IconButton, Tooltip, Typography, Zoom } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import MovieIcon from '@mui/icons-material/Movie';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SearchIcon from '@mui/icons-material/Search';
import { useState, useMemo } from 'react';
import { safePosterUrl } from '../../utils/imageFallbacks';
import '../../pages/admin/AdminStyles.css';

function formatRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return '';
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}

export default function MovieTable({
  movies,
  onEdit,
  onDelete,
  onManageEpisodes,
  onToggleVisibility,
  onTmdbEnrich,
  tmdbLoadingId,
}) {
  const [hovered, setHovered] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMovies = useMemo(() => {
    if (!searchTerm) return movies;
    const lowerSearch = searchTerm.toLowerCase();
    return movies.filter(movie => 
      movie.title?.toLowerCase().includes(lowerSearch) || 
      movie.original_title?.toLowerCase().includes(lowerSearch)
    );
  }, [movies, searchTerm]);

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <div className="admin-search">
          <SearchIcon className="admin-search-icon" />
          <input 
            type="text" 
            placeholder="Tìm kiếm phim..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </Box>

      {filteredMovies.length === 0 ? (
        <div className="admin-empty">
          <MovieIcon className="admin-empty-icon" sx={{ fontSize: 64, mb: 2, opacity: 0.2 }} />
          <Typography>Không tìm thấy phim nào phù hợp.</Typography>
        </div>
      ) : (
        <Grid container spacing={3} justifyContent="flex-start">
          {filteredMovies.map((movie) => {
            const hidden = Number(movie.is_visible) === 0;

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={movie.id} display="flex" justifyContent="center">
                <Zoom in>
                  <Card
                    className="admin-movie-card"
                    sx={{
                      width: '100%',
                      maxWidth: 260,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      border: hidden ? '2px solid var(--admin-danger)' : '1px solid var(--admin-border)',
                      position: 'relative',
                    }}
                    onMouseEnter={() => setHovered(movie.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <Box
                      sx={{
                        width: '100%',
                        aspectRatio: '2/3',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <img
                        src={safePosterUrl(movie.poster_url)}
                        alt={movie.title}
                        onError={(event) => {
                          event.currentTarget.src = safePosterUrl('');
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          opacity: hidden ? 0.45 : 1,
                          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                          transform: hovered === movie.id ? 'scale(1.08)' : 'scale(1)',
                        }}
                      />
                      {hidden && (
                        <Box
                          sx={{
                            position: 'absolute',
                            left: 10,
                            top: 10,
                            zIndex: 3,
                          }}
                        >
                          <span className="admin-badge danger">Đang ẩn</span>
                        </Box>
                      )}
                      
                      {/* Quality & Year Badges */}
                      <Box sx={{ position: 'absolute', right: 10, top: 10, zIndex: 3, display: 'flex', gap: 0.5, flexDirection: 'column', alignItems: 'flex-end' }}>
                        {movie.quality && <span className="admin-badge info" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>{movie.quality}</span>}
                        {movie.release_year && <span className="admin-badge warning" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>{movie.release_year}</span>}
                        {movie.tmdb_id && <span className="admin-badge success" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>TMDb</span>}
                      </Box>
                      
                      {/* IMDb Badge */}
                      {movie.imdb_rating > 0 && (
                        <Box sx={{ position: 'absolute', left: 10, bottom: 10, zIndex: 3 }}>
                          <span className="admin-badge warning" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
                            <span style={{ color: 'var(--admin-warning)' }}>★</span> {formatRating(movie.imdb_rating)}
                          </span>
                        </Box>
                      )}

                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          bgcolor: 'rgba(0,0,0,0.5)',
                          zIndex: 2,
                          transition: 'opacity 0.3s ease',
                          opacity: hovered === movie.id ? 1 : 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: hovered === movie.id ? 'auto' : 'none',
                        }}
                      >
                        <IconButton
                          sx={{ bgcolor: 'var(--admin-accent)', color: '#fff', '&:hover': { bgcolor: 'var(--admin-accent-hover)' }, transition: 'background-color 160ms ease' }}
                          onClick={() => onManageEpisodes(movie)}
                        >
                          <PlaylistPlayIcon sx={{ fontSize: 32 }} />
                        </IconButton>
                      </Box>
                    </Box>

                    <CardContent sx={{ pb: 1, pt: 2, width: '100%', flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <Tooltip title={movie.title.length > 20 ? movie.title : ''} arrow>
                        <Typography variant="h6" fontWeight={700} noWrap sx={{ fontSize: '1rem', textAlign: 'center', width: '100%', color: 'var(--admin-text-strong)' }}>
                          {movie.title}
                        </Typography>
                      </Tooltip>
                      <Tooltip title={movie.original_title?.length > 25 ? movie.original_title : ''} arrow>
                         <Typography variant="body2" noWrap sx={{ fontSize: '0.75rem', textAlign: 'center', width: '100%', color: 'var(--admin-text-muted)' }}>
                          {movie.original_title || 'N/A'}
                        </Typography>
                      </Tooltip>
                    </CardContent>

                    <CardActions sx={{ justifyContent: 'center', width: '100%', pb: 2, pt: 1, gap: 1 }}>
                      {onTmdbEnrich && (
                        <Tooltip title="Bổ sung poster/backdrop/trailer/diễn viên/đạo diễn từ TMDb" arrow>
                          <span>
                            <IconButton
                              size="small"
                              disabled={tmdbLoadingId === movie.id}
                              sx={{
                                bgcolor: 'var(--admin-accent-soft)',
                                color: 'var(--admin-accent)',
                                '&:hover': { bgcolor: 'var(--admin-accent)', color: '#fff' },
                                '&.Mui-disabled': { color: 'var(--admin-text-muted)' },
                              }}
                              onClick={() => onTmdbEnrich(movie)}
                            >
                              {tmdbLoadingId === movie.id ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      <Tooltip title="Sửa phim" arrow>
                        <IconButton size="small" sx={{ bgcolor: 'var(--admin-bg-soft)', color: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent)', color: '#fff' } }} onClick={() => onEdit(movie)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Xóa phim" arrow>
                        <IconButton size="small" sx={{ bgcolor: 'var(--admin-bg-soft)', color: 'var(--admin-danger)', '&:hover': { bgcolor: 'var(--admin-danger)', color: '#fff' } }} onClick={() => onDelete(movie.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={hidden ? 'Hiện phim' : 'Ẩn phim'} arrow>
                        <IconButton
                          size="small"
                          sx={{ 
                            bgcolor: 'var(--admin-bg-soft)', 
                            color: hidden ? 'var(--admin-success)' : 'var(--admin-warning)', 
                            '&:hover': { bgcolor: hidden ? 'var(--admin-success)' : 'var(--admin-warning)', color: '#fff' } 
                          }}
                          onClick={() => onToggleVisibility(movie)}
                        >
                          {hidden ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </CardActions>
                  </Card>
                </Zoom>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
