import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaBookmark,
  FaCheck,
  FaInfoCircle,
  FaPaperPlane,
  FaPlay,
  FaQuestionCircle,
  FaRedo,
  FaTimes,
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import './MovieChatbot.css';
import MovieTasteFeedback from '../movie/MovieTasteFeedback';
import { API_BASE_URL as API } from '../../config/api';
import { getActiveProfile, getProfileHeaders } from '../../utils/profile';

const CHAT_STORAGE_KEY = 'smart-movie-chatbot-session-v3';
const CHAT_SESSION_ID_KEY = 'smart-movie-chatbot-session-id-v1';
const MAX_MESSAGES = 24;
const STREAM_INTERVAL_MS = 18;
const STREAM_MIN_STEP = 2;
const STREAM_MAX_STEP = 6;

const starterMessages = [
  'Tối nay xem gì cho cuốn?',
  'Tôi muốn phim hành động hài',
  'Gợi ý phim tình cảm nhẹ nhàng',
  'Anime Nhật IMDb cao',
];

const followUpMessages = ['Phim khác', 'Ngắn thôi', 'Mới hơn', 'IMDb cao hơn', 'Không kinh dị', 'Anime thôi'];

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
      requestId: item?.requestId || item?.request_id || null,
      grounding: item?.grounding,
      aiError: item?.aiError,
      suggestedReplies: Array.isArray(item?.suggestedReplies) ? item.suggestedReplies.slice(0, 8) : [],
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

function getRecommendedMovieIds(messages) {
  return [...new Set(
    messages
      .flatMap((item) => item.recommendations || [])
      .map((movie) => Number(movie?.id))
      .filter(Boolean)
  )];
}

function getLibraryMovieIds(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => Number(item?.id || item?.movie_id))
    .filter(Boolean);
}

function getVisibleMatchReasons(movie) {
  if (!Array.isArray(movie?.match_reasons)) return [];
  return movie.match_reasons
    .filter((reason) => !String(reason || '').toLowerCase().startsWith('có từ khóa'))
    .slice(0, 2);
}

function getRecommendationExplanation(movie) {
  const explanation = movie?.why_recommended || movie?.recommendation_explanation;
  const details = Array.isArray(explanation?.details)
    ? explanation.details.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const fallbackDetails = getVisibleMatchReasons(movie).map((reason) => `Điểm khớp từ hệ thống: ${reason}.`);
  const mergedDetails = details.length ? details : fallbackDetails;
  const summary = String(explanation?.summary || mergedDetails[0] || '').trim();
  const detailList = mergedDetails.filter((detail) => detail !== summary);

  if (!summary && !mergedDetails.length) return null;
  return {
    summary: summary || 'Phim này nằm trong nhóm phù hợp nhất từ kho dữ liệu hiện có.',
    details: detailList.slice(0, 6),
  };
}

function createMessageId(prefix = 'chat') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getNextStreamIndex(text, currentIndex) {
  if (currentIndex >= text.length) return text.length;
  const nextChar = text[currentIndex];
  if (nextChar === '\n') return currentIndex + 1;

  const step = Math.min(
    STREAM_MAX_STEP,
    Math.max(STREAM_MIN_STEP, Math.ceil(text.length / 90))
  );
  let nextIndex = Math.min(text.length, currentIndex + step);

  while (nextIndex < text.length && /\S/.test(text[nextIndex]) && nextIndex - currentIndex < STREAM_MAX_STEP + 8) {
    nextIndex += 1;
  }

  return nextIndex;
}

function parseSseBlock(block) {
  let event = 'message';
  const dataLines = [];

  block.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith(':')) return;
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
      return;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });

  const rawData = dataLines.join('\n');
  return {
    event,
    data: rawData ? JSON.parse(rawData) : {},
  };
}

async function readSseEvents(response, onEvent) {
  if (!response.body?.getReader) {
    throw new Error('Trình duyệt chưa hỗ trợ streaming.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (!part.trim()) continue;
      await onEvent(parseSseBlock(part));
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    await onEvent(parseSseBlock(buffer));
  }
}

function recommendationEventKey(eventType, requestId, movieId) {
  return `${eventType}:${requestId || 'unknown'}:${movieId}`;
}

export default function MovieChatbot() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const historyLoadedRef = useRef(false);
  const streamTimerRef = useRef(null);
  const activeStreamIdRef = useRef('');
  const trackedAnalyticsKeysRef = useRef(new Set());
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState(loadMessagesFromSession);
  const [chatSessionId, setChatSessionId] = useState(loadChatSessionId);
  const [watchlistIds, setWatchlistIds] = useState(() => new Set());
  const [watchlistBusyId, setWatchlistBusyId] = useState(null);
  const [tasteSummary, setTasteSummary] = useState([]);
  const [expandedWhyIds, setExpandedWhyIds] = useState(() => new Set());
  const [actionMessage, setActionMessage] = useState('');

  const trackRecommendationEvents = useCallback(async (events, defaults = {}) => {
    const items = (Array.isArray(events) ? events : [events]).filter(Boolean);
    if (!items.length) return;
    const response = await fetch(`${API}/api/ai/recommendation-events`, {
      method: 'POST',
      keepalive: true,
      headers: getProfileHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        session_id: defaults.sessionId || chatSessionId || undefined,
        request_id: defaults.requestId || undefined,
        source: defaults.source || 'chatbot',
        provider: defaults.provider || undefined,
        events: items,
      }),
    });
    if (!response.ok) throw new Error(`Analytics unavailable: ${response.status}`);
  }, [chatSessionId]);

  const clearStreamTimer = useCallback(() => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    activeStreamIdRef.current = '';
  }, []);

  useEffect(() => clearStreamTimer, [clearStreamTimer]);

  const loadTasteProfile = useCallback(async (signal) => {
    const user = getStoredUser();
    if (!user.id) {
      setTasteSummary([]);
      return;
    }

    const response = await fetch(`${API}/api/ai/profile-taste`, {
      headers: getProfileHeaders(),
      signal,
    });
    if (!response.ok) return;
    const body = await response.json().catch(() => ({}));
    setTasteSummary(Array.isArray(body.summary) ? body.summary.slice(0, 3) : []);
  }, []);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, loading, open]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    loadTasteProfile(controller.signal).catch((err) => {
      if (err.name !== 'AbortError') console.warn('[Chat taste]', err.message);
    });
    return () => controller.abort();
  }, [loadTasteProfile, open]);

  useEffect(() => {
    if (!open) return undefined;

    const user = getStoredUser();
    if (!user.id) {
      setWatchlistIds(new Set());
      return undefined;
    }

    const recommendationIds = getRecommendedMovieIds(messages);
    if (!recommendationIds.length) return undefined;

    const controller = new AbortController();
    const recommendationIdSet = new Set(recommendationIds);

    Promise.all([
      fetch(`${API}/api/user/watchlist`, {
        headers: getProfileHeaders(),
        signal: controller.signal,
      }),
      fetch(`${API}/api/user/favorites`, {
        headers: getProfileHeaders(),
        signal: controller.signal,
      }),
    ])
      .then(async ([watchlistResponse, favoriteResponse]) => {
        const watchlist = watchlistResponse.ok ? await watchlistResponse.json().catch(() => []) : [];
        const favorites = favoriteResponse.ok ? await favoriteResponse.json().catch(() => []) : [];
        const savedIds = [...getLibraryMovieIds(watchlist), ...getLibraryMovieIds(favorites)]
          .filter((movieId) => recommendationIdSet.has(movieId));

        setWatchlistIds((current) => {
          const next = new Set([...current].filter((movieId) => !recommendationIdSet.has(movieId)));
          savedIds.forEach((movieId) => next.add(movieId));
          return next;
        });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.warn('[Chat library status]', err.message);
      });

    return () => controller.abort();
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const pending = [];
    const pendingKeys = [];

    messages.forEach((message, messageIndex) => {
      if (message.role !== 'assistant' || message.isStreaming || !message.recommendations?.length) return;
      const requestId = message.requestId || message.id || `${chatSessionId || 'session'}-${messageIndex}`;
      message.recommendations.slice(0, 4).forEach((movie, index) => {
        const movieId = Number(movie?.id);
        if (!movieId) return;
        const eventKey = recommendationEventKey('impression', requestId, movieId);
        if (trackedAnalyticsKeysRef.current.has(eventKey)) return;
        trackedAnalyticsKeysRef.current.add(eventKey);
        pendingKeys.push(eventKey);
        pending.push({
          event_type: 'impression',
          event_key: eventKey,
          request_id: requestId,
          movie_id: movieId,
          position: index + 1,
          source: message.source || 'chatbot',
          provider: message.provider || null,
          metadata: { ui_variant: 'chatbot-card' },
        });
      });
    });

    if (!pending.length) return;
    trackRecommendationEvents(pending).catch((error) => {
      pendingKeys.forEach((key) => trackedAnalyticsKeysRef.current.delete(key));
      console.warn('[Recommendation analytics]', error.message);
    });
  }, [chatSessionId, messages, open, trackRecommendationEvents]);

  useEffect(() => {
    if (messages.some((item) => item.isStreaming)) return;
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
    clearStreamTimer();
    setMessages([welcomeMessage]);
    setChatSessionId('');
    historyLoadedRef.current = true;
    setExpandedWhyIds(new Set());
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

  const startAssistantStream = useCallback((assistantMessage) => {
    const fullContent = String(assistantMessage.content || '').trim();
    const messageId = createMessageId('assistant');
    const finalRecommendations = Array.isArray(assistantMessage.recommendations) ? assistantMessage.recommendations : [];
    const finalSuggestedReplies = Array.isArray(assistantMessage.suggestedReplies)
      ? assistantMessage.suggestedReplies
      : followUpMessages;

    clearStreamTimer();
    activeStreamIdRef.current = messageId;
    setLoading(false);

    if (!fullContent) {
      setMessages((prev) => [
        ...prev,
        {
          ...assistantMessage,
          id: messageId,
          content: assistantMessage.content || '',
          recommendations: finalRecommendations,
          suggestedReplies: finalSuggestedReplies,
          isStreaming: false,
        },
      ].slice(-MAX_MESSAGES));
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        ...assistantMessage,
        id: messageId,
        content: '',
        recommendations: [],
        suggestedReplies: [],
        isStreaming: true,
      },
    ].slice(-MAX_MESSAGES));

    let nextIndex = 0;
    streamTimerRef.current = setInterval(() => {
      nextIndex = getNextStreamIndex(fullContent, nextIndex);
      const done = nextIndex >= fullContent.length;

      setMessages((prev) => prev.map((item) => {
        if (item.id !== messageId) return item;
        return {
          ...item,
          content: fullContent.slice(0, nextIndex),
          recommendations: done ? finalRecommendations : [],
          suggestedReplies: done ? finalSuggestedReplies : [],
          isStreaming: !done,
        };
      }).slice(-MAX_MESSAGES));

      if (done) {
        clearStreamTimer();
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }, STREAM_INTERVAL_MS);
  }, [clearStreamTimer]);

  const streamAssistantResponse = async (payload) => {
    const response = await fetch(`${API}/api/ai/chat/stream`, {
      method: 'POST',
      headers: getProfileHeaders({
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      throw new Error(`SSE unavailable: ${response.status}`);
    }

    const assistantId = createMessageId('assistant-stream');
    let receivedDone = false;
    let streamStarted = false;

    const removePartialMessage = () => {
      if (!streamStarted) return;
      setMessages((prev) => prev.filter((item) => item.id !== assistantId));
    };

    try {
      activeStreamIdRef.current = assistantId;
      setLoading(false);
      streamStarted = true;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          recommendations: [],
          suggestedReplies: [],
          source: 'streaming',
          grounding: { no_fake_data: true },
          isStreaming: true,
          streamStatus: 'Đang phân tích gu phim...',
        },
      ].slice(-MAX_MESSAGES));

      await readSseEvents(response, ({ event, data }) => {
        if (event === 'session') {
          if (data?.session_id) setChatSessionId(data.session_id);
          return;
        }

        if (event === 'status') {
          setMessages((prev) => prev.map((item) => (
            item.id === assistantId
              ? { ...item, streamStatus: data?.message || item.streamStatus }
              : item
          )));
          return;
        }

        if (event === 'reply_delta') {
          const text = String(data?.text || '');
          if (!text) return;
          setMessages((prev) => prev.map((item) => (
            item.id === assistantId
              ? { ...item, content: `${item.content || ''}${text}` }
              : item
          )));
          return;
        }

        if (event === 'recommendations') {
          setMessages((prev) => prev.map((item) => (
            item.id === assistantId
              ? {
                  ...item,
                  recommendations: Array.isArray(data?.recommendations) ? data.recommendations : [],
                  suggestedReplies: Array.isArray(data?.suggested_replies) ? data.suggested_replies : followUpMessages,
                  requestId: data?.request_id || item.requestId,
                  source: data?.source || item.source,
                  provider: data?.provider,
                  grounding: data?.grounding,
                  aiError: data?.ai_error,
                  conversation: data?.conversation,
                }
              : item
          )));
          return;
        }

        if (event === 'done') {
          receivedDone = true;
          if (data?.session_id) setChatSessionId(data.session_id);
          setMessages((prev) => prev.map((item) => {
            if (item.id !== assistantId) return item;
            return {
              ...item,
              content: data?.reply || item.content,
              recommendations: Array.isArray(data?.recommendations) ? data.recommendations : item.recommendations,
              suggestedReplies: Array.isArray(data?.suggested_replies) ? data.suggested_replies : item.suggestedReplies,
              requestId: data?.request_id || item.requestId,
              source: data?.source || item.source,
              provider: data?.provider,
              grounding: data?.grounding || item.grounding,
              aiError: data?.ai_error,
              conversation: data?.conversation || item.conversation,
              isStreaming: false,
              streamStatus: '',
            };
          }).slice(-MAX_MESSAGES));
          return;
        }

        if (event === 'error') {
          throw new Error(data?.message || 'Mình bị gián đoạn một chút.');
        }
      });

      if (!receivedDone) {
        throw new Error('Stream ended before done event.');
      }
    } catch (error) {
      removePartialMessage();
      const wrapped = new Error(error.message || 'Mình bị gián đoạn một chút.');
      wrapped.partial = streamStarted;
      throw wrapped;
    } finally {
      activeStreamIdRef.current = '';
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const sendMessage = async (text) => {
    const message = String(text || input).trim();
    if (!message || loading || activeStreamIdRef.current) return;

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
    const payload = {
      session_id: chatSessionId || undefined,
      message,
      user_id: user.id || undefined,
      profile_id: profile.id || undefined,
      history,
      shown_movie_ids,
    };

    try {
      try {
        await streamAssistantResponse(payload);
        return;
      } catch (streamError) {
        if (streamError.partial) throw streamError;
        console.warn('[Chat SSE fallback]', streamError.message);
      }

      const response = await fetch(`${API}/api/ai/chat`, {
        method: 'POST',
        headers: getProfileHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || 'Mình bị gián đoạn một chút.');
      }

      if (body.session_id) setChatSessionId(body.session_id);

      startAssistantStream({
          role: 'assistant',
          content: body.reply || 'Mình chọn được vài phim khá hợp gu.\nBạn muốn mình lọc sâu hơn không?',
          recommendations: Array.isArray(body.recommendations) ? body.recommendations : [],
          suggestedReplies: Array.isArray(body.suggested_replies) ? body.suggested_replies : followUpMessages,
          requestId: body.request_id || null,
          source: body.source || 'rule-based',
          provider: body.provider,
          grounding: body.grounding,
          aiError: body.ai_error,
      });
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

  const trackMovieEvent = (eventType, movie, context = {}) => {
    const movieId = Number(movie?.id || movie);
    if (!movieId) return;
    const requestId = context.requestId || chatSessionId || 'unknown';
    trackRecommendationEvents([{
      event_type: eventType,
      event_key: recommendationEventKey(eventType, requestId, movieId),
      request_id: context.requestId || null,
      movie_id: movieId,
      position: context.position || null,
      source: context.source || 'chatbot',
      provider: context.provider || null,
      metadata: { ui_variant: 'chatbot-card' },
    }], context).catch((error) => console.warn('[Recommendation analytics]', error.message));
  };

  const openMovie = (movie, context) => {
    trackMovieEvent('detail_click', movie, context);
    setOpen(false);
    navigate(`/movies/${movie.id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const watchMovie = (movie, context) => {
    trackMovieEvent('play', movie, context);
    setOpen(false);
    navigate(`/watch/${movie.id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addToWatchlist = async (movie, event, context) => {
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
      trackMovieEvent('save', movie, context);
    } catch (err) {
      setActionMessage(err.message || 'Không thể thêm vào danh sách.');
    } finally {
      setWatchlistBusyId(null);
    }
  };

  const toggleWhy = (movieId) => {
    setExpandedWhyIds((current) => {
      const next = new Set(current);
      if (next.has(movieId)) next.delete(movieId);
      else next.add(movieId);
      return next;
    });
  };

  const renderMovieCard = (movie, context = {}) => {
    const movieId = Number(movie.id);
    const saved = watchlistIds.has(movieId);
    const busy = watchlistBusyId === movieId;
    const explanation = getRecommendationExplanation(movie);
    const whyOpen = expandedWhyIds.has(movieId);

    return (
    <article
      className="movie-chatbot-card"
      key={movie.id}
    >
      <button type="button" className="movie-chatbot-card-main" onClick={() => openMovie(movie, context)}>
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
        <button type="button" className="watch-now" onClick={() => watchMovie(movie, context)}>
          <FaPlay /> Xem ngay
        </button>
        <button
          type="button"
          className="save"
          disabled={busy || saved}
          onClick={(event) => addToWatchlist(movie, event, context)}
        >
          {saved ? <FaCheck /> : <FaBookmark />}
          {saved ? 'Đã lưu' : busy ? 'Đang lưu' : 'Thêm'}
        </button>
      </span>
      {explanation && (
        <div className={`movie-chatbot-why${whyOpen ? ' is-open' : ''}`}>
          <button
            type="button"
            className="movie-chatbot-why-toggle"
            aria-expanded={whyOpen}
            onClick={(event) => {
              event.stopPropagation();
              if (!whyOpen) trackMovieEvent('why_open', movie, context);
              toggleWhy(movieId);
            }}
          >
            <FaQuestionCircle /> Vì sao gợi ý?
          </button>
          {whyOpen && (
            <div className="movie-chatbot-why-panel">
              <p>{explanation.summary}</p>
              {explanation.details.length > 0 && (
                <ul>
                  {explanation.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      <MovieTasteFeedback
        movieId={movieId}
        sessionId={chatSessionId}
        requestId={context.requestId}
        position={context.position}
        source="chatbot"
        variant="chatbot"
        onChanged={({ message }) => {
          setActionMessage(message || 'Đã cập nhật gu phim.');
          loadTasteProfile().catch((err) => console.warn('[Chat taste]', err.message));
        }}
      />
    </article>
    );
  };

  const hasStreamingMessage = messages.some((item) => item.isStreaming);
  const suggestions = getActiveSuggestions(messages);

  return (
    <div className={`movie-chatbot${open ? ' open' : ''}`}>
      {open && (
        <section className="movie-chatbot-panel" aria-label="Tư vấn phim">
          <header className="movie-chatbot-header">
            <div className="movie-chatbot-title">
              <span className="movie-chatbot-avatar">
                <img src="/chatbot-logo.svg" alt="IT Move AI" />
              </span>
              <div>
                <strong>IT Move AI</strong>
                <small>{tasteSummary.length ? `Nhớ gu: ${tasteSummary.join(', ')}` : 'Sẵn sàng tư vấn phim'}</small>
              </div>
            </div>
            <div className="movie-chatbot-header-actions">
              <button type="button" className="movie-chatbot-close" onClick={resetChat} aria-label="Bắt đầu lại" title="Khởi động lại">
                <FaRedo />
              </button>
              <button type="button" className="movie-chatbot-close" onClick={() => setOpen(false)} aria-label="Đóng chatbot" title="Đóng">
                <FaTimes />
              </button>
            </div>
          </header>

          <div className="movie-chatbot-messages" aria-live="polite">
            {messages.map((chatMessage, index) => (
              <article
                className={`movie-chatbot-message ${chatMessage.role}${chatMessage.isStreaming ? ' streaming' : ''}`}
                key={chatMessage.id || `${chatMessage.role}-${index}`}
              >
                <p>
                  {chatMessage.content}
                  {chatMessage.isStreaming && <span className="movie-chatbot-stream-cursor" aria-hidden="true" />}
                </p>
                {chatMessage.isStreaming && (
                  <span className="movie-chatbot-stream-status">{chatMessage.streamStatus || 'Đang viết câu trả lời...'}</span>
                )}
                {chatMessage.role === 'assistant' && !chatMessage.isStreaming && chatMessage.recommendations?.length > 0 && (
                  <div className="movie-chatbot-message-meta">
                    <span>Chọn riêng cho bạn</span>
                  </div>
                )}
                {!chatMessage.isStreaming && chatMessage.recommendations?.length > 0 && (
                  <div className="movie-chatbot-recommendations">
                    {chatMessage.recommendations.slice(0, 4).map((movie, position) => renderMovieCard(movie, {
                      requestId: chatMessage.requestId,
                      position: position + 1,
                      source: chatMessage.source,
                      provider: chatMessage.provider,
                      sessionId: chatSessionId,
                    }))}
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

          {!loading && !hasStreamingMessage && suggestions.length > 0 && (
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
            <button type="submit" disabled={loading || hasStreamingMessage || !input.trim()} aria-label="Gửi">
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
          {open ? <FaTimes /> : <img src="/chatbot-logo.svg" alt="IT Move AI" />}
        </div>
        {!open && <span className="movie-chatbot-fab-text">Chatbot gợi ý phim</span>}
      </button>
    </div>
  );
}
