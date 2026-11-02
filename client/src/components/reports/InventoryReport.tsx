import { ArrowLeft, Boxes, Store } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ExportPDFButton from "../common/ExportPDFButton.tsx";   
import { formatDate } from '../../utils/date.ts';
import { showErrorToast } from '../../utils/toast';

interface StockItem {
  date: string;
  product: string;
  stock: number;
  warehouse: string;
  stockAlert: number | null;
  isLowStock: boolean;
}

const StockReport: React.FC = () => {
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    store: "All Stores",
    fromDate: "",
    toDate: "",
  });

  const [inventoryData, setInventoryData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);

  const api = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

  const fetchStockReport = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      const warehousesRes = await fetch(`${api}/warehouses`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const warehousesResult = await warehousesRes.json();
      const warehouseMap: Record<string, any> = {};
      warehousesResult.data.forEach((wh: any) => (warehouseMap[wh._id] = wh));

      const productsRes = await fetch(`${api}/products`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const productsResult = await productsRes.json();
      if (!productsRes.ok) throw new Error(productsResult?.message || "Failed to fetch products");

      const rows: StockItem[] = [];
      productsResult.data.forEach((product: any) => {
        if (product.warehouse && typeof product.warehouse === "object") {
          Object.entries(product.warehouse).forEach(([whId, whData]: [string, any]) => {
            const wh = warehouseMap[whId];
            if (!wh) return;
            if (filters.store !== "All Stores" && filters.store !== wh.name) return;

            const stock = whData.productQty || 0;
            const stockAlert = typeof whData.stockAlert === "number" ? whData.stockAlert : null;
            rows.push({
              product: product.name,
              warehouse: wh.name,
              stock,
              stockAlert,
              isLowStock: stockAlert !== null && stock <= stockAlert,
              date: whData.updatedAt
                ? formatDate(whData.updatedAt)
                : formatDate(wh.updatedAt),
            });
          });
        }
      });

      setInventoryData(rows);
    } catch (error) {
      console.error("Failed to load stock report", error);
      showErrorToast((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockReport();
  }, [filters]);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#004080] rounded-xl text-white shadow-lg">
            <Boxes size={26} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Inventory Report</h1>
            <p className="text-slate-500 text-xs md:text-sm">View current product stock levels</p>
          </div>
        </div>

    
        <div className="flex gap-3">
          <ExportPDFButton
            columns={["Date", "Product", "Stock", "Alert Threshold", "Warehouse", "Status"]}
            data={inventoryData.map((i) => ({
              Date: i.date,
              Product: i.product,
              Stock: i.stock.toString(),
              "Alert Threshold": i.stockAlert !== null ? i.stockAlert.toString() : "--",
              Warehouse: i.warehouse,
              Status: i.isLowStock ? "Low Stock" : "In Stock",
            }))}
            fileName="stock-report"
            reportTitle="Inventory Report"
           
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

      {/* Filters */}
      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-600">From Date</label>
            <input
              type="date"
              className="w-full mt-1 pl-4 pr-4 py-2.5 border border-slate-200 rounded-xl"
              value={filters.fromDate}
              onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">To Date</label>
            <input
              type="date"
              className="w-full mt-1 pl-4 pr-4 py-2.5 border border-slate-200 rounded-xl"
              value={filters.toDate}
              onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">Store</label>
            <div className="relative mt-1">
              <Store className="absolute left-3 top-3 text-slate-400" size={16} />
              <select
                value={filters.store}
                onChange={(e) => setFilters({ ...filters, store: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl"
              >
                <option>All Stores</option>
                {inventoryData
                  .map((i) => i.warehouse)
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((wh, idx) => (
                    <option key={idx}>{wh}</option>
                  ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-left">Stock</th>
              <th className="px-4 py-3 text-left">Alert Threshold</th>
              <th className="px-4 py-3 text-left">Warehouse</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-6">
                  Loading...
                </td>
              </tr>
            ) : inventoryData.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6">
                  No data available
                </td>
              </tr>
            ) : (
              inventoryData.map((item, i) => (
                <tr
                  key={i}
                  className={
                    `border-t hover:bg-slate-50 ${item.isLowStock ? "bg-amber-50" : ""}`
                  }
                >
                  <td className="px-4 py-3">{item.date}</td>
                  <td className="px-4 py-3">{item.product}</td>
                  <td className="px-4 py-3 font-semibold">{item.stock}</td>
                  <td className="px-4 py-3">{item.stockAlert !== null ? item.stockAlert : "--"}</td>
                  <td className="px-4 py-3">{item.warehouse}</td>
                  <td className="px-4 py-3 font-semibold text-amber-700">
                    {item.isLowStock ? "Low Stock" : "In Stock"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StockReport;