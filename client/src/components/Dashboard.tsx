import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Layout,
  RefreshCcw,
  ShoppingCart,
  Wallet
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell, Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis, YAxis
} from 'recharts';
import { useCurrency } from '../contexts/CurrencyContext';

const PALETTE = {
  lightest: '#B9D5F2', 
  sky: '#80CAFF',      // Paid Label Background
  cool: '#55AAFF',     // Order Numbers & Card 1, 7
  primary: '#3B82F6', 
  medium: '#3079C2',   // Card 2, 5, 8 & Paid Status Text & Bar Chart
  darkBlue: '#155A9E', // Card 3
  dark: '#1A3E73',     // Card 4 & Headings
  deep: '#0B2C5D',     // Card 6 & Text
  cyan: '#3CC3DF'
};

const CHART_COLORS = [PALETTE.primary, PALETTE.cyan, PALETTE.medium, PALETTE.dark, PALETTE.sky];

const Dashboard: React.FC = () => {
  const { currencyCode } = useCurrency();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('daily');
  const navigate = useNavigate();
  
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  const token = localStorage.getItem('token');

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        navigate('/');
        return;
      }
      try {
        const res = await fetch(`${api}/dashboard/stats?filter=${filter}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/');
          return;
        }
        
        const result = await res.json();
        if (result.status === 'success') {
          setData(result.data);
        }
      } catch (err) {
        console.error("Dashboard Data Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [api, token, filter, navigate]);

  if (loading) return <div className="p-10 text-center text-[#1A3E73] font-black italic">Loading ServeSmart...</div>;
  if (!data) return <div className="p-10 text-center text-red-500">Error loading data.</div>;

  const cardColors = [
    PALETTE.cool, PALETTE.medium, PALETTE.darkBlue, PALETTE.dark, 
    PALETTE.medium, PALETTE.deep, PALETTE.cool, PALETTE.medium
  ];

  const StatCard = ({ title, value, unit, icon: Icon, path, index }: any) => (
    <div 
      onClick={() => path && navigate(path)} 
      style={{ background: `linear-gradient(135deg, ${PALETTE.lightest} 0%, ${cardColors[index]} 100%)` }}
      className="p-6 rounded-[24px] shadow-lg flex justify-between items-center cursor-pointer hover:scale-[1.03] transition-all duration-300 border-none min-h-[120px]"
    >
      <div className="text-white">
        <p className="text-white text-opacity-90 text-[11px] font-black uppercase tracking-[0.12em] mb-1">{title}</p>
        <h3 className="text-2xl font-black leading-tight">{unit} {value.toLocaleString()}</h3>
      </div>
      <div className="bg-white/20 p-3.5 rounded-2xl backdrop-blur-sm border border-white/10 ml-4">
        <Icon className="text-white" size={26} strokeWidth={2.5} />
      </div>
    </div>
  );

  return (
    <div className="p-6 bg-[#F8FAFC] min-h-screen space-y-10">
      
      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard index={0} title="Today Sale" value={data.cards?.todaySales || 0} unit={currencyCode} icon={FileText} path="/viewSales" />
        
        {}
        <StatCard index={1} title="Today Purchase" value={data.cards?.todayPurchases || 0} unit={currencyCode} icon={ShoppingCart} path="/createPurchase" />
        
        <StatCard index={2} title="Today Purchase Return" value={data.cards?.todayPurchaseReturns || 0} unit={currencyCode} icon={ArrowRight} path="/viewPurchaseReturns" />
        <StatCard index={3} title="Today Sale Return" value={data.cards?.todaySaleReturns || 0} unit={currencyCode} icon={ArrowLeft} path="/saleReturns" />
        <StatCard index={4} title="Total Sale" value={data.cards?.sales || 0} unit={currencyCode} icon={Layout} path="/viewSales" />
        
        {}
        <StatCard index={5} title="Total Purchase" value={data.cards?.totalPurchases || 0} unit={currencyCode} icon={Wallet} path="/createPurchase" />
        
        <StatCard index={6} title="Total Sale Return" value={data.cards?.saleReturns || 0} unit={currencyCode} icon={RefreshCcw} path="/saleReturns" />
        <StatCard index={7} title="Today Expenses" value={data.cards?.todayExpenses || 0} unit={currencyCode} icon={Wallet} path="/expenses" />
      </div>

      {}
      <div className="bg-white p-8 rounded-[28px] shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-10">
          <h3 className="text-xl font-black text-[#1A3E73]">Week Sales & Purchases</h3>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="border-2 border-[#B9D5F2] rounded-xl px-4 py-2 text-xs font-black text-[#1A3E73] bg-white cursor-pointer hover:border-[#3B82F6] transition-all"
          >
            <option value="daily">Daily View</option>
            <option value="weekly">Weekly View</option>
          </select>
        </div>
        {}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.weeklySales}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="_id" axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12, fontWeight: 700}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} />
              <Tooltip cursor={{fill: '#F8FAFC'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
              <Bar dataKey="sales" fill={PALETTE.medium} radius={[8, 8, 0, 0]} barSize={35} />
              <Bar dataKey="purchases" fill={PALETTE.lightest} radius={[8, 8, 0, 0]} barSize={35} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-[28px] shadow-sm border border-slate-100">
          <h3 className="text-lg font-black text-[#1A3E73] mb-6">Top Selling Products</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={data.topProducts?.map((p:any)=>({name:p.name, value:p.quantity})) || []} 
                  innerRadius={70} outerRadius={105} paddingAngle={6} dataKey="value"
                >
                  {data.topProducts?.map((_:any, index:number) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[28px] shadow-sm border border-slate-100">
          <h3 className="text-lg font-black text-[#1A3E73] mb-6">Top Customers</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={data.topCustomers || []} 
                  innerRadius={70} outerRadius={105} paddingAngle={6} dataKey="value"
                >
                  {data.topCustomers?.map((_:any, index:number) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. Stock Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden">
          <h3 className="text-lg font-black p-6 text-[#1A3E73] bg-[#F8FAFC] border-b border-slate-100 uppercase tracking-wide">Product Stock Alerts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F1F5F9] text-[#64748B] text-[10px] uppercase tracking-[0.2em] font-black">
                <tr>
                  <th className="p-6 text-center">Product Code</th>
                  <th className="p-6">Product</th>
                  <th className="p-6 text-center">Qty</th>
                  <th className="p-6 text-center">Min</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.stockAlert?.length ? (
                  data.stockAlert.slice(0, 10).map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6 text-center text-[#64748B] font-bold text-sm">{item.productCode || '-'}</td>
                      <td className="p-6 font-semibold text-[#1A3E73] text-sm">{item.name}</td>
                      <td className="p-6 text-center text-[#3B82F6] font-black text-sm">{item.quantity}</td>
                      <td className="p-6 text-center text-[#64748B] font-bold text-sm">{item.alertLimit}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-[#64748B] italic text-sm">No products below alert level.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden">
          <h3 className="text-lg font-black p-6 text-[#1A3E73] bg-[#F8FAFC] border-b border-slate-100 uppercase tracking-wide">Kitchen Stock Alerts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F1F5F9] text-[#64748B] text-[10px] uppercase tracking-[0.2em] font-black">
                <tr>
                  <th className="p-6">Ingredient</th>
                  <th className="p-6 text-center">Qty</th>
                  <th className="p-6 text-center">Min</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.kitchenStockAlert?.length ? (
                  data.kitchenStockAlert.slice(0, 10).map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6 font-semibold text-[#1A3E73] text-sm">{item.name}</td>
                      <td className="p-6 text-center text-rose-500 font-black text-sm">{item.quantity} {item.unit}</td>
                      <td className="p-6 text-center text-[#64748B] font-bold text-sm">{item.alertLimit} {item.unit}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="p-10 text-center text-[#64748B] italic text-sm">All kitchen stocks are healthy.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. Recent Transactions Section */}
      <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden">
        <h3 className="text-lg font-black p-6 text-[#1A3E73] bg-[#F8FAFC] border-b border-slate-100">Recent Sales Transactions</h3>
        <table className="w-full text-left">
          <thead className="bg-[#F1F5F9] text-[#64748B] text-[10px] uppercase tracking-[0.2em] font-black">
            <tr><th className="p-6">Order Ref</th><th className="p-6">Customer</th><th className="p-6">Status</th><th className="p-6 text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.recentSales?.map((sale: any, idx: number) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="p-6 font-bold text-[#55AAFF]">{sale.referenceNumber}</td>
                <td className="p-6 text-[#1A3E73] font-bold">{sale.customer?.name || 'Walk-in Customer'}</td>
                <td className="p-6">
                  <span style={{ backgroundColor: PALETTE.sky, color: PALETTE.medium }} className="px-5 py-2 text-[10px] font-black rounded-xl uppercase shadow-sm">Paid</span>
                </td>
                <td className="p-6 text-right font-black text-[#0B2C5D]">{currencyCode} {sale.grandTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default Dashboard;