import React, { useCallback, useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, Button, Stack, Chip } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import TranslateIcon from '@mui/icons-material/Translate';
import SyncIcon from '@mui/icons-material/Sync';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { API_URL } from '../../config/api';
import { getProfileHeaders } from '../../utils/profile';

const toolCardSx = {
  bgcolor: 'var(--admin-card)',
  border: '1px solid var(--admin-border)',
  color: 'var(--admin-text)',
  height: '100%',
  boxShadow: 'var(--admin-shadow-soft)',
};

const mutedTextSx = {
  color: 'var(--admin-text-muted)',
  lineHeight: 1.55,
};

const statBoxSx = {
  p: 1.5,
  bgcolor: 'var(--admin-bg-soft)',
  border: '1px solid var(--admin-border)',
  borderRadius: 1.5,
};

const questionRowSx = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  bgcolor: 'var(--admin-bg-soft)',
  border: '1px solid var(--admin-border)',
  p: 1,
  borderRadius: 1.25,
};

const toolTitleSx = {
  fontWeight: 700,
  color: 'inherit',
};

export default function AdminAutomationHub({ aiHealth }) {
  const [localAiHealth, setLocalAiHealth] = useState(aiHealth || null);

  const fetchAiHealth = useCallback(async () => {
    if (aiHealth) {
      setLocalAiHealth(aiHealth);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/admin/ai-health`, {
        headers: getProfileHeaders(),
      });
      if (response.ok) {
        setLocalAiHealth(await response.json());
      }
    } catch {
      setLocalAiHealth(null);
    }
  }, [aiHealth]);

  useEffect(() => {
    fetchAiHealth();
  }, [fetchAiHealth]);

  const health = aiHealth || localAiHealth;

  const handleAction = (action) => {
    window.dispatchEvent(new CustomEvent('admin-action', { detail: action }));
  };

  return (
    <Box sx={{ mb: 4 }}>
      <div className="admin-panel">
        <div className="admin-panel-title">
          <AutoFixHighIcon sx={{ color: 'var(--admin-accent)' }} /> AI & Automation Hub
        </div>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Card sx={toolCardSx}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, color: 'var(--admin-accent)' }}>
                      <AutoFixHighIcon sx={{ mr: 1 }} />
                      <Typography variant="subtitle1" sx={toolTitleSx}>AI viết mô tả</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ ...mutedTextSx, mb: 2 }}>
                      Tạo nội dung mô tả tiếng Việt cho phim đang thiếu thông tin.
                    </Typography>
                    <Button variant="outlined" size="small" onClick={() => handleAction('ai-writer')}>
                      Thực hiện hàng loạt
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Card sx={toolCardSx}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, color: 'var(--admin-accent)' }}>
                      <SyncIcon sx={{ mr: 1 }} />
                      <Typography variant="subtitle1" sx={toolTitleSx}>TMDb Enrich</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ ...mutedTextSx, mb: 2 }}>
                      Bổ sung poster, backdrop, trailer, diễn viên và đạo diễn từ TMDb.
                    </Typography>
                    <Button variant="outlined" size="small" color="primary" onClick={() => handleAction('tmdb-enrich')}>
                      Đồng bộ ngay
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Card sx={toolCardSx}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, color: 'var(--admin-accent)' }}>
                      <SettingsInputAntennaIcon sx={{ mr: 1 }} />
                      <Typography variant="subtitle1" sx={toolTitleSx}>Subtitle Provider Hub</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ ...mutedTextSx, mb: 2 }}>
                      Quản lý kết nối phụ đề online như SubDL và OpenSubtitles.
                    </Typography>
                    <Button variant="outlined" size="small" onClick={() => handleAction('subtitle-hub')}>
                      Quản lý kết nối
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Card sx={toolCardSx}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, color: 'var(--admin-accent)' }}>
                      <TranslateIcon sx={{ mr: 1 }} />
                      <Typography variant="subtitle1" sx={toolTitleSx}>AI Subtitle Translator</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ ...mutedTextSx, mb: 2 }}>
                      Dịch và chuẩn hóa phụ đề sang tiếng Việt để lưu theo từng tập.
                    </Typography>
                    <Button variant="outlined" size="small" onClick={() => handleAction('ai-translator')}>
                      Mở công cụ dịch
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Card sx={toolCardSx}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, color: 'var(--admin-accent)' }}>
                  <SmartToyIcon sx={{ mr: 1 }} />
                  <Typography variant="subtitle1" sx={toolTitleSx}>Trạng thái AI Chatbot</Typography>
                </Box>

                {health ? (
                  <Stack spacing={2}>
                    <Grid container spacing={2}>
                      <Grid size={6}>
                        <Box sx={statBoxSx}>
                          <Typography variant="caption" sx={mutedTextSx}>Engine</Typography>
                          <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--admin-text-strong)' }}>
                            {health.status?.configured ? 'Gemini AI' : 'Rule-based'}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid size={6}>
                        <Box sx={statBoxSx}>
                          <Typography variant="caption" sx={mutedTextSx}>Tin nhắn AI</Typography>
                          <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--admin-text-strong)' }}>
                            {health.chat?.messages?.assistant || 0}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid size={6}>
                        <Box sx={statBoxSx}>
                          <Typography variant="caption" sx={mutedTextSx}>Phiên chat 7 ngày</Typography>
                          <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--admin-text-strong)' }}>
                            {health.chat?.sessions?.last_7_days || 0} / {health.chat?.sessions?.total || 0}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid size={6}>
                        <Box sx={statBoxSx}>
                          <Typography variant="caption" sx={mutedTextSx}>Fallback</Typography>
                          <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--admin-text-strong)' }}>
                            {health.chat?.messages?.fallback || 0}
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>

                    {health.chat?.questions?.top?.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" sx={{ ...mutedTextSx, mb: 1, display: 'block' }}>
                          Chủ đề được hỏi nhiều nhất:
                        </Typography>
                        <Stack spacing={1}>
                          {health.chat.questions.top.slice(0, 3).map((question, index) => (
                            <Box key={`${question.question}-${index}`} sx={questionRowSx}>
                              <Typography variant="caption" noWrap sx={{ maxWidth: '80%', color: 'var(--admin-text-soft)' }}>
                                {question.question}
                              </Typography>
                              <Chip size="small" label={question.total} sx={{ height: 20, fontSize: '10px' }} />
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Stack>
                ) : (
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" sx={mutedTextSx}>Chưa có dữ liệu thống kê chatbot.</Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </div>
    </Box>
  );
}
