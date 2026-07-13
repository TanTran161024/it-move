import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL as API } from '../../config/api';

const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value || 0));
const statusLabel = {
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
};

export default function Vip() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [plans, setPlans] = useState([]);
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState({});
  const [message, setMessage] = useState('');
  const [payingPlanId, setPayingPlanId] = useState(null);
  const headers = user.id
    ? { 'Content-Type': 'application/json', 'x-user-id': String(user.id) }
    : { 'Content-Type': 'application/json' };

  const load = () => Promise.all([
    fetch(`${API}/api/vip/plans`).then(r => r.json()),
    user.id ? fetch(`${API}/api/vip/orders/my`, { headers }).then(r => r.json()) : Promise.resolve([]),
    fetch(`${API}/api/vip/status`, { headers }).then(r => r.json()),
  ]).then(([p, o, s]) => {
    setPlans(Array.isArray(p) ? p : []);
    setOrders(Array.isArray(o) ? o : []);
    setStatus(s || {});
  });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const payment = params.get('payment');
    if (!payment) return;
    const messages = {
      success: 'Thanh toán mô phỏng thành công. Tài khoản VIP đã được kích hoạt.',
      failed: 'Giao dịch mô phỏng không thành công.',
      cancelled: 'Bạn đã hủy giao dịch mô phỏng.',
    };
    setMessage(messages[payment] || 'Đã nhận kết quả giao dịch.');
    load();
    navigate('/vip', { replace: true });
  }, [location.search]);

  const buy = async plan => {
    if (!user.id) {
      setMessage('Vui lòng đăng nhập trước khi mua VIP.');
      return;
    }

    try {
      setPayingPlanId(plan.id);
      setMessage('Đang tạo giao dịch MoMo Sandbox Demo...');
      const response = await fetch(`${API}/api/vip/mock-momo/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ plan_id: plan.id }),
      });
      const data = await response.json();
      if (!response.ok && !data.payment_url) throw new Error(data.message || 'Không thể tạo giao dịch');
      navigate(data.payment_url);
    } catch (error) {
      setMessage(error.message);
      setPayingPlanId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-28 text-white">
      <div className="overflow-hidden rounded-[2rem] border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-500/20 via-black to-amber-500/10 p-8 shadow-2xl shadow-fuchsia-950/30">
        <div className="text-sm font-black uppercase tracking-[.25em] text-fuchsia-300">IT Move VIP</div>
        <h1 className="mt-2 text-4xl font-black md:text-5xl">Xem phim liền mạch, không quảng cáo</h1>
        <p className="mt-4 max-w-3xl text-white/70">Thanh toán qua cổng MoMo Sandbox Demo nội bộ. Đây là môi trường mô phỏng phục vụ học tập, không phát sinh tiền thật.</p>
        {status.is_vip && (
          <div className="mt-6 inline-flex rounded-full bg-amber-400 px-4 py-2 font-black text-black">
            VIP đến {new Date(status.vip_until).toLocaleDateString('vi-VN')}
          </div>
        )}
      </div>

      {message && <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-4">{message}</div>}

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {plans.map((plan, index) => (
          <div key={plan.id} className={`relative rounded-3xl border p-6 ${index === 1 ? 'border-fuchsia-400/50 bg-fuchsia-500/10' : 'border-white/10 bg-white/5'}`}>
            {index === 1 && <span className="absolute right-5 top-5 rounded-full bg-fuchsia-500 px-3 py-1 text-xs font-black">PHỔ BIẾN</span>}
            <h2 className="text-2xl font-black text-amber-300">{plan.name}</h2>
            <div className="mt-3 text-3xl font-black">{money(plan.price)}</div>
            <p className="mt-3 min-h-12 text-white/60">{plan.description}</p>
            <ul className="mt-5 space-y-2 text-sm text-white/75">
              <li>✓ Không hiển thị quảng cáo</li>
              <li>✓ Huy hiệu VIP trên tài khoản</li>
              <li>✓ Ưu tiên nội dung mới</li>
            </ul>
            <button
              onClick={() => buy(plan)}
              disabled={payingPlanId !== null}
              className="mt-6 w-full rounded-xl bg-[#a50064] py-3 font-black text-white transition hover:bg-[#c00075] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {payingPlanId === plan.id ? 'Đang chuyển đến MoMo...' : 'Thanh toán bằng MoMo Demo'}
            </button>
          </div>
        ))}
      </div>

      {user.id && (
        <div className="mt-10">
          <h2 className="text-2xl font-black">Lịch sử giao dịch VIP</h2>
          <div className="mt-4 space-y-3">
            {orders.length === 0 && <div className="rounded-xl bg-white/5 p-4 text-white/50">Chưa có giao dịch.</div>}
            {orders.map(order => {
              const paymentStatus = order.payment_status || (order.status === 'approved' ? 'paid' : 'pending');
              return (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div>
                    <div className="font-bold">{order.plan_name}</div>
                    <div className="mt-1 text-xs text-white/40">#{order.id} · {new Date(order.created_at).toLocaleString('vi-VN')}</div>
                  </div>
                  <span>{money(order.amount)}</span>
                  <b className={paymentStatus === 'paid' ? 'text-green-400' : paymentStatus === 'failed' ? 'text-red-400' : paymentStatus === 'cancelled' ? 'text-white/50' : 'text-amber-300'}>
                    {statusLabel[paymentStatus] || paymentStatus}
                  </b>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
