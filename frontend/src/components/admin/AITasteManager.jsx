import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { API_URL } from '../../config/api';

const EMPTY_DASHBOARD = {
  stats: {
    totalFeedback: 0,
    likes: 0,
    dislikes: 0,
    watched: 0,
    notRecommend: 0,
    profilesWithTaste: 0,
    profilesWithoutTaste: 0,
  },
  topTastes: {
    likedGenres: [],
    likedCountries: [],
    avoidedGenres: [],
    preferredDuration: 'Chưa rõ',
  },
  profiles: [],
  feedbacks: [],
  recommendations: [],
  selected_profile_id: null,
  selected_profile: null,
};

function getAdminHeaders() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.id ? { 'x-user-id': user.id } : {};
  } catch {
    return {};
  }
}

function formatTime(value) {
  if (!value) return 'Chưa rõ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function tasteName(item) {
  return typeof item === 'string' ? item : item?.name || 'Không rõ';
}

function statNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AITasteManager() {
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const selectedProfile = dashboard.selected_profile
    || dashboard.profiles.find((profile) => String(profile.id) === String(selectedProfileId))
    || null;
  const currentRecs = dashboard.recommendations || [];
  const feedbackRows = dashboard.feedbacks || [];
  const stats = dashboard.stats || EMPTY_DASHBOARD.stats;
  const topTastes = dashboard.topTastes || EMPTY_DASHBOARD.topTastes;
  const tasteSummary = selectedProfile?.taste_profile?.summary || [];

  const surfaceSx = {
    bgcolor: 'var(--admin-surface)',
    color: 'var(--admin-text)',
    borderRadius: '8px',
    border: '1px solid var(--admin-border)',
    boxShadow: 'var(--admin-shadow-soft)',
  };

  const statCards = useMemo(() => ([
    { label: 'Tổng Feedback', value: stats.totalFeedback },
    { label: 'Lượt Thích', value: stats.likes, color: '#10b981' },
    { label: 'Lượt Không thích', value: stats.dislikes, color: '#ef4444' },
    { label: 'Đã xem', value: stats.watched, color: '#3b82f6' },
    { label: 'Không gợi ý nữa', value: stats.notRecommend, color: '#f59e0b' },
    { label: 'Profile có gu rõ', value: stats.profilesWithTaste },
    { label: 'Profile thiếu data', value: stats.profilesWithoutTaste, color: '#8b5cf6' },
  ]), [stats]);

  const loadDashboard = useCallback(async (profileId = selectedProfileId, options = {}) => {
    if (!options.silent) setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_URL}/admin/ai-taste`, {
        headers: getAdminHeaders(),
        params: {
          profile_id: profileId || undefined,
          limit: 120,
        },
      });
      const nextDashboard = { ...EMPTY_DASHBOARD, ...(response.data || {}) };
      setDashboard(nextDashboard);
      if (!profileId && nextDashboard.selected_profile_id) {
        setSelectedProfileId(String(nextDashboard.selected_profile_id));
      }
      return true;
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể tải dữ liệu AI & gu người dùng.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    loadDashboard(selectedProfileId);
  }, [loadDashboard, selectedProfileId]);

  const typeColor = (type) => {
    switch (type) {
      case 'Thích':
        return 'success';
      case 'Không thích':
        return 'error';
      case 'Đã xem':
        return 'info';
      case 'Không gợi ý nữa':
        return 'warning';
      default:
        return 'default';
    }
  };

  const runAction = async (key, callback, successMessage) => {
    setActionBusy(key);
    setError('');
    try {
      await callback();
      setToastMsg(successMessage);
      await loadDashboard(selectedProfileId, { silent: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể thực hiện thao tác.');
    } finally {
      setActionBusy('');
    }
  };

  const handleResetProfile = () => {
    if (!selectedProfile?.id) return;
    if (!window.confirm('Xóa toàn bộ feedback AI của profile này? Lịch sử xem và yêu thích sẽ được giữ nguyên.')) return;
    runAction(
      'reset-profile',
      () => axios.post(`${API_URL}/admin/ai-taste/profiles/${selectedProfile.id}/reset`, null, {
        headers: getAdminHeaders(),
      }),
      'Đã reset feedback AI của profile.'
    );
  };

  const handleRefresh = async () => {
    setActionBusy('refresh');
    try {
      const ok = await loadDashboard(selectedProfileId, { silent: true });
      if (ok) setToastMsg('Đã làm mới dữ liệu gợi ý.');
    } finally {
      setActionBusy('');
    }
  };

  const handleExport = () => {
    if (!selectedProfile) return;
    downloadJson(`ai-taste-profile-${selectedProfile.id}.json`, {
      exported_at: new Date().toISOString(),
      profile: selectedProfile,
      recommendations: currentRecs,
      feedbacks: feedbackRows,
    });
    setToastMsg('Đã xuất dữ liệu gu profile.');
  };

  const handleViewProfile = (row) => {
    setSelectedProfileId(String(row.profile_id));
    setToastMsg(`Đang xem gu của ${row.profile}`);
  };

  const handleDeleteFeedback = (row) => {
    runAction(
      `delete-${row.id}`,
      () => axios.delete(`${API_URL}/admin/ai-taste/feedback/${row.id}`, {
        headers: getAdminHeaders(),
      }),
      'Đã xóa feedback.'
    );
  };

  const handleHideMovie = (row) => {
    runAction(
      `hide-${row.id}`,
      () => axios.post(`${API_URL}/admin/ai-taste/feedback/hide`, {
        profile_id: row.profile_id,
        movie_id: row.movie_id,
      }, {
        headers: getAdminHeaders(),
      }),
      `Đã đánh dấu không gợi ý "${row.movie}".`
    );
  };

  return (
    <Box sx={{ width: '100%', px: { xs: 1, md: 3 }, mt: 2, pb: 6 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading && !dashboard.profiles.length ? (
        <Box sx={{ ...surfaceSx, p: 5, display: 'grid', placeItems: 'center', minHeight: 240 }}>
          <CircularProgress />
          <Typography sx={{ mt: 2, color: 'var(--admin-text-muted)' }}>Đang tải dữ liệu AI...</Typography>
        </Box>
      ) : (
        <>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: 'var(--admin-text-strong)' }}>
            Tổng quan hệ thống AI
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
            {statCards.map((stat) => (
              <Box key={stat.label} sx={{ ...surfaceSx, p: 2, flex: '1 1 120px', minWidth: '140px', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)' }}>{stat.label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: stat.color || 'var(--admin-text)' }}>
                  {statNumber(stat.value)}
                </Typography>
              </Box>
            ))}
          </Box>

          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={6}>
              <Box sx={{ ...surfaceSx, p: 3, height: '100%' }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: 'var(--admin-text-strong)' }}>
                  Gu nổi bật toàn hệ thống
                </Typography>

                <Typography variant="subtitle2" sx={{ color: 'var(--admin-text-muted)', mb: 1 }}>Top thể loại được thích</Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                  {(topTastes.likedGenres || []).map((item) => (
                    <Chip key={tasteName(item)} label={tasteName(item)} size="small" sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 600 }} />
                  ))}
                  {!topTastes.likedGenres?.length && <Typography variant="body2" sx={{ color: 'var(--admin-text-muted)' }}>Chưa có dữ liệu</Typography>}
                </Box>

                <Typography variant="subtitle2" sx={{ color: 'var(--admin-text-muted)', mb: 1 }}>Top quốc gia được thích</Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                  {(topTastes.likedCountries || []).map((item) => (
                    <Chip key={tasteName(item)} label={tasteName(item)} size="small" sx={{ bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 600 }} />
                  ))}
                  {!topTastes.likedCountries?.length && <Typography variant="body2" sx={{ color: 'var(--admin-text-muted)' }}>Chưa có dữ liệu</Typography>}
                </Box>

                <Typography variant="subtitle2" sx={{ color: 'var(--admin-text-muted)', mb: 1 }}>Top thể loại bị tránh</Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                  {(topTastes.avoidedGenres || []).map((item) => (
                    <Chip key={tasteName(item)} label={tasteName(item)} size="small" sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontWeight: 600 }} />
                  ))}
                  {!topTastes.avoidedGenres?.length && <Typography variant="body2" sx={{ color: 'var(--admin-text-muted)' }}>Chưa có dữ liệu</Typography>}
                </Box>

                <Typography variant="subtitle2" sx={{ color: 'var(--admin-text-muted)', mb: 1 }}>Thời lượng hay xem</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--admin-text)' }}>
                  {topTastes.preferredDuration || 'Chưa rõ'}
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box sx={{ ...surfaceSx, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: 'var(--admin-text-strong)' }}>
                  Kiểm tra & xử lý gu profile
                </Typography>

                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Chọn profile"
                  value={selectedProfileId}
                  onChange={(event) => setSelectedProfileId(event.target.value)}
                  sx={{ mb: 2, '& .MuiOutlinedInput-root': { bgcolor: 'var(--admin-bg-soft)', color: 'var(--admin-text)' } }}
                  InputLabelProps={{ style: { color: 'var(--admin-text-muted)' } }}
                  SelectProps={{ native: true }}
                >
                  {dashboard.profiles.map((profile) => (
                    <option key={profile.id} value={profile.id} style={{ color: '#000' }}>{profile.name}</option>
                  ))}
                </TextField>

                <Box sx={{ bgcolor: 'var(--admin-bg-soft)', p: 2, borderRadius: 2, mb: 3, flexGrow: 1 }}>
                  <Typography variant="subtitle2" sx={{ color: 'var(--admin-text-muted)', mb: 1 }}>Tóm tắt gu:</Typography>
                  {tasteSummary.length > 0 ? (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                      {tasteSummary.map((item) => (
                        <Chip key={item} label={item} size="small" sx={{ bgcolor: 'rgba(45, 212, 191, 0.1)', color: '#5eead4', fontWeight: 700 }} />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" sx={{ mb: 1, color: 'var(--admin-text)' }}>
                      Chưa đủ dữ liệu gu cho profile này.
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{ color: 'var(--admin-text)' }}>
                    Ưu tiên thời lượng: {selectedProfile?.type || 'Chưa rõ'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" color="error" startIcon={<RefreshIcon />} disabled={!selectedProfile || Boolean(actionBusy)} onClick={handleResetProfile}>
                    Reset gu
                  </Button>
                  <Button size="small" variant="outlined" color="info" startIcon={<DownloadIcon />} disabled={!selectedProfile} onClick={handleExport}>
                    Xuất dữ liệu
                  </Button>
                  <Button size="small" variant="contained" sx={{ bgcolor: 'var(--admin-accent)' }} startIcon={<AutoAwesomeIcon />} disabled={Boolean(actionBusy)} onClick={handleRefresh}>
                    Làm mới gợi ý
                  </Button>
                </Box>
              </Box>
            </Grid>
          </Grid>

          <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: 'var(--admin-text-strong)' }}>
            Preview gợi ý cho {selectedProfile?.name || 'profile'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 4, overflowX: 'auto', pb: 1 }}>
            {currentRecs.length > 0 ? currentRecs.map((rec) => (
              <Box key={rec.id} sx={{ ...surfaceSx, minWidth: 260, flex: '0 0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ display: 'flex' }}>
                  <Box sx={{ width: 80, height: 120, bgcolor: 'var(--admin-bg-soft)', flex: '0 0 auto' }}>
                    {rec.poster && <img src={rec.poster} alt={rec.title} style={{ width: 80, height: 120, objectFit: 'cover' }} />}
                  </Box>
                  <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2, mb: 1, color: 'var(--admin-text)' }}>
                      {rec.title}
                    </Typography>
                    <Chip size="small" label={`Match: ${rec.match}%`} color={rec.match > 90 ? 'success' : 'primary'} sx={{ alignSelf: 'flex-start', height: 20, fontSize: '0.7rem', fontWeight: 600, mb: 1 }} />
                  </Box>
                </Box>
                <Box sx={{ bgcolor: 'var(--admin-bg-soft)', p: 1, borderTop: '1px solid var(--admin-border)', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                  <strong>Lý do:</strong> {rec.reason}
                </Box>
              </Box>
            )) : (
              <Typography sx={{ color: 'var(--admin-text-muted)', py: 2 }}>Không có gợi ý nào cho profile này.</Typography>
            )}
          </Box>

          <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: 'var(--admin-text-strong)' }}>
            Lịch sử feedback phim gần đây
          </Typography>
          <TableContainer component={Paper} sx={{ ...surfaceSx, backgroundImage: 'none', mb: 4 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: 'var(--admin-text-muted)', borderBottomColor: 'var(--admin-border)' }}>Profile</TableCell>
                  <TableCell sx={{ color: 'var(--admin-text-muted)', borderBottomColor: 'var(--admin-border)' }}>Phim</TableCell>
                  <TableCell sx={{ color: 'var(--admin-text-muted)', borderBottomColor: 'var(--admin-border)' }}>Loại</TableCell>
                  <TableCell sx={{ color: 'var(--admin-text-muted)', borderBottomColor: 'var(--admin-border)' }}>Nguồn</TableCell>
                  <TableCell sx={{ color: 'var(--admin-text-muted)', borderBottomColor: 'var(--admin-border)' }}>Thời gian</TableCell>
                  <TableCell sx={{ color: 'var(--admin-text-muted)', borderBottomColor: 'var(--admin-border)', textAlign: 'right' }}>Thao tác</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {feedbackRows.length > 0 ? feedbackRows.map((row) => (
                  <TableRow key={row.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell sx={{ color: 'var(--admin-text)', borderBottomColor: 'var(--admin-border)', fontWeight: 600 }}>{row.profile}</TableCell>
                    <TableCell sx={{ color: 'var(--admin-text)', borderBottomColor: 'var(--admin-border)' }}>{row.movie}</TableCell>
                    <TableCell sx={{ borderBottomColor: 'var(--admin-border)' }}>
                      <Chip label={row.type_label || row.type} size="small" color={typeColor(row.type_label)} sx={{ fontWeight: 600, height: 24 }} />
                    </TableCell>
                    <TableCell sx={{ color: 'var(--admin-text)', borderBottomColor: 'var(--admin-border)' }}>
                      <Chip label={row.source} size="small" variant="outlined" sx={{ color: 'var(--admin-text-muted)', borderColor: 'var(--admin-border)', height: 20, fontSize: '0.7rem' }} />
                    </TableCell>
                    <TableCell sx={{ color: 'var(--admin-text-muted)', borderBottomColor: 'var(--admin-border)' }}>{formatTime(row.time)}</TableCell>
                    <TableCell sx={{ borderBottomColor: 'var(--admin-border)', textAlign: 'right' }}>
                      <IconButton size="small" sx={{ color: 'var(--admin-text-muted)' }} onClick={() => handleViewProfile(row)} title="Xem gu">
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" sx={{ color: 'var(--admin-danger)' }} disabled={Boolean(actionBusy)} onClick={() => handleDeleteFeedback(row)} title="Xóa feedback">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" sx={{ color: '#f59e0b' }} disabled={Boolean(actionBusy)} onClick={() => handleHideMovie(row)} title="Ẩn phim">
                        <VisibilityOffIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ color: 'var(--admin-text-muted)', borderBottomColor: 'var(--admin-border)', py: 4, textAlign: 'center' }}>
                      Chưa có feedback AI cho profile này.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      <Snackbar
        open={Boolean(toastMsg)}
        autoHideDuration={3000}
        onClose={() => setToastMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToastMsg('')} severity="success" sx={{ width: '100%' }}>
          {toastMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
