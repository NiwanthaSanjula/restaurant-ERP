import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Loader from '../common/Loader';

const EditPermission: React.FC = () => {
  const { id } = useParams();
  const [name, setName] = useState('');
  const [component, setComponent] = useState('');
  const [action, setAction] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const components = [
    { key: 'manageUsers', label: 'User Management' },
    { key: 'manageRoles', label: 'Role Management' },
    { key: 'manageMenu', label: 'Menu Management' },
    { key: 'manageOrders', label: 'Order Management' },
    { key: 'manageTables', label: 'Table Management' },
    { key: 'posOperations', label: 'POS Operations' },
    { key: 'reports', label: 'Reports' }
  ];

  const actions = [
    { key: 'create', label: 'Create' },
    { key: 'read', label: 'Read' },
    { key: 'update', label: 'Update' },
    { key: 'delete', label: 'Delete' }
  ];

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/permissions/${id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load');
      
      setName(data.data.name);
      setComponent(data.data.component);
      setAction(data.data.action);
      setDescription(data.data.description);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/permissions/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ name, component, action, description })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Update failed');
      navigate('/viewRoles');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {loading && <Loader text="Loading" />}
        <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold text-foreground">Edit Permission</div>
        <button 
          onClick={() => navigate('/viewRoles')}
          className="px-4 py-2 rounded border border-line-strong text-foreground hover:bg-surface-raised"
        >
          Back to Roles
        </button>
      </div>
      
      <form onSubmit={submit} className="bg-surface border border-line rounded p-6 max-w-2xl space-y-6">
        <div>
          <label className="block text-base font-medium text-foreground mb-2">Permission Name</label>
          <input 
            required 
            value={name} 
            onChange={e => setName(e.target.value)} 
            className="w-full text-base border border-line rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="e.g., create_user, read_orders"
          />
          <p className="text-xs text-muted mt-1">Use lowercase with underscores (e.g., create_user, read_orders)</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-base font-medium text-foreground mb-2">Component</label>
            <select
              required
              value={component}
              onChange={e => setComponent(e.target.value)}
              className="w-full text-base border border-line rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select component</option>
              {components.map(comp => (
                <option key={comp.key} value={comp.key}>{comp.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-base font-medium text-foreground mb-2">Action</label>
            <select
              required
              value={action}
              onChange={e => setAction(e.target.value)}
              className="w-full text-base border border-line rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select action</option>
              {actions.map(act => (
                <option key={act.key} value={act.key}>{act.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-base font-medium text-foreground mb-2">Description</label>
          <textarea 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            className="w-full text-base border border-line rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            rows={3}
            placeholder="Describe what this permission allows"
          />
        </div>

        <div className="flex justify-end space-x-3">
          <button 
            type="button" 
            onClick={() => navigate('/viewRoles')}
            className="px-4 py-2 text-base font-medium rounded border border-line-strong text-foreground hover:bg-surface-raised"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="px-4 py-2 text-base font-medium rounded bg-primary text-on-primary hover:bg-primary-hover"
          >
            Update Permission
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditPermission;
