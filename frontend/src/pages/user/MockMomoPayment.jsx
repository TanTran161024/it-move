import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL as API } from '../../config/api';

const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value || 0));

function DemoQr({ seed = '' }) {
  const cells = useMemo(() => {
    let state = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 97);
    return Array.from({ length: 21 * 21 }, (_, index) => {
      state = (state * 9301 + 49297 + index) % 233280;
      const row = Math.floor(index / 21);
      const col = index % 21;
      const finder = (row < 7 && col < 7) || (row < 7 && col > 13) || (row > 13 && col < 7);
      return finder || state / 233280 > 0.52;
    });
  }, [seed]);

  return (
    <div className="grid h-52 w-52 grid-cols-[repeat(21,minmax(0,1fr))] bg-white p-3 shadow-xl">
      {cells.map((active, index) => <span key={index} className={active ? 'bg-black' : 'bg-white'} />)}
    </div>
  );
}

export default function MockMomoPayment() {
  const { token } = useParams();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(10 * 60);
  const headers = { 'Content-Type': 'application/json', 'x-user-id': String(user.id || '') };

  useEffect(() => {
    if (!user.id) {
      navigate('/login');
      return;
    }
    fetch(`${API}/api/vip/mock-momo/${token}`, { headers })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Không thể tải giao dịch');
        setOrder(data);
      })
      .catch(err => setError(err.message));
  }, [token]);

  useEffect(() => {
    if (!order || order.payment_status !== 'pending') return undefined;
    const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [order]);

  const complete = async result => {
    try {
      setProcessing(true);
      setError('');
      const response = await fetch(`${API}/api/vip/mock-momo/${token}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ result }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể xử lý giao dịch');
      navigate(`/vip?payment=${result === 'success' ? 'success' : result}`);
    } catch (err) {
      setError(err.message);
      setProcessing(false);
    }
  };

  const minute = String(Math.floor(seconds / 60)).padStart(2, '0');
  const second = String(seconds % 60).padStart(2, '0');

  return (
    <div className="min-h-screen bg-[#f4f4f6] px-4 py-20 text-slate-900">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#a50064] px-6 py-5 text-white">
          <div>
            <div className="text-2xl font-black tracking-tight">MoMo</div>
            <div className="text-xs font-bold uppercase tracking-[.2em] text-white/70">Sandbox Demo · IT Move</div>
          </div>
          <div className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold">Không phát sinh tiền thật</div>
        </div>

        {error && <div className="m-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
        {!order && !error && <div className="grid min-h-96 place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#a50064]/20 border-t-[#a50064]" /></div>}

        {order && (
          <div className="grid md:grid-cols-[1.05fr_.95fr]">
            <section className="border-b border-slate-200 p-7 md:border-b-0 md:border-r">
              <div className="text-sm font-bold uppercase tracking-wider text-slate-400">Thông tin đơn hàng</div>
              <h1 className="mt-3 text-3xl font-black">Thanh toán gói VIP</h1>
              <div className="mt-7 space-y-4 rounded-2xl bg-slate-50 p-5">
                <div className="flex justify-between gap-4"><span className="text-slate-500">Nhà cung cấp</span><b>IT Move</b></div>
                <div className="flex justify-between gap-4"><span className="text-slate-500">Sản phẩm</span><b>{order.plan_name}</b></div>
                <div className="flex justify-between gap-4"><span className="text-slate-500">Thời hạn</span><b>{order.duration_days} ngày</b></div>
                <div className="flex justify-between gap-4"><span className="text-slate-500">Mã đơn hàng</span><b>VIP-{order.id}</b></div>
              </div>
              <div className="mt-7 flex items-end justify-between border-t border-dashed border-slate-300 pt-6">
                <span className="font-semibold text-slate-500">Tổng thanh toán</span>
                <strong className="text-3xl text-[#a50064]">{money(order.amount)}</strong>
              </div>
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Đây là cổng thanh toán mô phỏng dành cho đồ án. Ba nút bên cạnh giúp kiểm thử đầy đủ các trường hợp thành công, thất bại và hủy giao dịch.
              </div>
            </section>

            <section className="flex flex-col items-center p-7 text-center">
              <div className="text-sm font-bold uppercase tracking-wider text-slate-400">Quét mã bằng ứng dụng MoMo</div>
              <div className="mt-5 rounded-3xl border-4 border-[#a50064] p-2"><DemoQr seed={`${token}-${order.id}`} /></div>
              <div className="mt-4 text-sm text-slate-500">Giao dịch hết hạn sau</div>
              <div className="mt-1 font-mono text-2xl font-black text-[#a50064]">{minute}:{second}</div>

              <div className="mt-7 grid w-full gap-3">
                <button disabled={processing || seconds === 0} onClick={() => complete('success')} className="rounded-xl bg-[#a50064] px-5 py-3.5 font-black text-white hover:bg-[#c00075] disabled:opacity-50">
                  {processing ? 'Đang xử lý...' : 'Mô phỏng thanh toán thành công'}
                </button>
                <button disabled={processing} onClick={() => complete('failed')} className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">Mô phỏng thanh toán thất bại</button>
                <button disabled={processing} onClick={() => complete('cancelled')} className="rounded-xl border border-slate-200 px-5 py-3 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Hủy giao dịch</button>
              </div>
              <button onClick={() => navigate('/vip')} className="mt-5 text-sm font-bold text-slate-400 hover:text-slate-700">← Quay lại trang VIP</button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
