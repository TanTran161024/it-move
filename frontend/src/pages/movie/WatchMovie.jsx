import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaArrowLeft, FaTimes } from "react-icons/fa";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import VideoPlayer from "../../components/player/VideoPlayer";
import { API_BASE_URL, API_URL as API } from "../../config/api";
import { getProfileHeaders } from "../../utils/profile";

const REPORT_REASONS = [
  "Video không phát",
  "Sai tập",
  "Âm thanh lỗi",
  "Phụ đề lỗi",
  "Link die",
  "Khác",
];

const PLAYER_SETTINGS_KEY = "itmove_player_settings";
const DEFAULT_PLAYER_SETTINGS = {
  autoplayNext: true,
  cinemaDefault: false,
  subtitleStyle: "default",
  subtitleTrack: "auto",
};

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function getStoredPlayerSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAYER_SETTINGS_KEY) || "{}");
    return { ...DEFAULT_PLAYER_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
}

function formatEpisodeTitle(episode) {
  if (!episode) return "Chưa có tập";
  return `Tập ${episode.episode_number}${episode.title ? ` - ${episode.title}` : ""}`;
}

function normalizeSubtitleTracks(currentEpisode) {
  const apiTracks = Array.isArray(currentEpisode?.subtitle_tracks) ? currentEpisode.subtitle_tracks : [];
  if (apiTracks.length) {
    return apiTracks
      .map((track, index) => {
        const src = String(track.src || track.url || "").trim();
        if (!src) return null;
        return {
          id: track.id || `subtitle-${index + 1}`,
          label: track.label || "Phụ đề",
          srclang: track.srclang || "vi",
          src: src.startsWith("http") ? src : `${API_BASE_URL}${src}`,
        };
      })
      .filter(Boolean);
  }

  if (!currentEpisode?.id || !currentEpisode?.subtitle_url) return [];
  return [
    {
      id: `episode-${currentEpisode.id}-vi`,
      label: "Tiếng Việt",
      srclang: "vi",
      src: `${API}/subtitles/episodes/${currentEpisode.id}.vtt`,
    },
  ];
}

function EpisodeShelf({ open, movie, episodes, selectedEpisode, onClose, onSelectEpisode }) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[95] flex items-end bg-black/60 backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Đóng danh sách tập"
        onClick={onClose}
      />
      <section className="relative z-10 w-full border-t border-white/10 bg-[#050505]/96 px-4 pb-6 pt-5 shadow-[0_-30px_80px_rgba(0,0,0,0.65)] md:px-8 md:pb-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e50914]">Episodes</p>
              <h2 className="truncate text-2xl font-black text-white md:text-4xl">{movie?.title}</h2>
              <p className="mt-1 text-sm font-semibold text-white/45">{episodes.length} tập đang có sẵn</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Đóng"
            >
              <FaTimes />
            </button>
          </div>

          {episodes.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-8 text-center text-white/55">
              Chưa có tập phim.
            </div>
          ) : (
            <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
              {episodes.map((episode) => {
                const active = Number(selectedEpisode) === Number(episode.episode_number);
                return (
                  <button
                    key={episode.id}
                    onClick={() => onSelectEpisode(episode)}
                    className={`group/episode w-[210px] shrink-0 overflow-hidden rounded-xl border text-left transition-colors ${
                      active
                        ? "border-[#e50914] bg-[#e50914]/15"
                        : "border-white/10 bg-white/[0.05] hover:border-white/25 hover:bg-white/[0.09]"
                    }`}
                    type="button"
                  >
                    <div className="relative aspect-video overflow-hidden bg-[#171717]">
                      <img
                        src={movie?.poster_url}
                        alt=""
                        className="h-full w-full object-cover opacity-55 transition-transform duration-300 group-hover/episode:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                      <div className={`absolute left-3 top-3 rounded-md px-2 py-1 text-xs font-black ${active ? "bg-[#e50914] text-white" : "bg-black/70 text-white"}`}>
                        Tập {episode.episode_number}
                      </div>
                      {active && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-2xl">
                            <PlayArrowIcon />
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="line-clamp-1 text-sm font-black text-white">{formatEpisodeTitle(episode)}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/45">
                        {active ? "Đang xem" : "Chọn để phát tập này"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const WatchMovie = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const epParam = Number.parseInt(query.get("ep"), 10);
  const urlResumeAt = Number(query.get("t") || 0);
  const user = useMemo(getStoredUser, []);
  const initialPlayerSettings = useMemo(getStoredPlayerSettings, []);

  const [data, setData] = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playerSettings, setPlayerSettings] = useState(initialPlayerSettings);
  const [cinemaMode, setCinemaMode] = useState(Boolean(initialPlayerSettings.cinemaDefault));
  const [episodeShelfOpen, setEpisodeShelfOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDescription, setReportDescription] = useState("");
  const [reportStatus, setReportStatus] = useState({ type: "", message: "" });

  const videoRef = useRef(null);
  const movie = data?.movie || null;
  const episodes = useMemo(() => data?.episodes || [], [data?.episodes]);
  const currentEpisode = useMemo(
    () => episodes.find((episode) => Number(episode.episode_number) === Number(selectedEpisode)) || episodes[0] || null,
    [episodes, selectedEpisode]
  );
  const currentEpisodeIndex = useMemo(
    () => episodes.findIndex((episode) => Number(episode.episode_number) === Number(selectedEpisode)),
    [episodes, selectedEpisode]
  );
  const hasNextEpisode = currentEpisodeIndex >= 0 && currentEpisodeIndex < episodes.length - 1;
  const currentSubtitleTracks = useMemo(() => normalizeSubtitleTracks(currentEpisode), [currentEpisode]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    const closeOverlay = (event) => {
      if (event.key !== "Escape") return;
      setEpisodeShelfOpen(false);
      setReportOpen(false);
    };
    window.addEventListener("keydown", closeOverlay);
    return () => window.removeEventListener("keydown", closeOverlay);
  }, []);

  const handlePlayerSettingChange = useCallback((key, value) => {
    setPlayerSettings((current) => {
      const next = { ...current, [key]: value };
      localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(next));
      return next;
    });

    if (key === "cinemaDefault") setCinemaMode(Boolean(value));
  }, []);

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
          const selected = epParam && availableEpisodes.some((episode) => Number(episode.episode_number) === epParam)
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
      headers: getProfileHeaders(),
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
      headers: getProfileHeaders({ "Content-Type": "application/json" }),
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
    setEpisodeShelfOpen(false);
    navigate(`/watch/${id}?ep=${episode.episode_number}`, { replace: true });
  }, [id, navigate]);

  const handleNextEpisode = useCallback(async (snapshot) => {
    const nextEpisode = currentEpisodeIndex >= 0 ? episodes[currentEpisodeIndex + 1] : null;
    if (!nextEpisode) return;
    await saveProgress(snapshot);
    handleSelectEpisode(nextEpisode);
  }, [currentEpisodeIndex, episodes, handleSelectEpisode, saveProgress]);

  const handleEnded = useCallback(async (snapshot) => {
    await saveProgress(snapshot, true);
    if (!playerSettings.autoplayNext) return;

    const index = episodes.findIndex((episode) => Number(episode.episode_number) === Number(selectedEpisode));
    const nextEpisode = index >= 0 ? episodes[index + 1] : null;
    if (nextEpisode) handleSelectEpisode(nextEpisode);
  }, [episodes, handleSelectEpisode, playerSettings.autoplayNext, saveProgress, selectedEpisode]);

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
      <div className="fixed inset-0 flex items-center justify-center bg-black text-xl font-bold text-white">
        <div className="h-11 w-11 animate-spin rounded-full border-2 border-white/20 border-t-[#e50914]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black px-4 text-center text-white">
        <div className="text-2xl font-black">{error || "Không tìm thấy phim."}</div>
        <button className="rounded-lg bg-white/10 px-5 py-2 hover:bg-white/20" onClick={handleBack} type="button">
          Quay lại
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
      <div className="absolute inset-0 z-0">
        {currentEpisode ? (
          <VideoPlayer
            ref={videoRef}
            src={currentEpisode.video_url}
            poster={movie.poster_url}
            resumeAt={resumeAt}
            onSnapshot={(snapshot) => saveProgress(snapshot)}
            onEnded={handleEnded}
            hasNextEpisode={hasNextEpisode}
            onNextEpisode={handleNextEpisode}
            onOpenEpisodeList={() => setEpisodeShelfOpen(true)}
            playerSettings={playerSettings}
            onPlayerSettingChange={handlePlayerSettingChange}
            subtitles={currentSubtitleTracks}
            autoPlay
            onReport={() => {
              setReportOpen(true);
              setReportStatus({ type: "", message: "" });
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-black text-white/70">
            Phim chưa có tập phát.
          </div>
        )}
      </div>

      <div className={`pointer-events-none absolute inset-x-0 top-0 z-[70] bg-gradient-to-b from-black/80 via-black/35 to-transparent px-4 pb-24 pt-4 transition-opacity duration-300 md:px-8 md:pt-6 ${cinemaMode ? "opacity-0" : "opacity-100"}`}>
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="pointer-events-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-white/18"
            title="Quay lại"
            type="button"
          >
            <FaArrowLeft />
          </button>
          <div className="min-w-0">
            <p className="hidden text-xs font-black uppercase tracking-[0.28em] text-[#e50914] md:block">Now Playing</p>
            <h1 className="truncate text-xl font-black drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] md:text-4xl">
              {movie.title}
            </h1>
            <p className="mt-1 truncate text-sm font-semibold text-white/60 md:text-base">
              {formatEpisodeTitle(currentEpisode)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/movies/${id}`)}
            className="pointer-events-auto ml-auto hidden rounded-full border border-white/12 bg-black/35 px-4 py-2 text-sm font-black text-white backdrop-blur-md transition-colors hover:bg-white/16 md:inline-flex"
          >
            Chi tiết
          </button>
        </div>
      </div>

      <EpisodeShelf
        open={episodeShelfOpen}
        movie={movie}
        episodes={episodes}
        selectedEpisode={selectedEpisode}
        onClose={() => setEpisodeShelfOpen(false)}
        onSelectEpisode={handleSelectEpisode}
      />

      {reportOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/78 px-4 backdrop-blur-sm">
          <form onSubmit={handleReportSubmit} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#141414] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e50914]">Report</p>
                <h3 className="mt-1 text-xl font-black">Báo lỗi video</h3>
                <p className="mt-1 text-sm text-white/45">
                  {movie.title}{currentEpisode ? ` - Tập ${currentEpisode.episode_number}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setReportOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
                <FaTimes />
              </button>
            </div>

            <label className="mb-2 block text-sm font-semibold" htmlFor="report-reason">Lý do</label>
            <select
              id="report-reason"
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              className="mb-4 w-full rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-white outline-none focus:border-[#e50914]"
            >
              {REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>

            <label className="mb-2 block text-sm font-semibold" htmlFor="report-description">Mô tả thêm</label>
            <textarea
              id="report-description"
              value={reportDescription}
              onChange={(event) => setReportDescription(event.target.value)}
              rows={4}
              maxLength={1000}
              className="w-full resize-none rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-white outline-none focus:border-[#e50914]"
              placeholder="Ví dụ: video bị đứng ở phút 05:20"
            />

            {reportStatus.message && (
              <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${reportStatus.type === "success" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200" : "border-red-500/30 bg-red-500/15 text-red-200"}`}>
                {reportStatus.message}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setReportOpen(false)} className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20">
                Hủy
              </button>
              <button type="submit" className="rounded-lg bg-[#e50914] px-5 py-2 font-bold hover:bg-[#f6121d]">
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
