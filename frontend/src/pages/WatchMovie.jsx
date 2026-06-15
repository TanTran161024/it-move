import React, { useEffect, useState, useRef } from "react";
import "./WatchMovie.css";
import { FaArrowLeft } from "react-icons/fa";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import VideoPlayer from "../components/player/VideoPlayer";

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

  if (!data) return <div>Loading...</div>;
  const { movie, genres, episodes } = data;
  const currentEpisode = episodes.find(e => e.episode_number === selectedEpisode) || episodes[0];

  const handleBack = () => {
    window.history.back();
  };

  return (
    <div className="watch-movie-container">
      <div className="wm-movie-header">
        <button className="wm-back-btn" onClick={handleBack} title="Quay lại trang chi tiết phim">
          <FaArrowLeft />
        </button>
        <span className="wm-movie-title">Xem phim {movie.title}</span>
      </div>
      {/* Video Player Component */}
      <VideoPlayer
        ref={videoRef}
        src={currentEpisode?.video_url}
        poster={movie.poster_url}
      />
      {/* Info & Actions */}
      <div className="wm-info-actions">
        {/* Left: Poster + Info */}
        <div className="wm-info-left">
          <div className="wm-poster">
            <img src={movie.poster_url} alt="Poster" />
          </div>
          <div className="wm-info-main">
            <h2 className="wm-title">{movie.title}</h2>
            {movie.original_title && <div className="wm-english-title">{movie.original_title}</div>}
            <div className="wm-badges">
              {movie.imdb_rating && <span className="banner-badge banner-badge-imdb"><span className="imdb-label">IMDb</span> <span className="imdb-score">{Number(movie.imdb_rating).toFixed(1)}</span></span>}
              {movie.age_limit && <span className="banner-badge banner-badge-age">{movie.age_limit}</span>}
              {movie.release_year && <span className="banner-badge banner-badge-default">{movie.release_year}</span>}
              {movie.duration && <span className="banner-badge banner-badge-default">{movie.duration}</span>}
            </div>
            <div className="wm-tags">
              {genres.map(g => (
                <span
                  className="banner-tag"
                  key={g.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/movies?genre=${encodeURIComponent(g.name)}`)}
                >
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        {/* Right: Description + Button */}
        <div className="wm-info-right">
          <div className="wm-description">
            {movie.description}
          </div>
          <button 
            className="wm-info-btn" 
            onClick={() => navigate(`/movies/${id}`)}
          >
            Thông tin phim <span className="wm-info-btn-arrow">&gt;</span>
          </button>
        </div>
      </div>
      {/* End movie info section */}
      <hr className="wm-divider" />
      <div className="wm-section-title">Các bản chiếu</div>
      <div className="episode-list">
        {episodes.map((ep, i) => (
          <button
            key={ep.id}
            className={`episode-btn${selectedEpisode === ep.episode_number ? ' active' : ''}`}
            onClick={() => {
              setSelectedEpisode(ep.episode_number);
              navigate(`/watch/${id}?ep=${ep.episode_number}`);
            }}
          >
            <span className="episode-icon" style={{display:'flex',alignItems:'center'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{display:'block'}}>
                <path d="M8 5v14l11-7z"/>
              </svg>
            </span> Tập {ep.episode_number}
          </button>
        ))}
      </div>
      {/* Đánh giá & Bình luận */}
    </div>
  );
};

export default WatchMovie;
