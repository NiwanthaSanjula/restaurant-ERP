import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { showErrorToast, showSuccessToast } from '../../utils/toast';

import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';
import SearchBar from '../common/SearchBar';

import { formatDate } from '../../utils/date.ts';

type RoleRow = {
  _id: string;
  name: string;
  description: string;
  permissions: Array<{
    component: string;
    actions: {
      create: boolean;
      read: boolean;
      update: boolean;
      delete: boolean;
    };
  }>;
  isActive: boolean; 
  createdAt: string;
  updatedAt: string;
};

const ViewRoles: React.FC = () => {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [filteredPermissions, setFilteredPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'roles' | 'permissions'>('roles');
  const [componentFilter, setComponentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const fetchRoles = async (searchQuery: string = '') => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const searchParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`${api}/roles${searchParam}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load');
      setRoles(data.data);
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async (searchQuery: string = '') => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const searchParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`${api}/permissions${searchParam}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load');
      setPermissions(data.data);
      // Apply component filter after search
      if (componentFilter === 'all') {
        setFilteredPermissions(data.data);
      } else {
        setFilteredPermissions(data.data.filter((p: any) => p.component === componentFilter));
      }
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => { 
    if (activeTab === 'roles') {
      fetchRoles(searchQuery); 
    } else {
      fetchPermissions(searchQuery);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    if (activeTab === 'permissions') {
      if (componentFilter === 'all') {
        setFilteredPermissions(permissions);
      } else {
        setFilteredPermissions(permissions.filter((p: any) => p.component === componentFilter));
      }
    }
  }, [componentFilter, permissions, activeTab]);
  
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const endpoint = activeTab === 'roles' ? 'roles' : 'permissions';
      const res = await fetch(`${api}/${endpoint}/${toDelete}`, { 
        method: 'DELETE', 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Delete failed');
      const itemType = activeTab === 'roles' ? 'Role' : 'Permission';
      showSuccessToast(data.message || `${itemType} deleted successfully`);
      setToDelete(null);
      showSuccessToast(data?.message || `${activeTab === 'roles' ? 'Role' : 'Permission'} deleted successfully`);
      if (activeTab === 'roles') {
        fetchRoles(searchQuery);
      } else {
        fetchPermissions(searchQuery);
      }
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const formatComponentLabel = (component: string) => {
    const componentMap: { [key: string]: string } = {
      'manageUsers': 'Users',
      'manageRoles': 'Roles',
      'manageMenu': 'Menu',
      'manageOrders': 'Orders',
      'manageTables': 'Tables',
      'posOperations': 'POS',
      'reports': 'Reports',
      'manageWarehouses': 'Warehouses',
      'manageProducts': 'Products',
      'manageBaseUnits': 'Base Units',
      'manageUnits': 'Units',
      'manageCategories': 'Categories',
      'manageBrands': 'Brands',
      'manageVariations': 'Variations',
      'manageCustomers': 'Customers',
      'manageSuppliers': 'Suppliers'
    };

    if (componentMap[component]) {
      return componentMap[component];
    }

    const cleaned = (component || 'unknown')
      .replace(/^manage/, '')
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim();

    const label = cleaned
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return label || 'Unknown';
  };

  const getPermissionBadges = (permissions: RoleRow['permissions']) => {
    return permissions.map((permission, index) => {
      const actions = Object.entries(permission.actions)
        .filter(([_, enabled]) => enabled)
        .map(([action, _]) => action.charAt(0).toUpperCase() + action.slice(1))
        .join(', ');

      return (
        <div key={index} className="text-sm font-semibold bg-primary-soft text-primary px-2 py-1 rounded mr-1 mb-1 inline-block">
          {formatComponentLabel(permission.component)}: {actions}
        </div>
      );
    });
  };

  return (
    <div>
      {loading && <Loader text="Loading" />}
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold text-foreground">Roles & Permissions</div>
        <div className="space-x-2">
          {activeTab === 'roles' ? (
            <PermissionGate component="manageRoles" action="create">
              <Link to="/createRole" className="px-4 py-2 rounded bg-primary text-on-primary hover:bg-primary-hover">
                Create Role
              </Link>
            </PermissionGate>
          ) : (
            <PermissionGate component="manageRoles" action="create">
              <Link to="/createPermission" className="px-4 py-2 rounded bg-secondary text-on-secondary hover:bg-secondary-hover">
                Create Permission
              </Link>
            </PermissionGate>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="border-b border-line">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('roles')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'roles'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-foreground hover:border-line-strong'
              }`}
            >
              Roles
            </button>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'permissions'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-foreground hover:border-line-strong'
              }`}
            >
              Permissions
            </button>
          </nav>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <SearchBar 
          onSearch={handleSearch}
          placeholder={activeTab === 'roles' ? 'Search roles by name...' : 'Search permissions by name, component, or action...'}
          className="max-w-md"
        />
      </div>
      
      {activeTab === 'roles' ? (
        <div className="bg-surface border border-line rounded overflow-auto">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-primary text-on-primary">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold">Role Name</th>
                <th className="text-left px-6 py-4 text-sm font-semibold">Description</th>
                <th className="text-left px-6 py-4 text-sm font-semibold">Permissions</th>
                <th className="text-left px-6 py-4 text-sm font-semibold">Status</th>
                <th className="text-left px-6 py-4 text-sm font-semibold">Created</th>
                <th className="text-right px-6 py-4 text-sm font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-line">
              {roles.map(role => (
                <tr key={role._id} className="hover:bg-surface-raised transition-colors duration-150">
                  <td className="px-6 py-5 text-base font-semibold text-foreground">{role.name}</td>
                  <td className="px-6 py-5 text-base text-muted">{role.description}</td>
                  <td className="px-6 py-5">
                    <div className="flex flex-wrap">
                      {getPermissionBadges(role.permissions)}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-2 py-1 rounded text-sm font-semibold ${
                      role.isActive 
                        ? 'bg-secondary-soft text-secondary'
                        : 'bg-danger-soft text-danger'
                    }`}>
                      {role.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-base text-muted">
                    {formatDate(role.createdAt)}
                  </td>
                  <td className="px-6 py-5 text-right space-x-3">
                    <PermissionGate component="manageRoles" action="update">
                      <button
                        onClick={() => navigate(`/editRole/${role._id}`)}
                        className="inline-flex items-center justify-center p-2.5 rounded-lg border border-line-strong text-primary hover:bg-surface-muted transition-colors duration-200"
                        title="Edit"
                        aria-label="Edit"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                          <path d="M12 20h9"/>
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                        </svg>
                      </button>
                    </PermissionGate>
                    <PermissionGate component="manageRoles" action="delete">
                      <button
                        onClick={() => setToDelete(role._id)}
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
                    </PermissionGate>
                  </td>
                </tr>
              ))}
              {roles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-base text-muted">No roles found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          {/* Component Filter */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-2">Filter by Component:</label>
            <select
              value={componentFilter}
              onChange={e => setComponentFilter(e.target.value)}
              className="border border-line rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              {components.map(comp => (
                <option key={comp.key} value={comp.key}>{comp.label}</option>
              ))}
            </select>
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
                <th className="text-right px-6 py-4 text-sm font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-line">
              {filteredPermissions.map(permission => (
                <tr key={permission._id} className="hover:bg-surface-raised transition-colors duration-150">
                  <td className="px-6 py-5 text-base font-semibold text-foreground">{permission.name}</td>
                  <td className="px-6 py-5">
                    <span className="px-2 py-1 rounded text-sm font-semibold bg-violet-soft text-violet-status">
                      {permission.component.replace('manage', '').replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="px-2 py-1 rounded text-sm font-semibold bg-primary-soft text-primary">
                      {permission.action.charAt(0).toUpperCase() + permission.action.slice(1)}
                    </span>
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
                  <td className="px-6 py-5 text-right space-x-3">
                    <PermissionGate component="manageRoles" action="update">
                      <button
                        onClick={() => navigate(`/editPermission/${permission._id}`)}
                        className="inline-flex items-center justify-center p-2.5 rounded-lg border border-line-strong text-primary hover:bg-surface-muted transition-colors duration-200"
                        title="Edit"
                        aria-label="Edit"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                          <path d="M12 20h9"/>
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                        </svg>
                      </button>
                    </PermissionGate>
                    <PermissionGate component="manageRoles" action="delete">
                      <button
                        onClick={() => setToDelete(permission._id)}
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
                    </PermissionGate>
                  </td>
                </tr>
              ))}
              {filteredPermissions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-base text-muted">
                    {permissions.length === 0 ? 'No permissions found' : 'No permissions match the selected filter'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
      
      {toDelete && (
        <DeleteConfirmModal 
          onCancel={() => setToDelete(null)} 
          onConfirm={confirmDelete} 
          title={`Delete ${activeTab === 'roles' ? 'Role' : 'Permission'}`}
          message={`Are you sure you want to delete this ${activeTab === 'roles' ? 'role' : 'permission'}? This action cannot be undone.`}
        />
      )}
    </div>
  );
};

export default ViewRoles;
