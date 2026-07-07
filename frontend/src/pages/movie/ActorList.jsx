import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_URL as API } from '../../config/api';

const PAGE_SIZE = 36;

function getInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
}

function slugifyName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function actorPath(actor) {
  const slug = slugifyName(actor.name);
  return `/dien-vien/${actor.id}${slug ? `-${slug}` : ''}`;
}

function hasImage(actor) {
  return Boolean(String(actor?.profile_pic_url || '').trim());
}

function ActorCard({ actor, onClick }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = hasImage(actor) && !imageFailed ? actor.profile_pic_url : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-[5/6] w-full overflow-hidden rounded-lg bg-[#202330] text-left shadow-[0_12px_30px_rgba(0,0,0,0.22)] outline-none transition-transform duration-300 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-primary/80"
    >
      {image ? (
        <img
          src={image}
          alt={actor.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/10 via-white/[0.03] to-primary/20 text-4xl font-black text-white/80">
          {getInitials(actor.name)}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#171b26] via-[#171b26]/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 px-3 pb-3 text-center">
        <h2 className="line-clamp-2 text-base font-black leading-tight text-white drop-shadow-md md:text-[17px]">
          {actor.name}
        </h2>
      </div>
    </button>
  );
}

function ActorCardSkeleton() {
  return (
    <div className="aspect-[5/6] overflow-hidden rounded-lg bg-white/[0.06]">
      <div className="h-full w-full -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((pageNumber) => (
      pageNumber === 1
      || pageNumber === totalPages
      || Math.abs(pageNumber - page) <= 1
    ));

  return (
    <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="h-10 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
      >
        Trước
      </button>

      {visiblePages.map((pageNumber, index) => {
        const previousPage = visiblePages[index - 1];
        const showGap = previousPage && pageNumber - previousPage > 1;

        return (
          <span key={pageNumber} className="inline-flex items-center gap-2">
            {showGap && <span className="px-1 text-white/35">...</span>}
            <button
              type="button"
              onClick={() => onPageChange(pageNumber)}
              className={`h-10 min-w-10 rounded-lg px-3 text-sm font-black transition-colors ${
                page === pageNumber
                  ? 'bg-white text-background'
                  : 'border border-white/10 bg-white/[0.04] text-white hover:bg-white/10'
              }`}
            >
              {pageNumber}
            </button>
          </span>
        );
      })}

      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="h-10 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
      >
        Sau
      </button>

      <span className="ml-2 text-sm font-bold text-white/45">
        Trang {page} / {totalPages}
      </span>
    </div>
  );
}

export default function ActorList() {
  const [actors, setActors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetch(`${API}/actors?image_priority=true&with_stats=true`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => []);
        if (!response.ok) throw new Error(payload.message || 'Không thể tải diễn viên.');
        return Array.isArray(payload) ? payload : [];
      })
      .then((payload) => {
        const sorted = [...payload].sort((left, right) => {
          const imageGap = Number(hasImage(right)) - Number(hasImage(left));
          if (imageGap !== 0) return imageGap;
          return Number(right.movie_count || 0) - Number(left.movie_count || 0);
        });
        setActors(sorted);
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message || 'Không thể tải diễn viên.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const totalPages = Math.max(1, Math.ceil(actors.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageActors = useMemo(
    () => actors.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [actors, safePage]
  );

  useEffect(() => {
    if (!loading && page !== safePage) {
      setSearchParams(safePage > 1 ? { page: String(safePage) } : {});
    }
  }, [loading, page, safePage, setSearchParams]);

  const handlePageChange = (nextPage) => {
    setSearchParams(nextPage > 1 ? { page: String(nextPage) } : {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background px-4 pb-16 pt-24 text-white md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-white md:text-3xl">Diễn viên</h1>
        </div>

        {error ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-16 text-center">
            <h2 className="text-xl font-black text-white">Không tải được dữ liệu</h2>
            <p className="mt-2 text-sm text-white/55">{error}</p>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-12 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 18 }).map((_, index) => (
              <ActorCardSkeleton key={index} />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-5 gap-y-12 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {pageActors.map((actor) => (
                <ActorCard
                  key={actor.id}
                  actor={actor}
                  onClick={() => navigate(actorPath(actor))}
                />
              ))}
            </div>

            <Pagination page={safePage} totalPages={totalPages} onPageChange={handlePageChange} />
          </>
        )}
      </div>
    </div>
  );
}
