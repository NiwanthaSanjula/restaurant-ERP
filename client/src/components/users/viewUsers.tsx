import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { showErrorToast, showSuccessToast } from '../../utils/toast';

import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';
import SearchBar from '../common/SearchBar';

type UserRow = { id: string; name: string; email: string; role: string; roleId: any; isActive: boolean; createdAt: string };

/** Converts backend role strings (e.g. "admin", "super admin") to Title Case for display */
const toTitleCase = (str: string) =>
  str.replace(/\b\w/g, (c) => c.toUpperCase());

const ViewUsers: React.FC = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const fetchUsers = async (searchQuery: string = '') => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const searchParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`${api}/users${searchParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load');
      const rows: UserRow[] = data.data.map((u: any) => ({ id: u._id, name: u.name, email: u.email, role: u.role, roleId: u.roleId, isActive: u.isActive, createdAt: u.createdAt }));
      setUsers(rows);
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Debounce search query updates
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch when debounced query changes
  useEffect(() => { fetchUsers(debouncedSearchQuery); }, [debouncedSearchQuery]);
  
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

const confirmDelete = async () => {
  if (!toDelete) return;

  const token = localStorage.getItem('token');

  if (!token) {
    alert('Session expired. Please log in again.');
    return;
  }

  setLoading(true);

  try {
    const res = await fetch(`${api}/users/${toDelete}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.message || 'Delete failed');

    showSuccessToast(data.message || 'User deleted successfully');

    setToDelete(null);

    fetchUsers(debouncedSearchQuery || searchQuery);

  } catch (e) {
    showErrorToast((e as Error).message);
  } finally {
    setLoading(false);
  }
};

  return (
    <div>
      {loading && <Loader text="Loading" />}
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold text-foreground">Users</div>
        <Link to="/createUser" className="px-4 py-2 rounded bg-primary text-on-primary hover:bg-primary-hover">
          Create User
        </Link>
      </div>
      <div className="mb-4">
        <SearchBar 
          onSearch={handleSearch}
          placeholder="Search users by name, email, or role..."
          className="max-w-md"
        />
      </div>
      <div className="bg-surface border border-line rounded overflow-auto">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-primary text-on-primary">
            <tr>
              <th className="text-left px-6 py-4 text-sm font-semibold">Name</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">Email</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">Role</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">Status</th>
              <th className="text-right px-6 py-4 text-sm font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-line">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-surface-raised transition-colors duration-150">
                <td className="px-6 py-5 text-base font-semibold text-foreground">{u.name}</td>
                <td className="px-6 py-5 text-base text-foreground">{u.email}</td>
<td className="px-6 py-5 text-base text-foreground">
  {toTitleCase(u.roleId?.name || u.role || '')}
</td>
                <td className="px-6 py-5 text-base text-foreground">{u.isActive ? 'Active' : 'Inactive'}</td>
                <td className="px-6 py-5 text-right space-x-3">
                  <PermissionGate component="manageUsers" action="update">
                    <button
                      onClick={() => navigate(`/editUser/${u.id}`)}
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
                  <PermissionGate component="manageUsers" action="delete">
                    <button
                      onClick={() => setToDelete(u.id)}
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
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-base text-muted">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {toDelete && (
        <DeleteConfirmModal onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
};

export default ViewUsers;

