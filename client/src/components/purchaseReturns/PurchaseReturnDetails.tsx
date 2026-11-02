import { Pencil } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast } from '../../utils/toast';
import Loader from '../common/Loader';
import { formatDate } from '../../utils/date.ts';

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const getStatusClassName = (status: string) => {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus.includes('complete') || normalizedStatus.includes('receive')) {
    return 'text-green-600 font-black';
  }

  if (normalizedStatus.includes('pend')) {
    return 'text-amber-600 font-black';
  }

  if (normalizedStatus.includes('cancel')) {
    return 'text-red-600 font-black';
  }

  return 'text-[#003366] font-black';
};

const PurchaseReturnDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currencyCode } = useCurrency();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${api}/purchase-returns/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const json = await res.json();
        if (!res.ok || !json.data) {
          showErrorToast(json?.message || 'Purchase return not found');
          return;
        }
        setData(json.data);
      } catch (e) {
        showErrorToast((e as Error).message || 'Failed to load purchase return');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) return <Loader />;
  if (!data) {
    return (
      <div className="p-8 bg-[#F8FAFC] min-h-screen">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[#64748B] font-bold mb-4">Purchase return not found</p>
          <Link to="/viewPurchaseReturns" className="text-[#003366] font-bold hover:underline">
            Back to Purchase Returns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black text-[#003366] mb-1">Purchase Return Details</h1>
            <p className="text-sm text-[#64748B] font-bold">
              Reference: {data.returnId} • {formatDate(data.returnDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/editPurchaseReturn/${data._id}`)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-[#003366] font-bold hover:bg-slate-50"
            >
              <Pencil size={18} />
              Edit
            </button>
            <Link
              to="/viewPurchaseReturns"
              className="px-4 py-2 text-[#003366] font-bold border border-slate-300 rounded-lg hover:bg-slate-100"
            >
              Back
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-xs font-black text-[#64748B] uppercase mb-3">Supplier Info</h3>
            <p className="font-black text-[#003366] mb-1">
              {data.supplierName || data.supplierId?.name || '—'}
            </p>
            <p className="text-xs text-[#64748B] font-medium">
              {data.supplierId?.email || data.supplierEmail || '—'}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-xs font-black text-[#64748B] uppercase mb-3">Warehouse Info</h3>
            <p className="font-black text-[#003366] mb-1">
              {data.warehouseName || data.warehouseId?.name || '—'}
            </p>
            <p className="text-xs text-[#64748B] font-medium">
              {data.warehouseId?.location || data.warehouseLocation || '—'}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-xs font-black text-[#64748B] uppercase mb-3">Return Info</h3>
            <p className="text-xs text-[#64748B] font-bold mb-1">
              Status:{' '}
              <span className={getStatusClassName(data.status || '')}>{data.status || '—'}</span>
            </p>
            <p className="text-xs text-[#64748B] font-bold mb-1">
              Reason: <span className="font-black text-[#003366] capitalize">{data.reason}</span>
            </p>
            {data.notes && (
              <p className="text-xs text-[#64748B] font-bold">
                Note: <span className="font-medium text-[#0f172a]">{data.notes}</span>
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-[#F8FAFC]">
            <h3 className="text-sm font-black text-[#003366]">Order Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Quantity</th>
                  <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Net Unit Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((item: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="px-6 py-3">
                      <div className="font-black text-[#003366]">{item.productName}</div>
                      {item.productCode && (
                        <div className="text-xs text-[#64748B] font-medium">{item.productCode}</div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-[#0f172a]">{item.returnQuantity}</td>
                    <td className="px-6 py-3 text-sm text-[#0f172a]">
                      {currencyCode} {(item.productCost ?? 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-sm font-black text-[#003366]">
                      {currencyCode} {(item.subTotal ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 w-full md:w-80">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[#64748B] font-bold">Order Tax</span>
              <span className="font-bold text-[#003366]">{currencyCode} 0.00 (0.00)%</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[#64748B] font-bold">Discount</span>
              <span className="font-bold text-[#003366]">{currencyCode} 0.00</span>
            </div>
            <div className="flex justify-between text-sm mb-4">
              <span className="text-[#64748B] font-bold">Shipping</span>
              <span className="font-bold text-[#003366]">{currencyCode} 0.00</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-200">
              <span className="text-[#64748B] font-black">Grand Total</span>
              <span className="text-xl font-black text-[#2563EB]">
                {currencyCode} {(data.totalReturnAmount ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseReturnDetails;

