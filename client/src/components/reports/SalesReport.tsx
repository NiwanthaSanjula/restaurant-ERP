import { ArrowLeft, BarChart3, Calendar, Layout, Printer, RefreshCcw, Store } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "../../contexts/CurrencyContext";
import { getSalesReport } from "../../services/saleService";
import { getWarehouses } from "../../services/warehouseService";
import { showErrorToast } from "../../utils/toast";
import ExportPDFButton from "../common/ExportPDFButton";

const SalesReport: React.FC = () => {
  const navigate = useNavigate();
  const { currencySymbol } = useCurrency();
  const [activeTab, setActiveTab] = useState<"sales" | "returns">("sales");

  const [filters, setFilters] = useState({
    fromDate: "",
    toDate: "",
    store: "All Stores"
  });

  type SaleRow = {
    date: string;
    ref: string;
    customer: string;
    warehouse: string;
    type: string;
    total: number;
    status: string;
  };

  type SaleReturnRow = {
    date: string;
    retRef: string;
    saleRef: string;
    customer: string;
    total: number;
    status: string;
  };

  const [salesData, setSalesData] = useState<SaleRow[]>([]);
  const [returnsData, setReturnsData] = useState<SaleReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  const fetchWarehousesList = async () => {
    setLoadingWarehouses(true);
    try {
      const res = await getWarehouses();
      if (res?.data && Array.isArray(res.data)) {
        setWarehouses(res.data.map((w: any) => ({ _id: w._id, name: w.name })));
      } else setWarehouses([]);
    } catch (error: any) {
      showErrorToast(error.message || "Failed to load warehouses");
      setWarehouses([]);
    } finally {
      setLoadingWarehouses(false);
    }
  };

  const fetchSalesReport = async () => {
    setLoading(true);
    try {
      const response = await getSalesReport({
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        warehouseId: !filters.store || filters.store === "All Stores" ? undefined : filters.store,
      });
      setSalesData(response.status === "success" && Array.isArray(response.data) ? response.data : []);
    } catch (error: any) {
      showErrorToast(error.message || "Failed to load sales report");
      setSalesData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSaleReturns = async () => {
    setLoadingReturns(true);
    try {
      const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (filters.fromDate) params.append("startDate", filters.fromDate);
      if (filters.toDate) params.append("endDate", filters.toDate);
      if (filters.store && filters.store !== "All Stores") params.append("warehouseId", filters.store);
      const url = `${api}/sale-returns?${params.toString()}`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) { setReturnsData([]); return; }
        showErrorToast(data?.message || "Failed to load sale returns");
        setReturnsData([]);
        return;
      }
      setReturnsData((data.data || []).map((r: any) => ({
        date: r.returnDate || r.createdAt,
        retRef: r.returnId || r._id,
        saleRef: r.saleId?.invoiceId || r.saleRef || "—",
        customer: r.customerId?.name || r.customerName || "—",
        total: r.totalAmount ?? r.total ?? 0,
        status: r.status || "Completed",
      })));
    } catch (error: any) {
      setReturnsData([]);
      showErrorToast(error.message || "Failed to load sale returns");
    } finally {
      setLoadingReturns(false);
    }
  };

  useEffect(() => { fetchWarehousesList(); }, []);
  useEffect(() => {
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      showErrorToast("From Date cannot be greater than To Date");
      setSalesData([]);
      setReturnsData([]);
      return;
    }
    fetchSalesReport();
    fetchSaleReturns();
  }, [filters.fromDate, filters.toDate, filters.store]);

  const totalSalesAmount = salesData.reduce((acc, curr) => acc + curr.total, 0);
  const totalReturnsAmount = returnsData.reduce((acc, curr) => acc + curr.total, 0);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#004080] rounded-xl text-white shadow-lg"><BarChart3 size={26} /></div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Sales Report</h1>
            <p className="text-slate-500 text-xs md:text-sm">View sales performance and transactions</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="flex items-center text-slate-500 hover:text-[#004080]">
              <ArrowLeft size={18} className="mr-2"/> Back
            </button>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all">
              <Printer size={18}/> Print
            </button>

            <ExportPDFButton
              columns={activeTab === "sales"
                ? ["date","ref","customer","warehouse","type","total","status"]
                : ["date","retRef","saleRef","customer","total","status"]
              }
              data={activeTab === "sales"
                ? salesData.map(s => ({
                    date: s.date,
                    ref: s.ref,
                    customer: s.customer,
                    warehouse: s.warehouse,
                    type: s.type,
                    total: `${currencySymbol} ${currencyCode} ${s.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    status: s.status
                  }))
                : returnsData.map(r => ({
                    date: r.date,
                    retRef: r.retRef,
                    saleRef: r.saleRef,
                    customer: r.customer,
                    total: `${currencySymbol} ${currencyCode} ${r.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    status: r.status
                  }))
              }
              fileName={activeTab === "sales" ? "sales-report" : "sale-returns-report"}
              reportTitle={activeTab === "sales" ? "Sales Report" : "Sale Returns Report"}
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-600">From Date</label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-3 text-slate-400" size={16}/>
              <input
                type="date"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080]"
                value={filters.fromDate}
                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">To Date</label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-3 text-slate-400" size={16}/>
              <input
                type="date"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080]"
                value={filters.toDate}
                onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">Warehouse</label>
            <div className="relative mt-1">
              <Store className="absolute left-3 top-3 text-slate-400" size={16}/>
              <select
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl"
                value={filters.store}
                onChange={(e) => setFilters({ ...filters, store: e.target.value })}
              >
                <option value="All Stores">All Stores</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div
          className="relative overflow-hidden rounded-[30px] p-8 transition-all duration-300 hover:scale-[1.02] cursor-pointer shadow-lg"
          style={{
            background: `linear-gradient(135deg, #80CAFF 0%, #3B82F6 100%)`,
          }}
        >
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <p className="text-white/80 text-sm font-bold uppercase tracking-wider mb-1">Total Sales</p>
              <h3 className="text-white text-3xl font-black tracking-tighter">
                {currencySymbol} {currencyCode} {totalSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md">
              <Layout className="text-white w-8 h-8" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
        </div>

        <div
          className="relative overflow-hidden rounded-[30px] p-8 transition-all duration-300 hover:scale-[1.02] cursor-pointer shadow-lg"
          style={{
            background: `linear-gradient(135deg, #80CAFF 0%, #1A3E73 100%)`,
          }}
        >
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <p className="text-white/80 text-sm font-bold uppercase tracking-wider mb-1">Total Returns</p>
              <h3 className="text-white text-3xl font-black tracking-tighter">
                {currencySymbol} {currencyCode} {totalReturnsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md">
              <RefreshCcw className="text-white w-8 h-8" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setActiveTab("sales")}
            className={`px-8 py-5 text-sm font-black transition-all relative ${
              activeTab === "sales" ? "text-[#004080]" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Sales
            {activeTab === "sales" && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#004080] rounded-t-full" />}
          </button>
          <button
            onClick={() => setActiveTab("returns")}
            className={`px-8 py-5 text-sm font-black transition-all relative ${
              activeTab === "returns" ? "text-[#004080]" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Sale Returns
            {activeTab === "returns" && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#004080] rounded-t-full" />}
          </button>
        </div>

        <div className="p-6 md:p-8">
          <div className="border border-slate-100 rounded-[24px] overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                {activeTab === "sales" ? (
                  <tr>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Reference</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Warehouse</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Payment Type</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Grand Total</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Return Date</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Return Ref</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Sale Ref</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Return Total</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                  </tr>
                )}
              </thead>

              <tbody className="divide-y divide-slate-50">
                {activeTab === "sales" ? (
                  loading ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500">
                        Loading sales...
                      </td>
                    </tr>
                  ) : salesData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500">
                        No sales found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    salesData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-5 text-sm font-bold text-slate-600">{item.date}</td>
                        <td className="p-5 text-sm font-black text-[#1A3E73]">{item.ref}</td>
                        <td className="p-5 text-sm font-bold text-slate-700">{item.customer}</td>
                        <td className="p-5 text-sm font-bold text-slate-700">{item.warehouse}</td>
                        <td className="p-5 text-sm font-bold text-slate-600">
                          <span className="px-3 py-1 bg-slate-100 rounded-lg text-[11px]">{item.type}</span>
                        </td>
                        <td className="p-5 text-sm font-black text-[#004080] text-right">
                          {currencySymbol} {currencyCode} {item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-5 text-center">
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                              item.status.toLowerCase() === "paid"
                                ? "bg-green-100 text-green-600"
                                : "bg-red-100 text-red-600"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )
                ) : loadingReturns ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      Loading returns...
                    </td>
                  </tr>
                ) : returnsData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      No sale returns found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  returnsData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-5 text-sm font-bold text-slate-600">{item.date}</td>
                      <td className="p-5 text-sm font-black text-[#E11D48]">{item.retRef}</td>
                      <td className="p-5 text-sm font-medium text-slate-500">{item.saleRef}</td>
                      <td className="p-5 text-sm font-bold text-slate-700">{item.customer}</td>
                      <td className="p-5 text-sm font-black text-[#004080] text-right">
                        {currencySymbol} {currencyCode} {item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-5 text-center">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                            item.status.toLowerCase() === "received"
                              ? "bg-blue-100 text-blue-600"
                              : "bg-orange-100 text-orange-600"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-slate-50 bg-white">
            <div className="text-sm font-medium text-slate-400">
              {(() => {
                const length = activeTab === "sales" ? salesData.length : returnsData.length;
                if (length === 0) {
                  return (
                    <>
                      Showing <span className="text-slate-600 font-bold">0</span> to{" "}
                      <span className="text-slate-600 font-bold">0</span> of{" "}
                      <span className="text-slate-600 font-bold">0</span> entries
                    </>
                  );
                }
                return (
                  <>
                    Showing <span className="text-slate-600 font-bold">1</span> to{" "}
                    <span className="text-slate-600 font-bold">{length}</span> of{" "}
                    <span className="text-slate-600 font-bold">{length}</span> entries
                  </>
                );
              })()}
            </div>

            <div className="flex items-center gap-2">
              <button className="px-3 py-1 text-sm font-bold text-slate-400 hover:text-[#004080] transition-colors">
                Previous
              </button>

              <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-[#004080] font-black text-sm border border-blue-100">
                1
              </button>

              <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-400 font-bold text-sm border border-slate-100 hover:bg-slate-50">
                <span className="text-[10px]">▶</span>
              </button>

              <button className="px-3 py-1 text-sm font-bold text-slate-400 hover:text-[#004080] transition-colors">
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesReport;

