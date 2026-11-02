import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';

const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Converts backend role strings (e.g. "admin") to Title Case for display */
const toTitleCase = (str: string) =>
  str.replace(/\b\w/g, (c) => c.toUpperCase());

const EditUser: React.FC = () => {
  const { id } = useParams();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/roles`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load roles');
      setRoles(data.data || []);
    } catch (e) {
      console.error('Failed to fetch roles:', e);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/users/${id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load');
      const name = (data.data.name || '').trim();
      const [fn, ...rest] = name.split(' ');
      setFirstName(fn || '');
      setLastName(rest.join(' ') || '');
      setEmail(data.data.email || '');
      setRoleId(data.data.roleId || '');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    load(); 
    fetchRoles();
  }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      alert('Please enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          firstName, 
          lastName, 
          email, 
          roleId: roleId || undefined 
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Update failed');
      showSuccessToast(data.message || 'User updated successfully');
      navigate('/viewUsers');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {loading && <Loader text="Saving" />}
        <div className="mb-6">
          <div className="text-2xl font-semibold text-[#001F54]">Edit User</div>
        </div>
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-medium text-[#001F54] mb-2">First name</label>
              <input required value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-base font-medium text-[#001F54] mb-2">Last name</label>
              <input required value={lastName} onChange={e => setLastName(e.target.value)} className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" />
            </div>
          </div>
          <div>
            <label className="block text-base font-medium text-[#001F54] mb-2">Username (Email)</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-base font-medium text-[#001F54] mb-2">Role</label>
            <select
              value={roleId}
              onChange={e => setRoleId(e.target.value)}
              className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent"
            >
              <option value="">Select a role (optional)</option>
              {roles.map(role => (
                <option key={role._id} value={role._id}>{toTitleCase(role.name)}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end pt-4">
            <button type="submit" className="px-4 py-2 text-base font-medium rounded bg-[#003366] text-white hover:bg-[#004080] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditUser;


