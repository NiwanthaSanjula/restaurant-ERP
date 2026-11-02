import { Calendar, Plus } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast } from '../../utils/toast';
import Loader from '../common/Loader';
import Pagination from '../common/Pagination';
import SearchBar from '../common/SearchBar';

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

interface SaleReturnRow {
  id: string;
  returnId: string;
  saleRef: string;
  customerName: string;
  warehouseName: string;
  returnDate: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

const ViewSaleReturns: React.FC = () => {
  const { currencySymbol } = useCurrency();
  const [returns, setReturns] = useState<SaleReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('page', String(pagination.page));
      params.append('limit', String(pagination.limit));
      if (searchQuery) params.append('q', searchQuery);
      if (filterDate) {
        params.append('startDate', filterDate);
        params.append('endDate', filterDate);
      }
      const url = `${api}/sale-returns?${params}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          setReturns([]);
          setPagination(prev => ({ ...prev, total: 0 }));
          return;
        }
        showErrorToast(data?.message || 'Failed to load sale returns');
        setReturns([]);
        return;
      }
      const list = data.data || [];
      const pag = data.pagination || {};
      setReturns(
        list.map((r: any) => ({
          id: r._id,
          returnId: r.returnId || r._id,
          saleRef: r.saleId?.invoiceId || r.saleRef || '—',
          customerName: r.customerId?.name || r.customerName || '—',
          warehouseName: r.warehouseId?.name || r.warehouseName || '—',
          returnDate: r.returnDate || r.createdAt,
          status: r.status || 'Completed',
          totalAmount: r.totalReturnAmount ?? r.total ?? 0,
          createdAt: r.createdAt
        }))
      );
      setPagination(prev => ({ ...prev, total: pag.total ?? list.length }));
    } catch (err) {
      setReturns([]);
      setPagination(prev => ({ ...prev, total: 0 }));
      showErrorToast((err as any)?.message || 'Failed to load sale returns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.limit, searchQuery, filterDate]);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/-/g, '-');
  };

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-black text-[#003366] mb-2">Sale Returns</h1>
            <p className="text-[#64748B] font-bold">View all sale return transactions</p>
          </div>
          <Link
            to="/viewSales"
            className="bg-[#003366] text-white px-6 py-3 rounded-lg hover:bg-[#004080] font-black flex items-center gap-2 transition"
          >
            <Plus size={20} /> Sales
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <SearchBar onSearch={setSearchQuery} placeholder="Search sale returns" />
          </div>
          <div className="relative">
            <input
              type="date"
              value={filterDate}
              onChange={e => { setFilterDate(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="px-4 py-2.5 pl-10 border border-slate-200 rounded-lg focus:outline-none focus:border-[#003366] bg-white"
            />
            <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <Loader />
          ) : returns.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-[#64748B] font-bold mb-2">No sale returns found</p>
              <p className="text-sm text-[#64748B] mb-4">Sale returns can be created from a completed sale in the Sales list.</p>
              <Link to="/viewSales" className="bg-[#003366] text-white px-6 py-2 rounded-lg hover:bg-[#004080] font-bold inline-block">
                Go to Sales
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#F1F5F9] text-[#64748B] text-[10px] uppercase tracking-[0.2em] font-black">
                  <tr>
                    <th className="p-6">Reference</th>
                    <th className="p-6">Sale</th>
                    <th className="p-6">Customer</th>
                    <th className="p-6">Warehouse</th>
                    <th className="p-6">Return Date</th>
                    <th className="p-6 text-center">Status</th>
                    <th className="p-6 text-right">Total</th>
                    <th className="p-6">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {returns.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6">
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold border border-amber-300 bg-amber-50 text-amber-700">
                          {r.returnId}
                        </span>
                      </td>
                      <td className="p-6 font-semibold text-[#003366]">{r.saleRef}</td>
                      <td className="p-6 font-semibold text-[#003366]">{r.customerName}</td>
                      <td className="p-6 font-semibold text-[#003366]">{r.warehouseName}</td>
                      <td className="p-6 text-[#64748B]">{formatDate(r.returnDate)}</td>
                      <td className="p-6 text-center">
                        <span className="inline-flex px-3 py-1 text-xs font-bold rounded-full border border-green-300 bg-green-50 text-green-700">
                          {r.status}
                        </span>
                      </td>
                      <td className="p-6 text-right font-black text-[#003366]">
                        {currencySymbol} {(r.totalAmount ?? 0).toFixed(2)}
                      </td>
                      <td className="p-6 text-[#64748B] font-medium">{formatDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pagination.total > 0 && (
                <div className="px-4 py-3 border-t border-slate-200 bg-[#F8FAFC]">
                  <Pagination
                    totalItems={pagination.total}
                    itemsPerPage={pagination.limit}
                    currentPage={pagination.page}
                  onPageChange={(page: number) => setPagination((prev) => ({ ...prev, page }))}
                  onItemsPerPageChange={(limit: number) =>
                    setPagination((prev) => ({ ...prev, limit, page: 1 }))
                  }
                    itemsPerPageOptions={[10, 25, 50, 100]}
                    hideWhenEmpty
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewSaleReturns;
