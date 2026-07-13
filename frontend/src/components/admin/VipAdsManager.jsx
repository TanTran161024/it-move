import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL as API } from '../../config/api';

const emptyAd={name:'',image_url:'',target_url:'',placement:'home',is_active:true,start_at:'',end_at:''};
export default function VipAdsManager(){
 const [orders,setOrders]=useState([]),[ads,setAds]=useState([]),[form,setForm]=useState(emptyAd),[error,setError]=useState('');
 const load=async()=>{try{const [o,a]=await Promise.all([axios.get(`${API}/api/admin/vip/orders`),axios.get(`${API}/api/admin/ads`)]);setOrders(o.data);setAds(a.data)}catch(e){setError(e.response?.data?.message||e.message)}};
 useEffect(()=>{load()},[]);
 const decide=async(id,status)=>{await axios.patch(`${API}/api/admin/vip/orders/${id}`,{status});load()};
 const addAd=async()=>{try{await axios.post(`${API}/api/admin/ads`,form);setForm(emptyAd);load()}catch(e){setError(e.response?.data?.message||e.message)}};
 const toggle=async ad=>{await axios.put(`${API}/api/admin/ads/${ad.id}`,{...ad,is_active:!ad.is_active,start_at:ad.start_at||null,end_at:ad.end_at||null});load()};
 const remove=async id=>{if(confirm('Xóa quảng cáo này?')){await axios.delete(`${API}/api/admin/ads/${id}`);load()}};
 return <div className="p-6 text-white"><h2 className="text-2xl font-black">VIP & Quảng cáo</h2>{error&&<div className="my-4 rounded bg-red-500/20 p-3">{error}</div>}
 <h3 className="mt-7 text-xl font-bold">Đơn VIP chờ xử lý</h3><div className="mt-3 space-y-3">{orders.map(o=><div key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-4"><b>{o.username}</b><span>{o.plan_name}</span><span>{Number(o.amount).toLocaleString('vi-VN')}đ</span><span className="ml-auto">{o.status}</span>{o.status==='pending'&&<><button className="rounded bg-green-600 px-3 py-2" onClick={()=>decide(o.id,'approved')}>Duyệt</button><button className="rounded bg-red-600 px-3 py-2" onClick={()=>decide(o.id,'rejected')}>Từ chối</button></>}</div>)}</div>
 <h3 className="mt-10 text-xl font-bold">Tạo quảng cáo</h3><div className="mt-3 grid gap-3 rounded-xl border border-white/10 p-4 md:grid-cols-2">{['name','image_url','target_url','start_at','end_at'].map(k=><input key={k} type={k.includes('_at')?'datetime-local':'text'} placeholder={k} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} className="rounded bg-black/40 p-3"/>)}<select value={form.placement} onChange={e=>setForm({...form,placement:e.target.value})} className="rounded bg-black/40 p-3"><option value="home">Trang chủ</option><option value="movie_detail">Chi tiết phim</option><option value="watch_top">Trên player</option><option value="watch_bottom">Dưới player</option><option value="watch_popup">Popup xem phim</option></select><button onClick={addAd} className="rounded bg-blue-600 p-3 font-bold">Thêm quảng cáo</button></div>
 <div className="mt-5 space-y-3">{ads.map(ad=><div key={ad.id} className="flex items-center gap-4 rounded-xl border border-white/10 p-3"><img src={ad.image_url} className="h-16 w-28 rounded object-cover"/><div><b>{ad.name}</b><div className="text-white/50">{ad.placement}</div></div><button onClick={()=>toggle(ad)} className="ml-auto rounded bg-white/10 px-3 py-2">{ad.is_active?'Tắt':'Bật'}</button><button onClick={()=>remove(ad.id)} className="rounded bg-red-600 px-3 py-2">Xóa</button></div>)}</div></div>
}
