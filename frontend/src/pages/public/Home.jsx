import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import Banner from '../../components/layout/Banner';
import { API_BASE_URL as API } from '../../config/api';

const MovieSlider = lazy(() => import('../../components/movie/MovieSlider'));
const ContinueWatchingSection = lazy(() => import('../../components/movie/ContinueWatchingSection'));
const Top10Slider = lazy(() => import('../../components/movie/Top10Slider'));

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

function SectionSkeleton({ className = 'h-[300px]' }) {
  return (
    <div className={`${className} w-full relative bg-[#1A1A1A] overflow-hidden rounded-xl`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite_linear] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

function useNearViewport(rootMargin = '700px 0px') {
  const ref = useRef(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    if (isNear) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    if (!('IntersectionObserver' in window)) {
      setIsNear(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isNear, rootMargin]);

  return [ref, isNear];
}

function DeferredTop10Section({ movies }) {
  const [sectionRef, shouldRender] = useNearViewport('900px 0px');

  return (
    <div ref={sectionRef} className="min-h-[360px] md:min-h-[430px]">
      {shouldRender ? (
        <Suspense fallback={<SectionSkeleton />}>
          <Top10Slider movies={movies} title="Top 10 Phim Thịnh Hành" />
        </Suspense>
      ) : (
        <SectionSkeleton />
      )}
    </div>
  );
}

function CategoryMovieSection({ category }) {
  const [sectionRef, shouldLoad] = useNearViewport('800px 0px');
  const [movies, setMovies] = useState([]);

  useEffect(() => {
    if (!shouldLoad || !category?.id) return undefined;

    let cancelled = false;
    getJson(`${API}/api/categories/${category.id}/movies?limit=8`)
      .then((data) => {
        if (!cancelled) {
          setMovies(data.map(normalizeMovie));
        }
      })
      .catch(() => {
        if (!cancelled) setMovies([]);
      });

    return () => {
      cancelled = true;
    };
  }, [category?.id, shouldLoad]);

  return (
    <div ref={sectionRef} className="min-h-[390px] md:min-h-[430px]">
      {shouldLoad ? (
        <Suspense fallback={<SectionSkeleton />}>
          <MovieSlider
            movies={movies}
            title={category.name}
            categoryId={category.id}
            categoryName={category.name}
          />
        </Suspense>
      ) : (
        <SectionSkeleton />
      )}
    </div>
  );
}

function normalizeMovie(movie) {
  return {
    ...movie,
    poster: movie.poster_url,
    originalTitle: movie.original_title || movie.title,
  };
}

export default function Home() {
  const [newMovies, setNewMovies] = useState([]);
  const [topViewedMovies, setTopViewedMovies] = useState([]);
  const [categories, setCategories] = useState([]);
  const [hasStoredUser] = useState(() => Boolean(localStorage.getItem('user')));

  useEffect(() => {
    Promise.all([
      getJson(`${API}/api/movies?limit=12&sort=recent`).catch(() => []),
      getJson(`${API}/api/movies?limit=10&sort=views`).catch(() => []),
      getJson(`${API}/api/categories`).catch(() => [])
    ]).then(([movies, topMovies, categoryList]) => {
      setNewMovies(movies.map(normalizeMovie));
      setTopViewedMovies(topMovies.map(normalizeMovie));
      setCategories(categoryList);
    });
  }, []);

  return (
    <div className="w-full bg-background min-h-screen pb-20 overflow-x-hidden">
      <h1 className="sr-only">Nền tảng phim trực tuyến cao cấp IT Move</h1>
      <Banner />

      <div className="w-full px-[16px] md:px-[32px] lg:px-[48px] xl:px-[72px] relative z-20 -mt-20 md:-mt-32 space-y-10 md:space-y-16">
        {hasStoredUser && (
          <Suspense fallback={<SectionSkeleton className="h-[200px]" />}>
            <ContinueWatchingSection />
          </Suspense>
        )}
        
        <Suspense fallback={<SectionSkeleton />}>
          <MovieSlider movies={newMovies} title="Phim mới cập nhật" />
        </Suspense>

        <DeferredTop10Section movies={topViewedMovies} />

        {categories.map((category) => (
          <CategoryMovieSection key={category.id} category={category} />
        ))}
      </div>
    </div>
  );
}
