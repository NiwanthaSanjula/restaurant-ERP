import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../common/Loader';

const CreatePermission: React.FC = () => {
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
    { key: 'manageWarehouses', label: 'Warehouse Management' },
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/permissions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ name, component, action, description })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Create failed');
      navigate('/viewRoles');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {loading && <Loader text="Creating permission" />}
        <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold text-[#001F54]">Create Permission</div>
        <button 
          onClick={() => navigate('/viewRoles')}
          className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Back to Roles
        </button>
      </div>
      
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <label className="block text-base font-medium text-[#001F54] mb-2">Permission Name</label>
          <input 
            required 
            value={name} 
            onChange={e => setName(e.target.value)} 
            className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" 
            placeholder="e.g., create_user, read_orders"
          />
          <p className="text-sm text-gray-500 mt-1">Use lowercase with underscores (e.g., create_user, read_orders)</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-base font-medium text-[#001F54] mb-2">Component</label>
            <select
              required
              value={component}
              onChange={e => setComponent(e.target.value)}
              className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent"
            >
              <option value="">Select component</option>
              {components.map(comp => (
                <option key={comp.key} value={comp.key}>{comp.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-base font-medium text-[#001F54] mb-2">Action</label>
            <select
              required
              value={action}
              onChange={e => setAction(e.target.value)}
              className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent"
            >
              <option value="">Select action</option>
              {actions.map(act => (
                <option key={act.key} value={act.key}>{act.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-base font-medium text-[#001F54] mb-2">Description</label>
          <textarea 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" 
            rows={3}
            placeholder="Describe what this permission allows"
          />
        </div>

        <div className="flex justify-end space-x-3">
          <button 
            type="button" 
            onClick={() => navigate('/viewRoles')}
            className="px-4 py-2 text-base font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="px-4 py-2 text-base font-medium rounded bg-[#003366] text-white hover:bg-[#004080] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
          >
            Create Permission
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreatePermission;
