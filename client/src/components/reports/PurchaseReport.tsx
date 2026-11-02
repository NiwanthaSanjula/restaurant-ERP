import {
    ArrowLeft,
    Calendar,
    Printer,
    RefreshCcw,
    ShoppingCart,
    Store,
    Wallet
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "../../contexts/CurrencyContext";
import { getPurchaseReport, getPurchaseReturnsReport } from "../../services/purchaseService";
import { getWarehouses } from "../../services/warehouseService";
import { showErrorToast } from "../../utils/toast";
import ExportPDFButton from "../common/ExportPDFButton";

const PurchaseReport: React.FC = () => {
  const navigate = useNavigate();
  const { currencySymbol, currencyCode } = useCurrency();
  const [activeTab, setActiveTab] = useState<"purchases" | "returns">("purchases");

  const [filters, setFilters] = useState({
    fromDate: "",
    toDate: "",
    store: "All Stores",
  });

  type PurchaseRow = {
    date: string;
    ref: string;
    supplier: string;
    warehouse: string;
    total: number;
    status: string;
  };

  type PurchaseReturnRow = {
    date: string;
    retRef: string;
    purchaseRef: string;
    supplier: string;
    warehouse: string;
    total: number;
    status: string;
  };

  const [purchasesData, setPurchasesData] = useState<PurchaseRow[]>([]);
  const [returnsData, setReturnsData] = useState<PurchaseReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  const fetchWarehousesList = async () => {
    setLoadingWarehouses(true);
    try {
      const res = await getWarehouses();
      if (res?.data && Array.isArray(res.data)) {
        const rows = res.data.map((w: any) => ({
          _id: w._id,
          name: w.name,
        }));
        setWarehouses(rows);
      } else {
        setWarehouses([]);
      }
    } catch (error: any) {
      showErrorToast(error.message || "Failed to load warehouses");
      setWarehouses([]);
    } finally {
      setLoadingWarehouses(false);
    }
  };

  const fetchPurchaseReport = async () => {
    setLoading(true);
    try {
      const response = await getPurchaseReport({
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        warehouseId: !filters.store || filters.store === "All Stores" ? undefined : filters.store,
      });

      if (response.status === "success" && Array.isArray(response.data)) {
        setPurchasesData(response.data);
      } else {
        setPurchasesData([]);
      }
    } catch (error: any) {
      showErrorToast(error.message || "Failed to load purchase report");
      setPurchasesData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPurchaseReturnsReport = async () => {
    setLoadingReturns(true);
    try {
      const response = await getPurchaseReturnsReport({
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        warehouseId: !filters.store || filters.store === "All Stores" ? undefined : filters.store,
      });

      if (response.status === "success" && Array.isArray(response.data)) {
        setReturnsData(response.data);
      } else {
        setReturnsData([]);
      }
    } catch (error: any) {
      showErrorToast(error.message || "Failed to load purchase returns report");
      setReturnsData([]);
    } finally {
      setLoadingReturns(false);
    }
  };

  useEffect(() => {
    fetchWarehousesList();
  }, []);

  useEffect(() => {
    fetchPurchaseReport();
    fetchPurchaseReturnsReport();
  }, [filters.fromDate, filters.toDate, filters.store]);

  const totalPurchasesAmount = purchasesData.reduce((acc, curr) => acc + curr.total, 0);
  const totalReturnsAmount = returnsData.reduce((acc, curr) => acc + curr.total, 0);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 bg-canvas min-h-screen">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary rounded-xl text-on-primary">
            <Wallet size={26} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Purchase Report</h1>
            <p className="text-muted text-xs md:text-sm">View purchase performance and transactions</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="flex items-center text-muted hover:text-primary">
              <ArrowLeft size={18} className="mr-2" />
              Back
            </button>{" "}
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-surface border border-line rounded-xl text-sm font-bold text-foreground hover:bg-surface-raised transition-all">
              <Printer size={18} /> Print
            </button>

            <ExportPDFButton
              columns={activeTab === "purchases"
                ? ["date", "ref", "supplier", "warehouse", "total", "status"]
                : ["date", "retRef", "purchaseRef", "supplier", "warehouse", "total", "status"]}
              data={activeTab === "purchases"
                ? purchasesData.map((p) => ({
                  date: p.date,
                  ref: p.ref,
                  supplier: p.supplier,
                  warehouse: p.warehouse,
                  total: `${currencySymbol} ${currencyCode} ${p.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  status: p.status,
                }))
                : returnsData.map((r) => ({
                  date: r.date,
                  retRef: r.retRef,
                  purchaseRef: r.purchaseRef,
                  supplier: r.supplier,
                  warehouse: r.warehouse,
                  total: `${currencySymbol} ${currencyCode} ${r.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  status: r.status,
                }))
              }
              fileName={activeTab === "purchases" ? "purchase-report" : "purchase-returns-report"}
              reportTitle={activeTab === "purchases" ? "Purchase Report" : "Purchase Returns Report"}
            />
          </div>
        </div>
      </div>

      <div className="bg-surface p-5 md:p-6 rounded-2xl border border-line mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-semibold text-muted">From Date</label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-3 text-subtle" size={16} />
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
              <Calendar className="absolute left-3 top-3 text-subtle" size={16} />
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
              <Store className="absolute left-3 top-3 text-subtle" size={16} />
              <select
                className="w-full pl-10 pr-4 py-2.5 border border-line rounded-xl"
                value={filters.store}
                onChange={(e) => setFilters({ ...filters, store: e.target.value })}
                disabled={loadingWarehouses}
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
          className="relative overflow-hidden rounded-[30px] p-8 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
          style={{ background: `linear-gradient(135deg, #B9D5F2 0%, #3CC3DF 100%)` }}
        >
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <p className="text-foreground text-sm font-bold uppercase tracking-wider mb-1">Total Purchases</p>
              <h3 className="text-foreground text-3xl font-black tracking-tighter">{currencySymbol} {currencyCode} {totalPurchasesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
            <div className="bg-surface-muted p-4 rounded-2xl backdrop-blur-md">
              <ShoppingCart className="text-foreground w-8 h-8" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-surface-muted rounded-full blur-2xl"></div>
        </div>

        <div
          className="relative overflow-hidden rounded-[30px] p-8 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
          style={{ background: `linear-gradient(135deg, #3CC3DF 0%, #1A3E73 100%)` }}
        >
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <p className="text-foreground text-sm font-bold uppercase tracking-wider mb-1">Total Returns</p>
              <h3 className="text-foreground text-3xl font-black tracking-tighter">{currencySymbol} {currencyCode} {totalReturnsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
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
            onClick={() => setActiveTab("purchases")}
            className={`px-8 py-5 text-sm font-black transition-all relative ${
              activeTab === "purchases" ? "text-primary" : "text-subtle hover:text-muted"
            }`}
          >
            Purchases
            {activeTab === "purchases" && <div className="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full" />}
          </button>
          <button
            onClick={() => setActiveTab("returns")}
            className={`px-8 py-5 text-sm font-black transition-all relative ${
              activeTab === "returns" ? "text-primary" : "text-subtle hover:text-muted"
            }`}
          >
            Purchase Returns
            {activeTab === "returns" && <div className="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full" />}
          </button>
        </div>

        <div className="p-6 md:p-8">
          <div className="border border-line rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-surface-raised">
                {activeTab === "purchases" ? (
                  <tr>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Date</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Reference</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Supplier</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Warehouse</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest text-right">Grand Total</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest text-center">Status</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Return Date</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Return Ref</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Purchase Ref</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest">Supplier</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest text-right">Return Total</th>
                    <th className="p-5 text-[11px] font-black text-subtle uppercase tracking-widest text-center">Status</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-line">
                {activeTab === "purchases"
                  ? loading
                    ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted">Loading purchases...</td>
                      </tr>
                    ) : purchasesData.length === 0
                      ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-muted">No purchases found for the selected filters.</td>
                        </tr>
                      ) : (
                        purchasesData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-surface-raised transition-colors">
                            <td className="p-5 text-sm font-bold text-muted">{item.date}</td>
                            <td className="p-5 text-sm font-black text-foreground">{item.ref}</td>
                            <td className="p-5 text-sm font-bold text-foreground">{item.supplier}</td>
                            <td className="p-5 text-sm font-bold text-foreground">{item.warehouse}</td>
                            <td className="p-5 text-sm font-black text-foreground text-right">{currencySymbol} {currencyCode} {item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="p-5 text-center">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                String(item.status).toLowerCase() === "paid" ? "bg-secondary-soft text-secondary" : "bg-danger-soft text-danger"
                              }`}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )
                  : loadingReturns
                    ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted">Loading purchase returns...</td>
                      </tr>
                    ) : returnsData.length === 0
                      ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-muted">No purchase returns found for the selected filters.</td>
                        </tr>
                      ) : (
                        returnsData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-surface-raised transition-colors">
                            <td className="p-5 text-sm font-bold text-muted">{item.date}</td>
                            <td className="p-5 text-sm font-black text-danger">{item.retRef}</td>
                            <td className="p-5 text-sm font-medium text-muted">{item.purchaseRef}</td>
                            <td className="p-5 text-sm font-bold text-foreground">{item.supplier}</td>
                            <td className="p-5 text-sm font-black text-foreground text-right">{currencySymbol} {currencyCode} {item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="p-5 text-center">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                item.status === "Received" ? "bg-primary-soft text-primary" : "bg-orange-100 text-orange-600"
                              }`}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )
                }
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-line bg-surface">
            <div className="text-sm font-medium text-subtle">
              {(() => {
                const length = activeTab === "purchases" ? purchasesData.length : returnsData.length;
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
                    <span className="text-muted font-bold">{length}</span>{" "}
                    of <span className="text-muted font-bold">{length}</span> entries
                  </>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 text-sm font-bold text-subtle hover:text-primary transition-colors">Previous</button>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-soft text-primary font-black text-sm border border-primary-line">1</button>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-subtle font-bold text-sm border border-line hover:bg-surface-raised"><span className="text-[10px]">▶</span></button>
              <button className="px-3 py-1 text-sm font-bold text-subtle hover:text-primary transition-colors">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseReport;

