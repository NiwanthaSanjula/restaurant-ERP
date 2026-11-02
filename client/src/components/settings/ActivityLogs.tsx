import React, { useEffect, useRef, useState } from 'react';
import activityLogService from '../../services/activityLogService';
import ExportPDFButton from '../common/ExportPDFButton';

const ActivityLogs: React.FC = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [action, setAction] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState<number>(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastFetchRef = useRef<number>(0);

  const fetchLogs = async (nextPage = page, showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
        setError('');
      }
      const res = await activityLogService.getLogs({
        from,
        to,
        module: moduleFilter,
        action,
        page: nextPage,
        limit
      });

      if (res && res.data) {
        setResults(res.data.results || []);
        setTotal(res.data.total || 0);
        lastFetchRef.current = Date.now();
      }
    } catch (err) {
      console.error('Failed to fetch activity logs', err);
      if (showLoading) {
        setError('Unable to load activity logs. Check backend or access.');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchLogs(page, false);
    }, 10000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, from, to, moduleFilter, action]);

  const onSearch = () => {
    setPage(1);
    fetchLogs(1);
  };

  const fetchPdfRows = async () => {
    const res = await activityLogService.getLogs({
      from,
      to,
      module: moduleFilter,
      action,
      page: 1,
      limit: 1000
    });

    const rows = res?.data?.results || [];
    return rows.map((r: any) => ({
      Time: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
      User: r.username || r.userId || '',
      Role: r.role || '',
      Action: r.action || '',
      Module: r.entityType || '',
      Entity: r.displayEntityId || r.entityId || ''
    }));
  };

  return (
    <div className="p-6 bg-canvas min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Activity Logs</h2>
        <p className="text-sm text-muted">
          Track all edits and deletions across your system
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-danger-line bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded p-2" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded p-2" />
          <input placeholder="Module (Product/Sale)" value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} className="border rounded p-2" />
          <input placeholder="Action (EDIT/DELETE)" value={action} onChange={e => setAction(e.target.value)} className="border rounded p-2" />

          <button
            onClick={onSearch}
            className="bg-primary hover:bg-primary-hover text-on-primary px-3 py-2 rounded"
          >
            Search
          </button>

          <div className="flex flex-wrap gap-2 md:justify-end">
            <ExportPDFButton
              columns={["Time", "User", "Role", "Action", "Module", "Entity"]}
              data={[]}
              fileName={`activity-logs-${from || 'start'}-${to || 'end'}`}
              reportTitle="Activity Logs"
              subtitle={`Date range: ${from || 'Any'} to ${to || 'Any'}`}
              fetchData={fetchPdfRows}
            />
          </div>
        </div>
      </div>

      {/* Table */}
    <div className="bg-surface rounded-2xl overflow-hidden border border-line">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-raised text-foreground uppercase text-xs tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Module</th>
              <th className="px-4 py-3 text-left">Entity</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted">
                  Loading activity logs...
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted">
                  No activity logs found.
                </td>
              </tr>
            ) : (
              results.map((r) => (
                <tr
                  key={r._id}
                  className="hover:bg-surface-raised transition"
                >
                  <td className="px-4 py-3 text-muted">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                  </td>

                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.username || r.userId}
                  </td>

                  <td className="px-4 py-3 text-muted">
                    {r.role}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        r.action === 'DELETE'
                          ? 'bg-danger-soft text-danger'
                          : 'bg-warning-soft text-warning'
                      }`}
                    >
                      {r.action}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {r.entityType}
                  </td>

                  <td className="px-4 py-3 text-muted text-xs">
                    {r.displayEntityId || r.entityId}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <div>
          Total records: <span className="font-semibold">{total}</span>
        </div>

        <div className="flex items-center gap-3">
          <span>
            Last updated:{' '}
            {lastFetchRef.current
              ? new Date(lastFetchRef.current).toLocaleTimeString()
              : 'Never'}
          </span>

          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="border rounded px-3 py-1 disabled:opacity-40"
          >
            Prev
          </button>

          <span>Page {page}</span>

          <button
            disabled={results.length < limit}
            onClick={() => setPage(p => p + 1)}
            className="border rounded px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActivityLogs;
