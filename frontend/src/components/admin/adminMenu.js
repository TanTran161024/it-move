import BarChartIcon from '@mui/icons-material/BarChart';
import CategoryIcon from '@mui/icons-material/Category';
import ImageIcon from '@mui/icons-material/Image';
import MovieIcon from '@mui/icons-material/Movie';
import PeopleIcon from '@mui/icons-material/People';
import RateReviewIcon from '@mui/icons-material/RateReview';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SubtitlesIcon from '@mui/icons-material/Subtitles';

export const adminMenuGroups = [
  {
    title: 'Tổng quan',
    items: [
      {
        key: 'dashboard',
        label: 'Thống kê',
        description: 'Tình hình nội dung, người dùng, lượt xem và báo cáo.',
        Icon: BarChartIcon,
      },
    ],
  },
  {
    title: 'Nội dung',
    items: [
      {
        key: 'movies',
        label: 'Quản lý phim',
        description: 'Thêm, sửa, ẩn hiện phim, bổ sung TMDb và quản lý tập.',
        Icon: MovieIcon,
      },
      {
        key: 'banners',
        label: 'Quản lý banner',
        description: 'Điều phối banner và hình ảnh nổi bật trên trang chủ.',
        Icon: ImageIcon,
      },
      {
        key: 'categories',
        label: 'Danh mục phim',
        description: 'Quản lý các danh mục nội dung chính của hệ thống.',
        Icon: CategoryIcon,
      },
      {
        key: 'general',
        label: 'Dữ liệu chung',
        description: 'Thể loại, quốc gia, nhà sản xuất, diễn viên và đạo diễn.',
        Icon: CategoryIcon,
      },
    ],
  },
  {
    title: 'Người dùng',
    items: [
      {
        key: 'users',
        label: 'Quản lý người dùng',
        description: 'Theo dõi tài khoản, quyền admin và trạng thái hoạt động.',
        Icon: PeopleIcon,
      },
    ],
  },
  {
    title: 'Kiểm duyệt',
    items: [
      {
        key: 'feedback',
        label: 'Phản hồi & báo lỗi',
        description: 'Duyệt bình luận, xử lý report và kiểm tra link phim.',
        Icon: RateReviewIcon,
      },
    ],
  },
  {
    title: 'Công cụ',
    items: [
      {
        key: 'subtitles',
        label: 'Phụ đề theo tập',
        description: 'Upload, dịch, tìm online và lưu phụ đề cho từng tập.',
        Icon: SubtitlesIcon,
      },
      {
        key: 'ai_tools',
        label: 'AI & tự động hóa',
        description: 'Theo dõi chatbot và các công cụ hỗ trợ vận hành.',
        Icon: SmartToyIcon,
      },
    ],
  },
  {
    title: 'Cài đặt',
    items: [
      {
        key: 'settings',
        label: 'Cài đặt hệ thống',
        description: 'Các tùy chọn vận hành, API và bảo trì hệ thống.',
        Icon: SettingsIcon,
      },
    ],
  },
];

export const adminMenuItems = adminMenuGroups.flatMap((group) => (
  group.items.map((item) => ({ ...item, group: group.title }))
));
