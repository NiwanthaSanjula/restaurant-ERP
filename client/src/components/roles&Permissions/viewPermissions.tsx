import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../common/Loader';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import { formatDate } from '../../utils/date.ts';

type PermissionRow = { 
  id: string; 
  name: string; 
  component: string;
  action: string;
  description: string; 
  isActive: boolean; 
  createdAt: string;
  updatedAt: string;
};

const ViewPermissions: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<string>('all');
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:4044/api') as string;

  const components = [
    { key: 'all', label: 'All Components' },
    { key: 'manageUsers', label: 'User Management' },
    { key: 'manageRoles', label: 'Role Management' },
    { key: 'manageMenu', label: 'Menu Management' },
    { key: 'manageOrders', label: 'Order Management' },
    { key: 'manageTables', label: 'Table Management' },
    { key: 'posOperations', label: 'POS Operations' },
    { key: 'reports', label: 'Reports' }
  ];

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const url = selectedComponent === 'all' 
        ? `${api}/permissions`
        : `${api}/permissions/component/${selectedComponent}`;
      
      const res = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load');
      setPermissions(data.data);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPermissions(); }, [selectedComponent]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/permissions/${toDelete}`, { 
        method: 'DELETE', 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Delete failed');
      setToDelete(null);
      fetchPermissions();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getComponentLabel = (component: string) => {
    const comp = components.find(c => c.key === component);
    return comp ? comp.label : component;
  };

  const getActionBadge = (action: string) => {
    const colors: { [key: string]: string } = {
      'create': 'bg-secondary-soft text-secondary',
      'read': 'bg-primary-soft text-primary',
      'update': 'bg-warning-soft text-warning',
      'delete': 'bg-danger-soft text-danger'
    };
    
    return (
      <span className={`px-2 py-1 rounded text-sm font-semibold ${colors[action] || 'bg-surface-muted text-foreground'}`}>
        {action.charAt(0).toUpperCase() + action.slice(1)}
      </span>
    );
  };

  return (
    <div>
      {loading && <Loader text="Loading" />}
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold text-foreground">Permissions</div>
        <div className="flex items-center space-x-4">
          <select
            value={selectedComponent}
            onChange={(e) => setSelectedComponent(e.target.value)}
            className="border border-line rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            {components.map(comp => (
              <option key={comp.key} value={comp.key}>{comp.label}</option>
            ))}
          </select>
          <button
            onClick={() => navigate('/createPermission')}
            className="px-4 py-2 rounded bg-primary text-on-primary hover:bg-primary-hover"
          >
            Create Permission
          </button>
        </div>
      </div>
      
      <div className="bg-surface border border-line rounded overflow-auto">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-primary text-on-primary">
            <tr>
              <th className="text-left px-6 py-4 text-sm font-semibold">Permission Name</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">Component</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">Action</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">Description</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">Status</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">Created</th>
              <th className="text-right px-6 py-4 text-sm font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-line">
            {permissions.map(permission => (
              <tr key={permission.id} className="hover:bg-surface-raised transition-colors duration-150">
                <td className="px-6 py-5 text-base font-semibold text-foreground">{permission.name}</td>
                <td className="px-6 py-5">
                  <span className="px-2 py-1 rounded text-sm font-semibold bg-violet-soft text-violet-status">
                    {getComponentLabel(permission.component)}
                  </span>
                </td>
                <td className="px-6 py-5">
                  {getActionBadge(permission.action)}
                </td>
                <td className="px-6 py-5 text-base text-muted">{permission.description}</td>
                <td className="px-6 py-5">
                  <span className={`px-2 py-1 rounded text-sm font-semibold ${
                    permission.isActive 
                      ? 'bg-secondary-soft text-secondary'
                      : 'bg-danger-soft text-danger'
                  }`}>
                    {permission.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-5 text-base text-muted">
                  {formatDate(permission.createdAt)}
                </td>
                <td className="px-6 py-5 text-right space-x-3">
                  <button
                    onClick={() => navigate(`/editPermission/${permission.id}`)}
                    className="inline-flex items-center justify-center p-2.5 rounded-lg border border-line-strong text-primary hover:bg-surface-muted transition-colors duration-200"
                    title="Edit"
                    aria-label="Edit"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => setToDelete(permission.id)}
                    className="inline-flex items-center justify-center p-2.5 rounded-lg border border-line-strong text-danger hover:bg-surface-muted transition-colors duration-200"
                    title="Delete"
                    aria-label="Delete"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {permissions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-base text-muted">No permissions found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {toDelete && (
        <DeleteConfirmModal 
          onCancel={() => setToDelete(null)} 
          onConfirm={confirmDelete} 
        />
      )}
    </div>
  );
};

export default ViewPermissions;
