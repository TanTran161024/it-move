import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ForgotPasswordDialog from '../../components/auth/ForgotPasswordDialog';
import LoginDialog from '../../components/auth/LoginDialog';
import RegisterDialog from '../../components/auth/RegisterDialog';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const reportReasons = [
  'Video không phát',
  'Sai tập phim',
  'Âm thanh/phụ đề lỗi',
  'Thông tin phim sai',
  'Lỗi khác',
];

const DetailMovies = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('episodes');
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [libraryStatus, setLibraryStatus] = useState({ favorite: false, watchlist: false });
  const [ratingInfo, setRatingInfo] = useState({ average_rating: 0, rating_count: 0, my_rating: null });
  const [reviewRating, setReviewRating] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [reportReason, setReportReason] = useState(reportReasons[0]);
  const [reportText, setReportText] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [registerPromptOpen, setRegisterPromptOpen] = useState(false);
  const [forgotPromptOpen, setForgotPromptOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/movie/${id}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        if (json.episodes?.length) setSelectedEpisode(json.episodes[0].episode_number);
        setLoading(false);
      })
      .catch(() => {
        setError('Không thể tải dữ liệu phim');
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!user.id) return;
    fetch(`${API}/user/library-status/${id}`, { headers: { 'x-user-id': user.id } })
      .then((res) => res.json())
      .then((status) => setLibraryStatus({
        favorite: Boolean(status.favorite),
        watchlist: Boolean(status.watchlist),
      }))
      .catch(() => {});
  }, [id, user.id]);

  const fetchFeedback = () => {
    const headers = user.id ? { 'x-user-id': user.id } : {};
    Promise.all([
      fetch(`${API}/movies/${id}/ratings`, { headers }).then((res) => res.json()),
      fetch(`${API}/movies/${id}/comments`).then((res) => res.json()),
    ])
      .then(([ratings, commentsData]) => {
        setRatingInfo(ratings);
        setReviewRating(Number(ratings.my_rating) || 0);
        setComments(Array.isArray(commentsData) ? commentsData : []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchFeedback();
  }, [id, user.id]);

  const handleGenreClick = (genre) => {
    navigate(`/movies?genre=${encodeURIComponent(genre)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const requireLogin = () => {
    setFeedbackMessage('Vui lòng đăng nhập để sử dụng chức năng này.');
    setLoginPromptOpen(true);
  };

  const toggleLibraryItem = async (type) => {
    if (!user.id) {
      requireLogin();
      return;
    }

    const active = libraryStatus[type];
    const endpoint = type === 'favorite' ? '/user/favorites' : '/user/watchlist';
    const res = await fetch(`${API}${active ? `${endpoint}/${id}` : endpoint}`, {
      method: active ? 'DELETE' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': user.id,
      },
      body: active ? undefined : JSON.stringify({ movie_id: id }),
    });

    if (res.ok) setLibraryStatus((prev) => ({ ...prev, [type]: !active }));
  };

  const handleSubmitReview = async (event) => {
    event.preventDefault();
    if (!user.id) {
      setFeedbackMessage('Vui lòng đăng nhập để đánh giá và bình luận.');
      return;
    }
    if (!reviewRating) {
      setFeedbackMessage('Vui lòng chọn điểm đánh giá.');
      return;
    }
    if (!commentText.trim()) {
      setFeedbackMessage('Vui lòng nhập bình luận.');
      return;
    }

    const headers = { 'Content-Type': 'application/json', 'x-user-id': user.id };
    const ratingRes = await fetch(`${API}/movies/${id}/ratings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rating: reviewRating }),
    });
    const commentRes = await fetch(`${API}/movies/${id}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: commentText.trim() }),
    });

    if (ratingRes.ok && commentRes.ok) {
      setCommentText('');
      setFeedbackMessage('Đã gửi đánh giá và bình luận.');
      fetchFeedback();
      return;
    }

    const errorBody = await (ratingRes.ok ? commentRes : ratingRes).json().catch(() => ({}));
    setFeedbackMessage(errorBody.message || 'Không thể gửi đánh giá và bình luận.');
  };

  const handleSubmitReport = async (event) => {
    event.preventDefault();
    const selected = data.episodes?.find((ep) => ep.episode_number === selectedEpisode);
    const res = await fetch(`${API}/movies/${id}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user.id ? { 'x-user-id': user.id } : {}),
      },
      body: JSON.stringify({
        reason: reportReason,
        description: reportText,
        episode_id: selected?.id || null,
      }),
    });

    if (res.ok) {
      setReportText('');
      setFeedbackMessage('Cảm ơn bạn, báo lỗi đã được gửi cho admin.');
    } else {
      const body = await res.json().catch(() => ({}));
      setFeedbackMessage(body.message || 'Không thể gửi báo lỗi.');
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-xl font-bold text-white bg-background">Đang tải dữ liệu phim...</div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center text-xl font-bold text-white bg-background">{error || 'Không tìm thấy phim'}</div>;

  const bgImage = data.bg_url || data.poster_url;
  const selectedEpisodeQuery = selectedEpisode > 1 ? `?ep=${selectedEpisode}` : '';

  return (
    <>
      <div className="relative min-h-screen bg-background text-white pb-20">
        {/* Massive Blurred Cinematic Background */}
        <div className="fixed inset-0 z-0">
          <img src={bgImage} alt="background" className="w-full h-full object-cover opacity-30 scale-105" style={{ filter: 'blur(30px) saturate(1.5)' }} />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
        </div>

        <div className="relative z-10 container mx-auto px-4 md:px-8 max-w-7xl pt-24 md:pt-32">
          
          <div className="flex flex-col md:flex-row gap-8 lg:gap-12 items-start">
            {/* Left: Poster */}
            <div className="w-full md:w-1/3 lg:w-1/4 flex-shrink-0 mx-auto md:mx-0 max-w-[280px]">
              <div className="rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 group relative">
                <img src={data.poster_url} alt={data.title} className="w-full aspect-[2/3] object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            </div>

            {/* Right: Info & Actions */}
            <div className="flex-1 w-full flex flex-col gap-6">
              {/* Titles & Meta */}
              <div>
                {data.title_url ? (
                  <img className="max-w-[300px] md:max-w-[400px] mb-4 drop-shadow-2xl" src={data.title_url} alt={data.title} />
                ) : (
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-black font-heading tracking-tight leading-tight drop-shadow-lg mb-2">
                    {data.title}
                  </h1>
                )}
                {data.original_title && data.original_title !== data.title && (
                  <h2 className="text-lg md:text-xl text-primary font-bold tracking-wide drop-shadow-md mb-4">{data.original_title}</h2>
                )}

                <div className="flex flex-wrap items-center gap-3 text-sm font-semibold mb-6">
                  {data.imdb_rating && (
                    <div className="flex items-center gap-1 border border-[#f5c518] rounded px-2 py-0.5 text-[#f5c518] bg-black/40 backdrop-blur-sm">
                      <span>IMDb</span>
                      <span className="text-white">{Number(data.imdb_rating).toFixed(1)}</span>
                    </div>
                  )}
                  {data.age_limit && <div className="px-2 py-0.5 rounded border border-white/50 text-white bg-white/10 backdrop-blur-sm">{data.age_limit}</div>}
                  {data.release_year && <div className="text-white/90">{data.release_year}</div>}
                  {data.duration && <div className="text-white/90">{data.duration}</div>}
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-6">
                  {data.genres?.map((genre) => (
                    <button key={genre} onClick={() => handleGenreClick(genre)} className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-primary text-white text-sm font-medium transition-colors border border-white/10 hover:border-primary backdrop-blur-sm">
                      {genre}
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary Actions Shell - Glassmorphism */}
              <div className="flex flex-wrap items-center gap-4 p-4 md:p-6 bg-surface/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
                <button
                  onClick={() => navigate(`/watch/${id}${selectedEpisodeQuery}`)}
                  className="flex items-center justify-center gap-2 px-8 py-3.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold text-lg transition-colors shadow-[0_0_20px_rgba(229,9,20,0.4)] group w-full md:w-auto"
                >
                  <PlayArrowIcon className="text-3xl group-hover:scale-110 transition-transform" />
                  <span>Phát Phim</span>
                </button>
                
                <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-start">
                  <button
                    onClick={() => toggleLibraryItem('favorite')}
                    className={`flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all duration-300 border ${libraryStatus.favorite ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/30'}`}
                    title={libraryStatus.favorite ? 'Đã thích' : 'Yêu thích'}
                  >
                    {libraryStatus.favorite ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
                  </button>
                  <button
                    onClick={() => toggleLibraryItem('watchlist')}
                    className={`flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all duration-300 border ${libraryStatus.watchlist ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/30'}`}
                    title={libraryStatus.watchlist ? 'Đã thêm' : 'Thêm vào'}
                  >
                    {libraryStatus.watchlist ? <CheckIcon fontSize="small" /> : <AddIcon fontSize="small" />}
                  </button>
                  <button
                    onClick={() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })}
                    className="flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all duration-300 border bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/30"
                    title="Bình luận"
                  >
                    <ChatBubbleOutlineIcon fontSize="small" />
                  </button>
                </div>

                <div className="md:ml-auto flex flex-col items-end w-full md:w-auto text-center md:text-right mt-4 md:mt-0">
                  <div className="flex items-center justify-center md:justify-end gap-1 text-primary">
                    <span className="text-2xl font-black">{ratingInfo.average_rating || 0}</span>
                    <span className="text-sm font-bold mt-1">/10</span>
                  </div>
                  <div className="text-xs text-white/50">{ratingInfo.rating_count || 0} đánh giá</div>
                </div>
              </div>

              {/* Description */}
              <div className="mt-4 max-w-4xl">
                <h3 className="text-xl font-bold mb-3 text-white">Nội dung phim</h3>
                <p className={`text-text-secondary leading-relaxed text-sm md:text-base ${expanded ? '' : 'line-clamp-4'}`}>
                  {data.description}
                </p>
                {data.description && data.description.length > 250 && (
                  <button onClick={() => setExpanded(!expanded)} className="text-primary hover:text-primary-hover font-bold text-sm mt-2 focus:outline-none">
                    {expanded ? 'Thu gọn' : 'Đọc thêm'}
                  </button>
                )}
              </div>

              {/* Facts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm max-w-4xl bg-white/5 p-4 rounded-xl border border-white/5">
                {data.countries?.length > 0 && <div><span className="text-white/50 mr-2">Quốc gia:</span> <span className="font-semibold text-white/90">{data.countries.join(', ')}</span></div>}
                {data.directors?.length > 0 && <div><span className="text-white/50 mr-2">Đạo diễn:</span> <span className="font-semibold text-white/90">{data.directors.join(', ')}</span></div>}
                {data.producers?.length > 0 && <div className="col-span-1 md:col-span-2"><span className="text-white/50 mr-2">Sản xuất:</span> <span className="font-semibold text-white/90">{data.producers.join(', ')}</span></div>}
              </div>
            </div>
          </div>

          {/* Content Tabs */}
          <div className="mt-16 border-t border-white/10 pt-8">
            <nav className="flex gap-8 mb-8 overflow-x-auto hide-scrollbar border-b border-white/5 pb-2">
              <button onClick={() => setActiveTab('episodes')} className={`pb-3 font-bold text-lg transition-colors relative whitespace-nowrap ${activeTab === 'episodes' ? 'text-white' : 'text-text-secondary hover:text-white'}`}>
                Tập phim
                {activeTab === 'episodes' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-md shadow-[0_0_10px_rgba(229,9,20,0.8)]" />}
              </button>
              <button onClick={() => setActiveTab('actors')} className={`pb-3 font-bold text-lg transition-colors relative whitespace-nowrap ${activeTab === 'actors' ? 'text-white' : 'text-text-secondary hover:text-white'}`}>
                Diễn viên
                {activeTab === 'actors' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-md shadow-[0_0_10px_rgba(229,9,20,0.8)]" />}
              </button>
              <button onClick={() => setActiveTab('suggested')} className={`pb-3 font-bold text-lg transition-colors relative whitespace-nowrap ${activeTab === 'suggested' ? 'text-white' : 'text-text-secondary hover:text-white'}`}>
                Gợi ý tương tự
                {activeTab === 'suggested' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-md shadow-[0_0_10px_rgba(229,9,20,0.8)]" />}
              </button>
            </nav>

            <div className="min-h-[300px]">
              {/* Episodes Tab */}
              {activeTab === 'episodes' && (
                <div className="animate-in fade-in duration-500">
                  <div className="flex items-center gap-4 mb-6">
                    <h3 className="text-2xl font-bold text-white">Danh sách tập</h3>
                    <span className="px-3 py-1 bg-white/10 rounded-full text-sm font-semibold">{data.episodes?.length || 0} tập</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                    {data.episodes?.length > 0 ? data.episodes.map((episode) => (
                      <button
                        key={episode.id || episode.episode_number}
                        onClick={() => {
                          setSelectedEpisode(episode.episode_number);
                          navigate(`/watch/${id}?ep=${episode.episode_number}`);
                        }}
                        className={`relative group overflow-hidden rounded-xl p-4 flex flex-col items-center justify-center transition-all duration-300 border ${selectedEpisode === episode.episode_number ? 'bg-primary/20 border-primary shadow-[0_0_15px_rgba(229,9,20,0.2)]' : 'bg-surface hover:bg-white/10 border-white/5 hover:border-white/20'}`}
                      >
                        <PlayArrowIcon className={`text-4xl mb-2 transition-transform duration-300 group-hover:scale-125 ${selectedEpisode === episode.episode_number ? 'text-primary' : 'text-text-secondary group-hover:text-white'}`} />
                        <span className={`font-bold transition-colors ${selectedEpisode === episode.episode_number ? 'text-white' : 'text-text-secondary group-hover:text-white'}`}>Tập {episode.episode_number}</span>
                      </button>
                    )) : <div className="col-span-full text-text-secondary font-medium">Đang cập nhật tập phim...</div>}
                  </div>
                </div>
              )}

              {/* Actors Tab */}
              {activeTab === 'actors' && (
                <div className="animate-in fade-in duration-500">
                  <h3 className="text-2xl font-bold text-white mb-6">Dàn diễn viên</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {data.actors?.length > 0 ? data.actors.map((actor) => (
                      <div key={actor.id || actor.name} className="flex items-center gap-4 p-4 rounded-2xl bg-surface/50 border border-white/5 hover:bg-surface hover:border-white/10 transition-colors">
                        <img src={actor.profile_pic_url || '/avatar-actor.svg'} alt={actor.name} className="w-16 h-16 rounded-full object-cover border-2 border-white/10" onError={(e) => { e.currentTarget.src = '/avatar-actor.svg'; }} />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-bold truncate">{actor.name}</h4>
                          {actor.bio && <p className="text-text-secondary text-xs line-clamp-2 mt-1">{actor.bio}</p>}
                        </div>
                      </div>
                    )) : <div className="text-text-secondary font-medium">Chưa có thông tin diễn viên</div>}
                  </div>
                </div>
              )}

              {/* Suggested Tab */}
              {activeTab === 'suggested' && (
                <div className="animate-in fade-in duration-500">
                  <h3 className="text-2xl font-bold text-white mb-6">Có thể bạn sẽ thích</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                    {data.suggested?.length > 0 ? data.suggested.map((movie) => (
                      <button key={movie.id} onClick={() => navigate(`/movies/${movie.id}`)} className="group text-left focus:outline-none">
                        <div className="relative overflow-hidden rounded-xl aspect-[2/3] mb-3">
                          <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <PlayArrowIcon className="text-5xl text-white drop-shadow-lg" />
                          </div>
                        </div>
                        <h4 className="text-white font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors">{movie.title}</h4>
                      </button>
                    )) : <div className="col-span-full text-text-secondary font-medium">Không có đề xuất phù hợp</div>}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Sections: Comments & Reports */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-16">
              
              {/* Left Col: Comments (Takes 2 columns on large screens) */}
              <div className="lg:col-span-2 space-y-8" id="comments">
                <div className="bg-surface/50 border border-white/10 rounded-2xl p-6 md:p-8">
                  <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                    <h3 className="text-2xl font-bold text-white">Đánh giá & Bình luận ({comments.length})</h3>
                  </div>

                  <form onSubmit={handleSubmitReview} className="mb-10">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center gap-1 bg-black/40 px-4 py-2 rounded-xl border border-white/5">
                        <span className="text-3xl font-black text-primary">{ratingInfo.average_rating || 0}</span>
                        <div className="flex flex-col text-xs font-bold text-text-secondary leading-tight">
                          <span>/ 10</span>
                          <span>{ratingInfo.rating_count || 0} lượt</span>
                        </div>
                      </div>
                      <div className="flex-1 flex items-center gap-1 overflow-x-auto hide-scrollbar">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
                          <button
                            type="button"
                            key={score}
                            onClick={() => setReviewRating(score)}
                            className={`flex-shrink-0 w-10 h-10 rounded-lg font-bold text-sm transition-all ${Number(reviewRating) === score ? 'bg-primary text-white shadow-[0_0_10px_rgba(229,9,20,0.5)]' : 'bg-white/5 text-text-secondary hover:bg-white/20 hover:text-white'}`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder={user.id ? 'Chia sẻ cảm nhận của bạn về phim này...' : 'Vui lòng đăng nhập để bình luận'}
                      disabled={!user.id}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors min-h-[120px] resize-y"
                      maxLength={1000}
                    />
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-xs text-text-secondary font-medium">{commentText.length}/1000</span>
                      <button
                        type="submit"
                        disabled={!user.id || !reviewRating || !commentText.trim()}
                        className="px-6 py-2 bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-text-secondary disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                      >
                        Gửi đánh giá
                      </button>
                    </div>
                    {feedbackMessage && <div className="mt-4 p-3 bg-primary/20 border border-primary/50 text-white rounded-lg text-sm">{feedbackMessage}</div>}
                  </form>

                  <div className="space-y-6">
                    {comments.length > 0 ? comments.map((comment) => (
                      <div key={comment.id} className="flex gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-md">
                          {comment.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 bg-black/20 p-4 rounded-2xl rounded-tl-none border border-white/5">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-bold text-white text-sm">{comment.username}</h5>
                            <span className="text-xs text-text-secondary">{new Date(comment.created_at).toLocaleString('vi-VN')}</span>
                          </div>
                          <p className="text-white/80 text-sm leading-relaxed whitespace-pre-line">{comment.content}</p>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-10 bg-black/20 rounded-2xl border border-white/5">
                        <ChatBubbleOutlineIcon className="text-6xl text-white/10 mb-4" />
                        <p className="text-text-secondary font-medium">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Col: Report Form */}
              <div className="lg:col-span-1">
                <form onSubmit={handleSubmitReport} className="bg-surface/50 border border-white/10 rounded-2xl p-6 sticky top-24">
                  <h3 className="text-xl font-bold text-white mb-2">Báo cáo sự cố</h3>
                  <p className="text-text-secondary text-sm mb-6">Giúp chúng tôi cải thiện trải nghiệm của bạn</p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-white/70 mb-2">Vấn đề gặp phải</label>
                      <select 
                        value={reportReason} 
                        onChange={(e) => setReportReason(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none"
                      >
                        {reportReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/70 mb-2">Mô tả chi tiết</label>
                      <textarea
                        value={reportText}
                        onChange={(e) => setReportText(e.target.value)}
                        placeholder="Mô tả cụ thể lỗi bạn đang gặp..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors min-h-[100px] resize-y"
                      />
                    </div>
                    <button type="submit" className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold rounded-xl transition-colors">
                      Gửi Báo Cáo
                    </button>
                  </div>
                </form>
              </div>

            </div>
          </div>
        </div>
      </div>

      <LoginDialog
        open={loginPromptOpen}
        onClose={() => setLoginPromptOpen(false)}
        onRegister={() => { setLoginPromptOpen(false); setRegisterPromptOpen(true); }}
        onForgot={() => { setLoginPromptOpen(false); setForgotPromptOpen(true); }}
      />
      <RegisterDialog
        open={registerPromptOpen}
        onClose={() => setRegisterPromptOpen(false)}
        onLogin={() => { setRegisterPromptOpen(false); setLoginPromptOpen(true); }}
      />
      <ForgotPasswordDialog
        open={forgotPromptOpen}
        onClose={() => setForgotPromptOpen(false)}
        onLogin={() => { setForgotPromptOpen(false); setLoginPromptOpen(true); }}
      />
    </>
  );
};

export default DetailMovies;
