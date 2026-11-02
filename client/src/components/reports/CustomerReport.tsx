import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { formatDate } from '../../utils/date.ts';
import { showErrorToast } from '../../utils/toast';

import Loader from "../common/Loader";
import SearchBar from "../common/SearchBar";
import ExportPDFButton from "../common/ExportPDFButton";

type CustomerRow = {
  id: string;
  name: string;
  mobile: string;
  NIC?: string;
  address?: string;
  createdAt: string;
};

const CustomerReport: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const navigate = useNavigate();

  const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;

  const fetchCustomers = async (query: string = "") => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (query) params.append("q", query);
      params.append("page", page.toString());
      params.append("limit", pageSize.toString());

      const res = await fetch(`${api}/customers?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.message || "Failed to load");

      const rows: CustomerRow[] = data.data.map((c: any) => ({
        id: c._id,
        name: c.name,
        mobile: c.mobile,
        NIC: c.NIC,
        address: c.address,
        createdAt: c.createdAt,
      }));

      setCustomers(rows);
      setTotal(data.pagination?.total || rows.length);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers(searchQuery);
  }, [searchQuery, page, pageSize]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  return (
    <div className="p-4 sm:p-6">
      {loading && <Loader text="Loading Customers..." />}

      <div className="flex justify-between items-center mb-4">
        
        <div>
        <h2 className="text-2xl font-semibold text-foreground">
          Customer Report
        </h2>
        <p className="text-muted text-xs md:text-sm">View current customers </p>
        </div>
      </div>

    
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-4">
        <SearchBar
          onSearch={handleSearch}
          placeholder="Search by name, mobile, or NIC..."
          className="w-full sm:max-w-md"
        />

        <div className="flex gap-3">
          <ExportPDFButton
            columns={["name", "mobile", "NIC", "address", "createdAt"]}
            data={customers.map((c) => ({
              name: c.name,
              mobile: c.mobile,
              NIC: c.NIC || "-",
              address: c.address || "-",
              createdAt: formatDate(c.createdAt),
            }))}
            fileName="customer-report"
            reportTitle="Customer Report"
          />

          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-muted hover:text-primary px-3 py-2 rounded-lg"
          >
            <ArrowLeft size={18} className="mr-2" />
            Back
          </button>
        </div>
      </div>


      <div
        id="report-table"
        className="bg-surface border border-line rounded overflow-x-auto"
      >
        <table className="min-w-[640px] w-full divide-y divide-line">
          <thead className="bg-primary text-on-primary">
            <tr>
              <th className="text-left px-6 py-4 text-sm font-semibold">
                Name
              </th>
              <th className="text-left px-6 py-4 text-sm font-semibold">
                Mobile
              </th>
              <th className="text-left px-6 py-4 text-sm font-semibold">
                NIC
              </th>
              <th className="text-left px-6 py-4 text-sm font-semibold">
                Address
              </th>
              <th className="text-left px-6 py-4 text-sm font-semibold">
                Created Date
              </th>
            </tr>
          </thead>

          <tbody className="bg-surface divide-y divide-line">
            {customers.length > 0 ? (
              customers.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-surface-raised transition-colors duration-150"
                >
                  <td className="px-6 py-5 font-semibold text-foreground">
                    {c.name}
                  </td>
                  <td className="px-6 py-5 text-foreground">{c.mobile}</td>
                  <td className="px-6 py-5 text-foreground">
                    {c.NIC || "-"}
                  </td>
                  <td className="px-6 py-5 text-foreground">
                    {c.address || "-"}
                  </td>
                  <td className="px-6 py-5 text-foreground">
                    {formatDate(c.createdAt)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-muted"
                >
                  No customers found
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-line bg-surface-raised">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-muted">Rows per page:</label>
            <select
              className="border border-line-strong rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[5, 10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <div className="text-sm font-medium text-subtle">
              Showing{" "}
              <span className="text-muted font-bold">
                {total === 0 ? 0 : (page - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="text-muted font-bold">
                {Math.min(page * pageSize, total)}
              </span>{" "}
              of <span className="text-muted font-bold">{total}</span> entries
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 text-sm font-bold text-muted hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-line-strong rounded-lg bg-surface"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <div className="px-4 py-2 text-sm font-bold text-on-primary bg-primary rounded-lg">
              {page}
            </div>
            <button
              className="px-4 py-2 text-sm font-bold text-muted hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-line-strong rounded-lg bg-surface"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerReport;
