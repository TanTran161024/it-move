import { useEffect, useMemo, useRef, useState } from 'react';
import { FaPaperPlane, FaPlay, FaStar, FaTimes } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import './MovieChatbot.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const starterMessages = [
  'Tối nay xem gì cho cuốn?',
  'Tôi muốn phim hành động hài',
  'Gợi ý phim tình cảm nhẹ nhàng',
];

function formatMovieMeta(movie) {
  return [
    movie.imdb_rating ? `IMDb ${Number(movie.imdb_rating).toFixed(1)}` : null,
    movie.release_year || null,
    Array.isArray(movie.genres) && movie.genres.length ? movie.genres[0] : null,
  ].filter(Boolean).join(' · ') || 'Sẵn sàng xem';
}

export default function MovieChatbot() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Tối nay bạn muốn xem gì?\nNói thể loại, tâm trạng hoặc quốc gia bạn thích nhé.',
      recommendations: [],
      source: 'system',
      grounding: { no_fake_data: true },
    },
  ]);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch (_) {
      return {};
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, loading, open]);

  const sendMessage = async (text) => {
    const message = String(text || input).trim();
    if (!message || loading) return;
    const history = messages
      .filter((item) => item.content)
      .slice(-6)
      .map((item) => ({ role: item.role, content: item.content }));
    const shown_movie_ids = messages
      .flatMap((item) => item.recommendations || [])
      .map((movie) => Number(movie.id))
      .filter(Boolean);

    setInput('');
    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: message, recommendations: [] }]);
    setLoading(true);

    try {
      const response = await fetch(`${API}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user.id ? { 'x-user-id': user.id } : {}),
        },
        body: JSON.stringify({
          message,
          user_id: user.id || undefined,
          history,
          shown_movie_ids,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || 'Mình bị gián đoạn một chút.');
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: body.reply || 'Mình chọn được vài phim khá hợp gu.\nBạn muốn mình lọc sâu hơn không?',
          recommendations: Array.isArray(body.recommendations) ? body.recommendations : [],
          source: body.source || 'rule-based',
          provider: body.provider,
          grounding: body.grounding,
          aiError: body.ai_error,
        },
      ]);
    } catch (err) {
      setError(err.message || 'Mình bị gián đoạn một chút.');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Mình bị gián đoạn một chút.\nBạn gửi lại gu phim nhé.',
          recommendations: [],
          source: 'rule-based-fallback',
          grounding: { no_fake_data: true },
        },
      ]);
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

  const renderMovieCard = (movie) => (
    <button
      type="button"
      className="movie-chatbot-card"
      key={movie.id}
      onClick={() => openMovie(movie.id)}
    >
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
        {Array.isArray(movie.match_reasons) && movie.match_reasons.length > 0 && (
          <small className="movie-chatbot-reason">{movie.match_reasons.slice(0, 2).join(' · ')}</small>
        )}
        <em>Xem ngay</em>
      </span>
    </button>
  );

  return (
    <div className={`movie-chatbot${open ? ' open' : ''}`}>
      {open && (
        <section className="movie-chatbot-panel" aria-label="Tư vấn phim">
          <header className="movie-chatbot-header">
            <div className="movie-chatbot-title">
              <span className="movie-chatbot-avatar"><FaPlay /></span>
              <div>
                <strong>Chọn phim tối nay</strong>
                <small>Gợi ý theo gu của bạn</small>
              </div>
            </div>
            <div className="movie-chatbot-header-actions">
              <button type="button" className="movie-chatbot-close" onClick={() => setOpen(false)} aria-label="Đóng chatbot">
                <FaTimes />
              </button>
            </div>
          </header>

          <div className="movie-chatbot-messages" aria-live="polite">
            {messages.map((message, index) => (
              <article className={`movie-chatbot-message ${message.role}`} key={`${message.role}-${index}`}>
                <p>{message.content}</p>
                {message.role === 'assistant' && message.recommendations?.length > 0 && (
                  <div className="movie-chatbot-message-meta">
                    <span>Chọn riêng cho bạn</span>
                  </div>
                )}
                {message.recommendations?.length > 0 && (
                  <div className="movie-chatbot-recommendations">
                    {message.recommendations.slice(0, 4).map(renderMovieCard)}
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

          {messages.length <= 1 && (
            <div className="movie-chatbot-starters">
              {starterMessages.map((item) => (
                <button type="button" key={item} onClick={() => sendMessage(item)}>
                  {item}
                </button>
              ))}
            </div>
          )}

          {error && <div className="movie-chatbot-error">{error}</div>}

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
        className="movie-chatbot-fab"
        onClick={() => {
          setOpen((value) => !value);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        aria-label="Mở tư vấn phim"
      >
        {open ? <FaTimes /> : <FaStar />}
      </button>
    </div>
  );
}
