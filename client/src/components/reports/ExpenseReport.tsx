import { ArrowLeft, Calendar, ChartBarStacked, DollarSign, Loader2, Printer, Store, Wallet } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DEFAULT_PAGE_SIZE,
  FILTER_DEBOUNCE_MS,
  REPORT_PAGE_SIZE_OPTIONS,
  WAREHOUSE_FILTER_ALL,
} from "../../constants/reportFilters";
import { useCurrency } from "../../contexts/CurrencyContext";
import { getExpenseCategoriesReport, getExpensesReport } from "../../services/expensesService";
import { getWarehouses } from "../../services/warehouseService";
import { exportReportPdf } from "../../utils/reportPdf";
import { showErrorToast } from "../../utils/toast";
import ExportPDFButton from "../common/ExportPDFButton";

const ExpensesReport: React.FC = () => {
  const navigate = useNavigate();
  const { currencyCode } = useCurrency();
  const [activeTab, setActiveTab] = useState<"expenses" | "categories">("expenses");

  const [filters, setFilters] = useState({
    fromDate: "",
    toDate: "",
    store: WAREHOUSE_FILTER_ALL,
  });

  const [pageExpenses, setPageExpenses] = useState(1);
  const [pageCategories, setPageCategories] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const isFirstRun = useRef(true);

  type ExpenseRow = {
    date: string;
    ref: string;
    title: string;
    category: string | { name: string };
    warehouse: string | { name: string };
    amount: number;
  };

  const [expensesData, setExpensesData] = useState<ExpenseRow[]>([]);
  const [categoriesData, setCategoriesData] = useState<any[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  const [paginationExpenses, setPaginationExpenses] = useState({
    total: 0,
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    totalPages: 1,
  });
  const [paginationCategories, setPaginationCategories] = useState({
    total: 0,
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    totalPages: 1,
  });

  const [summary, setSummary] = useState<{
    totalAmount: number;
    totalCategories: number;
  }>({ totalAmount: 0, totalCategories: 0 });

  const fetchWarehousesList = useCallback(async () => {
    setLoadingWarehouses(true);
    try {
      const res = await getWarehouses();
      if (res?.data && Array.isArray(res.data)) {
        setWarehouses(res.data.map((w: { _id: string; name: string }) => ({ _id: w._id, name: w.name })));
      } else {
        setWarehouses([]);
      }
    } catch (error: unknown) {
      showErrorToast((error as Error).message || "Failed to load warehouses");
      setWarehouses([]);
      setFilters((prev) => ({ ...prev, store: WAREHOUSE_FILTER_ALL }));
    } finally {
      setLoadingWarehouses(false);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    setLoadingExpenses(true);
    try {
      const response = await getExpensesReport({
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        warehouseId: filters.store === WAREHOUSE_FILTER_ALL ? undefined : filters.store,
        page: pageExpenses,
        limit: pageSize,
      });
      if (response.status === "success" && Array.isArray(response.data)) {
        setExpensesData(response.data);
        setPaginationExpenses(response.pagination ?? paginationExpenses);
        setSummary((s) => ({ ...s, totalAmount: response.summary?.totalAmount ?? 0 }));
      } else {
        setExpensesData([]);
      }
    } catch (error: unknown) {
      showErrorToast((error as Error).message || "Failed to load expenses report");
      setExpensesData([]);
    } finally {
      setLoadingExpenses(false);
    }
  }, [filters.fromDate, filters.toDate, filters.store, pageExpenses, pageSize]);

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const response = await getExpenseCategoriesReport({
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        warehouseId: filters.store === WAREHOUSE_FILTER_ALL ? undefined : filters.store,
        page: pageCategories,
        limit: pageSize,
      });
      if (response.status === "success" && Array.isArray(response.data)) {
        setCategoriesData(response.data);
        setPaginationCategories(response.pagination ?? paginationCategories);
        setSummary((s) => ({
          ...s,
          totalCategories: response.summary?.totalCategories ?? response.pagination?.total ?? 0,
        }));
      } else {
        setCategoriesData([]);
      }
    } catch (error: unknown) {
      showErrorToast((error as Error).message || "Failed to load expense categories report");
      setCategoriesData([]);
    } finally {
      setLoadingCategories(false);
    }
  }, [filters.fromDate, filters.toDate, filters.store, pageCategories, pageSize]);

  const handlePrint = useCallback(() => {
    const filtersArray = [];
    if (filters.fromDate) filtersArray.push({ label: "From Date", value: filters.fromDate });
    if (filters.toDate) filtersArray.push({ label: "To Date", value: filters.toDate });
    if (filters.store !== WAREHOUSE_FILTER_ALL) {
      const warehouseName = warehouses.find(w => w._id === filters.store)?.name || filters.store;
      filtersArray.push({ label: "Warehouse", value: warehouseName });
    }

    const summaryArray = [];
    if (activeTab === "expenses") {
      summaryArray.push({ label: "Total Expenses", value: `${currencyCode} ${summary.totalAmount.toLocaleString()}` });
    } else {
      summaryArray.push({ label: "Total Categories", value: summary.totalCategories.toLocaleString() });
    }

    if (activeTab === "expenses") {
      const columns = [
        { key: "date", header: "Date" },
        { key: "ref", header: "Reference" },
        { key: "title", header: "Title" },
        { key: "category", header: "Category" },
        { key: "warehouse", header: "Warehouse" },
        { key: "amount", header: "Amount", align: "right" as const },
      ];

      const rows = expensesData.map(item => ({
        date: item.date,
        ref: item.ref,
        title: item.title,
        category: typeof item.category === 'string' ? item.category : (item.category?.name || '-'),
        warehouse: typeof item.warehouse === 'string' ? item.warehouse : (item.warehouse?.name || '-'),
        amount: `${currencyCode} ${Number(item.amount || 0).toLocaleString()}`,
      }));

      exportReportPdf({
        title: "Expenses Report",
        fileName: "expenses-report",
        columns,
        rows,
        summary: summaryArray,
        filters: filtersArray,
      });
    } else {
      const columns = [
        { key: "name", header: "Category" },
        { key: "description", header: "Description" },
        { key: "totalAmount", header: "Total Amount", align: "right" as const },
        { key: "transactions", header: "Transactions", align: "right" as const },
      ];

      const rows = categoriesData.map(item => {
        const row = normalizeCategoryRow(item);
        return {
          name: row.name,
          description: row.description,
          totalAmount: `${currencyCode} ${row.totalAmount.toLocaleString()}`,
          transactions: row.transactions.toLocaleString(),
        };
      });

      exportReportPdf({
        title: "Expense Categories Report",
        fileName: "expense-categories-report",
        columns,
        rows,
        summary: summaryArray,
        filters: filtersArray,
      });
    }
  }, [activeTab, expensesData, categoriesData, filters, warehouses, currencyCode, summary]);

  useEffect(() => {
    fetchWarehousesList();
  }, [fetchWarehousesList]);

  useEffect(() => {
    const run = () => {
      if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
        showErrorToast("From Date cannot be greater than To Date");
        setExpensesData([]);
        setCategoriesData([]);
        return;
      }
      fetchExpenses();
      fetchCategories();
    };

    if (isFirstRun.current) {
      isFirstRun.current = false;
      run();
      return;
    }

    const timer = setTimeout(run, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.fromDate, filters.toDate, filters.store, pageSize]);

  useEffect(() => {
    if (!isFirstRun.current) {
      fetchExpenses();
    }
  }, [pageExpenses]);

  useEffect(() => {
    if (!isFirstRun.current) {
      fetchCategories();
    }
  }, [pageCategories]);

  const pagination = activeTab === "expenses" ? paginationExpenses : paginationCategories;
  const safeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const safeEnd = Math.min(pagination.page * pagination.limit, pagination.total);

  type CategoryRow = {
    name: string;
    description: string;
    totalAmount: number;
    transactions: number;
    categoryId?: string | number;
  };

  const normalizeCategoryRow = (row: any): CategoryRow => ({
    name: String(row?.name ?? row?.categoryName ?? row?.category ?? "—"),
    description: String(row?.description ?? row?.desc ?? "—"),
    totalAmount: Number(row?.totalAmount ?? row?.amount ?? 0),
    transactions: Number(row?.transactions ?? row?.count ?? 0),
    categoryId: row?.categoryId ?? row?._id,
  });

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#004080] rounded-xl text-white shadow-lg">
            <Wallet size={26} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Expenses Report</h1>
            <p className="text-slate-500 text-xs md:text-sm">View expenses and expense categories</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="flex items-center text-slate-500 hover:text-[#004080]">
              <ArrowLeft size={18} className="mr-2" />
              Back
            </button>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={handlePrint} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all">
              <Printer size={18} /> Print
            </button>
            <ExportPDFButton
              columns={activeTab === 'expenses'
                ? ['Date','Reference','Title','Category','Warehouse','Amount']
                : ['Category','Description','Total Amount','Transactions']}
              data={activeTab === 'expenses'
                ? expensesData.map((r:any) => ({ Date: r.date, Reference: r.ref || '-', Title: r.title || '-', Category: r.category || '-', Warehouse: r.warehouse || '-', Amount: `${currencyCode} ${Number(r.amount||0).toLocaleString()}` }))
                : categoriesData.map((r:any) => { const row = normalizeCategoryRow(r); return { Category: row.name, Description: row.description, 'Total Amount': `${currencyCode} ${row.totalAmount.toLocaleString()}`, Transactions: row.transactions.toString() }; })}
              fileName={activeTab === 'expenses' ? 'expenses-report' : 'expense-categories-report'}
              reportTitle={activeTab === 'expenses' ? 'Expenses Report' : 'Expense Categories Report'}
              disabled={activeTab === 'expenses' ? loadingExpenses : loadingCategories}
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-600">From Date</label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-3 text-slate-400" size={16} />
              <input
                type="date"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080]"
                value={filters.fromDate}
                onChange={(e) => {
                  setFilters({ ...filters, fromDate: e.target.value });
                  setPageExpenses(1);
                  setPageCategories(1);
                }}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-600">To Date</label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-3 text-slate-400" size={16} />
              <input
                type="date"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080]"
                value={filters.toDate}
                onChange={(e) => {
                  setFilters({ ...filters, toDate: e.target.value });
                  setPageExpenses(1);
                  setPageCategories(1);
                }}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-600">Warehouse</label>
            <div className="relative mt-1">
              <Store className="absolute left-3 top-3 text-slate-400" size={16} />
              <select
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl"
                value={filters.store}
                onChange={(e) => {
                  setFilters({ ...filters, store: e.target.value });
                  setPageExpenses(1);
                  setPageCategories(1);
                }}
                disabled={loadingWarehouses}
              >
                <option value={WAREHOUSE_FILTER_ALL}>All Stores</option>
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
          style={{ background: `linear-gradient(135deg, #0B2C5D 0%, #3B82F6 100%)` }}
        >
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <p className="text-white/80 text-sm font-bold uppercase tracking-wider mb-1">Total Expenses</p>
              {(loadingExpenses || loadingCategories) ? (
                <div className="flex items-center gap-2 text-white">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-lg font-medium">Loading...</span>
                </div>
              ) : (
                <h3 className="text-white text-3xl font-black tracking-tighter">
                  {currencyCode} {summary.totalAmount.toLocaleString()}
                </h3>
              )}
            </div>
            <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md">
              <DollarSign className="text-white w-8 h-8" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
        </div>

        <div
          className="relative overflow-hidden rounded-[30px] p-8 transition-all duration-300 hover:scale-[1.02] cursor-pointer shadow-lg"
          style={{ background: `linear-gradient(135deg, #3B82F6 0%, #B9D5F2 100%)` }}
        >
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <p className="text-white/80 text-sm font-bold uppercase tracking-wider mb-1">Total Categories</p>
              {(loadingExpenses || loadingCategories) ? (
                <div className="flex items-center gap-2 text-white">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-lg font-medium">Loading...</span>
                </div>
              ) : (
                <h3 className="text-white text-3xl font-black tracking-tighter">
                  {summary.totalCategories.toLocaleString()}
                </h3>
              )}
            </div>
            <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md">
              <ChartBarStacked className="text-white w-8 h-8" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setActiveTab("expenses")}
            className={`px-8 py-5 text-sm font-black transition-all relative ${
              activeTab === "expenses" ? "text-[#004080]" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Expenses
            {activeTab === "expenses" && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#004080] rounded-t-full" />}
          </button>
          <button
            onClick={() => setActiveTab("categories")}
            className={`px-8 py-5 text-sm font-black transition-all relative ${
              activeTab === "categories" ? "text-[#004080]" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Expense Categories
            {activeTab === "categories" && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#004080] rounded-t-full" />}
          </button>
        </div>

        <div className="p-6 md:p-8">
          <div className="flex justify-end mb-4">
            <label className="text-sm font-medium text-slate-600 mr-2">Rows per page:</label>
            <select
              className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
              value={pageSize}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPageSize(val);
                setPageExpenses(1);
                setPageCategories(1);
              }}
            >
              {REPORT_PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="border border-slate-100 rounded-[24px] overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                {activeTab === "expenses" ? (
                  <tr>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Reference</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Title</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Warehouse</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Total Amount</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Transactions</th>
                  </tr>
                )}
              </thead>

              <tbody className="divide-y divide-slate-50">
                {activeTab === "expenses" ? (
                  loadingExpenses ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        Loading expenses...
                      </td>
                    </tr>
                  ) : expensesData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        No expenses found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    expensesData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-5 text-sm font-bold text-slate-600">{item.date}</td>
                        <td className="p-5 text-sm font-black text-[#1A3E73]">{item.ref}</td>
                        <td className="p-5 text-sm font-bold text-slate-700">{item.title}</td>
                        <td className="p-5 text-sm font-bold text-slate-700">
                          {typeof item.category === 'object' ? item.category?.name : item.category}
                        </td>
                        <td className="p-5 text-sm font-bold text-slate-700">
                          {typeof item.warehouse === 'object' ? item.warehouse?.name : item.warehouse}
                        </td>
                        <td className="p-5 text-sm font-black text-[#004080] text-right">
                          {currencyCode} {Number(item.amount || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )
                ) : loadingCategories ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500">
                      Loading categories...
                    </td>
                  </tr>
                ) : categoriesData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500">
                      No categories found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  categoriesData.map((item, idx) => {
                    const row = normalizeCategoryRow(item);
                    return (
                      <tr key={String(row.categoryId ?? idx)} className="hover:bg-slate-50 transition-colors">
                        <td className="p-5 text-sm font-black text-[#1A3E73]">{row.name}</td>
                        <td className="p-5 text-sm font-bold text-slate-700">{row.description}</td>
                        <td className="p-5 text-sm font-black text-[#004080] text-right">
                          {currencyCode} {row.totalAmount.toLocaleString()}
                        </td>
                        <td className="p-5 text-sm font-black text-slate-600 text-right">
                          {row.transactions.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-slate-50 bg-white">
            <div className="text-sm font-medium text-slate-400">
              Showing{" "}
              <span className="text-slate-600 font-bold">
                {safeStart}
              </span>{" "}
              to <span className="text-slate-600 font-bold">{safeEnd}</span> of{" "}
              <span className="text-slate-600 font-bold">{pagination.total}</span> entries
            </div>

            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1 text-sm font-bold text-slate-400 hover:text-[#004080] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={pagination.page <= 1}
                onClick={() =>
                  activeTab === "expenses"
                    ? setPageExpenses((p) => Math.max(1, p - 1))
                    : setPageCategories((p) => Math.max(1, p - 1))
                }
              >
                Previous
              </button>
              <span className="text-sm font-medium text-slate-600">
                Page {pagination.page} of {pagination.totalPages || 1}
              </span>
              <button
                className="px-3 py-1 text-sm font-bold text-slate-400 hover:text-[#004080] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() =>
                  activeTab === "expenses"
                    ? setPageExpenses((p) => Math.min(pagination.totalPages, p + 1))
                    : setPageCategories((p) => Math.min(pagination.totalPages, p + 1))
                }
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpensesReport;

