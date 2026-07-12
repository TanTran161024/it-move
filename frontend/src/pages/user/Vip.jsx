import { useEffect, useState } from 'react';
import { API_BASE_URL as API } from '../../config/api';

const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value || 0));
export default function Vip() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [plans, setPlans] = useState([]); const [orders, setOrders] = useState([]); const [status, setStatus] = useState({}); const [message, setMessage] = useState('');
  const headers = user.id ? { 'Content-Type': 'application/json', 'x-user-id': user.id } : { 'Content-Type': 'application/json' };
  const load = () => Promise.all([
    fetch(`${API}/api/vip/plans`).then(r=>r.json()),
    user.id ? fetch(`${API}/api/vip/orders/my`, { headers }).then(r=>r.json()) : Promise.resolve([]),
    fetch(`${API}/api/vip/status`, { headers }).then(r=>r.json()),
  ]).then(([p,o,s]) => { setPlans(p); setOrders(Array.isArray(o)?o:[]); setStatus(s); });
  useEffect(() => { load(); }, []);
  const buy = async plan => {
    if (!user.id) return setMessage('Vui lòng đăng nhập trước khi mua VIP.');
    const r = await fetch(`${API}/api/vip/orders`, { method:'POST', headers, body: JSON.stringify({ plan_id: plan.id }) });
    const data = await r.json(); setMessage(data.message || (r.ok ? 'Đã gửi yêu cầu' : 'Có lỗi xảy ra')); if (r.ok) load();
  };
  return <div className="mx-auto w-full max-w-6xl px-4 py-28 text-white">
    <div className="rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-500/15 to-black p-8">
      <div className="text-sm font-black uppercase tracking-[.25em] text-amber-300">IT Move VIP</div>
      <h1 className="mt-2 text-4xl font-black">Xem phim không quảng cáo</h1>
      <p className="mt-3 text-white/70">Huy hiệu VIP, ưu tiên nội dung mới và sẵn sàng cho phim chất lượng cao/nội dung khóa.</p>
      {status.is_vip && <div className="mt-5 inline-flex rounded-full bg-amber-400 px-4 py-2 font-black text-black">VIP đến {new Date(status.vip_until).toLocaleDateString('vi-VN')}</div>}
    </div>
    {message && <div className="mt-5 rounded-xl bg-white/10 p-4">{message}</div>}
    <div className="mt-8 grid gap-5 md:grid-cols-3">{plans.map(plan => <div key={plan.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-2xl font-black text-amber-300">{plan.name}</h2><div className="mt-3 text-3xl font-black">{money(plan.price)}</div><p className="mt-3 min-h-12 text-white/60">{plan.description}</p>
      <button onClick={()=>buy(plan)} className="mt-6 w-full rounded-xl bg-amber-400 py-3 font-black text-black hover:bg-amber-300">Đăng ký gói</button>
    </div>)}</div>
    {user.id && <div className="mt-10"><h2 className="text-2xl font-black">Lịch sử đăng ký</h2><div className="mt-4 space-y-3">{orders.map(o=><div key={o.id} className="flex flex-wrap justify-between gap-3 rounded-xl bg-white/5 p-4"><span>{o.plan_name}</span><span>{money(o.amount)}</span><b className={o.status==='approved'?'text-green-400':o.status==='rejected'?'text-red-400':'text-amber-300'}>{o.status}</b></div>)}</div></div>}
  </div>;
}
