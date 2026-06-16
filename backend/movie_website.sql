
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Cơ sở dữ liệu: `movie_website`
--

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `actors`
--

CREATE TABLE `actors` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `profile_pic_url` text DEFAULT NULL,
  `bio` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `actors`
--

INSERT INTO `actors` (`id`, `name`, `profile_pic_url`, `bio`) VALUES
(1, 'Pierce Brosnan', 'https://image.tmdb.org/t/p/w500/dzXVwwJLPwiZeXOnf7YxorqVEEM.jpg', ''),
(2, 'Samuel L. Jackson', 'https://image.tmdb.org/t/p/w500/nCJJ3NVksYNxIzEHcyC1XziwPVj.jpg', ''),
(3, 'Brandon Lessard', 'https://image.tmdb.org/t/p/w500/mHNBdwkGRqDdjMbPK1LEIoTVdhC.jpg', ''),
(4, 'Veronica Ferres', 'https://image.tmdb.org/t/p/w500/coHFoFuANZyDaIUBuJoOeSgGEKl.jpg', '');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `banners`
--

CREATE TABLE `banners` (
  `id` int(11) NOT NULL,
  `movie_id` int(11) NOT NULL,
  `bg_url` text DEFAULT NULL,
  `title_url` text DEFAULT NULL,
  `thumbnails` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `banners`
--

INSERT INTO `banners` (`id`, `movie_id`, `bg_url`, `title_url`, `thumbnails`, `created_at`) VALUES
(1, 1, 'https://static.nutscdn.com/vimg/1920-0/9cc9d2008cb739de22bfa2ecb02f623c.webp&quot', 'https://static.nutscdn.com/vimg/0-260/d77163d9c75119a0933b0be98f6e798a.png', '[\"https://static.nutscdn.com/vimg/1920-0/9cc9d2008cb739de22bfa2ecb02f623c.webp&quot\"]', '2025-07-11 00:00:00'),
(2, 10, 'https://static.nutscdn.com/vimg/1920-0/0d7e0179ed1c60fa3caf57cea4ed6663.webp', 'https://static.nutscdn.com/vimg/0-260/ebfb0189613d2ccfc8734c2efbd9de5e.png', '[\"https://static.nutscdn.com/vimg/1920-0/0d7e0179ed1c60fa3caf57cea4ed6663.webp\"]', '2025-07-11 00:00:00'),
(4, 16, 'https://static.nutscdn.com/vimg/1920-0/f92a70bbd84ec57fa3e81239da6bd44b.webp&quot', 'https://static.nutscdn.com/vimg/0-260/44386cc9a8fd46755e4984ee247c5697.png', '[\"https://static.nutscdn.com/vimg/1920-0/f92a70bbd84ec57fa3e81239da6bd44b.webp&quot\"]', '2025-07-15 23:10:15');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `categories`
--

CREATE TABLE `categories` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `categories`
--

INSERT INTO `categories` (`id`, `name`, `created_at`) VALUES
(6, 'Trải nghiệm tột đỉnh', '2025-07-28 17:57:56'),
(8, 'Đặc sắc điện ảnh', '2025-08-04 16:36:49');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `category_countries`
--

CREATE TABLE `category_countries` (
  `category_id` int(11) NOT NULL,
  `country_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `category_countries`
--

INSERT INTO `category_countries` (`category_id`, `country_id`) VALUES
(8, 4),
(8, 7);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `category_genres`
--

CREATE TABLE `category_genres` (
  `category_id` int(11) NOT NULL,
  `genre_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `category_genres`
--

INSERT INTO `category_genres` (`category_id`, `genre_id`) VALUES
(6, 16),
(6, 25),
(6, 44),
(8, 10),
(8, 17),
(8, 25),
(8, 32);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `countries`
--

CREATE TABLE `countries` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `countries`
--

INSERT INTO `countries` (`id`, `name`) VALUES
(1, 'Việt Nam'),
(2, 'Hàn Quốc'),
(3, 'Trung Quốc'),
(4, 'Mỹ'),
(5, 'Nhật Bản'),
(7, 'Anh'),
(16, 'Đức');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `directors`
--

CREATE TABLE `directors` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `profile_pic_url` text DEFAULT NULL,
  `bio` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `directors`
--

INSERT INTO `directors` (`id`, `name`, `profile_pic_url`, `bio`) VALUES
(1, 'Zhang Yimou', 'https://via.placeholder.com/100x100', 'Đạo diễn nổi tiếng Trung Quốc với nhiều tác phẩm đình đám'),
(3, 'ABC', NULL, NULL);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `episodes`
--

CREATE TABLE `episodes` (
  `id` int(11) NOT NULL,
  `movie_id` int(11) DEFAULT NULL,
  `episode_number` int(11) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `video_url` text DEFAULT NULL,
  `subtitle_url` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `episodes`
--

INSERT INTO `episodes` (`id`, `movie_id`, `episode_number`, `title`, `video_url`, `subtitle_url`, `created_at`) VALUES
(1, 1, 1, 'The Unholy Trinity', 'http://localhost/videos/the-unholy-trinity.mp4', NULL, '2025-07-12 14:27:13'),
(2, 10, 1, 'Tập 1', 'https://www.w3schools.com/html/mov_bbb.mp4', 'https://example.com/subtitle/episode-1.srt', '2025-07-12 12:18:54'),
(3, 12, 2, 'Tập 2', 'https://example.com/video/episode-2.mp4', 'https://example.com/subtitle/episode-2.srt', '2025-07-12 12:18:54'),
(4, 12, 3, 'Tập 3', 'https://example.com/video/episode-3.mp4', 'https://example.com/subtitle/episode-3.srt', '2025-07-12 12:18:54'),
(5, 12, 4, 'Tập 4', 'https://example.com/video/episode-4.mp4', 'https://example.com/subtitle/episode-4.srt', '2025-07-12 12:18:54'),
(6, 12, 5, 'Tập 5', 'https://example.com/video/episode-5.mp4', 'https://example.com/subtitle/episode-5.srt', '2025-07-12 12:18:54'),
(7, 12, 6, 'Tập 6', 'https://example.com/video/episode-6.mp4', 'https://example.com/subtitle/episode-6.srt', '2025-07-12 12:18:54'),
(8, 12, 7, 'Tập 7', 'https://example.com/video/episode-7.mp4', 'https://example.com/subtitle/episode-7.srt', '2025-07-12 12:18:54'),
(9, 12, 8, 'Tập 8', 'https://example.com/video/episode-8.mp4', 'https://example.com/subtitle/episode-8.srt', '2025-07-12 12:18:54'),
(10, 12, 9, 'Tập 9', 'https://example.com/video/episode-9.mp4', 'https://example.com/subtitle/episode-9.srt', '2025-07-12 12:18:54'),
(11, 12, 10, 'Tập 10', 'https://example.com/video/episode-10.mp4', 'https://example.com/subtitle/episode-10.srt', '2025-07-12 12:18:54'),
(12, 12, 11, 'Tập 11', 'https://www.w3schools.com/html/mov_bbb.mp4', 'https://example.com/subtitle/episode-11.srt', '2025-07-12 12:18:54'),
(13, 12, 12, 'Tập 12', 'https://example.com/video/episode-12.mp4', 'https://example.com/subtitle/episode-12.srt', '2025-07-12 12:18:54'),
(14, 12, 13, 'Tập 13', 'https://example.com/video/episode-13.mp4', 'https://example.com/subtitle/episode-13.srt', '2025-07-12 12:18:54'),
(15, 12, 14, 'Tập 14', 'https://example.com/video/episode-14.mp4', 'https://example.com/subtitle/episode-14.srt', '2025-07-12 12:18:54'),
(16, 12, 15, 'Tập 15', 'https://example.com/video/episode-15.mp4', 'https://example.com/subtitle/episode-15.srt', '2025-07-12 12:18:54'),
(17, 12, 16, 'Tập 16', 'https://example.com/video/episode-16.mp4', 'https://example.com/subtitle/episode-16.srt', '2025-07-12 12:18:54'),
(18, 12, 17, 'Tập 17', 'https://example.com/video/episode-17.mp4', 'https://example.com/subtitle/episode-17.srt', '2025-07-12 12:18:54'),
(19, 12, 18, 'Tập 18', 'https://example.com/video/episode-18.mp4', 'https://example.com/subtitle/episode-18.srt', '2025-07-12 12:18:54'),
(23, 2, 1, 'abc', 'http://localhost/videos/the-unholy-trinity.mp4', 'fwfw', '2025-07-22 20:17:40'),
(24, 2, 2, 'xyz', 'http://localhost/videos/the-unholy-trinity.mp4', NULL, '2025-07-22 20:20:51'),
(26, 16, 1, 'a', 'http://localhost/videos/the-unholy-trinity.mp4', NULL, '2025-07-23 13:49:24');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `genres`
--

CREATE TABLE `genres` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `genres`
--

INSERT INTO `genres` (`id`, `name`) VALUES
(1, 'Hành động'),
(2, 'Tình cảm'),
(3, 'Kinh dị'),
(5, 'Phiêu lưu'),
(6, 'Hài'),
(7, 'Tâm lý'),
(8, 'Viễn tưởng'),
(9, 'Chuyển thể'),
(10, 'Chương trình truyền hình'),
(11, 'Cổ trang'),
(12, 'Giả tưởng'),
(13, 'Phép thuật'),
(14, 'Thể thao'),
(15, 'Võ thuật'),
(16, 'Bí ẩn'),
(17, 'Gay cấn'),
(18, 'Hình sự'),
(19, 'Kinh điển'),
(20, 'Lãng mạn'),
(21, 'Nghệ nghiệp'),
(22, 'Siêu anh hùng'),
(23, 'Truyền hình thực tế'),
(24, 'Xuyên không'),
(25, 'Chiến tranh'),
(26, 'Gia đình'),
(27, 'Học đường'),
(28, 'Tuổi trẻ'),
(29, 'Tập luyện'),
(30, 'Đau thương'),
(32, 'Chính trị'),
(33, 'Cách mạng'),
(34, 'DC'),
(35, 'Giáng sinh'),
(36, 'Khoa học'),
(37, 'Kỳ ảo'),
(38, 'Marvel'),
(39, 'Thần thoại'),
(40, 'Đời thường'),
(44, 'Chiếu rạp');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `movies`
--

CREATE TABLE `movies` (
  `id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `age_limit` varchar(10) DEFAULT NULL,
  `original_title` varchar(255) DEFAULT NULL COMMENT 'Tên tiếng Anh',
  `slug` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `release_year` int(11) DEFAULT NULL,
  `duration` varchar(50) DEFAULT NULL,
  `is_series` tinyint(1) DEFAULT NULL,
  `poster_url` text DEFAULT NULL,
  `trailer_url` text DEFAULT NULL,
  `imdb_rating` float DEFAULT NULL,
  `status` enum('ongoing','completed') DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `quality` varchar(20) DEFAULT NULL,
  `views` int(11) NOT NULL DEFAULT 0,
  `is_visible` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `movies`
--

INSERT INTO `movies` (`id`, `title`, `age_limit`, `original_title`, `slug`, `description`, `release_year`, `duration`, `is_series`, `poster_url`, `trailer_url`, `imdb_rating`, `status`, `created_at`, `quality`) VALUES
(1, 'Bộ Ba Bất Hạnh', 'T16', 'The Unholy Trinity', 'bo-ba-bat-hanh', 'Lấy bối cảnh Montana đầy biến động những năm 1870, trong khoảnh khắc trước khi bị hành quyết, Isaac Broadway giao cho người con trai đã xa cách bấy lâu – Henry – một nhiệm vụ bất khả thi: giết kẻ đã vu oan cho ông một tội danh mà ông không hề gây ra. Quyết thực hiện lời hứa, Henry lên đường đến thị trấn hẻo lánh Trinity. Nhưng một sự kiện bất ngờ khiến anh mắc kẹt tại đây, bị cuốn vào cuộc đối đầu giữa Gabriel Dove – vị cảnh trưởng mới chính trực – và một nhân vật bí ẩn tên là St. Christopher.', 2025, '1h35m', 0, 'https://static.nutscdn.com/vimg/1920-0/9cc9d2008cb739de22bfa2ecb02f623c.webp', 'https://www.youtube.com/watch?v=YoHD9XEInc0', 5.8, 'completed', '2025-07-09 15:57:59', '4K'),
(2, 'Avengers: Endgame', 'T16', '', 'avengers-endgame', 'After the devastating events of Avengers: Infinity War, the universe is in ruins.', 2019, '3h1m', 1, 'https://image.tmdb.org/t/p/original/ulzhLuWrPK07P1YkdWQLZnQh1JL.jpg', 'https://www.youtube.com/watch?v=TcMBFSGVi1c', 8.4, 'completed', '2025-07-09 15:57:59', NULL),
(3, 'Parasite', NULL, NULL, 'parasite', 'A poor family schemes to become employed by a wealthy family by infiltrating their household.', 2019, '2h12m', 0, 'https://image.tmdb.org/t/p/original/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', 'https://www.youtube.com/watch?v=5xH0HfJHsaY', 8.6, 'completed', '2025-07-09 16:01:38', NULL),
(4, 'Interstellar', NULL, NULL, 'interstellar', 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.', 2014, '2h49m', 0, 'https://image.tmdb.org/t/p/original/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg', 'https://www.youtube.com/watch?v=zSWdZVtXT7E', 8.7, 'completed', '2025-07-09 16:01:38', NULL),
(5, 'The Dark Knight', NULL, NULL, 'the-dark-knight', 'Batman faces the Joker, a criminal mastermind who wants to plunge Gotham City into anarchy.', 2008, '2h32m', 0, 'https://image.tmdb.org/t/p/original/qJ2tW6WMUDux911r6m7haRef0WH.jpg', 'https://www.youtube.com/watch?v=EXeTwQWrcwY', 9, 'completed', '2025-07-09 16:01:38', NULL),
(7, 'Joker', NULL, NULL, 'joker', 'In Gotham City, mentally troubled comedian Arthur Fleck is disregarded and mistreated by society.', 2019, '2h2m', 0, 'https://image.tmdb.org/t/p/original/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg', 'https://www.youtube.com/watch?v=zAGVQLHvwOY', 8.5, 'completed', '2025-07-09 16:01:38', NULL),
(10, 'Từ Vũ Trụ John Wick: Ballerina', 'T16', 'Ballerina', 'ballerina', 'Lấy bối cảnh giữa sự kiện của Sát thủ John Wick: Phần 3 – Chuẩn Bị Chiến Tranh, bộ phim Từ Vũ Trụ John Wick: Ballerina theo chân Eve Macarro (thủ vai bởi Ana de Armas) trên hành trình trả thù cho cái chết của gia đình mình, dưới sự huấn luyện của tổ chức tội phạm Ruska Roma.', 2025, '2h05m', 0, 'https://static.nutscdn.com/vimg/300-0/fe15c492d94cdcaf1e5e379f44b94d59.jpg', 'https://www.youtube.com/watch?v=YoHD9XEInc0', 7, 'completed', '2025-07-09 15:57:59', '4K'),
(12, 'Chiến Binh Thép', 'T16', 'Tin Soldier', 'chien-binh-thep', 'Tin Soldier xoay quanh nhân vật Nash Cavanaugh (Scott Eastwood thủ vai), một cựu đặc nhiệm tìm cách trả thù Bokushi (Jamie Foxx), thủ lĩnh một giáo phái đã lôi kéo các cựu chiến binh Mỹ vào một chương trình huấn luyện cực đoan. Sau nhiều nỗ lực xâm nhập thất bại, đặc vụ quân đội Emmanuel Ashburn (Robert De Niro) quyết định hợp tác với Nash để thâm nhập vào pháo đài kiên cố của Bokushi và vạch trần sự thật.', 2025, '1h27m', 1, 'https://static.nutscdn.com/vimg/300-0/677ba8c0eb6e8aee4db72e569e9c8d95.jpg', 'https://www.youtube.com/watch?v=example', 3.4, 'ongoing', '2025-07-12 12:18:54', NULL),
(13, 'Người Sắt', NULL, NULL, NULL, 'Phim siêu anh hùng về Tony Stark', 2008, '2h06m', NULL, 'https://via.placeholder.com/300x450', NULL, 7.9, NULL, '2025-07-12 12:18:54', NULL),
(14, 'Batman Begins', NULL, NULL, NULL, 'Khởi nguồn của Batman', 2005, '2h20m', NULL, 'https://via.placeholder.com/300x450', NULL, 8.2, NULL, '2025-07-12 12:18:54', NULL),
(15, 'The Matrix', NULL, NULL, NULL, 'Phim khoa học viễn tưởng kinh điển', 1999, '2h16m', NULL, 'https://via.placeholder.com/300x450', NULL, 8.7, NULL, '2025-07-12 12:18:54', NULL),
(16, 'M3GAN 2.0', 'T18', 'M3GAN 2.0', NULL, 'MEGAN 2.0 lấy bối cảnh 2 năm sau các sự kiện ở phần 1. Lúc này, Gemma phát hiện công nghệ sản xuất MEGAN đã bị đánh cắp. Kẻ gian đã tạo ra một robot AI khác với chức năng tương tự MEGAN, nhưng được trang bị sức mạnh chiến đấu \"khủng\" hơn mang tên Amelia. Để \"đối đầu\" với Amelia, Gemma buộc phải \"hồi sinh\" và cải tiến MEGAN, hứa hẹn một trận chiến \"nảy lửa\" trên màn ảnh vào năm 2025.', 2025, '1h40m', NULL, 'https://static.nutscdn.com/vimg/300-0/9fdba340ff590a5c4038148213e25486.jpg', NULL, 6.3, NULL, '2025-07-15 22:44:00', '4K');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `movie_actors`
--

CREATE TABLE `movie_actors` (
  `movie_id` int(11) NOT NULL,
  `actor_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `movie_actors`
--

INSERT INTO `movie_actors` (`movie_id`, `actor_id`) VALUES
(1, 1),
(1, 2),
(1, 3),
(15, 3);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `movie_countries`
--

CREATE TABLE `movie_countries` (
  `movie_id` int(11) NOT NULL,
  `country_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `movie_countries`
--

INSERT INTO `movie_countries` (`movie_id`, `country_id`) VALUES
(1, 4),
(2, 7),
(12, 4),
(12, 7),
(13, 7),
(15, 4),
(16, 4);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `movie_directors`
--

CREATE TABLE `movie_directors` (
  `movie_id` int(11) NOT NULL,
  `director_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `movie_directors`
--

INSERT INTO `movie_directors` (`movie_id`, `director_id`) VALUES
(15, 3);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `movie_genres`
--

CREATE TABLE `movie_genres` (
  `movie_id` int(11) NOT NULL,
  `genre_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `movie_genres`
--

INSERT INTO `movie_genres` (`movie_id`, `genre_id`) VALUES
(1, 1),
(1, 5),
(1, 17),
(1, 18),
(1, 44),
(2, 5),
(2, 17),
(2, 18),
(2, 44),
(12, 1),
(12, 5),
(12, 17),
(13, 16),
(14, 1),
(15, 3),
(15, 7),
(15, 8),
(15, 17),
(15, 36),
(15, 44),
(16, 3),
(16, 7),
(16, 8),
(16, 17),
(16, 36),
(16, 44);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `movie_producer`
--

CREATE TABLE `movie_producer` (
  `movie_id` int(11) NOT NULL,
  `producer_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `producers`
--

CREATE TABLE `producers` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `country_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `producers`
--

INSERT INTO `producers` (`id`, `name`, `country_id`) VALUES
(2, 'ABC', 4);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `gender` enum('male','female','other') DEFAULT NULL,
  `avatar_url` text DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `email` varchar(100) NOT NULL,
  `is_admin` tinyint(1) DEFAULT 0,
  `email_verified` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `email_otp` varchar(64) DEFAULT NULL,
  `email_otp_expires` datetime DEFAULT NULL,
  `password_reset_otp` varchar(64) DEFAULT NULL,
  `password_reset_expires` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Đang đổ dữ liệu cho bảng `users`
--

INSERT INTO `users` (`id`, `username`, `gender`, `avatar_url`, `phone`, `birth_date`, `password`, `email`, `is_admin`, `email_verified`, `is_active`, `email_otp`, `email_otp_expires`, `password_reset_otp`, `password_reset_expires`, `created_at`) VALUES
(1, 'Admin', 'male', NULL, NULL, NULL, '$2b$10$eRkghm5P/a6P69TCMVaYwuTE4I7SAzNrqD6ZHr0WEJXwPZ.EChuIu', 'admin@gmail.com', 1, 1, 1, NULL, NULL, NULL, NULL, '2025-06-30 10:16:01'),
(8, 'abc2', 'female', NULL, NULL, NULL, '$2b$10$glFoblKMSzqsPLvlW2S6reKGtFoCADxumSyZOnIfToOlTRKSGTDUe', 'abc@gmail.com', 0, 1, 1, NULL, NULL, NULL, NULL, '2025-06-30 12:56:10'),
(9, 'bcd', 'other', NULL, NULL, NULL, '$2b$10$9oPVfgOR7JGpKsJdAbLY8uQvUFZv8ekWClrMD8AFMroK4hdKCOh2W', 'bcd@gmail.com', 0, 1, 1, NULL, NULL, NULL, NULL, '2025-07-15 14:02:55');

-- --------------------------------------------------------

--
-- C?u tr?c b?ng cho b?ng `movie_views`
--

CREATE TABLE IF NOT EXISTS `movie_views` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `movie_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `viewed_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_movie_views_movie` (`movie_id`, `viewed_at`),
  KEY `idx_movie_views_user` (`user_id`, `viewed_at`),
  CONSTRAINT `movie_views_ibfk_1` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `movie_views_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Chỉ mục cho các bảng đã đổ
--

--
-- Chỉ mục cho bảng `actors`
--
ALTER TABLE `actors`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `banners`
--
ALTER TABLE `banners`
  ADD PRIMARY KEY (`id`),
  ADD KEY `movie_id` (`movie_id`);

--
-- Chỉ mục cho bảng `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `category_countries`
--
ALTER TABLE `category_countries`
  ADD PRIMARY KEY (`category_id`,`country_id`),
  ADD KEY `country_id` (`country_id`);

--
-- Chỉ mục cho bảng `category_genres`
--
ALTER TABLE `category_genres`
  ADD PRIMARY KEY (`category_id`,`genre_id`),
  ADD KEY `genre_id` (`genre_id`);

--
-- Chỉ mục cho bảng `countries`
--
ALTER TABLE `countries`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `directors`
--
ALTER TABLE `directors`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `episodes`
--
ALTER TABLE `episodes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `movie_id` (`movie_id`);

--
-- Chỉ mục cho bảng `genres`
--
ALTER TABLE `genres`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `movies`
--
ALTER TABLE `movies`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `movie_actors`
--
ALTER TABLE `movie_actors`
  ADD PRIMARY KEY (`movie_id`,`actor_id`),
  ADD KEY `actor_id` (`actor_id`);

--
-- Chỉ mục cho bảng `movie_countries`
--
ALTER TABLE `movie_countries`
  ADD PRIMARY KEY (`movie_id`,`country_id`),
  ADD KEY `country_id` (`country_id`);

--
-- Chỉ mục cho bảng `movie_directors`
--
ALTER TABLE `movie_directors`
  ADD PRIMARY KEY (`movie_id`,`director_id`),
  ADD KEY `director_id` (`director_id`);

--
-- Chỉ mục cho bảng `movie_genres`
--
ALTER TABLE `movie_genres`
  ADD PRIMARY KEY (`movie_id`,`genre_id`),
  ADD KEY `genre_id` (`genre_id`);

--
-- Chỉ mục cho bảng `movie_producer`
--
ALTER TABLE `movie_producer`
  ADD PRIMARY KEY (`movie_id`,`producer_id`),
  ADD KEY `producer_id` (`producer_id`);

--
-- Chỉ mục cho bảng `producers`
--
ALTER TABLE `producers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `country_id` (`country_id`);

--
-- Chỉ mục cho bảng `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT cho các bảng đã đổ
--

--
-- AUTO_INCREMENT cho bảng `actors`
--
ALTER TABLE `actors`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT cho bảng `banners`
--
ALTER TABLE `banners`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT cho bảng `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT cho bảng `countries`
--
ALTER TABLE `countries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT cho bảng `directors`
--
ALTER TABLE `directors`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT cho bảng `episodes`
--
ALTER TABLE `episodes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=30;

--
-- AUTO_INCREMENT cho bảng `genres`
--
ALTER TABLE `genres`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=47;

--
-- AUTO_INCREMENT cho bảng `movies`
--
ALTER TABLE `movies`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT cho bảng `producers`
--
ALTER TABLE `producers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT cho bảng `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- Các ràng buộc cho các bảng đã đổ
--

--
-- Các ràng buộc cho bảng `banners`
--
ALTER TABLE `banners`
  ADD CONSTRAINT `banners_ibfk_1` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `category_countries`
--
ALTER TABLE `category_countries`
  ADD CONSTRAINT `category_countries_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `category_countries_ibfk_2` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `category_genres`
--
ALTER TABLE `category_genres`
  ADD CONSTRAINT `category_genres_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `category_genres_ibfk_2` FOREIGN KEY (`genre_id`) REFERENCES `genres` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `episodes`
--
ALTER TABLE `episodes`
  ADD CONSTRAINT `episodes_ibfk_1` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `movie_actors`
--
ALTER TABLE `movie_actors`
  ADD CONSTRAINT `movie_actors_ibfk_1` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `movie_actors_ibfk_2` FOREIGN KEY (`actor_id`) REFERENCES `actors` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `movie_countries`
--
ALTER TABLE `movie_countries`
  ADD CONSTRAINT `movie_countries_ibfk_1` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `movie_countries_ibfk_2` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `movie_directors`
--
ALTER TABLE `movie_directors`
  ADD CONSTRAINT `movie_directors_ibfk_1` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `movie_directors_ibfk_2` FOREIGN KEY (`director_id`) REFERENCES `directors` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `movie_genres`
--
ALTER TABLE `movie_genres`
  ADD CONSTRAINT `movie_genres_ibfk_1` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `movie_genres_ibfk_2` FOREIGN KEY (`genre_id`) REFERENCES `genres` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `movie_producer`
--
ALTER TABLE `movie_producer`
  ADD CONSTRAINT `movie_producer_ibfk_1` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `movie_producer_ibfk_2` FOREIGN KEY (`producer_id`) REFERENCES `producers` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `producers`
--
ALTER TABLE `producers`
  ADD CONSTRAINT `producers_ibfk_1` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`);

-- --------------------------------------------------------
--
-- Backend auth update: email verification, account status, OTP.
-- Safe to run on an existing database; existing columns are skipped.
--

ALTER TABLE `movies`
  ADD COLUMN IF NOT EXISTS `views` int(11) NOT NULL DEFAULT 0 AFTER `quality`,
  ADD COLUMN IF NOT EXISTS `is_visible` tinyint(1) NOT NULL DEFAULT 1 AFTER `views`;

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `avatar_url` text DEFAULT NULL AFTER `gender`,
  ADD COLUMN IF NOT EXISTS `phone` varchar(20) DEFAULT NULL AFTER `avatar_url`,
  ADD COLUMN IF NOT EXISTS `birth_date` date DEFAULT NULL AFTER `phone`,
  ADD COLUMN IF NOT EXISTS `email_verified` tinyint(1) NOT NULL DEFAULT 1 AFTER `is_admin`,
  ADD COLUMN IF NOT EXISTS `is_active` tinyint(1) NOT NULL DEFAULT 1 AFTER `email_verified`,
  ADD COLUMN IF NOT EXISTS `email_otp` varchar(64) DEFAULT NULL AFTER `is_active`,
  ADD COLUMN IF NOT EXISTS `email_otp_expires` datetime DEFAULT NULL AFTER `email_otp`,
  ADD COLUMN IF NOT EXISTS `password_reset_otp` varchar(64) DEFAULT NULL AFTER `email_otp_expires`,
  ADD COLUMN IF NOT EXISTS `password_reset_expires` datetime DEFAULT NULL AFTER `password_reset_otp`;

UPDATE `users`
SET `email_verified` = 1,
    `is_active` = 1
WHERE `email_verified` IS NULL
   OR `is_active` IS NULL;

-- --------------------------------------------------------
--
-- User library update: favorites, watchlist, watch history.
-- Safe to run on an existing database; existing tables are skipped.
--

CREATE TABLE IF NOT EXISTS `user_favorites` (
  `user_id` int(11) NOT NULL,
  `movie_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`, `movie_id`),
  KEY `idx_user_favorites_movie` (`movie_id`),
  CONSTRAINT `user_favorites_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_favorites_ibfk_2` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `user_watchlist` (
  `user_id` int(11) NOT NULL,
  `movie_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`, `movie_id`),
  KEY `idx_user_watchlist_movie` (`movie_id`),
  CONSTRAINT `user_watchlist_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_watchlist_ibfk_2` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `user_watch_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `movie_id` int(11) NOT NULL,
  `episode_id` int(11) DEFAULT NULL,
  `episode_number` int(11) DEFAULT NULL,
  `progress_seconds` int(11) NOT NULL DEFAULT 0,
  `duration_seconds` int(11) NOT NULL DEFAULT 0,
  `completed` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_watched_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_movie_episode` (`user_id`, `movie_id`, `episode_number`),
  KEY `idx_user_watch_history_movie` (`movie_id`),
  KEY `idx_user_watch_history_episode` (`episode_id`),
  KEY `idx_user_watch_history_last` (`user_id`, `last_watched_at`),
  CONSTRAINT `user_watch_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_watch_history_ibfk_2` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_watch_history_ibfk_3` FOREIGN KEY (`episode_id`) REFERENCES `episodes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
--
-- Movie feedback update: user ratings, comments, and movie issue reports.
-- Safe to run on an existing database; existing tables are skipped.
--

CREATE TABLE IF NOT EXISTS `movie_ratings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `movie_id` int(11) NOT NULL,
  `rating` tinyint(3) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_movie_rating_user` (`user_id`, `movie_id`),
  KEY `idx_movie_ratings_movie` (`movie_id`),
  CONSTRAINT `movie_ratings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `movie_ratings_ibfk_2` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `movie_comments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `movie_id` int(11) NOT NULL,
  `content` text NOT NULL,
  `status` enum('visible','hidden') NOT NULL DEFAULT 'visible',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_movie_comments_movie` (`movie_id`, `status`, `created_at`),
  KEY `idx_movie_comments_user` (`user_id`),
  CONSTRAINT `movie_comments_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `movie_comments_ibfk_2` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `movie_reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `movie_id` int(11) NOT NULL,
  `episode_id` int(11) DEFAULT NULL,
  `reason` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `status` enum('open','resolved','rejected') NOT NULL DEFAULT 'open',
  `admin_note` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_movie_reports_movie` (`movie_id`, `status`, `created_at`),
  KEY `idx_movie_reports_user` (`user_id`),
  KEY `idx_movie_reports_episode` (`episode_id`),
  CONSTRAINT `movie_reports_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `movie_reports_ibfk_2` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `movie_reports_ibfk_3` FOREIGN KEY (`episode_id`) REFERENCES `episodes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
