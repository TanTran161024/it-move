import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Alert, CircularProgress, Select, MenuItem, FormControl, Button, Chip, Stack } from '@mui/material';
import MovieIcon from '@mui/icons-material/Movie';
import CategoryIcon from '@mui/icons-material/Category';
import HomeIcon from '@mui/icons-material/Home';
import PeopleIcon from '@mui/icons-material/People';
import VisibilityIcon from '@mui/icons-material/Visibility';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import CommentIcon from '@mui/icons-material/Comment';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { getProfileHeaders } from '../../utils/profile';
import { API_URL } from '../../config/api';
import '../../pages/admin/AdminStyles.css';

const COLORS = ['#FFD600', '#42a5f5', '#66bb6a', '#ff7043', '#ab47bc', '#ec407a'];
const STATUS_COLORS = {
  new: '#ef4444',
  processing: '#ff9800',
  resolved: '#4caf50',
  rejected: '#f44336'
};

const REPORT_TYPE_LABELS = {
  playback: 'Video không phát',
  wrong_episode: 'Sai tập',
  audio: 'Âm thanh',
  subtitle: 'Phụ đề',
  dead_link: 'Link die',
  metadata: 'Thông tin phim',
  other: 'Khác',
};

export default function AdminDashboardStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('7d');
  const [aiHealth, setAiHealth] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/admin/dashboard-stats?range=${range}`, {
        headers: getProfileHeaders()
      });
      if (!response.ok) {
        if (response.status === 403) throw new Error('Không có quyền truy cập');
        throw new Error('Lỗi server khi lấy dữ liệu thống kê');
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  const fetchAiHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/admin/ai-health`, {
        headers: getProfileHeaders()
      });
      if (response.ok) setAiHealth(await response.json());
    } catch {
      setAiHealth(null);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchAiHealth();
  }, [fetchAiHealth]);

  const { overview, charts, recent_reports } = stats || {};

  const renderStatusBadge = (status) => {
    const meta = {
      new: { color: 'error', label: 'Mới' },
      processing: { color: 'warning', label: 'Đang xử lý' },
      open: { color: 'warning', label: 'Đang mở' },
      resolved: { color: 'success', label: 'Đã xử lý' },
      rejected: { color: 'error', label: 'Từ chối' },
    }[status] || { color: 'default', label: status };
    return <Chip label={meta.label} color={meta.color} size="small" variant="outlined" />;
  };

  const formatDateTime = (value) => {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  if (error) {
    return (
      <Box sx={{ width: '100%', maxWidth: '1200px', mx: 'auto', px: { xs: 1, md: 3 }, mt: 2 }}>
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
        <Button startIcon={<RefreshIcon />} onClick={fetchStats} variant="contained">Thử lại</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', mx: 'auto', px: { xs: 1, md: 3 }, mt: 2, pb: 6 }}>
      {/* Header */}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} mb={4} gap={2}>
        <div className="admin-section-header" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="admin-section-title">Thống kê & Báo cáo</h2>
            <p className="admin-section-subtitle">Tổng quan hoạt động hệ thống</p>
          </div>
        </div>
        
        <Stack direction="row" gap={2} alignItems="center">
          <Button startIcon={<RefreshIcon />} onClick={fetchStats} disabled={loading} sx={{ color: '#fff', '&:hover': { background: 'rgba(255,255,255,0.1)' } }}>
            Làm mới
          </Button>
          <FormControl size="small" sx={{ minWidth: 140, bgcolor: 'var(--admin-panel-bg)', borderRadius: 1 }}>
            <Select 
              value={range} 
              onChange={(e) => setRange(e.target.value)}
              sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
            >
              <MenuItem value="7d">7 ngày qua</MenuItem>
              <MenuItem value="30d">30 ngày qua</MenuItem>
              <MenuItem value="all">Tất cả thời gian</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      {loading && !stats && (
        <div className="admin-loading"><CircularProgress sx={{ color: 'var(--admin-accent)' }} /></div>
      )}

      {stats && (
        <>
          {/* Overview Cards */}
          <div className="admin-stats-grid" style={{ marginBottom: 28 }}>
            <div className="admin-stat-card accent-yellow">
              <div className="admin-stat-icon yellow"><MovieIcon /></div>
              <div className="admin-stat-label">Tổng phim</div>
              <div className="admin-stat-value">{overview.total_movies}</div>
            </div>
            <div className="admin-stat-card accent-blue">
              <div className="admin-stat-icon blue"><PlayCircleOutlineIcon /></div>
              <div className="admin-stat-label">Tổng tập phim</div>
              <div className="admin-stat-value">{overview.total_episodes}</div>
            </div>
            <div className="admin-stat-card accent-purple">
              <div className="admin-stat-icon purple"><VisibilityIcon /></div>
              <div className="admin-stat-label">Tổng lượt xem</div>
              <div className="admin-stat-value">{overview.total_views}</div>
            </div>
            <div className="admin-stat-card accent-green">
              <div className="admin-stat-icon green"><PeopleIcon /></div>
              <div className="admin-stat-label">Tổng người dùng</div>
              <div className="admin-stat-value">{overview.total_users}</div>
            </div>
          </div>

          <div className="admin-stats-grid" style={{ marginBottom: 28 }}>
            <div className="admin-stat-card accent-blue">
              <div className="admin-stat-icon blue"><TrendingUpIcon /></div>
              <div className="admin-stat-label">Phim đang chiếu</div>
              <div className="admin-stat-value">{overview.ongoing_movies}</div>
            </div>
            <div className="admin-stat-card accent-orange">
              <div className="admin-stat-icon orange"><ReportProblemIcon /></div>
              <div className="admin-stat-label">Báo lỗi cần xử lý</div>
              <div className="admin-stat-value">{overview.open_reports}</div>
            </div>
            <div className="admin-stat-card accent-green">
              <div className="admin-stat-icon green"><CommentIcon /></div>
              <div className="admin-stat-label">Bình luận mới ({range === 'all' ? 'Tổng' : range})</div>
              <div className="admin-stat-value">{overview.new_comments}</div>
            </div>
          </div>

          {aiHealth && (
            <div className="admin-stats-grid" style={{ marginBottom: 28 }}>
              <div className="admin-stat-card accent-purple">
                <div className="admin-stat-label">AI Chatbot</div>
                <div className="admin-stat-value">{aiHealth.status?.configured ? 'Gemini' : 'Rules'}</div>
                <div className="admin-stat-subtitle">Grounded DB · no fake movies</div>
              </div>
              <div className="admin-stat-card accent-blue">
                <div className="admin-stat-label">Phiên chat</div>
                <div className="admin-stat-value">{aiHealth.chat?.sessions?.total || 0}</div>
                <div className="admin-stat-subtitle">7 ngày: {aiHealth.chat?.sessions?.last_7_days || 0}</div>
              </div>
              <div className="admin-stat-card accent-green">
                <div className="admin-stat-label">Tin nhắn AI</div>
                <div className="admin-stat-value">{aiHealth.chat?.messages?.assistant || 0}</div>
                <div className="admin-stat-subtitle">Rule: {aiHealth.chat?.messages?.rule_based || 0}</div>
              </div>
              <div className="admin-stat-card accent-orange">
                <div className="admin-stat-label">Fallback</div>
                <div className="admin-stat-value">{aiHealth.chat?.messages?.fallback || 0}</div>
                <div className="admin-stat-subtitle">{aiHealth.chat?.persisted ? 'Đang lưu session' : 'Chưa chạy migration'}</div>
              </div>
            </div>
          )}

          {aiHealth && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.35fr 1fr' }, gap: 3, mb: 4 }}>
              <div className="admin-panel">
                <div className="admin-panel-title"><CommentIcon sx={{ color: 'var(--admin-accent)' }} /> Câu hỏi chatbot gần đây</div>
                {aiHealth.chat?.questions?.recent?.length > 0 ? (
                  <div className="admin-table-wrap">
                    {aiHealth.chat.questions.recent.slice(0, 6).map((question, index) => (
                      <div key={`${question.session_id}-${index}`} className="admin-table-row" style={{ gap: 12 }}>
                        <Box sx={{ flex: 1.6, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {question.content}
                          </Typography>
                        </Box>
                        <Box sx={{ flex: 0.45, color: '#aaa', fontSize: 13, textAlign: 'right' }}>
                          {formatDateTime(question.created_at)}
                        </Box>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Typography sx={{ color: '#888', textAlign: 'center', py: 4 }}>Chưa có câu hỏi chatbot.</Typography>
                )}
              </div>

              <div className="admin-panel">
                <div className="admin-panel-title"><TrendingUpIcon sx={{ color: 'var(--admin-accent)' }} /> Câu hỏi lặp nhiều</div>
                {aiHealth.chat?.questions?.top?.length > 0 ? (
                  <Stack spacing={1.2}>
                    {aiHealth.chat.questions.top.slice(0, 6).map((question, index) => (
                      <Box key={`${question.question}-${index}`} sx={{ display: 'flex', alignItems: 'center', gap: 1.2, p: 1.25, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Chip label={question.total} size="small" sx={{ bgcolor: 'rgba(99,102,241,0.16)', color: '#c7d2fe', fontWeight: 900 }} />
                        <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {question.question}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Typography sx={{ color: '#888', textAlign: 'center', py: 4 }}>Chưa có dữ liệu lặp.</Typography>
                )}
              </div>
            </Box>
          )}

          {/* Charts Row 1 */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3, mb: 4 }}>
            <div className="admin-panel">
              <div className="admin-panel-title"><TrendingUpIcon sx={{ color: 'var(--admin-accent)' }} /> Biểu đồ lượt xem</div>
              {charts.daily_views.length > 0 ? (
                <Box sx={{ height: 300, mt: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={charts.daily_views}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" stroke="#888" tickFormatter={(v) => new Date(v).toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'})} />
                      <YAxis stroke="#888" />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }}
                        labelFormatter={(v) => new Date(v).toLocaleDateString('vi-VN')}
                      />
                      <Line type="monotone" dataKey="views" name="Lượt xem" stroke="var(--admin-accent)" strokeWidth={3} dot={{ r: 4, fill: 'var(--admin-accent)' }} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Typography sx={{ color: '#888', textAlign: 'center', py: 8 }}>Chưa có dữ liệu</Typography>
              )}
            </div>

            <div className="admin-panel">
              <div className="admin-panel-title"><CategoryIcon sx={{ color: 'var(--admin-accent)' }} /> Top Thể loại</div>
              {charts.top_genres.length > 0 ? (
                <Box sx={{ height: 300, mt: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={charts.top_genres} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="views">
                        {charts.top_genres.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Typography sx={{ color: '#888', textAlign: 'center', py: 8 }}>Chưa có dữ liệu</Typography>
              )}
            </div>
          </Box>

          {/* Charts Row 2 */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 3, mb: 4 }}>
            {/* Top Movies */}
            <div className="admin-panel">
              <div className="admin-panel-title"><VisibilityIcon sx={{ color: 'var(--admin-accent)' }} /> Top phim xem nhiều</div>
              {charts.top_movies.length > 0 ? (
                <div className="admin-data-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                  {charts.top_movies.slice(0, 4).map(movie => (
                    <div key={movie.id} className="admin-movie-card">
                      <img src={movie.poster_url} alt={movie.title} />
                      <div className="admin-movie-card-body" style={{ padding: '8px' }}>
                        <div className="admin-movie-card-title" style={{ fontSize: '13px' }}>{movie.title}</div>
                        <div className="admin-movie-card-meta">{movie.views || 0} lượt xem</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Typography sx={{ color: '#888', textAlign: 'center', py: 4 }}>Chưa có dữ liệu</Typography>
              )}
            </div>

            {/* Movie Types */}
            <div className="admin-panel">
              <div className="admin-panel-title"><MovieIcon sx={{ color: 'var(--admin-accent)' }} /> Tỉ lệ Phim lẻ / Phim bộ</div>
              <Box sx={{ height: 220, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={charts.movie_types} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                      {charts.movie_types.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#42a5f5' : '#FFD600'} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </div>

            {/* Report Stats */}
            <div className="admin-panel">
              <div className="admin-panel-title"><ReportProblemIcon sx={{ color: 'var(--admin-accent)' }} /> Trạng thái Báo lỗi</div>
              <Box sx={{ height: 220, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[charts.report_stats]} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                    <XAxis type="number" stroke="#888" />
                    <YAxis type="category" dataKey="name" hide />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }} />
                    <Legend />
                    <Bar dataKey="new" name="Mới" stackId="a" fill={STATUS_COLORS.new} barSize={40} />
                    <Bar dataKey="processing" name="Đang xử lý" stackId="a" fill={STATUS_COLORS.processing} />
                    <Bar dataKey="resolved" name="Đã xử lý" stackId="a" fill={STATUS_COLORS.resolved} />
                    <Bar dataKey="rejected" name="Từ chối" stackId="a" fill={STATUS_COLORS.rejected} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </div>
          </Box>

          {/* Top Countries */}
          <div className="admin-panel" style={{ marginBottom: '32px' }}>
            <div className="admin-panel-title"><HomeIcon sx={{ color: 'var(--admin-accent)' }} /> Top Quốc gia</div>
            {charts.top_countries.length > 0 ? (
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {charts.top_countries.map((country, idx) => {
                  const maxViews = Math.max(...charts.top_countries.map(c => c.views), 1);
                  return (
                    <Box key={country.name} sx={{ flex: '1 1 300px', mb: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2">{country.name}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{country.views}</Typography>
                      </Box>
                      <div className="admin-bar-track">
                        <div className="admin-bar-fill" style={{ width: `${(country.views / maxViews) * 100}%`, backgroundColor: COLORS[idx % COLORS.length] }} />
                      </div>
                    </Box>
                  );
                })}
              </Box>
            ) : (
              <Typography sx={{ color: '#888', textAlign: 'center', py: 4 }}>Chưa có dữ liệu</Typography>
            )}
          </div>

          {/* Recent Reports Table */}
          <div className="admin-panel">
            <div className="admin-panel-title"><ReportProblemIcon sx={{ color: 'var(--admin-accent)' }} /> Danh sách báo lỗi gần đây</div>
            {recent_reports.length > 0 ? (
              <div className="admin-table-wrap">
                <div className="admin-table-header">
                  <Box sx={{ flex: 2 }}>Phim / Tập</Box>
                  <Box sx={{ flex: 2 }}>Lý do</Box>
                  <Box sx={{ flex: 1 }}>Người gửi</Box>
                  <Box sx={{ flex: 1 }}>Trạng thái</Box>
                  <Box sx={{ flex: 1 }}>Ngày gửi</Box>
                </div>
                {recent_reports.map(report => (
                  <div key={report.id} className="admin-table-row">
                    <Box sx={{ flex: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{report.movie_title || 'N/A'}</Typography>
                      {report.episode_id && <Typography variant="caption" sx={{ color: '#888' }}>Tập ID: {report.episode_id}</Typography>}
                    </Box>
                    <Box sx={{ flex: 2 }}>
                      <Typography variant="body2">{report.reason}</Typography>
                      {report.report_type && (
                        <Typography variant="caption" sx={{ color: '#fbbf24', display: 'block' }}>
                          {REPORT_TYPE_LABELS[report.report_type] || report.report_type}
                        </Typography>
                      )}
                      {report.description && <Typography variant="caption" sx={{ color: '#aaa', display: 'block' }}>{report.description}</Typography>}
                    </Box>
                    <Box sx={{ flex: 1, color: '#aaa', fontSize: 14 }}>{report.reporter_name || 'Khách'}</Box>
                    <Box sx={{ flex: 1 }}>{renderStatusBadge(report.status)}</Box>
                    <Box sx={{ flex: 1, color: '#aaa', fontSize: 13 }}>{new Date(report.created_at).toLocaleDateString('vi-VN')}</Box>
                  </div>
                ))}
              </div>
            ) : (
              <Typography sx={{ color: '#888', textAlign: 'center', py: 4 }}>Không có báo cáo lỗi nào trong khoảng thời gian này.</Typography>
            )}
          </div>
        </>
      )}
    </Box>
  );
}


