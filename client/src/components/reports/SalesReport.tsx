import { ArrowLeft, BarChart3, Calendar, Layout, Printer, RefreshCcw, Store } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "../../contexts/CurrencyContext";
import { getSalesReport, getSaleReturnsReport } from "../../services/saleService";
import { getWarehouses } from "../../services/warehouseService";
import { showErrorToast } from "../../utils/toast";
import ExportPDFButton from "../common/ExportPDFButton";

const SalesReport: React.FC = () => {
  const navigate = useNavigate();
  const { currencySymbol, currencyCode } = useCurrency();
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
    total: number | null;
    status: string;
  };

  type SaleReturnRow = {
    date: string;
    retRef: string;
    saleRef: string;
    customer: string;
    total: number | null;
    status: string;
  };

  const [loadedSalesData, setSalesData] = useState<SaleRow[]>([]);
  const [loadedReturnsData, setReturnsData] = useState<SaleReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [salesReady, setSalesReady] = useState<string | null>(null);
  const [returnsReady, setReturnsReady] = useState<string | null>(null);
  const [salesError, setSalesError] = useState('');
  const [returnsError, setReturnsError] = useState('');
  const [totalSalesAmount, setTotalSalesAmount] = useState<number | null>(null);
  const [totalReturnsAmount, setTotalReturnsAmount] = useState<number | null>(null);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [, setLoadingWarehouses] = useState(false);
  const filterKey = JSON.stringify([filters.fromDate, filters.toDate, filters.store]);

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

  useEffect(() => { fetchWarehousesList(); }, []);
  useEffect(() => {
    let current = true;
    setSalesData([]); setReturnsData([]);
    setSalesReady(null); setReturnsReady(null);
    setTotalSalesAmount(null); setTotalReturnsAmount(null);
    setSalesError(''); setReturnsError('');
    setLoading(true); setLoadingReturns(true);
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      const message = 'From Date cannot be greater than To Date';
      setSalesError(message); setReturnsError(message);
      setLoading(false); setLoadingReturns(false);
      showErrorToast(message);
      return () => { current = false; };
    }
    const params = {
      fromDate: filters.fromDate || undefined,
      toDate: filters.toDate || undefined,
      warehouseId: !filters.store || filters.store === 'All Stores' ? undefined : filters.store,
    };
    getSalesReport(params).then(response => {
      if (!current) return;
      setSalesData(response.data); setTotalSalesAmount(response.totalAmount); setSalesReady(filterKey);
    }).catch(error => {
      if (!current) return;
      const message = error instanceof Error ? error.message : 'Failed to load sales report';
      setSalesError(message); showErrorToast(message);
    }).finally(() => { if (current) setLoading(false); });
    getSaleReturnsReport(params).then(response => {
      if (!current) return;
      setReturnsData(response.data); setTotalReturnsAmount(response.totalAmount); setReturnsReady(filterKey);
    }).catch(error => {
      if (!current) return;
      const message = error instanceof Error ? error.message : 'Failed to load sale returns';
      setReturnsError(message); showErrorToast(message);
    }).finally(() => { if (current) setLoadingReturns(false); });
    return () => { current = false; };
  }, [filters.fromDate, filters.toDate, filters.store, filterKey]);

  const salesData = salesReady === filterKey ? loadedSalesData : [];
  const returnsData = returnsReady === filterKey ? loadedReturnsData : [];
  const activeError = activeTab === 'sales' ? salesError : returnsError;
  const formatAmount = (amount: number | null) => amount === null ? 'Unavailable'
    : `${currencySymbol} ${currencyCode} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 bg-canvas min-h-screen">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary rounded-xl text-on-primary"><BarChart3 size={26} /></div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Sales Report</h1>
            <p className="text-muted text-xs md:text-sm">View sales performance and transactions</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="flex items-center text-muted hover:text-primary">
              <ArrowLeft size={18} className="mr-2"/> Back
            </button>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-surface border border-line rounded-xl text-sm font-bold text-foreground hover:bg-surface-raised transition-all">
              <Printer size={18}/> Print
            </button>

            <ExportPDFButton
              disabled={activeTab === 'sales' ? loading || salesReady !== filterKey : loadingReturns || returnsReady !== filterKey}
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
                    total: formatAmount(s.total),
                    status: s.status
                  }))
                : returnsData.map(r => ({
                    date: r.date,
                    retRef: r.retRef,
                    saleRef: r.saleRef,
                    customer: r.customer,
                    total: formatAmount(r.total),
                    status: r.status
                  }))
              }
              fileName={activeTab === "sales" ? "sales-report" : "sale-returns-report"}
              reportTitle={activeTab === "sales" ? "Sales Report" : "Sale Returns Report"}
            />
          </div>
        </div>
      </div>

      <div className="bg-surface p-5 md:p-6 rounded-2xl border border-line mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-semibold text-muted">From Date</label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-3 text-subtle" size={16}/>
              <input
                type="date"
                className="w-full pl-10 pr-4 py-2.5 border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={filters.fromDate}
                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-muted">To Date</label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-3 text-subtle" size={16}/>
              <input
                type="date"
                className="w-full pl-10 pr-4 py-2.5 border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={filters.toDate}
                onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-muted">Warehouse</label>
            <div className="relative mt-1">
              <Store className="absolute left-3 top-3 text-subtle" size={16}/>
              <select
                className="w-full pl-10 pr-4 py-2.5 border border-line rounded-xl"
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

      {activeError && <p role="alert" className="mb-4 rounded-xl border border-danger-line bg-danger-soft p-4 text-danger">{activeError} No incomplete report can be exported.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div
          className="relative overflow-hidden rounded-[30px] p-8 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
          style={{
            background: `linear-gradient(135deg, #80CAFF 0%, #3B82F6 100%)`,
          }}
        >
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <p className="text-foreground text-sm font-bold uppercase tracking-wider mb-1">Total Sales</p>
              <h3 className="text-foreground text-3xl font-black tracking-tighter">
                {formatAmount(salesReady === filterKey ? totalSalesAmount : null)}
              </h3>
            </div>
            <div className="bg-surface-muted p-4 rounded-2xl backdrop-blur-md">
              <Layout className="text-foreground w-8 h-8" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-surface-muted rounded-full blur-2xl"></div>
        </div>

        <div
          className="relative overflow-hidden rounded-[30px] p-8 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
          style={{
            background: `linear-gradient(135deg, #80CAFF 0%, #1A3E73 100%)`,
          }}
        >
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <p className="text-foreground text-sm font-bold uppercase tracking-wider mb-1">Total Returns</p>
              <h3 className="text-foreground text-3xl font-black tracking-tighter">
                {formatAmount(returnsReady === filterKey ? totalReturnsAmount : null)}
              </h3>
            </div>
            <div className="bg-surface-muted p-4 rounded-2xl backdrop-blur-md">
              <RefreshCcw className="text-foreground w-8 h-8" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-surface-muted rounded-full blur-2xl"></div>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        <div className="flex border-b border-line">
          <button
            onClick={() => setActiveTab("sales")}
            className={`px-8 py-5 text-sm font-black transition-all relative ${
              activeTab === "sales" ? "text-primary" : "text-subtle hover:text-muted"
            }`}
          >
            Sales
            {activeTab === "sales" && <div className="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full" />}
          </button>
          <button
            onClick={() => setActiveTab("returns")}
            className={`px-8 py-5 text-sm font-black transition-all relative ${
              activeTab === "returns" ? "text-primary" : "text-subtle hover:text-muted"
            }`}
          >
            Sale Returns
            {activeTab === "returns" && <div className="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full" />}
          </button>
        </div>

        <div className="p-6 md:p-8">
          <div className="border border-line rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-surface-raised">
                {activeTab === "sales" ? (
                  <tr>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Date</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Reference</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Customer</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Warehouse</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Payment Type</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest text-right">Grand Total</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest text-center">Status</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Return Date</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Return Ref</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Sale Ref</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Customer</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest text-right">Return Total</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest text-center">Status</th>
                  </tr>
                )}
              </thead>

              <tbody className="divide-y divide-line">
                {activeTab === "sales" ? (
                  loading ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted">
                        Loading sales...
                      </td>
                    </tr>
                  ) : salesData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted">
                        {salesError ? 'Sales report could not be loaded.' : 'No sales found for the selected filters.'}
                      </td>
                    </tr>
                  ) : (
                    salesData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-surface-raised transition-colors">
                        <td className="p-5 text-sm font-bold text-muted">{item.date}</td>
                        <td className="p-5 text-sm font-black text-foreground">{item.ref}</td>
                        <td className="p-5 text-sm font-bold text-foreground">{item.customer}</td>
                        <td className="p-5 text-sm font-bold text-foreground">{item.warehouse}</td>
                        <td className="p-5 text-sm font-bold text-muted">
                          <span className="px-3 py-1 bg-surface-muted rounded-lg text-[11px]">{item.type}</span>
                        </td>
                        <td className="p-5 text-sm font-black text-foreground text-right">
                          {formatAmount(item.total)}
                        </td>
                        <td className="p-5 text-center">
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                              item.status.toLowerCase() === "paid"
                                ? "bg-secondary-soft text-secondary"
                                : "bg-danger-soft text-danger"
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
                    <td colSpan={6} className="p-6 text-center text-muted">
                      Loading returns...
                    </td>
                  </tr>
                ) : returnsData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted">
                      {returnsError ? 'Sale returns report could not be loaded.' : 'No sale returns found for the selected filters.'}
                    </td>
                  </tr>
                ) : (
                  returnsData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-surface-raised transition-colors">
                      <td className="p-5 text-sm font-bold text-muted">{item.date}</td>
                      <td className="p-5 text-sm font-black text-danger">{item.retRef}</td>
                      <td className="p-5 text-sm font-medium text-muted">{item.saleRef}</td>
                      <td className="p-5 text-sm font-bold text-foreground">{item.customer}</td>
                      <td className="p-5 text-sm font-black text-foreground text-right">
                        {formatAmount(item.total)}
                      </td>
                      <td className="p-5 text-center">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                            item.status.toLowerCase() === "received"
                              ? "bg-primary-soft text-primary"
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

          <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-line bg-surface">
            <div className="text-sm font-medium text-subtle">
              {(() => {
                if (activeError) return <span>Report unavailable</span>;
                if (activeTab === 'sales' ? loading : loadingReturns) return <span>Loading all matching records…</span>;
                const length = activeTab === "sales" ? salesData.length : returnsData.length;
                if (length === 0) {
                  return (
                    <>
                      Showing <span className="text-muted font-bold">0</span> to{" "}
                      <span className="text-muted font-bold">0</span> of{" "}
                      <span className="text-muted font-bold">0</span> entries
                    </>
                  );
                }
                return (
                  <>
                    Showing <span className="text-muted font-bold">1</span> to{" "}
                    <span className="text-muted font-bold">{length}</span> of{" "}
                    <span className="text-muted font-bold">{length}</span> entries
                  </>
                );
              })()}
            </div>

            <div className="flex items-center gap-2">
              <button className="px-3 py-1 text-sm font-bold text-subtle hover:text-primary transition-colors">
                Previous
              </button>

              <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-soft text-primary font-black text-sm border border-primary-line">
                1
              </button>

              <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-subtle font-bold text-sm border border-line hover:bg-surface-raised">
                <span className="text-[10px]">▶</span>
              </button>

              <button className="px-3 py-1 text-sm font-bold text-subtle hover:text-primary transition-colors">
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

