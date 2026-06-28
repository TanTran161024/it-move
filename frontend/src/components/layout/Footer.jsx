import { Link as RouterLink, useNavigate } from 'react-router-dom';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import FacebookIcon from '@mui/icons-material/Facebook';
import YouTubeIcon from '@mui/icons-material/YouTube';
import InstagramIcon from '@mui/icons-material/Instagram';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import XIcon from '@mui/icons-material/X';

export default function Footer() {
  const navigate = useNavigate();
  const handleLogoClick = (e) => {
    e.preventDefault();
    navigate('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <footer className="w-full bg-surface text-white pt-16 md:pt-20 pb-28 md:pb-24 mt-auto border-t border-border">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 justify-between">
          {/* Logo and Description */}
          <div className="col-span-1 md:col-span-5 lg:col-span-4">
            <div className="flex items-center gap-2 mb-4">
              <PlayCircleIcon className="text-primary text-4xl" />
              <RouterLink to="/" onClick={handleLogoClick} className="text-white hover:text-white transition-none no-underline flex items-center">
                <span className="font-heading font-extrabold tracking-wide text-2xl">IT Move</span>
              </RouterLink>
            </div>
            <p className="text-text-secondary text-sm mb-6 leading-relaxed">
              IT Move - Trang xem phim online chất lượng cao miễn phí Vietsub, thuyết minh, lồng tiếng full HD. Kho phim mới khổng lồ, phim chiếu rạp, phim bộ, phim lẻ từ nhiều quốc gia. Khám phá nền tảng phim trực tuyến hay nhất 2024 chất lượng 4K!
            </p>
            <div className="flex items-center gap-2">
              <button className="p-2 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-full transition-colors"><FacebookIcon /></button>
              <button className="p-2 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-full transition-colors"><XIcon /></button>
              <button className="p-2 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-full transition-colors"><YouTubeIcon /></button>
              <button className="p-2 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-full transition-colors"><CameraAltIcon /></button>
              <button className="p-2 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-full transition-colors"><InstagramIcon /></button>
            </div>
          </div>

          {/* Links */}
          <div className="col-span-1 md:col-span-7 lg:col-span-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
              <div>
                <h4 className="font-heading font-bold mb-4 text-white">Khám phá</h4>
                <div className="flex flex-col gap-3">
                  <a href="#" className="text-text-secondary hover:text-primary hover:translate-x-1 transition-all text-sm w-fit">Phim mới</a>
                  <a href="#" className="text-text-secondary hover:text-primary hover:translate-x-1 transition-all text-sm w-fit">Phim bộ</a>
                  <a href="#" className="text-text-secondary hover:text-primary hover:translate-x-1 transition-all text-sm w-fit">Phim lẻ</a>
                  <a href="#" className="text-text-secondary hover:text-primary hover:translate-x-1 transition-all text-sm w-fit">Phim chiếu rạp</a>
                </div>
              </div>
              <div>
                <h4 className="font-heading font-bold mb-4 text-white">Thông tin</h4>
                <div className="flex flex-col gap-3">
                  <a href="#" className="text-text-secondary hover:text-primary hover:translate-x-1 transition-all text-sm w-fit">Giới thiệu</a>
                  <a href="#" className="text-text-secondary hover:text-primary hover:translate-x-1 transition-all text-sm w-fit">Hỏi-Đáp</a>
                  <a href="#" className="text-text-secondary hover:text-primary hover:translate-x-1 transition-all text-sm w-fit">Liên hệ</a>
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <h4 className="font-heading font-bold mb-4 text-white">Pháp lý</h4>
                <div className="flex flex-col gap-3">
                  <a href="#" className="text-text-secondary hover:text-primary hover:translate-x-1 transition-all text-sm w-fit">Điều khoản sử dụng</a>
                  <a href="#" className="text-text-secondary hover:text-primary hover:translate-x-1 transition-all text-sm w-fit">Chính sách bảo mật</a>
                  <a href="#" className="text-text-secondary hover:text-primary hover:translate-x-1 transition-all text-sm w-fit">Bản quyền</a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <hr className="my-8 md:my-10 border-border" />
        
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-text-secondary text-sm">
          <p>
            © {new Date().getFullYear()} IT Move. All rights reserved.
          </p>
          <p>
            Thiết kế với <span className="text-primary">♥</span> dành cho người yêu phim
          </p>
        </div>
      </div>
    </footer>
  );
}
