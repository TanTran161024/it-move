import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress, Stack, Button, Collapse, IconButton } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CloseIcon from '@mui/icons-material/Close';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ImageNotSupportedIcon from '@mui/icons-material/ImageNotSupported';
import SubtitlesOffIcon from '@mui/icons-material/SubtitlesOff';
import ApiIcon from '@mui/icons-material/Api';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getProfileHeaders } from '../../utils/profile';
import { API_URL } from '../../config/api';
import '../../pages/admin/AdminStyles.css';

export default function AdminAlertCenter() {
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(true);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/admin/dashboard-alerts`, {
        headers: getProfileHeaders()
      });
      if (!response.ok) {
        throw new Error('Không thể tải dữ liệu cảnh báo');
      }
      const data = await response.json();
      setAlerts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  if (error) {
    return (
      <Box sx={{ mb: 4, p: 2, bgcolor: 'var(--admin-danger-soft)', border: '1px solid var(--admin-border)', borderRadius: 2 }}>
        <Typography color="error" variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ErrorOutlineIcon fontSize="small" /> Lỗi tải Alert Center: {error}
        </Typography>
        <Button size="small" onClick={fetchAlerts} sx={{ mt: 1, color: 'var(--admin-danger)' }}>Thử lại</Button>
      </Box>
    );
  }

  if (loading && !alerts) {
    return (
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center', p: 3, bgcolor: 'var(--admin-surface)', borderRadius: 2 }}>
        <CircularProgress size={24} sx={{ color: 'var(--admin-accent)' }} />
      </Box>
    );
  }

  if (!alerts) return null;

  // Tính tổng số mục cần xử lý
  const totalAlerts = 
    (alerts.new_reports > 0 ? 1 : 0) +
    (alerts.high_report_episodes > 0 ? 1 : 0) +
    (alerts.missing_images > 0 ? 1 : 0) +
    (alerts.missing_video_url > 0 ? 1 : 0) +
    (alerts.subtitle_import_errors > 0 ? 1 : 0) +
    (alerts.unconfigured_apis?.length > 0 ? 1 : 0);

  if (totalAlerts === 0) {
    return null; // Không hiển thị nếu không có cảnh báo
  }

  return (
    <Collapse in={open}>
      <Box 
        sx={{ 
          mb: 4, 
          bgcolor: 'var(--admin-surface)',
          border: '1px solid var(--admin-border)',
          borderRadius: 2,
          overflow: 'hidden'
        }}
      >
        <Box sx={{ 
          px: 2.5, 
          py: 1.5, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--admin-border)',
          bgcolor: 'var(--admin-bg-soft)'
        }}>
          <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--admin-text-strong)', display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningAmberIcon />
            Cần xử lý ngay ({totalAlerts})
          </Typography>
          <Stack direction="row" gap={1}>
            <IconButton size="small" onClick={fetchAlerts} sx={{ color: 'var(--admin-text-muted)' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'var(--admin-text-muted)' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>
        
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
            
            {alerts.new_reports > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: 'var(--admin-bg-soft)', borderRadius: 1.5, border: '1px solid var(--admin-border)' }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'var(--admin-danger-soft)', color: 'var(--admin-danger)', display: 'flex' }}>
                  <ReportProblemIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--admin-text-strong)', fontWeight: 700 }}>Report mới</Typography>
                  <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)', fontWeight: 650 }}>{alerts.new_reports} yêu cầu chờ xử lý</Typography>
                </Box>
              </Box>
            )}

            {alerts.high_report_episodes > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: 'var(--admin-bg-soft)', borderRadius: 1.5, border: '1px solid var(--admin-border)' }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'var(--admin-danger-soft)', color: 'var(--admin-danger)', display: 'flex' }}>
                  <ErrorOutlineIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--admin-text-strong)', fontWeight: 700 }}>Video lỗi nghiêm trọng</Typography>
                  <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)', fontWeight: 650 }}>{alerts.high_report_episodes} tập bị nhiều người báo</Typography>
                </Box>
              </Box>
            )}

            {alerts.missing_images > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: 'var(--admin-bg-soft)', borderRadius: 1.5, border: '1px solid var(--admin-border)' }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'var(--admin-warning-soft)', color: 'var(--admin-warning)', display: 'flex' }}>
                  <ImageNotSupportedIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--admin-text-strong)', fontWeight: 700 }}>Phim thiếu Poster/Backdrop</Typography>
                  <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)', fontWeight: 650 }}>{alerts.missing_images} phim chưa hoàn thiện</Typography>
                </Box>
              </Box>
            )}

            {alerts.missing_video_url > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: 'var(--admin-bg-soft)', borderRadius: 1.5, border: '1px solid var(--admin-border)' }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'var(--admin-warning-soft)', color: 'var(--admin-warning)', display: 'flex' }}>
                  <LinkOffIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--admin-text-strong)', fontWeight: 700 }}>Tập thiếu Video URL</Typography>
                  <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)', fontWeight: 650 }}>{alerts.missing_video_url} tập phim trống</Typography>
                </Box>
              </Box>
            )}

            {alerts.subtitle_import_errors > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: 'var(--admin-bg-soft)', borderRadius: 1.5, border: '1px solid var(--admin-border)' }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'var(--admin-warning-soft)', color: 'var(--admin-warning)', display: 'flex' }}>
                  <SubtitlesOffIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--admin-text-strong)', fontWeight: 700 }}>Phụ đề import lỗi</Typography>
                  <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)', fontWeight: 650 }}>{alerts.subtitle_import_errors} tệp gặp sự cố</Typography>
                </Box>
              </Box>
            )}

            {alerts.unconfigured_apis?.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: 'var(--admin-bg-soft)', borderRadius: 1.5, border: '1px solid var(--admin-border)' }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'var(--admin-info-soft)', color: 'var(--admin-info)', display: 'flex' }}>
                  <ApiIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--admin-text-strong)', fontWeight: 700 }}>API chưa cấu hình</Typography>
                  <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)', fontWeight: 650 }}>{alerts.unconfigured_apis.join(', ')}</Typography>
                </Box>
              </Box>
            )}

          </Box>
        </Box>
      </Box>
    </Collapse>
  );
}
