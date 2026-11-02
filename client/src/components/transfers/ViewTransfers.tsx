import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../common/Loader';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import SearchBar from '../common/SearchBar';
import { showSuccessToast, showErrorToast } from '../../utils/toast';
import { getTransfers, deleteTransfer } from '../../services/transferService';
import { getWarehouses } from '../../services/warehouseService';
import { formatDate } from '../../utils/date.ts';

interface Transfer {
  _id: string;
  date: string;
  reference: string;
  fromWarehouse: { _id: string, name: string };
  toWarehouse: { _id: string, name: string };
  items: Array<{ productName: string, qty: number }>;
  status: string;
}

const ViewTransfers: React.FC = () => {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<{_id: string, name: string}[]>([]);
  
  // Filters
  const [fromWh, setFromWh] = useState('');
  const [toWh, setToWh] = useState('');
  const [status, setStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTransfers({ 
        q: searchQuery,
        fromWarehouse: fromWh, 
        toWarehouse: toWh, 
        status 
      });
      setTransfers(data.data);
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, fromWh, toWh, status]);

  const fetchWarehousesData = useCallback(async () => {
    try {
      const data = await getWarehouses();
      setWarehouses(data.data);
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchWarehousesData();
  }, [fetchWarehousesData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!toDelete) return;
    setLoading(true);
    try {
      await deleteTransfer(toDelete);
      showSuccessToast('Transfer deleted successfully');
      setToDelete(null);
      fetchData();
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      {loading && <Loader text="Loading..." />}
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Stock Transfers</h1>
          <p className="text-gray-500 text-sm">Transfer stock between warehouses</p>
        </div>
        <button 
          onClick={() => navigate('/createTransfer')}
          className="bg-[#001F54] text-white px-6 py-2 rounded-lg font-semibold hover:bg-[#003366] transition-colors"
        >
          + Add Transfer
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="md:col-span-4">
            <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Search Transfer</label>
            <SearchBar 
              onSearch={(query) => setSearchQuery(query)}
              placeholder="Search by Reference ID..."
              value={searchQuery}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-2">From Warehouse</label>
            <select 
              className="w-full bg-gray-50 border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              value={fromWh}
              onChange={(e) => setFromWh(e.target.value)}
            >
              <option value="">All Warehouses</option>
              {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-2">To Warehouse</label>
            <select 
              className="w-full bg-gray-50 border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              value={toWh}
              onChange={(e) => setToWh(e.target.value)}
            >
              <option value="">All Warehouses</option>
              {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-2">Status</label>
            <select 
              className="w-full bg-gray-50 border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Approved">Approved</option>
            </select>
          </div>
          <div className="flex items-end justify-start">
            <button 
              onClick={() => { setFromWh(''); setToWh(''); setStatus(''); }}
              className="px-6 py-2 bg-red-50 text-red-500 rounded-lg font-semibold hover:bg-red-100 transition-colors text-sm whitespace-nowrap"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400">Date</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400">Reference</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400">From</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400">To</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400">Items</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 text-center">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {transfers.map((t) => (
              <tr key={t._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-sm text-gray-600">
                  {formatDate(t.date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-[10px] font-bold">
                    {t.reference}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-800 font-medium">
                  {t.fromWarehouse?.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-800 font-medium">
                  {t.toWarehouse?.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {t.items.length} Items
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                    t.status === 'Completed' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                  }`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end space-x-2">
                    <button 
                      onClick={() => navigate(`/editTransfer/${t._id}`)}
                      className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => setToDelete(t._id)}
                      className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {transfers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                  No transfers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {toDelete && (
        <DeleteConfirmModal 
          onCancel={() => setToDelete(null)} 
          onConfirm={handleDelete} 
        />
      )}
    </div>
  );
};

export default ViewTransfers;
