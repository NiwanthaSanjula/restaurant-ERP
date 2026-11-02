import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';

const EditRole: React.FC = () => {
  const { id } = useParams();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<Array<{
    component: string;
    actions: {
      create: boolean;
      read: boolean;
      update: boolean;
      delete: boolean;
    };
  }>>([]);
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
      const res = await fetch(`${api}/roles/${id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load');
      
      setName(data.data.name);
      setDescription(data.data.description);
      setPermissions(data.data.permissions || []);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleActionChange = (componentIndex: number, action: string, checked: boolean) => {
    setPermissions(prev => {
      const newPermissions = [...prev];
      if (newPermissions[componentIndex]) {
        (newPermissions[componentIndex].actions as any)[action] = checked;
      }
      return newPermissions;
    });
  };

  const handleComponentToggle = (componentIndex: number, checked: boolean) => {
    setPermissions(prev => {
      const newPermissions = [...prev];
      if (newPermissions[componentIndex]) {
        actions.forEach(action => {
          (newPermissions[componentIndex].actions as any)[action.key] = checked;
        });
      }
      return newPermissions;
    });
  };

  const isAllPermissionsSelected = permissions.length > 0 && permissions.every(permission =>
    actions.every(action => (permission.actions as any)?.[action.key])
  );

  const handleAllPermissionsToggle = (checked: boolean) => {
    setPermissions(prev =>
      prev.map(permission => ({
        ...permission,
        actions: {
          create: checked,
          read: checked,
          update: checked,
          delete: checked
        }
      }))
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/roles/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ name, description, permissions })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Update failed');
      showSuccessToast(data.message || 'Role updated successfully');
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
        <div className="text-2xl font-semibold text-[#001F54]">Edit Role</div>
      </div>
      
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded p-6 max-w-4xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-base font-medium text-[#001F54] mb-2">Role Name</label>
            <input 
              required 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" 
              placeholder="Enter role name"
            />
          </div>
          <div>
            <label className="block text-base font-medium text-[#001F54] mb-2">Description</label>
            <input 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" 
              placeholder="Enter role description"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#001F54] mb-3">Permissions</label>
          <label className="inline-flex items-center mb-3">
            <input
              type="checkbox"
              checked={isAllPermissionsSelected}
              onChange={(e) => handleAllPermissionsToggle(e.target.checked)}
              className="mr-2"
            />
            <span className="text-base text-gray-700 font-medium">Select All Permissions</span>
          </label>
          <div className="space-y-4">
            {components.map((component) => {
              const componentPermission = permissions.find(p => p.component === component.key);
              const componentIndex = permissions.findIndex(p => p.component === component.key);
              
              if (componentIndex === -1) return null;
              
              return (
                <div key={component.key} className="border border-gray-200 rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-base font-medium text-[#001F54]">{component.label}</h4>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={actions.every(action => 
                          (componentPermission?.actions as any)?.[action.key]
                        )}
                        onChange={(e) => handleComponentToggle(componentIndex, e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-base text-gray-600">Select All</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {actions.map(action => (
                      <label key={action.key} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={(componentPermission?.actions as any)?.[action.key] || false}
                          onChange={(e) => handleActionChange(componentIndex, action.key, e.target.checked)}
                          className="mr-2"
                        />
                        <span className="text-base text-gray-700">{action.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button 
            type="button" 
            onClick={() => navigate('/viewRoles')}
            className="px-4 py-2 text-base font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="px-4 py-2 text-base font-medium rounded bg-[#003366] text-white hover:bg-[#004080]"
          >
            Update Role
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditRole;
