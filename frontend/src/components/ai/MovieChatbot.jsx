import { useEffect, useRef, useState } from 'react';
import { FaBookmark, FaCheck, FaInfoCircle, FaPaperPlane, FaPlay, FaRedo, FaTimes } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import './MovieChatbot.css';
import { API_BASE_URL as API } from '../../config/api';
import { getActiveProfile, getProfileHeaders } from '../../utils/profile';

const CHAT_STORAGE_KEY = 'smart-movie-chatbot-session-v3';
const CHAT_SESSION_ID_KEY = 'smart-movie-chatbot-session-id-v1';
const MAX_MESSAGES = 24;

const starterMessages = [
  'Tối nay xem gì cho cuốn?',
  'Tôi muốn phim hành động hài',
  'Gợi ý phim tình cảm nhẹ nhàng',
];

const followUpMessages = ['Phim khác', 'Nhẹ nhàng hơn', 'Ngắn thôi'];

const welcomeMessage = {
  role: 'assistant',
  content: 'Tối nay bạn muốn xem gì?\nBạn có thể nói thể loại, tâm trạng, quốc gia hoặc yêu cầu tiếp như “phim khác”.',
  recommendations: [],
  source: 'system',
  grounding: { no_fake_data: true },
  suggestedReplies: starterMessages,
};

function formatMovieMeta(movie) {
  return [
    movie.imdb_rating ? `IMDb ${Number(movie.imdb_rating).toFixed(1)}` : null,
    movie.release_year || null,
    movie.duration || null,
    Array.isArray(movie.genres) && movie.genres.length ? movie.genres[0] : null,
  ].filter(Boolean).join(' · ') || 'Sẵn sàng xem';
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

function normalizeStoredMessages(value) {
  if (!Array.isArray(value)) return null;
  const messages = value
    .map((item) => ({
      role: item?.role === 'user' ? 'user' : 'assistant',
      content: String(item?.content || '').trim(),
      recommendations: Array.isArray(item?.recommendations) ? item.recommendations.slice(0, 6) : [],
      source: item?.source || 'session',
      provider: item?.provider,
      grounding: item?.grounding,
      aiError: item?.aiError,
      suggestedReplies: Array.isArray(item?.suggestedReplies) ? item.suggestedReplies.slice(0, 4) : [],
    }))
    .filter((item) => item.content);

  return messages.length ? messages.slice(-MAX_MESSAGES) : null;
}

function loadMessagesFromSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CHAT_STORAGE_KEY) || 'null');
    return normalizeStoredMessages(parsed) || [welcomeMessage];
  } catch {
    return [welcomeMessage];
  }
}

function loadChatSessionId() {
  try {
    return sessionStorage.getItem(CHAT_SESSION_ID_KEY) || '';
  } catch {
    return '';
  }
}

function getActiveSuggestions(messages) {
  const latestAssistant = [...messages].reverse().find((item) => item.role === 'assistant');
  if (latestAssistant?.suggestedReplies?.length) return latestAssistant.suggestedReplies;
  return messages.length <= 1 ? starterMessages : followUpMessages;
}

function getVisibleMatchReasons(movie) {
  if (!Array.isArray(movie?.match_reasons)) return [];
  return movie.match_reasons
    .filter((reason) => !String(reason || '').toLowerCase().startsWith('có từ khóa'))
    .slice(0, 2);
}

export default function MovieChatbot() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const historyLoadedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState(loadMessagesFromSession);
  const [chatSessionId, setChatSessionId] = useState(loadChatSessionId);
  const [watchlistIds, setWatchlistIds] = useState(() => new Set());
  const [watchlistBusyId, setWatchlistBusyId] = useState(null);
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, loading, open]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch {
      // Session memory is helpful, not required.
    }
  }, [messages]);

  useEffect(() => {
    try {
      if (chatSessionId) sessionStorage.setItem(CHAT_SESSION_ID_KEY, chatSessionId);
      else sessionStorage.removeItem(CHAT_SESSION_ID_KEY);
    } catch {
      // Session id persistence is optional.
    }
  }, [chatSessionId]);

  useEffect(() => {
    if (historyLoadedRef.current) return;
    if (chatSessionId || messages.length > 1) return;

    const user = getStoredUser();
    if (!user.id) return;

    historyLoadedRef.current = true;
    const controller = new AbortController();

    fetch(`${API}/api/ai/chat/history?limit=${MAX_MESSAGES}`, {
      headers: getProfileHeaders(),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!body || !Array.isArray(body.messages) || !body.messages.length) return;
        const restoredMessages = normalizeStoredMessages(body.messages);
        if (restoredMessages?.length) setMessages(restoredMessages);
        if (body.session_id) setChatSessionId(body.session_id);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.warn('[Chat history]', err.message);
      });

    return () => controller.abort();
  }, [chatSessionId, messages.length]);

  const resetChat = () => {
    setMessages([welcomeMessage]);
    setChatSessionId('');
    historyLoadedRef.current = true;
    setError('');
    setActionMessage('');
    setInput('');
    try {
      sessionStorage.removeItem(CHAT_STORAGE_KEY);
      sessionStorage.removeItem(CHAT_SESSION_ID_KEY);
    } catch {
      // Ignore storage failures.
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const sendMessage = async (text) => {
    const message = String(text || input).trim();
    if (!message || loading) return;

    const history = messages
      .filter((item) => item.content)
      .slice(-10)
      .map((item) => ({ role: item.role, content: item.content }));
    const shown_movie_ids = messages
      .flatMap((item) => item.recommendations || [])
      .map((movie) => Number(movie.id))
      .filter(Boolean);

    setInput('');
    setError('');
    setActionMessage('');
    setMessages((prev) => [...prev, { role: 'user', content: message, recommendations: [] }].slice(-MAX_MESSAGES));
    setLoading(true);

    const user = getStoredUser();
    const profile = getActiveProfile();

    try {
      const response = await fetch(`${API}/api/ai/chat`, {
        method: 'POST',
        headers: getProfileHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          session_id: chatSessionId || undefined,
          message,
          user_id: user.id || undefined,
          profile_id: profile.id || undefined,
          history,
          shown_movie_ids,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || 'Mình bị gián đoạn một chút.');
      }

      if (body.session_id) setChatSessionId(body.session_id);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: body.reply || 'Mình chọn được vài phim khá hợp gu.\nBạn muốn mình lọc sâu hơn không?',
          recommendations: Array.isArray(body.recommendations) ? body.recommendations : [],
          suggestedReplies: Array.isArray(body.suggested_replies) ? body.suggested_replies : followUpMessages,
          source: body.source || 'rule-based',
          provider: body.provider,
          grounding: body.grounding,
          aiError: body.ai_error,
        },
      ].slice(-MAX_MESSAGES));
    } catch (err) {
      setError(err.message || 'Mình bị gián đoạn một chút.');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Mình bị gián đoạn một chút.\nBạn gửi lại gu phim nhé.',
          recommendations: [],
          suggestedReplies: starterMessages,
          source: 'rule-based-fallback',
          grounding: { no_fake_data: true },
        },
      ].slice(-MAX_MESSAGES));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };

  const openMovie = (movieId) => {
    setOpen(false);
    navigate(`/movies/${movieId}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const watchMovie = (movieId) => {
    setOpen(false);
    navigate(`/watch/${movieId}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addToWatchlist = async (movie, event) => {
    event?.stopPropagation();
    const movieId = Number(movie?.id);
    if (!movieId || watchlistBusyId) return;

    const user = getStoredUser();
    if (!user.id) {
      setActionMessage('Đăng nhập để lưu phim vào danh sách.');
      return;
    }

    setWatchlistBusyId(movieId);
    setActionMessage('');
    try {
      const response = await fetch(`${API}/api/user/watchlist`, {
        method: 'POST',
        headers: getProfileHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ movie_id: movieId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể thêm vào danh sách.');

      setWatchlistIds((current) => {
        const next = new Set(current);
        next.add(movieId);
        return next;
      });
      setActionMessage(`Đã thêm "${movie.title}" vào danh sách.`);
    } catch (err) {
      setActionMessage(err.message || 'Không thể thêm vào danh sách.');
    } finally {
      setWatchlistBusyId(null);
    }
  };

  const renderMovieCard = (movie) => {
    const movieId = Number(movie.id);
    const saved = watchlistIds.has(movieId);
    const busy = watchlistBusyId === movieId;

    return (
    <article
      className="movie-chatbot-card"
      key={movie.id}
    >
      <button type="button" className="movie-chatbot-card-main" onClick={() => openMovie(movie.id)}>
      <span className={`movie-chatbot-poster${movie.poster_url ? '' : ' is-empty'}`}>
        {movie.poster_url && (
          <img
            src={movie.poster_url}
            alt={movie.title}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.parentElement?.classList.add('is-empty');
              event.currentTarget.remove();
            }}
          />
        )}
        <span className="movie-chatbot-poster-empty">Chưa có ảnh</span>
      </span>
      <span className="movie-chatbot-card-body">
        <strong>{movie.title}</strong>
        <small>{formatMovieMeta(movie)}</small>
        {getVisibleMatchReasons(movie).length > 0 && (
          <small className="movie-chatbot-reason">{getVisibleMatchReasons(movie).join(' · ')}</small>
        )}
        <span className="movie-chatbot-detail-link"><FaInfoCircle /> Chi tiết</span>
      </span>
      </button>
      <span className="movie-chatbot-card-actions">
        <button type="button" className="watch-now" onClick={() => watchMovie(movie.id)}>
          <FaPlay /> Xem ngay
        </button>
        <button
          type="button"
          className="save"
          disabled={busy || saved}
          onClick={(event) => addToWatchlist(movie, event)}
        >
          {saved ? <FaCheck /> : <FaBookmark />}
          {saved ? 'Đã lưu' : busy ? 'Đang lưu' : 'Thêm'}
        </button>
      </span>
    </article>
    );
  };

  const suggestions = getActiveSuggestions(messages);

  return (
    <div className={`movie-chatbot${open ? ' open' : ''}`}>
      {open && (
        <section className="movie-chatbot-panel" aria-label="Tư vấn phim">
          <header className="movie-chatbot-header">
            <div className="movie-chatbot-title">
              <span className="movie-chatbot-avatar" style={{ padding: 0, overflow: 'hidden', background: 'transparent' }}>
                <img src="/chatbot-logo-128.png" alt="NetDL Assistant" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 0 5px rgba(168,85,247,0.5))' }} />
              </span>
              <div>
                <strong>NetDL Assistant</strong>
                <small>Nhớ gu trong phiên chat</small>
              </div>
            </div>
            <div className="movie-chatbot-header-actions">
              <button type="button" className="movie-chatbot-close" onClick={resetChat} aria-label="Bắt đầu lại">
                <FaRedo />
              </button>
              <button type="button" className="movie-chatbot-close" onClick={() => setOpen(false)} aria-label="Đóng chatbot">
                <FaTimes />
              </button>
            </div>
          </header>

          <div className="movie-chatbot-messages" aria-live="polite">
            {messages.map((chatMessage, index) => (
              <article className={`movie-chatbot-message ${chatMessage.role}`} key={`${chatMessage.role}-${index}`}>
                <p>{chatMessage.content}</p>
                {chatMessage.role === 'assistant' && chatMessage.recommendations?.length > 0 && (
                  <div className="movie-chatbot-message-meta">
                    <span>Chọn riêng cho bạn</span>
                  </div>
                )}
                {chatMessage.recommendations?.length > 0 && (
                  <div className="movie-chatbot-recommendations">
                    {chatMessage.recommendations.slice(0, 4).map(renderMovieCard)}
                  </div>
                )}
              </article>
            ))}
            {loading && (
              <article className="movie-chatbot-message assistant loading">
                <p>Đang chọn vài phim hợp gu</p>
                <span className="movie-chatbot-typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </article>
            )}
            <div ref={messagesEndRef} />
          </div>

          {!loading && suggestions.length > 0 && (
            <div className="movie-chatbot-starters">
              {suggestions.map((item) => (
                <button type="button" key={item} onClick={() => sendMessage(item)}>
                  {item}
                </button>
              ))}
            </div>
          )}

          {error && <div className="movie-chatbot-error">{error}</div>}
          {actionMessage && <div className="movie-chatbot-action-message">{actionMessage}</div>}

          <form className="movie-chatbot-input" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Bạn muốn xem phim kiểu gì?"
              maxLength={300}
            />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Gửi">
              <FaPaperPlane />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className={`movie-chatbot-fab ${open ? 'is-open' : ''}`}
        onClick={() => {
          setOpen((value) => !value);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        aria-label="Mở tư vấn phim"
      >
        <div className="movie-chatbot-fab-icon">
          {open ? <FaTimes /> : <img src="/chatbot-logo-128.png" alt="NetDL Assistant" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
        </div>
        {!open && <span className="movie-chatbot-fab-text">Tư vấn phim AI</span>}
      </button>
    </div>
  );
}
