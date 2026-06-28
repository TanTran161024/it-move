import React, { useEffect, useState, useRef } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import VideoPlayer from "../../components/player/VideoPlayer";
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const WatchMovie = () => {
  const { id } = useParams();
  const query = useQuery();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const videoRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    fetch(`/api/watch/${id}`)
      .then(res => res.json())
      .then(data => {
        setData(data);
        if (data.episodes && data.episodes.length > 0) {
          const epParam = parseInt(query.get('ep'), 10);
          if (epParam && data.episodes.some(e => e.episode_number === epParam)) {
            setSelectedEpisode(epParam);
          } else {
            setSelectedEpisode(data.episodes[0].episode_number);
          }
        }
      });
    // eslint-disable-next-line
  }, [id, query.get('ep')]);

  useEffect(() => {
    return () => {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const resumeAt = Number(query.get('t') || 0);
    if (!resumeAt || !selectedEpisode) return;
    const video = videoRef.current;
    if (!video) return;

    const seekToResumePoint = () => {
      if (Number.isFinite(video.duration) && video.duration > resumeAt) {
        video.currentTime = resumeAt;
      }
    };

    if (video.readyState >= 1) seekToResumePoint();
    video.addEventListener('loadedmetadata', seekToResumePoint, { once: true });
    return () => video.removeEventListener('loadedmetadata', seekToResumePoint);
  }, [query, selectedEpisode]);

  useEffect(() => {
    if (!user.id || !data?.movie || !data?.episodes?.length || !selectedEpisode) return;
    const episode = data.episodes.find(e => e.episode_number === selectedEpisode) || data.episodes[0];
    if (!episode) return;

    const saveProgress = () => {
      const video = videoRef.current;
      const isDirectVideo = video && typeof video.currentTime === 'number';
      const progress = video && Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
      fetch('/api/user/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({
          movie_id: data.movie.id,
          episode_id: episode.id,
          episode_number: episode.episode_number,
          progress_seconds: Math.floor(progress),
          duration_seconds: Math.floor(duration),
          completed: isDirectVideo && duration > 0 && progress / duration >= 0.9,
        }),
      }).catch(() => {});
    };

    saveProgress();
    const interval = setInterval(saveProgress, videoRef.current ? 10000 : 30000);
    return () => {
      clearInterval(interval);
      saveProgress();
    };
  }, [user.id, data, selectedEpisode]);

  if (!data) return <div className="min-h-screen flex items-center justify-center text-xl font-bold text-white bg-background">Loading...</div>;
  const { movie, genres, episodes } = data;
  const currentEpisode = episodes.find(e => e.episode_number === selectedEpisode) || episodes[0];

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center gap-4 px-6 py-4 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm pointer-events-none">
        <button 
          onClick={handleBack}
          className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md"
          title="Quay lại"
        >
          <FaArrowLeft />
        </button>
        <h1 className="text-xl md:text-2xl font-bold drop-shadow-md truncate pointer-events-auto">
          {movie.title} {currentEpisode ? `- Tập ${currentEpisode.episode_number}` : ''}
        </h1>
      </div>

      {/* Video Player */}
      <div className="w-full bg-black flex-shrink-0 -mt-20 z-40 relative shadow-2xl">
        <div className="max-w-7xl mx-auto aspect-video">
          <VideoPlayer
            ref={videoRef}
            src={currentEpisode?.video_url}
            poster={movie.poster_url}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 container mx-auto px-4 md:px-8 py-8 max-w-7xl">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left/Top: Movie Info */}
          <div className="w-full lg:w-2/3 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="w-full sm:w-1/3 max-w-[200px] flex-shrink-0 mx-auto sm:mx-0">
                <img src={movie.poster_url} alt={movie.title} className="w-full aspect-[2/3] object-cover rounded-xl shadow-lg border border-white/10" />
              </div>
              <div className="flex-1 flex flex-col gap-3">
                <h2 className="text-3xl font-black text-white">{movie.title}</h2>
                {movie.original_title && <h3 className="text-lg text-primary font-bold">{movie.original_title}</h3>}
                
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {movie.imdb_rating && (
                    <div className="flex items-center gap-1 bg-[#f5c518]/20 border border-[#f5c518] rounded px-2 py-0.5 text-[#f5c518] font-bold text-sm">
                      <span>IMDb</span>
                      <span className="text-white">{Number(movie.imdb_rating).toFixed(1)}</span>
                    </div>
                  )}
                  {movie.age_limit && <span className="px-2 py-0.5 rounded border border-white/50 text-white bg-white/10 text-sm font-semibold">{movie.age_limit}</span>}
                  {movie.release_year && <span className="px-2 py-0.5 rounded border border-white/20 text-white/90 text-sm">{movie.release_year}</span>}
                  {movie.duration && <span className="px-2 py-0.5 rounded border border-white/20 text-white/90 text-sm">{movie.duration}</span>}
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  {genres.map(g => (
                    <span
                      key={g.id}
                      className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs font-medium cursor-pointer transition-colors text-white/80 hover:text-white"
                      onClick={() => navigate(`/movies?genre=${encodeURIComponent(g.name)}`)}
                    >
                      {g.name}
                    </span>
                  ))}
                </div>

                <p className="text-text-secondary text-sm leading-relaxed mt-4 line-clamp-3">
                  {movie.description}
                </p>

                <button 
                  onClick={() => navigate(`/movies/${id}`)}
                  className="mt-auto self-start px-6 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg transition-colors border border-white/10 text-sm"
                >
                  Xem chi tiết phim
                </button>
              </div>
            </div>
          </div>

          {/* Right/Bottom: Episodes List */}
          <div className="w-full lg:w-1/3">
            <div className="bg-surface/50 border border-white/10 rounded-2xl p-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Danh sách tập</h3>
                <span className="text-sm font-medium text-text-secondary">{episodes.length} tập</span>
              </div>
              
              <div className="flex-1 overflow-y-auto max-h-[400px] lg:max-h-none pr-2 space-y-2 custom-scrollbar">
                {episodes.map((ep) => (
                  <button
                    key={ep.id}
                    onClick={() => {
                      setSelectedEpisode(ep.episode_number);
                      navigate(`/watch/${id}?ep=${ep.episode_number}`, { replace: true });
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-300 border ${selectedEpisode === ep.episode_number ? 'bg-primary/20 border-primary text-white shadow-[0_0_10px_rgba(229,9,20,0.2)]' : 'bg-black/40 border-white/5 text-text-secondary hover:bg-white/10 hover:text-white'}`}
                  >
                    <div className="flex items-center gap-3">
                      {selectedEpisode === ep.episode_number ? (
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
                          <PlayArrowIcon fontSize="small" className="text-white" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold border border-white/10">
                          {ep.episode_number}
                        </div>
                      )}
                      <span className="font-bold">Tập {ep.episode_number}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WatchMovie;
