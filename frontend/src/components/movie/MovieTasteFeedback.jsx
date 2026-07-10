import { useEffect, useState } from 'react';
import { FaBan, FaEye, FaThumbsDown, FaThumbsUp } from 'react-icons/fa';
import { API_URL as API } from '../../config/api';
import { getProfileHeaders, getStoredUser } from '../../utils/profile';
import './MovieTasteFeedback.css';

const DEFAULT_FEEDBACK_STATUS = {
  like: false,
  dislike: false,
  watched: false,
  hide: false,
};

const feedbackOptions = [
  { type: 'like', label: 'Thích', activeLabel: 'Đã thích', icon: FaThumbsUp },
  { type: 'dislike', label: 'Không thích', activeLabel: 'Không thích', icon: FaThumbsDown },
  { type: 'watched', label: 'Đã xem', activeLabel: 'Đã xem', icon: FaEye },
  { type: 'hide', label: 'Không gợi ý nữa', activeLabel: 'Đã chặn gợi ý', icon: FaBan },
];

const feedbackMessages = {
  like: 'Mình sẽ nhớ gu phim này cho profile hiện tại.',
  dislike: 'Mình sẽ bớt gợi ý phim giống vậy.',
  watched: 'Đã đánh dấu là phim đã xem.',
  hide: 'Mình sẽ tránh gợi ý lại phim này.',
};

const feedbackReasonOptions = {
  dislike: [
    { id: 'wrong_genre', label: 'Không hợp thể loại' },
    { id: 'too_long', label: 'Quá dài' },
    { id: 'too_intense', label: 'Quá căng' },
    { id: 'seen_before', label: 'Đã xem rồi' },
    { id: 'bad_match', label: 'Gợi ý chưa đúng' },
  ],
  hide: [
    { id: 'not_interested', label: 'Không quan tâm' },
    { id: 'seen_before', label: 'Đã xem rồi' },
    { id: 'wrong_mood', label: 'Sai mood' },
    { id: 'wrong_country', label: 'Không thích quốc gia này' },
    { id: 'too_repetitive', label: 'Gợi ý nhiều quá' },
  ],
};

function needsFeedbackReason(type) {
  return Array.isArray(feedbackReasonOptions[type]) && feedbackReasonOptions[type].length > 0;
}

function normalizeFeedbackStatus(status) {
  return {
    ...DEFAULT_FEEDBACK_STATUS,
    ...(status || {}),
  };
}

function applyLocalFeedback(status, type, active) {
  const next = normalizeFeedbackStatus(status);
  next[type] = Boolean(active);
  if (active && type === 'like') {
    next.dislike = false;
    next.hide = false;
  }
  if (active && type === 'dislike') next.like = false;
  if (active && type === 'hide') next.like = false;
  return next;
}

function parseInitialStatusKey(key) {
  try {
    return JSON.parse(key || '{}');
  } catch {
    return {};
  }
}

export default function MovieTasteFeedback({
  movieId,
  initialStatus = null,
  sessionId = '',
  requestId = '',
  position = null,
  source = 'chatbot',
  variant = 'default',
  className = '',
  onChanged,
  onRequireLogin,
}) {
  const numericMovieId = Number(movieId);
  const initialStatusKey = JSON.stringify(initialStatus || {});
  const [status, setStatus] = useState(() => normalizeFeedbackStatus(parseInitialStatusKey(initialStatusKey)));
  const [busyType, setBusyType] = useState('');
  const [reasonType, setReasonType] = useState('');

  useEffect(() => {
    setStatus(normalizeFeedbackStatus(parseInitialStatusKey(initialStatusKey)));
    setReasonType('');
  }, [initialStatusKey, numericMovieId]);

  useEffect(() => {
    if (!numericMovieId) return undefined;
    const user = getStoredUser();
    if (!user.id) return undefined;

    const controller = new AbortController();
    fetch(`${API}/ai/movie-feedback?movie_ids=${numericMovieId}`, {
      headers: getProfileHeaders(),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const nextStatus = body?.feedback?.[numericMovieId];
        if (nextStatus) setStatus(normalizeFeedbackStatus(nextStatus));
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.warn('[Movie taste feedback]', err.message);
      });

    return () => controller.abort();
  }, [numericMovieId]);

  const sendFeedback = async (type, reason = null) => {
    if (!numericMovieId || busyType) return;

    const user = getStoredUser();
    if (!user.id) {
      onRequireLogin?.();
      onChanged?.({
        movieId: numericMovieId,
        type,
        active: false,
        feedback: status,
        message: 'Đăng nhập để dạy bot gu phim của bạn.',
      });
      return;
    }

    const active = !status[type];
    if (active && needsFeedbackReason(type) && !reason) {
      setReasonType((current) => (current === type ? '' : type));
      return;
    }

    setBusyType(type);

    try {
      const response = await fetch(`${API}/ai/movie-feedback`, {
        method: 'POST',
        headers: getProfileHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          movie_id: numericMovieId,
          feedback_type: type,
          active,
          session_id: sessionId || undefined,
          source,
          metadata: {
            reason: reason?.id || null,
            reason_label: reason?.label || null,
            reason_type: type,
            ui_variant: variant,
            request_id: requestId || null,
            position: Number(position) || null,
            event_key: requestId ? `feedback:${requestId}:${numericMovieId}:${type}` : null,
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể lưu gu phim.');

      const nextStatus = normalizeFeedbackStatus(body.feedback || applyLocalFeedback(status, type, active));
      setStatus(nextStatus);
      setReasonType('');
      onChanged?.({
        movieId: numericMovieId,
        type,
        active,
        feedback: nextStatus,
        reason,
        message: active && reason
          ? `${feedbackMessages[type]} Lý do: ${reason.label}.`
          : active ? feedbackMessages[type] : 'Đã cập nhật lại gu phim.',
      });
    } catch (err) {
      onChanged?.({
        movieId: numericMovieId,
        type,
        active,
        feedback: status,
        message: err.message || 'Không thể lưu gu phim.',
        error: true,
      });
    } finally {
      setBusyType('');
    }
  };

  return (
    <div className={`movie-taste-feedback movie-taste-feedback--${variant} ${className}`.trim()} aria-label="Dạy gu phim">
      {feedbackOptions.map((option) => {
        const Icon = option.icon;
        const active = Boolean(status[option.type]);
        const busy = busyType === option.type;
        return (
          <button
            type="button"
            key={option.type}
            className={`movie-taste-feedback__button ${option.type}${active ? ' is-active' : ''}`}
            aria-pressed={active}
            disabled={Boolean(busyType)}
            title={active ? option.activeLabel : option.label}
            onClick={(event) => {
              event.stopPropagation();
              sendFeedback(option.type);
            }}
          >
            {busy ? <span className="movie-taste-feedback__spinner" /> : <Icon />}
            <span>{active ? option.activeLabel : option.label}</span>
          </button>
        );
      })}
      {reasonType && (
        <div className="movie-taste-feedback__reasons" onClick={(event) => event.stopPropagation()}>
          <span className="movie-taste-feedback__reasons-title">Vì sao?</span>
          {feedbackReasonOptions[reasonType].map((reason) => (
            <button
              type="button"
              key={reason.id}
              className="movie-taste-feedback__reason"
              disabled={Boolean(busyType)}
              onClick={() => sendFeedback(reasonType, reason)}
            >
              {reason.label}
            </button>
          ))}
          <button
            type="button"
            className="movie-taste-feedback__reason is-muted"
            disabled={Boolean(busyType)}
            onClick={() => setReasonType('')}
          >
            Hủy
          </button>
        </div>
      )}
    </div>
  );
}
