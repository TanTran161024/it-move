import { useEffect, useState } from 'react';
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

const API = 'http://localhost:5000/api';

export default function AdminFeedbackManager() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const headers = { 'x-user-id': user.id };
  const [comments, setComments] = useState([]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');

  const fetchData = async () => {
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
  };

  useEffect(() => {
    fetchData();
  }, []);

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
    <Box sx={{ color: '#fff', mt: 4, maxWidth: '1400px', mx: 'auto' }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 800, mb: 3 }}>
        Quản lý phản hồi phim
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ bgcolor: '#23242a', borderRadius: 3, p: 3, mb: 4, boxShadow: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 2, color: '#FFD600' }}>
          Bình luận phim
        </Typography>
        {comments.length === 0 ? (
          <Typography color="#aaa">Chưa có bình luận nào.</Typography>
        ) : comments.map((comment) => (
          <Box key={comment.id} sx={{ bgcolor: '#181a20', borderRadius: 2, p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap', mb: 1 }}>
              <Typography sx={{ fontWeight: 800 }}>{comment.movie_title}</Typography>
              <Typography color="#aaa">{new Date(comment.created_at).toLocaleString('vi-VN')}</Typography>
            </Box>
            <Typography color="#cfd5e2" sx={{ mb: 1 }}>
              {comment.username} - {comment.email}
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-line', mb: 2 }}>{comment.content}</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Select
                size="small"
                value={comment.status}
                onChange={(e) => updateCommentStatus(comment.id, e.target.value)}
                sx={{ color: '#fff', bgcolor: '#23242a', minWidth: 130, '& .MuiSvgIcon-root': { color: '#fff' } }}
              >
                <MenuItem value="visible">Hiển thị</MenuItem>
                <MenuItem value="hidden">Ẩn</MenuItem>
              </Select>
              <Button color="error" variant="outlined" onClick={() => deleteComment(comment.id)}>
                Xóa
              </Button>
            </Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ bgcolor: '#23242a', borderRadius: 3, p: 3, boxShadow: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 2, color: '#FFD600' }}>
          Báo lỗi phim
        </Typography>
        {reports.length === 0 ? (
          <Typography color="#aaa">Chưa có báo lỗi nào.</Typography>
        ) : reports.map((report) => (
          <Box key={report.id} sx={{ bgcolor: '#181a20', borderRadius: 2, p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap', mb: 1 }}>
              <Typography sx={{ fontWeight: 800 }}>
                {report.movie_title}{report.episode_number ? ` - Tập ${report.episode_number}` : ''}
              </Typography>
              <Typography color="#aaa">{new Date(report.created_at).toLocaleString('vi-VN')}</Typography>
            </Box>
            <Typography color="#cfd5e2" sx={{ mb: 1 }}>
              Người gửi: {report.username || 'Khách'} {report.email ? `- ${report.email}` : ''}
            </Typography>
            <Typography sx={{ mb: 1 }}><strong>Lý do:</strong> {report.reason}</Typography>
            {report.description && (
              <Typography sx={{ whiteSpace: 'pre-line', mb: 2 }}>{report.description}</Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Select
                size="small"
                value={report.status}
                onChange={(e) => updateReport(report, e.target.value)}
                sx={{ color: '#fff', bgcolor: '#23242a', minWidth: 130, '& .MuiSvgIcon-root': { color: '#fff' } }}
              >
                <MenuItem value="open">Đang mở</MenuItem>
                <MenuItem value="resolved">Đã xử lý</MenuItem>
                <MenuItem value="rejected">Từ chối</MenuItem>
              </Select>
              <TextField
                size="small"
                defaultValue={report.admin_note || ''}
                placeholder="Ghi chú admin"
                onBlur={(e) => updateReport(report, report.status, e.target.value)}
                sx={{ minWidth: 260, bgcolor: '#23242a', input: { color: '#fff' }, '& fieldset': { borderColor: '#444' } }}
              />
              <Button color="error" variant="outlined" onClick={() => deleteReport(report.id)}>
                Xóa
              </Button>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
