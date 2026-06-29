import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaArrowLeft, FaBug, FaLightbulb, FaTimes } from "react-icons/fa";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VideoPlayer from "../../components/player/VideoPlayer";
import { API_URL as API } from "../../config/api";

const REPORT_REASONS = [
  "Video không phát",
  "Sai tập",
  "Âm thanh lỗi",
  "Phụ đề lỗi",
  "Link die",
  "Khác",
];

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

const WatchMovie = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const epParam = Number.parseInt(query.get("ep"), 10);
  const urlResumeAt = Number(query.get("t") || 0);
  const user = useMemo(getStoredUser, []);

  const [data, setData] = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cinemaMode, setCinemaMode] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDescription, setReportDescription] = useState("");
  const [reportStatus, setReportStatus] = useState({ type: "", message: "" });

  const videoRef = useRef(null);

  const movie = data?.movie || null;
  const genres = useMemo(() => data?.genres || [], [data?.genres]);
  const episodes = useMemo(() => data?.episodes || [], [data?.episodes]);
  const currentEpisode = useMemo(
    () => episodes.find((episode) => episode.episode_number === selectedEpisode) || episodes[0] || null,
    [episodes, selectedEpisode]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetch(`${API}/watch/${id}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Không thể tải phim.");
        return res.json();
      })
      .then((payload) => {
        setData(payload);
        const availableEpisodes = payload.episodes || [];
        if (availableEpisodes.length > 0) {
          const selected = epParam && availableEpisodes.some((episode) => episode.episode_number === epParam)
            ? epParam
            : availableEpisodes[0].episode_number;
          setSelectedEpisode(selected);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || "Không thể tải phim.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id, epParam]);

  useEffect(() => {
    return () => {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!currentEpisode || !movie) {
      setResumeAt(0);
      return undefined;
    }

    if (!user.id) {
      setResumeAt(urlResumeAt > 5 ? urlResumeAt : 0);
      return undefined;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      movie_id: String(movie.id),
      episode_id: String(currentEpisode.id),
    });

    fetch(`${API}/watch-history/progress?${params.toString()}`, {
      headers: { "x-user-id": user.id },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!payload) {
          setResumeAt(urlResumeAt > 5 ? urlResumeAt : 0);
          return;
        }
        const savedSeconds = Number(payload.progress?.progress_seconds || 0);
        setResumeAt(payload.should_resume ? savedSeconds : (urlResumeAt > 5 ? urlResumeAt : 0));
      })
      .catch(() => {
        if (!controller.signal.aborted) setResumeAt(urlResumeAt > 5 ? urlResumeAt : 0);
      });

    return () => controller.abort();
  }, [currentEpisode, movie, urlResumeAt, user.id]);

  const saveProgress = useCallback(async (snapshot = null, forceCompleted = false) => {
    if (!user.id || !movie || !currentEpisode) return;

    const video = videoRef.current;
    const progress = Number.isFinite(snapshot?.currentTime)
      ? snapshot.currentTime
      : Number.isFinite(video?.currentTime)
        ? video.currentTime
        : 0;
    const duration = Number.isFinite(snapshot?.duration)
      ? snapshot.duration
      : Number.isFinite(video?.duration)
        ? video.duration
        : 0;

    await fetch(`${API}/watch-history/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user.id,
      },
      body: JSON.stringify({
        movie_id: movie.id,
        episode_id: currentEpisode.id,
        episode_number: currentEpisode.episode_number,
        progress_seconds: Math.floor(progress),
        duration_seconds: Math.floor(duration),
        completed: forceCompleted || (duration > 0 && progress / duration >= 0.9),
      }),
    }).catch(() => {});
  }, [currentEpisode, movie, user.id]);

  useEffect(() => {
    if (!user.id || !movie || !currentEpisode) return undefined;

    const interval = setInterval(() => {
      saveProgress();
    }, 15000);

    const handleBeforeUnload = () => {
      saveProgress();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      saveProgress();
    };
  }, [currentEpisode, movie, saveProgress, user.id]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleSelectEpisode = useCallback((episode) => {
    setSelectedEpisode(episode.episode_number);
    setResumeAt(0);
    navigate(`/watch/${id}?ep=${episode.episode_number}`, { replace: true });
  }, [id, navigate]);

  const handleEnded = useCallback(async (snapshot) => {
    await saveProgress(snapshot, true);
    const index = episodes.findIndex((episode) => episode.episode_number === selectedEpisode);
    const nextEpisode = index >= 0 ? episodes[index + 1] : null;
    if (nextEpisode) {
      handleSelectEpisode(nextEpisode);
    }
  }, [episodes, handleSelectEpisode, saveProgress, selectedEpisode]);

  const handleReportSubmit = async (event) => {
    event.preventDefault();
    if (!movie) return;

    setReportStatus({ type: "", message: "" });
    try {
      const headers = { "Content-Type": "application/json" };
      if (user.id) headers["x-user-id"] = user.id;
      const res = await fetch(`${API}/movie-reports`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          movie_id: movie.id,
          episode_id: currentEpisode?.id || null,
          reason: reportReason,
          description: reportDescription,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Không thể gửi báo lỗi.");
      setReportStatus({ type: "success", message: payload.message || "Đã gửi báo lỗi video." });
      setReportDescription("");
      setTimeout(() => setReportOpen(false), 700);
    } catch (err) {
      setReportStatus({ type: "error", message: err.message || "Không thể gửi báo lỗi." });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xl font-bold text-white bg-background">
        Đang tải...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-white bg-background px-4 text-center">
        <div className="text-2xl font-black">{error || "Không tìm thấy phim."}</div>
        <button className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/20" onClick={handleBack} type="button">
          Quay lại
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-white flex flex-col">
      {cinemaMode && <div className="fixed inset-0 bg-black/85 z-30 pointer-events-none" />}

      <div className="sticky top-0 z-50 flex items-center gap-4 px-6 py-4 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm pointer-events-none">
        <button
          onClick={handleBack}
          className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md"
          title="Quay lại"
          type="button"
        >
          <FaArrowLeft />
        </button>
        <h1 className="text-xl md:text-2xl font-bold drop-shadow-md truncate pointer-events-auto">
          {movie.title} {currentEpisode ? `- Tập ${currentEpisode.episode_number}` : ""}
        </h1>
      </div>

      <div className="w-full bg-black flex-shrink-0 -mt-20 z-40 relative shadow-2xl">
        <div className="max-w-7xl mx-auto aspect-video">
          {currentEpisode ? (
            <VideoPlayer
              ref={videoRef}
              src={currentEpisode.video_url}
              poster={movie.poster_url}
              resumeAt={resumeAt}
              onSnapshot={(snapshot) => saveProgress(snapshot)}
              onEnded={handleEnded}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black text-white/70">
              Phim chưa có tập phát.
            </div>
          )}
        </div>
      </div>

      <div className="relative z-40 border-b border-white/10 bg-black/40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-text-secondary">
            {currentEpisode ? `Tập ${currentEpisode.episode_number}${currentEpisode.title ? ` - ${currentEpisode.title}` : ""}` : "Chưa có tập"}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCinemaMode((value) => !value)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${cinemaMode ? "bg-primary/20 border-primary text-primary" : "bg-white/5 border-white/10 text-white hover:bg-white/10"}`}
            >
              <FaLightbulb /> {cinemaMode ? "Bật đèn" : "Tắt đèn"}
            </button>
            <button
              type="button"
              onClick={() => {
                setReportOpen(true);
                setReportStatus({ type: "", message: "" });
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
            >
              <FaBug /> Báo lỗi
            </button>
          </div>
        </div>
      </div>

      <div className={`flex-1 container mx-auto px-4 md:px-8 py-8 max-w-7xl transition-opacity ${cinemaMode ? "opacity-25" : "opacity-100"}`}>
        <div className="flex flex-col lg:flex-row gap-8">
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
                  {genres.map((genre) => (
                    <span
                      key={genre.id}
                      className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs font-medium cursor-pointer transition-colors text-white/80 hover:text-white"
                      onClick={() => navigate(`/movies?genre=${encodeURIComponent(genre.name)}`)}
                    >
                      {genre.name}
                    </span>
                  ))}
                </div>

                <p className="text-text-secondary text-sm leading-relaxed mt-4 line-clamp-3">
                  {movie.description}
                </p>

                <button
                  onClick={() => navigate(`/movies/${id}`)}
                  className="mt-auto self-start px-6 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg transition-colors border border-white/10 text-sm"
                  type="button"
                >
                  Xem chi tiết phim
                </button>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-1/3">
            <div className="bg-surface/50 border border-white/10 rounded-2xl p-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Danh sách tập</h3>
                <span className="text-sm font-medium text-text-secondary">{episodes.length} tập</span>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[400px] lg:max-h-none pr-2 space-y-2 custom-scrollbar">
                {episodes.length === 0 ? (
                  <div className="text-text-secondary text-sm py-6 text-center">Chưa có tập phim.</div>
                ) : episodes.map((episode) => (
                  <button
                    key={episode.id}
                    onClick={() => handleSelectEpisode(episode)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-300 border ${selectedEpisode === episode.episode_number ? "bg-primary/20 border-primary text-white shadow-[0_0_10px_rgba(229,9,20,0.2)]" : "bg-black/40 border-white/5 text-text-secondary hover:bg-white/10 hover:text-white"}`}
                    type="button"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {selectedEpisode === episode.episode_number ? (
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg flex-shrink-0">
                          <PlayArrowIcon fontSize="small" className="text-white" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold border border-white/10 flex-shrink-0">
                          {episode.episode_number}
                        </div>
                      )}
                      <span className="font-bold truncate">Tập {episode.episode_number}{episode.title ? ` - ${episode.title}` : ""}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {reportOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/75 backdrop-blur-sm flex items-center justify-center px-4">
          <form onSubmit={handleReportSubmit} className="w-full max-w-lg rounded-2xl bg-[#181a20] border border-white/10 shadow-2xl p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-black">Báo lỗi video</h3>
                <p className="text-sm text-text-secondary mt-1">{movie.title}{currentEpisode ? ` - Tập ${currentEpisode.episode_number}` : ""}</p>
              </div>
              <button type="button" onClick={() => setReportOpen(false)} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                <FaTimes />
              </button>
            </div>

            <label className="block text-sm font-semibold mb-2" htmlFor="report-reason">Lý do</label>
            <select
              id="report-reason"
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white outline-none focus:border-primary mb-4"
            >
              {REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>

            <label className="block text-sm font-semibold mb-2" htmlFor="report-description">Mô tả thêm</label>
            <textarea
              id="report-description"
              value={reportDescription}
              onChange={(event) => setReportDescription(event.target.value)}
              rows={4}
              maxLength={1000}
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white outline-none focus:border-primary resize-none"
              placeholder="Ví dụ: video bị đứng ở phút 05:20"
            />

            {reportStatus.message && (
              <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${reportStatus.type === "success" ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30" : "bg-red-500/15 text-red-200 border border-red-500/30"}`}>
                {reportStatus.message}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setReportOpen(false)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20">
                Hủy
              </button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 font-bold">
                Gửi báo lỗi
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default WatchMovie;
