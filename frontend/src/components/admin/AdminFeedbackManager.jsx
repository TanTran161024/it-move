import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { API_BASE_URL as API } from '../../config/api';
import '../../pages/admin/AdminStyles.css';

const darkSelectSx = { 
  color: '#fff', 
  bgcolor: 'var(--admin-card)', 
  minWidth: 130, 
  borderRadius: 2,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--admin-border)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--admin-accent)' },
  '& .MuiSvgIcon-root': { color: 'var(--admin-text-muted)' } 
};

export default function AdminFeedbackManager() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const headers = useMemo(() => ({ 'x-user-id': user.id }), [user.id]);
  const [comments, setComments] = useState([]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setError('');
      const [commentsRes, reportsRes] = await Promise.all([
        axios.get(`${API}/admin/comments`, { headers }),
        axios.get(`${API}/admin/reports`, { headers }),
      ]);
      setComments(commentsRes.data);
      setReports(reportsRes.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu quản lý.');
    }
  }, [headers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateCommentStatus = async (id, status) => {
    await axios.patch(`${API}/admin/comments/${id}`, { status }, { headers });
    fetchData();
  };

  const deleteComment = async (id) => {
    if (!window.confirm('Xóa bình luận này?')) return;
    await axios.delete(`${API}/admin/comments/${id}`, { headers });
    fetchData();
  };

  const updateReport = async (report, status, adminNote = report.admin_note || '') => {
    await axios.patch(`${API}/admin/reports/${report.id}`, { status, admin_note: adminNote }, { headers });
    fetchData();
  };

  const deleteReport = async (id) => {
    if (!window.confirm('Xóa báo lỗi này?')) return;
    await axios.delete(`${API}/admin/reports/${id}`, { headers });
    fetchData();
  };

  return (
    <Box sx={{ maxWidth: '1400px', mx: 'auto', p: { xs: 1, md: 3 } }}>
      <div className="admin-section-header">
        <div>
          <h2 className="admin-section-title">Quản lý phản hồi</h2>
          <p className="admin-section-subtitle">Bình luận & Báo lỗi từ người dùng</p>
        </div>
      </div>
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <div className="admin-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 30 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--admin-border)', background: 'rgba(0,0,0,0.2)' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'var(--admin-accent)' }}>
            Bình luận phim
          </Typography>
        </div>
        <Box sx={{ p: 3 }}>
          {comments.length === 0 ? (
            <div className="admin-empty">
              <Typography>Chưa có bình luận nào.</Typography>
            </div>
          ) : comments.map((comment) => (
            <Box key={comment.id} sx={{ bgcolor: 'var(--admin-surface)', borderRadius: 2, p: 2, mb: 2, border: '1px solid var(--admin-border)' }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap', mb: 1 }}>
                <Typography sx={{ fontWeight: 800, color: '#fff' }}>{comment.movie_title}</Typography>
                <Typography sx={{ color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>{new Date(comment.created_at).toLocaleString('vi-VN')}</Typography>
              </Box>
              <Typography sx={{ color: 'var(--admin-accent-hover)', mb: 1, fontSize: '0.9rem', fontWeight: 600 }}>
                {comment.username} <span style={{ color: 'var(--admin-text-muted)', fontWeight: 400 }}>— {comment.email}</span>
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-line', mb: 2, color: 'var(--admin-text)' }}>{comment.content}</Typography>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', pt: 1, borderTop: '1px dashed rgba(255,255,255,0.05)' }}>
                <Select
                  size="small"
                  value={comment.status}
                  onChange={(e) => updateCommentStatus(comment.id, e.target.value)}
                  sx={darkSelectSx}
                >
                  <MenuItem value="visible">Hiển thị</MenuItem>
                  <MenuItem value="hidden">Ẩn</MenuItem>
                </Select>
                <Button color="error" variant="outlined" size="small" onClick={() => deleteComment(comment.id)} sx={{ borderRadius: 2 }}>
                  Xóa
                </Button>
                {comment.status === 'visible' ? (
                  <span className="admin-badge success" style={{ marginLeft: 'auto' }}>Đang hiển thị</span>
                ) : (
                  <span className="admin-badge warning" style={{ marginLeft: 'auto' }}>Đang ẩn</span>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </div>

      <div className="admin-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--admin-border)', background: 'rgba(0,0,0,0.2)' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'var(--admin-danger)' }}>
            Báo lỗi phim
          </Typography>
        </div>
        <Box sx={{ p: 3 }}>
          {reports.length === 0 ? (
            <div className="admin-empty">
              <Typography>Chưa có báo lỗi nào.</Typography>
            </div>
          ) : reports.map((report) => (
            <Box key={report.id} sx={{ bgcolor: 'var(--admin-surface)', borderRadius: 2, p: 2, mb: 2, border: '1px solid var(--admin-border)' }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap', mb: 1 }}>
                <Typography sx={{ fontWeight: 800, color: '#fff', fontSize: '1.1rem' }}>
                  {report.movie_title}{report.episode_number ? ` - Tập ${report.episode_number}` : ''}
                </Typography>
                <Typography sx={{ color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>{new Date(report.created_at).toLocaleString('vi-VN')}</Typography>
              </Box>
              <Typography sx={{ color: 'var(--admin-accent-hover)', mb: 2, fontSize: '0.9rem', fontWeight: 600 }}>
                {report.username || 'Khách'} {report.email ? <span style={{ color: 'var(--admin-text-muted)', fontWeight: 400 }}>— {report.email}</span> : ''}
              </Typography>
              <Box sx={{ bgcolor: 'rgba(239, 68, 68, 0.05)', p: 1.5, borderRadius: 2, borderLeft: '3px solid var(--admin-danger)', mb: 2 }}>
                <Typography sx={{ mb: 0.5, color: 'var(--admin-danger)', fontWeight: 600 }}>Lý do: {report.reason}</Typography>
                {report.description && (
                  <Typography sx={{ whiteSpace: 'pre-line', color: 'var(--admin-text)', fontSize: '0.9rem' }}>{report.description}</Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', pt: 1 }}>
                <Select
                  size="small"
                  value={report.status}
                  onChange={(e) => updateReport(report, e.target.value)}
                  sx={darkSelectSx}
                >
                  <MenuItem value="open">Đang mở</MenuItem>
                  <MenuItem value="resolved">Đã xử lý</MenuItem>
                  <MenuItem value="rejected">Từ chối</MenuItem>
                </Select>
                <TextField
                  size="small"
                  defaultValue={report.admin_note || ''}
                  placeholder="Ghi chú admin..."
                  onBlur={(e) => updateReport(report, report.status, e.target.value)}
                  sx={{ 
                    minWidth: 260, 
                    bgcolor: 'var(--admin-card)', 
                    input: { color: '#fff' }, 
                    '& fieldset': { borderColor: 'var(--admin-border)' },
                    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                    '&.Mui-focused fieldset': { borderColor: 'var(--admin-accent)' },
                    borderRadius: 2
                  }}
                />
                <Button color="error" variant="outlined" size="small" onClick={() => deleteReport(report.id)} sx={{ borderRadius: 2 }}>
                  Xóa
                </Button>
                
                {report.status === 'open' && <span className="admin-badge danger" style={{ marginLeft: 'auto' }}>Đang mở</span>}
                {report.status === 'resolved' && <span className="admin-badge success" style={{ marginLeft: 'auto' }}>Đã xử lý</span>}
                {report.status === 'rejected' && <span className="admin-badge warning" style={{ marginLeft: 'auto' }}>Từ chối</span>}
              </Box>
            </Box>
          ))}
        </Box>
      </div>
    </Box>
  );
}
