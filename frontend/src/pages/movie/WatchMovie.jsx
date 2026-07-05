import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaArrowLeft, FaChevronLeft, FaChevronRight, FaRegCommentDots, FaRegHeart, FaShareAlt, FaStar, FaTimes } from "react-icons/fa";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import VideoPlayer from "../../components/player/VideoPlayer";
import { API_BASE_URL, API_URL as API } from "../../config/api";
import {
  getActiveProfile,
  getProfileHeaders,
  getProfilePlayerSettings,
  mergeProfilePlayerSettings,
  setActiveProfile,
} from "../../utils/profile";

const REPORT_REASONS = [
  "Video không phát",
  "Sai tập",
  "Âm thanh lỗi",
  "Phụ đề lỗi",
  "Link die",
  "Khác",
];

const PLAYER_SETTINGS_KEY = "itmove_player_settings";

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function getPlayerSettingsStorageKey(profile = getActiveProfile()) {
  return profile?.id ? `${PLAYER_SETTINGS_KEY}:${profile.id}` : PLAYER_SETTINGS_KEY;
}

function getStoredPlayerSettings(profile = getActiveProfile()) {
  try {
    const parsed = JSON.parse(localStorage.getItem(getPlayerSettingsStorageKey(profile)) || "{}");
    return { ...getProfilePlayerSettings(profile), ...parsed };
  } catch {
    return getProfilePlayerSettings(profile);
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

function getItemName(item) {
  if (typeof item === "string") return item.trim();
  return String(item?.name || item?.title || "").trim();
}

function normalizeNameList(items) {
  if (!Array.isArray(items)) return [];
  return items.map(getItemName).filter(Boolean);
}

function normalizeLookupRows(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (typeof item === "string") return { id: item || index, name: item };
      const name = getItemName(item);
      return name ? { ...item, id: item?.id || name || index, name } : null;
    })
    .filter(Boolean);
}

function formatViewCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return `${new Intl.NumberFormat("vi-VN").format(number)} lượt xem`;
}

function formatRating(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return number > 10 ? number.toFixed(0) : number.toFixed(1);
}

function formatAgeLimit(value) {
  if (!value) return "";
  const label = String(value).trim();
  if (!label) return "";
  return /^\d+$/.test(label) ? `T${label}` : label;
}

function formatDuration(value) {
  const label = String(value || "").trim();
  if (!label) return "";
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return label;
  return `${number} phút`;
}

function buildMetaItems(movie, episodes, countries) {
  return [
    movie?.release_year,
    formatAgeLimit(movie?.age_limit),
    countries.join(", "),
    episodes.length ? `${episodes.length} Tập` : formatDuration(movie?.duration),
    movie?.quality,
  ].filter(Boolean);
}

function getEpisodePlaybackSource(episode) {
  return episode?.hls_url || episode?.video_url || "";
}

function getEpisodePoster(episode, movie) {
  return episode?.thumbnail_url || movie?.bg_url || movie?.poster_url || "";
}

async function fetchWatchPayload(movieId, signal) {
  const primaryError = new Error("Không thể tải phim.");

  try {
    const response = await fetch(`${API}/watch/${movieId}`, { signal });
    if (response.ok) return response.json();
  } catch (error) {
    if (error.name === "AbortError") throw error;
  }

  try {
    const [moviesResponse, episodesResponse] = await Promise.all([
      fetch(`${API}/movies`, { signal }),
      fetch(`${API}/movies/${movieId}/episodes`, { signal }),
    ]);

    if (!moviesResponse.ok) throw primaryError;

    const [movies, episodes] = await Promise.all([
      moviesResponse.json(),
      episodesResponse.ok ? episodesResponse.json() : Promise.resolve([]),
    ]);

    const movie = (Array.isArray(movies) ? movies : [])
      .find((item) => Number(item.id) === Number(movieId));

    if (!movie) throw primaryError;

    const genreRows = normalizeLookupRows(movie.genres);
    const countryRows = normalizeNameList(movie.countries);

    return {
      movie: {
        ...movie,
        genres: genreRows.map((genre) => genre.name),
        countries: countryRows,
        directors: normalizeLookupRows(movie.directors),
        actors: normalizeLookupRows(movie.actors),
      },
      genres: genreRows,
      countries: countryRows,
      directors: normalizeLookupRows(movie.directors),
      actors: normalizeLookupRows(movie.actors),
      suggested: [],
      episodes: Array.isArray(episodes) ? episodes : [],
    };
  } catch (fallbackError) {
    if (fallbackError.name === "AbortError") throw fallbackError;
    throw primaryError;
  }
}

function EpisodeShelf({ open, movie, episodes, selectedEpisode, onClose, onSelectEpisode }) {
  useEffect(() => {
    if (!open) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  if (!open) return null;

  const activeEpisodeNumber = Number(selectedEpisode);
  const seasonLabel = movie?.is_series || episodes.length > 1 ? "Phần 1" : "Limited Series";

  return (
    <div className="fixed inset-0 z-[95] text-white">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/20 backdrop-blur-[1px]"
        aria-label="Đóng danh sách tập"
        onClick={onClose}
      />

      <section className="pointer-events-auto absolute bottom-20 left-3 right-3 z-10 max-h-[72vh] overflow-hidden rounded-sm border border-white/10 bg-[#111111]/95 shadow-[0_28px_90px_rgba(0,0,0,0.8)] backdrop-blur-md md:left-10 md:right-auto md:w-[660px] lg:bottom-24">
        <div className="flex h-16 items-center justify-between border-b border-white/10 bg-[#0b0b0b] px-5 md:px-6">
          <button
            type="button"
            className="flex min-w-0 items-center gap-3 text-left text-lg font-black text-white md:text-xl"
          >
            <span className="truncate">{seasonLabel}</span>
            <FaChevronRight className="rotate-90 text-white/75" size={18} />
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-bold text-white/45 sm:inline">{episodes.length} tập</span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Đóng"
            >
              <FaTimes size={16} />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(72vh-4rem)] overflow-y-auto [scrollbar-color:#555_transparent] [scrollbar-width:thin]">
          {episodes.length === 0 ? (
            <div className="px-5 py-8 text-center text-white/55">
              Chưa có tập phim.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {episodes.map((episode) => {
                const active = Number(episode.episode_number) === activeEpisodeNumber;
                const title = formatEpisodeTitle(episode);
                const thumb = getEpisodePoster(episode, movie);
                const description = episode.description || movie?.description || "Nội dung tập đang được cập nhật.";

                return (
                  <button
                    key={episode.id}
                    onClick={() => onSelectEpisode(episode)}
                    className={`group/episode block w-full text-left transition-colors ${active ? "bg-[#303030]" : "hover:bg-white/[0.06]"}`}
                    type="button"
                  >
                    <div className={`relative px-5 py-4 md:px-6 ${active ? "ring-2 ring-inset ring-white" : ""}`}>
                      <div className="grid grid-cols-[2.2rem_minmax(0,1fr)_8rem] items-center gap-3 md:grid-cols-[2.6rem_minmax(0,1fr)_10rem]">
                        <span className="text-center text-xl font-black text-white/90">{episode.episode_number}</span>
                        <h3 className="line-clamp-1 text-lg font-black text-white md:text-xl">{title}</h3>
                        <span className="relative h-1 rounded-full bg-white/35">
                          <span className={`absolute bottom-0 left-0 top-0 rounded-full ${active ? "w-2/3 bg-[#e50914]" : "w-0 bg-[#e50914]"}`} />
                        </span>
                      </div>

                      {active && (
                        <div className="mt-5 grid gap-5 md:grid-cols-[minmax(190px,0.95fr)_1.4fr] md:items-center">
                          <div className="relative aspect-video overflow-hidden bg-black">
                            {thumb && (
                              <img
                                src={thumb}
                                alt=""
                                className="h-full w-full object-cover opacity-90"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <span className="absolute inset-0 flex items-center justify-center">
                              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-2xl">
                                <PlayArrowIcon />
                              </span>
                            </span>
                          </div>
                          <p className="line-clamp-4 text-base font-semibold leading-6 text-white/85 md:text-lg md:leading-7">
                            {description}
                          </p>
                        </div>
                      )}
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

function WatchAction({ icon, label, detail, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 flex-col items-center gap-2 text-center text-white/75 transition-colors hover:text-white"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl transition-colors group-hover:bg-white/20">
        {icon}
      </span>
      <span className="text-sm font-bold">{label}</span>
      {detail && <span className="-mt-1 text-xs font-semibold text-white/45">{detail}</span>}
    </button>
  );
}

function DetailLine({ label, value }) {
  if (!value) return null;

  return (
    <p className="text-sm leading-relaxed text-white/60">
      <span className="font-bold text-white/45">{label}: </span>
      <span className="font-bold text-white/90">{value}</span>
    </p>
  );
}

function WatchInfoSection({
  movie,
  episodes,
  selectedEpisode,
  currentEpisode,
  metaItems,
  genres,
  actors,
  directors,
  suggestedMovies,
  viewLabel,
  ratingLabel,
  shareCopied,
  onSelectEpisode,
  onOpenEpisodeList,
  onOpenMovie,
  onGoDetail,
  onShare,
}) {
  const description = movie?.description || "Nội dung phim đang được cập nhật.";
  const activeEpisodeNumber = Number(selectedEpisode);
  const relatedMovies = Array.isArray(suggestedMovies) ? suggestedMovies : [];
  const episodeRailRef = useRef(null);
  const [episodeRailState, setEpisodeRailState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const updateEpisodeRailState = useCallback(() => {
    const rail = episodeRailRef.current;
    if (!rail) return;

    const maxScrollLeft = Math.max(rail.scrollWidth - rail.clientWidth, 0);
    setEpisodeRailState({
      hasOverflow: maxScrollLeft > 2,
      canScrollLeft: rail.scrollLeft > 2,
      canScrollRight: rail.scrollLeft < maxScrollLeft - 2,
    });
  }, []);

  const scrollEpisodes = useCallback((direction) => {
    const rail = episodeRailRef.current;
    if (!rail) return;

    rail.scrollBy({
      left: direction * Math.max(rail.clientWidth * 0.82, 300),
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    updateEpisodeRailState();
    const frameId = window.requestAnimationFrame(updateEpisodeRailState);
    const rail = episodeRailRef.current;

    window.addEventListener("resize", updateEpisodeRailState);
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateEpisodeRailState) : null;
    if (rail) resizeObserver?.observe(rail);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateEpisodeRailState);
      resizeObserver?.disconnect();
    };
  }, [episodes.length, updateEpisodeRailState]);

  return (
    <section className="bg-black px-4 py-8 text-white md:px-8 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <h2 className="text-2xl font-black leading-tight md:text-3xl">{movie?.title}</h2>
            {movie?.original_title && movie.original_title !== movie.title && (
              <p className="mt-3 text-base font-bold text-white/70">{movie.original_title}</p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-bold text-white/80 md:text-base">
              {viewLabel && <span>{viewLabel}</span>}
              {ratingLabel && (
                <span className="inline-flex items-center gap-2">
                  {ratingLabel}
                  <span className="inline-flex gap-0.5 text-[#e3a61a]">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <FaStar key={index} />
                    ))}
                  </span>
                </span>
              )}
            </div>

            {metaItems.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-3 text-base font-black text-white/90">
                {metaItems.map((item, index) => (
                  <React.Fragment key={`${item}-${index}`}>
                    {index > 0 && <span className="h-5 w-px bg-white/25" />}
                    <span>{item}</span>
                  </React.Fragment>
                ))}
              </div>
            )}

            {currentEpisode && (
              <h3 className="mt-6 text-xl font-black">{formatEpisodeTitle(currentEpisode)}</h3>
            )}

            <p className="mt-4 max-w-5xl text-base font-semibold leading-7 text-white/80">
              {description}
            </p>

            {episodes.length > 0 && (
              <div className="mt-9 xl:w-[calc(100%_+_392px)]">
                <div className="mb-5 flex flex-wrap items-end gap-4">
                  <h2 className="text-3xl font-black">Danh sách tập</h2>
                  <span className="pb-1 text-sm font-black text-white/70">{episodes.length}/{episodes.length} tập</span>
                  <button
                    type="button"
                    onClick={onOpenEpisodeList}
                    className="ml-auto rounded-md border border-white/30 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-white/10"
                  >
                    Tất cả tập
                  </button>
                </div>

                <div className="relative">
                  {episodeRailState.hasOverflow && episodeRailState.canScrollLeft && (
                    <button
                      type="button"
                      aria-label="Scroll episodes left"
                      onClick={() => scrollEpisodes(-1)}
                      className="absolute left-0 top-[38%] z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/75 text-white shadow-2xl backdrop-blur transition-colors hover:bg-black/90 md:flex"
                    >
                      <FaChevronLeft size={24} />
                    </button>
                  )}

                  <div
                    ref={episodeRailRef}
                    onScroll={updateEpisodeRailState}
                    className="-mx-4 flex scroll-smooth gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0"
                  >
                    {episodes.map((episode) => {
                      const active = Number(episode.episode_number) === activeEpisodeNumber;
                      return (
                        <button
                          key={episode.id}
                          type="button"
                          onClick={() => onSelectEpisode(episode)}
                          className="group w-[240px] shrink-0 text-left"
                        >
                          <div className={`relative aspect-video overflow-hidden rounded-xl bg-white/5 ring-2 transition-all duration-300 ${active ? "ring-primary shadow-[0_0_20px_rgba(229,9,20,0.3)]" : "ring-transparent group-hover:ring-white/30"}`}>
                            <img
                            src={getEpisodePoster(episode, movie)}
                              alt=""
                              className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-110"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                            {active && (
                              <span className="absolute left-3 top-3 rounded bg-primary px-2 py-1 text-xs font-black text-white shadow-lg">
                                Đang xem
                              </span>
                            )}
                          </div>
                          <h3 className={`mt-3 line-clamp-1 text-base font-black transition-colors ${active ? "text-primary" : "text-white group-hover:text-primary/80"}`}>{formatEpisodeTitle(episode)}</h3>
                          <p className="mt-1 text-sm font-bold text-white/55">
                            {movie?.age_limit ? `${formatAgeLimit(movie.age_limit)} | ` : ""}{movie?.quality || "Full HD"}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {episodeRailState.hasOverflow && episodeRailState.canScrollRight && (
                    <button
                      type="button"
                      aria-label="Scroll episodes right"
                      onClick={() => scrollEpisodes(1)}
                      className="absolute right-0 top-[38%] z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/75 text-white shadow-2xl backdrop-blur transition-colors hover:bg-black/90 md:flex"
                    >
                      <FaChevronRight size={24} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {relatedMovies.length > 0 && (
              <div className="mt-9">
                <h2 className="mb-5 text-3xl font-black">Video liên quan</h2>
                <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
                  {relatedMovies.map((item) => {
                    const itemId = item.id || item.movie_id;
                    return (
                      <button
                        key={itemId}
                        type="button"
                        onClick={() => itemId && onOpenMovie(itemId)}
                        className="group w-[190px] shrink-0 text-left"
                      >
                        <div className="aspect-[2/3] overflow-hidden rounded-sm bg-[#1c1c1c]">
                          <img
                            src={item.poster_url || item.bg_url}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <h3 className="mt-3 line-clamp-2 text-sm font-black text-white">{item.title}</h3>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-7 xl:pt-1">
            <div className="grid grid-cols-3 gap-3">
              <WatchAction icon={<FaRegHeart />} label="Yêu thích" onClick={onGoDetail} />
              <WatchAction icon={<FaRegCommentDots />} label="Bình luận" onClick={onGoDetail} />
              <WatchAction icon={<FaShareAlt />} label="Chia sẻ" detail={shareCopied ? "Đã sao chép" : ""} onClick={onShare} />
            </div>

            <div className="space-y-4">
              <DetailLine label="Diễn viên" value={actors.join(", ")} />
              <DetailLine label="Đạo diễn" value={directors.join(", ")} />
              <DetailLine label="Thể loại" value={genres.join(", ")} />
            </div>
          </aside>
        </div>
      </div>
    </section>
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
  const initialPlayerSettings = useMemo(() => getStoredPlayerSettings(), []);

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
  const [shareCopied, setShareCopied] = useState(false);

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
  const genres = useMemo(() => normalizeNameList(data?.genres?.length ? data.genres : movie?.genres), [data?.genres, movie?.genres]);
  const countries = useMemo(() => normalizeNameList(data?.countries?.length ? data.countries : movie?.countries), [data?.countries, movie?.countries]);
  const actors = useMemo(() => normalizeNameList(data?.actors?.length ? data.actors : movie?.actors), [data?.actors, movie?.actors]);
  const directors = useMemo(() => normalizeNameList(data?.directors?.length ? data.directors : movie?.directors), [data?.directors, movie?.directors]);
  const suggestedMovies = useMemo(() => data?.suggested || movie?.suggested || [], [data?.suggested, movie?.suggested]);
  const metaItems = useMemo(() => buildMetaItems(movie, episodes, countries), [countries, episodes, movie]);
  const viewLabel = useMemo(() => formatViewCount(movie?.views), [movie?.views]);
  const ratingLabel = useMemo(() => formatRating(movie?.imdb_rating), [movie?.imdb_rating]);

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
      const activeProfile = getActiveProfile();
      localStorage.setItem(getPlayerSettingsStorageKey(activeProfile), JSON.stringify(next));

      if (activeProfile?.id) {
        const optimisticProfile = mergeProfilePlayerSettings(activeProfile, next);
        setActiveProfile(optimisticProfile);

        fetch(`${API}/profiles/${activeProfile.id}/settings`, {
          method: "PUT",
          headers: getProfileHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(next),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((payload) => {
            if (payload?.profile) setActiveProfile(payload.profile);
          })
          .catch(() => {});
      }

      return next;
    });

    if (key === "cinemaDefault") setCinemaMode(Boolean(value));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetchWatchPayload(id, controller.signal)
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

  const handleGoDetail = useCallback(() => {
    navigate(`/movies/${id}`);
  }, [id, navigate]);

  const handleOpenMovie = useCallback((movieId) => {
    navigate(`/movies/${movieId}`);
  }, [navigate]);

  const handleShare = useCallback(async () => {
    const shareUrl = window.location.href;
    setShareCopied(false);

    try {
      if (navigator.share) {
        await navigator.share({ title: movie?.title || document.title, url: shareUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    } catch {
      setShareCopied(false);
    }
  }, [movie?.title]);

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
    <div className="min-h-screen overflow-x-hidden bg-black text-white">
      <section className="relative h-[100dvh] min-h-[520px] overflow-hidden bg-black">
        <div className="absolute inset-0 z-0">
        {currentEpisode ? (
          <VideoPlayer
            ref={videoRef}
            src={getEpisodePlaybackSource(currentEpisode)}
            poster={getEpisodePoster(currentEpisode, movie)}
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
            onClick={handleGoDetail}
            className="pointer-events-auto ml-auto hidden rounded-full border border-white/12 bg-black/35 px-4 py-2 text-sm font-black text-white backdrop-blur-md transition-colors hover:bg-white/16 md:inline-flex"
          >
            Chi tiết
          </button>
        </div>
      </div>

      </section>

      <WatchInfoSection
        movie={movie}
        episodes={episodes}
        selectedEpisode={selectedEpisode}
        currentEpisode={currentEpisode}
        metaItems={metaItems}
        genres={genres}
        actors={actors}
        directors={directors}
        suggestedMovies={suggestedMovies}
        viewLabel={viewLabel}
        ratingLabel={ratingLabel}
        shareCopied={shareCopied}
        onSelectEpisode={handleSelectEpisode}
        onOpenEpisodeList={() => setEpisodeShelfOpen(true)}
        onOpenMovie={handleOpenMovie}
        onGoDetail={handleGoDetail}
        onShare={handleShare}
      />

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
