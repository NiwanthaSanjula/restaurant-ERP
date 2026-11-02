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
import { useReducedMotion } from '../hooks/useReducedMotion';

const CHART_COLORS = [1, 2, 3, 4, 5].map(index => `var(--ss-chart-${index})`);
const chartTooltipStyle = { background: 'var(--ss-surface)', color: 'var(--ss-foreground)', border: '1px solid var(--ss-border)', borderRadius: '12px', boxShadow: 'var(--ss-shadow)' };

const Dashboard: React.FC = () => {
  const { currencyCode } = useCurrency();
  const reducedMotion = useReducedMotion();
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

  if (loading) return <div className="p-10 text-center text-foreground font-semibold italic">Loading ServeSmart...</div>;
  if (!data) return <div className="p-10 text-center text-danger">Error loading data.</div>;

  const StatCard = ({ title, value, unit, icon: Icon, path }: any) => (
    <button type="button"
      onClick={() => path && navigate(path)} 
      className="ss-stat flex justify-between items-center min-h-[120px] w-full border border-l-3 border-l-primary"
    >
      <div className="text-foreground">
        <p className="text-muted text-xs font-medium mb-2">{title}</p>
        <h3 className="text-2xl font-semibold leading-tight"><span className="text-sm font-medium text-muted">{unit}</span> {value.toLocaleString()}</h3>
      </div>
      <div className="ss-stat-icon ml-3 shrink-0">
        <Icon size={22} strokeWidth={1.75} />
      </div>
    </button>
  );

  return (
    <div className="ss-chart bg-canvas min-h-screen space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Overview</p>
        <h1 className="text-3xl font-semibold text-foreground">Your restaurant at a glance</h1>
        <p className="text-muted mt-2">Sales, purchasing, and stock activity.</p>
      </div>
      
      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Today Sale" value={data.cards?.todaySales || 0} unit={currencyCode} icon={FileText} path="/viewSales" />
        
        {}
        <StatCard title="Today Purchase" value={data.cards?.todayPurchases || 0} unit={currencyCode} icon={ShoppingCart} path="/createPurchase" />
        
        <StatCard title="Today Purchase Return" value={data.cards?.todayPurchaseReturns || 0} unit={currencyCode} icon={ArrowRight} path="/viewPurchaseReturns" />
        <StatCard title="Today Sale Return" value={data.cards?.todaySaleReturns || 0} unit={currencyCode} icon={ArrowLeft} path="/saleReturns" />
        <StatCard title="Total Sale" value={data.cards?.sales || 0} unit={currencyCode} icon={Layout} path="/viewSales" />
        
        {}
        <StatCard title="Total Purchase" value={data.cards?.totalPurchases || 0} unit={currencyCode} icon={Wallet} path="/createPurchase" />
        
        <StatCard title="Total Sale Return" value={data.cards?.saleReturns || 0} unit={currencyCode} icon={RefreshCcw} path="/saleReturns" />
        <StatCard title="Today Expenses" value={data.cards?.todayExpenses || 0} unit={currencyCode} icon={Wallet} path="/expenses" />
      </div>

      {}
      <div className="bg-surface p-4 sm:p-6 rounded-2xl border border-line">
        <div className="flex flex-wrap gap-3 justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-foreground">Week Sales & Purchases</h3>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="border-2 border-line-strong rounded-xl px-4 py-2 text-xs font-semibold text-foreground bg-surface cursor-pointer hover:border-primary transition-all"
          >
            <option value="daily">Daily View</option>
            <option value="weekly">Weekly View</option>
          </select>
        </div>
        {}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.weeklySales}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--ss-border)" />
              <XAxis dataKey="_id" axisLine={false} tickLine={false} tick={{fill: 'var(--ss-muted)', fontSize: 12, fontWeight: 500}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--ss-muted)', fontSize: 12}} />
              <Tooltip cursor={{fill: 'var(--ss-surface-muted)'}} contentStyle={chartTooltipStyle} labelStyle={{color:'var(--ss-foreground)'}} />
              <Bar isAnimationActive={!reducedMotion} dataKey="sales" fill="var(--ss-chart-1)" radius={[6, 6, 0, 0]} barSize={28} />
              <Bar isAnimationActive={!reducedMotion} dataKey="purchases" fill="var(--ss-chart-2)" radius={[6, 6, 0, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-surface p-6 rounded-2xl border border-line">
          <h3 className="text-lg font-semibold text-foreground mb-6">Top Selling Products</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  isAnimationActive={!reducedMotion}
                  data={data.topProducts?.map((p:any)=>({name:p.name, value:p.quantity})) || []} 
                  innerRadius={70} outerRadius={105} paddingAngle={6} dataKey="value"
                >
                  {data.topProducts?.map((_:any, index:number) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: 'var(--ss-foreground)' }} />
                <Legend formatter={value => <span className="text-muted">{value}</span>} layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-surface p-6 rounded-2xl border border-line">
          <h3 className="text-lg font-semibold text-foreground mb-6">Top Customers</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  isAnimationActive={!reducedMotion}
                  data={data.topCustomers || []} 
                  innerRadius={70} outerRadius={105} paddingAngle={6} dataKey="value"
                >
                  {data.topCustomers?.map((_:any, index:number) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: 'var(--ss-foreground)' }} />
                <Legend formatter={value => <span className="text-muted">{value}</span>} layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. Stock Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-surface rounded-2xl border border-line overflow-hidden">
          <h3 className="text-lg font-semibold p-6 text-foreground bg-surface-raised border-b border-line uppercase tracking-wide">Product Stock Alerts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-muted text-muted text-[10px] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-4 text-center">Product Code</th>
                  <th className="p-4">Product</th>
                  <th className="p-6 text-center">Qty</th>
                  <th className="p-6 text-center">Min</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.stockAlert?.length ? (
                  data.stockAlert.slice(0, 10).map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-surface-raised/50 transition-colors">
                      <td className="p-6 text-center text-muted font-bold text-sm">{item.productCode || '-'}</td>
                      <td className="p-6 font-semibold text-foreground text-sm">{item.name}</td>
                      <td className="p-6 text-center text-primary font-semibold text-sm">{item.quantity}</td>
                      <td className="p-6 text-center text-muted font-bold text-sm">{item.alertLimit}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-muted italic text-sm">No products below alert level.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-line overflow-hidden">
          <h3 className="text-lg font-semibold p-6 text-foreground bg-surface-raised border-b border-line uppercase tracking-wide">Kitchen Stock Alerts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-muted text-muted text-[10px] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-4">Ingredient</th>
                  <th className="p-6 text-center">Qty</th>
                  <th className="p-6 text-center">Min</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.kitchenStockAlert?.length ? (
                  data.kitchenStockAlert.slice(0, 10).map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-surface-raised/50 transition-colors">
                      <td className="p-6 font-semibold text-foreground text-sm">{item.name}</td>
                      <td className="p-6 text-center text-danger font-semibold text-sm">{item.quantity} {item.unit}</td>
                      <td className="p-6 text-center text-muted font-bold text-sm">{item.alertLimit} {item.unit}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="p-10 text-center text-muted italic text-sm">All kitchen stocks are healthy.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. Recent Transactions Section */}
      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        <h3 className="text-lg font-semibold p-6 text-foreground bg-surface-raised border-b border-line">Recent Sales Transactions</h3>
        <table className="w-full text-left">
          <thead className="bg-surface-muted text-muted text-[10px] uppercase tracking-wider font-semibold">
            <tr><th className="p-4">Order Ref</th><th className="p-4">Customer</th><th className="p-4">Status</th><th className="p-6 text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.recentSales?.map((sale: any, idx: number) => (
              <tr key={idx} className="hover:bg-surface-raised/50">
                <td className="p-6 font-bold text-primary">{sale.referenceNumber}</td>
                <td className="p-6 text-foreground font-bold">{sale.customer?.name || 'Walk-in Customer'}</td>
                <td className="p-4">
                  <span  className="bg-secondary-soft text-secondary px-3 py-1 text-xs font-semibold rounded-full">Paid</span>
                </td>
                <td className="p-6 text-right font-semibold text-foreground">{currencyCode} {sale.grandTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default Dashboard;
