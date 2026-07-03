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
  minWidth: 138,
  borderRadius: 2,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--admin-border)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--admin-accent)' },
  '& .MuiSvgIcon-root': { color: 'var(--admin-text-muted)' },
};

const commentStatusMeta = {
  pending: { label: 'Chờ duyệt', className: 'warning' },
  visible: { label: 'Đang hiển thị', className: 'success' },
  hidden: { label: 'Đang ẩn', className: 'warning' },
  deleted: { label: 'Đã xóa', className: 'danger' },
};

const reportStatusMeta = {
  new: { label: 'Mới', className: 'danger' },
  processing: { label: 'Đang xử lý', className: 'warning' },
  resolved: { label: 'Đã xử lý', className: 'success' },
  rejected: { label: 'Từ chối', className: 'warning' },
};

const reportTypeLabels = {
  all: 'Tất cả loại lỗi',
  playback: 'Video không phát',
  wrong_episode: 'Sai tập',
  audio: 'Âm thanh lỗi',
  subtitle: 'Phụ đề lỗi',
  dead_link: 'Link die',
  metadata: 'Thông tin phim sai',
  other: 'Khác',
};

function MetricChip({ children, tone = 'neutral' }) {
  const palette = {
    neutral: 'rgba(148, 163, 184, 0.14)',
    success: 'rgba(34, 197, 94, 0.14)',
    warning: 'rgba(245, 158, 11, 0.16)',
    danger: 'rgba(239, 68, 68, 0.16)',
  };

  return (
    <span
      style={{ background: palette[tone] || palette.neutral }}
      className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white/75"
    >
      {children}
    </span>
  );
}

function StatusBadge({ status, type = 'comment' }) {
  const meta = type === 'report'
    ? reportStatusMeta[status] || reportStatusMeta.new
    : commentStatusMeta[status] || commentStatusMeta.visible;

  return <span className={`admin-badge ${meta.className}`}>{meta.label}</span>;
}

export default function AdminFeedbackManager() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const headers = useMemo(() => ({ 'x-user-id': user.id }), [user.id]);
  const [comments, setComments] = useState([]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportStatusFilter, setReportStatusFilter] = useState('all');
  const [reportTypeFilter, setReportTypeFilter] = useState('all');
  const [reportPriorityFilter, setReportPriorityFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setNotice('');
      const reportParams = new URLSearchParams();
      if (reportStatusFilter !== 'all') reportParams.set('status', reportStatusFilter);
      if (reportTypeFilter !== 'all') reportParams.set('type', reportTypeFilter);
      if (reportPriorityFilter !== 'all') reportParams.set('priority', reportPriorityFilter);
      const [commentsRes, reportsRes] = await Promise.all([
        axios.get(`${API}/admin/comments`, { headers }),
        axios.get(`${API}/admin/reports${reportParams.toString() ? `?${reportParams}` : ''}`, { headers }),
      ]);
      setComments(Array.isArray(commentsRes.data) ? commentsRes.data : []);
      setReports(Array.isArray(reportsRes.data) ? reportsRes.data : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu quản lý.');
    } finally {
      setLoading(false);
    }
  }, [headers, reportPriorityFilter, reportStatusFilter, reportTypeFilter]);

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
    const res = await axios.patch(`${API}/admin/reports/${report.id}`, { status, admin_note: adminNote }, { headers });
    if (res.data?.notification_sent) {
      setNotice('Đã xử lý report và gửi thông báo cho người dùng.');
    }
    fetchData();
  };

  const testReportLink = async (report) => {
    try {
      const res = await axios.post(`${API}/admin/reports/${report.id}/test-link`, {}, { headers });
      const payload = res.data || {};
      alert(`${payload.ok ? 'OK' : 'Lỗi'}: ${payload.message || 'Đã kiểm tra link'}${payload.status ? ` (HTTP ${payload.status})` : ''}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể test link video.');
    }
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
          <p className="admin-section-subtitle">Duyệt bình luận, xử lý báo cáo và kiểm soát nội dung người dùng.</p>
        </div>
        <Button variant="contained" onClick={fetchData} disabled={loading} sx={{ borderRadius: 2, fontWeight: 800 }}>
          Làm mới
        </Button>
      </div>
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 3 }}>{notice}</Alert>}

      <div className="admin-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 30 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--admin-border)', background: 'rgba(0,0,0,0.2)' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'var(--admin-accent)' }}>
            Bình luận phim
          </Typography>
          <Typography sx={{ mt: 0.5, color: 'var(--admin-text-muted)', fontSize: '0.9rem' }}>
            Duyệt, ẩn hoặc xóa bình luận bị báo cáo. Bình luận đủ 3 báo cáo sẽ chuyển sang chờ duyệt.
          </Typography>
        </div>
        <Box sx={{ p: 3 }}>
          {comments.length === 0 ? (
            <div className="admin-empty">
              <Typography>Chưa có bình luận nào.</Typography>
            </div>
          ) : comments.map((comment) => {
            const openReports = Number(comment.open_report_count || 0);
            return (
              <Box
                key={comment.id}
                sx={{
                  bgcolor: 'var(--admin-surface)',
                  borderRadius: 3,
                  p: 2.5,
                  mb: 2,
                  border: openReports ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid var(--admin-border)',
                }}
              >
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap', mb: 1 }}>
                  <div>
                    <Typography sx={{ fontWeight: 900, color: '#fff' }}>{comment.movie_title}</Typography>
                    <Typography sx={{ color: 'var(--admin-accent-hover)', mt: 0.5, fontSize: '0.9rem', fontWeight: 700 }}>
                      {comment.username}
                      <span style={{ color: 'var(--admin-text-muted)', fontWeight: 400 }}> - {comment.email}</span>
                    </Typography>
                  </div>
                  <Typography sx={{ color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
                    {new Date(comment.created_at).toLocaleString('vi-VN')}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                  <StatusBadge status={comment.status} />
                  {comment.is_spoiler ? <MetricChip tone="warning">Spoiler</MetricChip> : null}
                  {comment.parent_id ? <MetricChip>Trả lời #{comment.parent_id}</MetricChip> : null}
                  <MetricChip>{Number(comment.like_count || 0)} like</MetricChip>
                  <MetricChip>{Number(comment.reply_count || 0)} trả lời</MetricChip>
                  <MetricChip tone={openReports ? 'danger' : 'neutral'}>{openReports} báo cáo mở</MetricChip>
                </Box>

                <Typography sx={{ whiteSpace: 'pre-line', mb: 2, color: 'var(--admin-text)', lineHeight: 1.7 }}>
                  {comment.content}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', pt: 1.5, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
                  <Select
                    size="small"
                    value={comment.status}
                    onChange={(e) => updateCommentStatus(comment.id, e.target.value)}
                    sx={darkSelectSx}
                  >
                    <MenuItem value="pending">Chờ duyệt</MenuItem>
                    <MenuItem value="visible">Hiển thị</MenuItem>
                    <MenuItem value="hidden">Ẩn</MenuItem>
                    <MenuItem value="deleted">Đã xóa</MenuItem>
                  </Select>
                  <Button variant="contained" size="small" onClick={() => updateCommentStatus(comment.id, 'visible')} sx={{ borderRadius: 2, fontWeight: 800 }}>
                    Duyệt
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => updateCommentStatus(comment.id, 'hidden')} sx={{ borderRadius: 2, fontWeight: 800 }}>
                    Ẩn
                  </Button>
                  <Button color="error" variant="outlined" size="small" onClick={() => deleteComment(comment.id)} sx={{ borderRadius: 2, fontWeight: 800 }}>
                    Xóa
                  </Button>
                </Box>
              </Box>
            );
          })}
        </Box>
      </div>

      <div className="admin-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--admin-border)', background: 'rgba(0,0,0,0.2)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <Typography variant="h6" sx={{ fontWeight: 800, color: 'var(--admin-danger)' }}>
                Báo lỗi phim
              </Typography>
              <Typography sx={{ mt: 0.5, color: 'var(--admin-text-muted)', fontSize: '0.9rem' }}>
                Ưu tiên các lỗi nhiều người báo, test link nhanh và ghi chú khi xử lý.
              </Typography>
            </div>
            <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
              <Select size="small" value={reportStatusFilter} onChange={(e) => setReportStatusFilter(e.target.value)} sx={darkSelectSx}>
                <MenuItem value="all">Tất cả trạng thái</MenuItem>
                <MenuItem value="new">Mới</MenuItem>
                <MenuItem value="processing">Đang xử lý</MenuItem>
                <MenuItem value="resolved">Đã xử lý</MenuItem>
                <MenuItem value="rejected">Từ chối</MenuItem>
              </Select>
              <Select size="small" value={reportTypeFilter} onChange={(e) => setReportTypeFilter(e.target.value)} sx={{ ...darkSelectSx, minWidth: 180 }}>
                {Object.entries(reportTypeLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>{label}</MenuItem>
                ))}
              </Select>
              <Select size="small" value={reportPriorityFilter} onChange={(e) => setReportPriorityFilter(e.target.value)} sx={darkSelectSx}>
                <MenuItem value="all">Tất cả ưu tiên</MenuItem>
                <MenuItem value="high">Nhiều người báo</MenuItem>
              </Select>
            </Box>
          </Box>
        </div>
        <Box sx={{ p: 3 }}>
          {reports.length === 0 ? (
            <div className="admin-empty">
              <Typography>Chưa có báo lỗi nào.</Typography>
            </div>
          ) : reports.map((report) => (
            <Box key={report.id} sx={{ bgcolor: 'var(--admin-surface)', borderRadius: 3, p: 2.5, mb: 2, border: '1px solid var(--admin-border)' }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap', mb: 1 }}>
                <Typography sx={{ fontWeight: 900, color: '#fff', fontSize: '1.1rem' }}>
                  {report.movie_title}{report.episode_number ? ` - Tập ${report.episode_number}` : ''}
                </Typography>
                <Typography sx={{ color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>{new Date(report.created_at).toLocaleString('vi-VN')}</Typography>
              </Box>
              <Typography sx={{ color: 'var(--admin-accent-hover)', mb: 2, fontSize: '0.9rem', fontWeight: 700 }}>
                {report.username || 'Khách'} {report.email ? <span style={{ color: 'var(--admin-text-muted)', fontWeight: 400 }}>- {report.email}</span> : ''}
              </Typography>
              <Box sx={{ bgcolor: 'rgba(239, 68, 68, 0.05)', p: 1.5, borderRadius: 2, borderLeft: '3px solid var(--admin-danger)', mb: 2 }}>
                <Typography sx={{ mb: 0.5, color: 'var(--admin-danger)', fontWeight: 700 }}>Lý do: {report.reason}</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  <MetricChip tone="warning">{reportTypeLabels[report.report_type] || report.report_type || 'Khác'}</MetricChip>
                  <MetricChip tone={Number(report.active_report_count || 0) >= 2 ? 'danger' : 'neutral'}>
                    {Number(report.active_report_count || 0)} report đang mở
                  </MetricChip>
                  <MetricChip>{Number(report.duplicate_count || 1)} report cùng lỗi</MetricChip>
                  {report.notified_at ? <MetricChip tone="success">Đã thông báo user</MetricChip> : null}
                </Box>
                {report.description && (
                  <Typography sx={{ whiteSpace: 'pre-line', color: 'var(--admin-text)', fontSize: '0.9rem' }}>{report.description}</Typography>
                )}
                {report.video_url && (
                  <Typography sx={{ mt: 1, color: 'var(--admin-text-muted)', fontSize: '0.82rem', wordBreak: 'break-all' }}>
                    Link tập: {report.video_url}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', pt: 1 }}>
                <Select
                  size="small"
                  value={report.status}
                  onChange={(e) => updateReport(report, e.target.value)}
                  sx={darkSelectSx}
                >
                  <MenuItem value="new">Mới</MenuItem>
                  <MenuItem value="processing">Đang xử lý</MenuItem>
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
                    borderRadius: 2,
                  }}
                />
                <Button color="error" variant="outlined" size="small" onClick={() => deleteReport(report.id)} sx={{ borderRadius: 2, fontWeight: 800 }}>
                  Xóa
                </Button>
                <Button variant="outlined" size="small" onClick={() => testReportLink(report)} disabled={!report.video_url} sx={{ borderRadius: 2, fontWeight: 800 }}>
                  Test link
                </Button>
                {report.video_url && (
                  <Button variant="text" size="small" onClick={() => window.open(report.video_url, '_blank', 'noopener,noreferrer')} sx={{ borderRadius: 2, fontWeight: 800 }}>
                    Mở link
                  </Button>
                )}

                <div style={{ marginLeft: 'auto' }}>
                  <StatusBadge status={report.status} type="report" />
                </div>
              </Box>
            </Box>
          ))}
        </Box>
      </div>
    </Box>
  );
}
