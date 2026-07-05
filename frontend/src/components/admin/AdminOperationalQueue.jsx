import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Chip, IconButton, Tooltip, CircularProgress } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import MovieIcon from '@mui/icons-material/Movie';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import BugReportIcon from '@mui/icons-material/BugReport';
import { API_URL } from '../../config/api';

const TYPE_CONFIG = {
  movie_report: { label: 'Video Lỗi', color: 'error', icon: <BugReportIcon fontSize="small" /> },
  comment_report: { label: 'Comment', color: 'warning', icon: <ReportProblemIcon fontSize="small" /> },
  missing_metadata: { label: 'Metadata', color: 'info', icon: <WarningAmberIcon fontSize="small" /> },
  missing_episodes: { label: 'Chưa có tập', color: 'secondary', icon: <MovieIcon fontSize="small" /> },
  missing_subtitle: { label: 'Thiếu Sub', color: 'info', icon: <SubtitlesIcon fontSize="small" /> },
};

function formatTimeAgo(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export default function AdminOperationalQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await fetch(`${API_URL}/admin/dashboard-queue`, {
        headers: { 'x-user-id': user.id }
      });
      if (res.ok) setQueue(await res.json());
    } catch (err) {
      console.error('Queue fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  if (loading) {
    return <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{ color: 'var(--admin-accent)' }} /></Box>;
  }

  if (queue.length === 0) {
    return <Typography sx={{ color: 'var(--admin-text-muted)', textAlign: 'center', py: 4 }}>Không có tác vụ nào trong hàng đợi.</Typography>;
  }

  return (
    <div className="admin-table-wrap">
      <div className="admin-table-header">
        <Box sx={{ flex: 1 }}>Phân loại</Box>
        <Box sx={{ flex: 3 }}>Chi tiết tác vụ</Box>
        <Box sx={{ flex: 1, textAlign: 'right' }}>Thời gian</Box>
        <Box sx={{ flex: 1, textAlign: 'center' }}>Thao tác</Box>
      </div>
      {queue.map((item, idx) => {
        const config = TYPE_CONFIG[item.type] || { label: 'Khác', color: 'default', icon: <WarningAmberIcon /> };
        return (
          <div key={`${item.type}-${item.item_id}-${idx}`} className="admin-table-row">
            <Box sx={{ flex: 1 }}>
              <Chip
                icon={config.icon}
                label={config.label}
                color={config.color}
                size="small"
                variant="outlined"
                sx={{
                  color: 'var(--admin-text-soft)',
                  borderColor: 'var(--admin-border-strong)',
                  fontWeight: 650,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            </Box>
            <Box sx={{ flex: 3, display: 'flex', flexDirection: 'column', gap: 0.5, pr: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--admin-text-strong)', display: 'flex', alignItems: 'center', gap: 1 }}>
                {item.movie_title || 'N/A'} {item.title && <span style={{ color: 'var(--admin-text-muted)', fontWeight: 500 }}>- {item.title}</span>}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {item.content}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, color: 'var(--admin-text-muted)', fontSize: '13px', textAlign: 'right' }}>
              {formatTimeAgo(item.created_at)}
            </Box>
            <Box sx={{ flex: 1, display: 'flex', gap: 1, justifyContent: 'center' }}>
              {item.movie_id && (
                <Tooltip title="Mở phim">
                  <IconButton size="small" component="a" href={`/movies/${item.movie_id}`} target="_blank" sx={{ color: 'var(--admin-accent)' }}>
                    <MovieIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {item.movie_id && item.episode_number && (
                <Tooltip title="Test Link / Mở tập">
                  <IconButton size="small" component="a" href={`/watch/${item.movie_id}?ep=${item.episode_number}`} target="_blank" sx={{ color: 'var(--admin-accent)' }}>
                    <PlayCircleOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </div>
        );
      })}
    </div>
  );
}
