import { Link as RouterLink, useNavigate } from 'react-router-dom';
import InlineIcon from '../common/InlineIcon';

export default function Footer() {
  const navigate = useNavigate();
  
  const handleLogoClick = (e) => {
    e.preventDefault();
    navigate('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="w-full bg-[#080808] text-white/70 pt-16 md:pt-20 pb-12 mt-auto border-t border-white/5 relative z-10" aria-label="Trang thông tin cuối">
      <div className="w-full px-[16px] md:px-[32px] lg:px-[48px] xl:px-[72px] mx-auto max-w-[1920px]">
        
        {/* Social Links */}
        <div className="flex items-center gap-6 mb-8">
          <a href="#" aria-label="Facebook" className="text-white/60 hover:text-white transition-colors duration-300">
            <InlineIcon name="facebook" size={32} />
          </a>
          <a href="#" aria-label="Instagram" className="text-white/60 hover:text-white transition-colors duration-300">
            <InlineIcon name="instagram" size={32} />
          </a>
          <a href="#" aria-label="X (Twitter)" className="text-white/60 hover:text-white transition-colors duration-300">
            <InlineIcon name="x" size={28} />
          </a>
          <a href="#" aria-label="YouTube" className="text-white/60 hover:text-white transition-colors duration-300">
            <InlineIcon name="youtube" size={32} />
          </a>
        </div>

        {/* Mega Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10 mb-12">
          
          <div className="flex flex-col gap-3">
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Âm thanh và Phụ đề</a>
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Trung tâm đa phương tiện</a>
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Bảo mật</a>
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Liên hệ với chúng tôi</a>
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">IT Move Play</a>
          </div>

          <div className="flex flex-col gap-3">
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Mô tả âm thanh</a>
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Quan hệ với nhà đầu tư</a>
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Thông báo pháp lý</a>
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Gói dịch vụ</a>
          </div>

          <div className="flex flex-col gap-3">
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Trung tâm trợ giúp</a>
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Việc làm</a>
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Tùy chọn cookie</a>
            <a href="#" className="hover:underline text-sm w-fit transition-all duration-300 hover:text-white">Thẻ quà tặng</a>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="font-bold text-white mb-2 font-heading tracking-wide">Tải Ứng Dụng</h4>
            <div className="flex flex-col gap-3">
              {/* Apple Store Button Mockup */}
              <button className="flex items-center gap-3 bg-black border border-white/20 rounded-lg px-4 py-2 hover:bg-white/5 transition-colors w-fit">
                <svg viewBox="0 0 384 512" className="w-6 h-6 fill-white"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] leading-tight text-white/70">Download on the</span>
                  <span className="text-sm font-bold text-white leading-tight">App Store</span>
                </div>
              </button>
              {/* Google Play Button Mockup */}
              <button className="flex items-center gap-3 bg-black border border-white/20 rounded-lg px-4 py-2 hover:bg-white/5 transition-colors w-fit">
                <svg viewBox="0 0 512 512" className="w-6 h-6 fill-white"><path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/></svg>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] leading-tight text-white/70">GET IT ON</span>
                  <span className="text-sm font-bold text-white leading-tight">Google Play</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Utility Row */}
        <div className="flex flex-col gap-6 md:flex-row md:items-center justify-between">
          <button className="flex items-center gap-2 border border-white/35 text-white/75 hover:text-white hover:border-white w-fit px-4 py-2 rounded transition-colors text-sm">
            <InlineIcon name="globe" size={18} />
            <span>Tiếng Việt</span>
          </button>
          
          <div className="flex items-center gap-2">
            <InlineIcon name="playCircle" size={24} className="text-primary" />
            <RouterLink to="/" onClick={handleLogoClick} aria-label="IT Move - Trang chủ" className="text-white/75 hover:text-white transition-colors no-underline">
              <span className="font-heading font-extrabold tracking-wide text-lg">IT Move</span>
            </RouterLink>
          </div>
        </div>

        {/* Legal & Copyright */}
        <div className="mt-8 text-xs text-white/70">
          <p className="mb-2">
            IT Move - Nền tảng phát trực tuyến cao cấp. Mang đến hàng ngàn giờ nội dung phim điện ảnh, truyền hình chất lượng 4K chuẩn rạp.
          </p>
          <p>
            © {new Date().getFullYear()} IT Move. Bản quyền đã được bảo hộ. Thiết kế dành cho người yêu điện ảnh.
          </p>
        </div>

      </div>
    </footer>
  );
}
