import { ArrowLeft, Truck } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "../../contexts/CurrencyContext";
import ExportPDFButton from "../common/ExportPDFButton";
import Loader from "../common/Loader";
import SearchBar from "../common/SearchBar";
import { showErrorToast } from '../../utils/toast';

type SupplierRow = {
  id: string;
  supplier: string;
  purchases: number;
  total: number;
};

const SupplierReport: React.FC = () => {
  const navigate = useNavigate();
  const { currencyCode } = useCurrency();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;

  const fetchSuppliers = async (query: string = "", start: string = "", end: string = "") => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (start) params.append('startDate', start);
      if (end) params.append('endDate', end);
      const queryString = params.toString();

      const res = await fetch(`${api}/suppliers${queryString ? `?${queryString}` : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load");

      const rows: SupplierRow[] = data.data.map((s: any) => ({
        id: s._id,
        supplier: s.name,
        purchases: s.purchaseCount || 0, 
        total: s.totalPurchaseAmount || 0, 
      }));

      setSuppliers(rows);
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers(searchQuery, startDate, endDate);
  }, [searchQuery, startDate, endDate]);

  const handleSearch = (query: string) => setSearchQuery(query);

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value);
  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen">
      {loading && <Loader text="Loading Suppliers..." />}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#004080] text-white rounded-xl">
            <Truck size={26} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">
              Supplier Report
            </h1>
            <p className="text-slate-500 text-sm">Supplier purchase summary</p>
          </div>
        </div>

        <div className="flex gap-3">
          
            <ExportPDFButton
              columns={["Supplier", "Purchases", "Total Amount"]}
              data={suppliers.map((row) => ({
                Supplier: row.supplier,
                Purchases: row.purchases.toString(),
                "Total Amount": `${currencyCode} ${row.total}`,
              }))}
              fileName="supplier-report"
              reportTitle="Supplier Report"
             
            />
        

          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-slate-500 hover:text-[#004080] px-3 py-2 rounded-lg"
          >
            <ArrowLeft size={18} className="mr-2" />
            Back
          </button>
        </div>
      </div>

      <SearchBar
        onSearch={handleSearch}
        placeholder="Search suppliers..."
        className="mb-4 w-full sm:max-w-md"
      />

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex flex-col">
          <label htmlFor="startDate" className="text-sm font-medium text-slate-700 mb-1">Start Date</label>
          <input
            type="date"
            id="startDate"
            value={startDate}
            onChange={handleStartDateChange}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004080] focus:border-transparent"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="endDate" className="text-sm font-medium text-slate-700 mb-1">End Date</label>
          <input
            type="date"
            id="endDate"
            value={endDate}
            onChange={handleEndDateChange}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004080] focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left">Supplier</th>
              <th className="px-4 py-3 text-left">Purchases</th>
              <th className="px-4 py-3 text-left">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-6">
                  No suppliers found
                </td>
              </tr>
            ) : (
              suppliers.map((row, i) => (
                <tr key={i} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3">{row.supplier}</td>
                  <td className="px-4 py-3">{row.purchases}</td>
                  <td className="px-4 py-3 font-semibold">{currencyCode} {row.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SupplierReport;