import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../common/Loader';
import { showErrorToast, showSuccessToast } from '../../utils/toast';

const CreateCustomer: React.FC = () => {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [NIC, setNIC] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  // Validation functions
  const validateMobile = (mobileValue: string): boolean => {
    // Format: 0XXXXXXXXX (10 digits starting with 0) or +94XXXXXXXXX (12 characters starting with +94)
    const mobileRegex = /^(0\d{9}|\+94\d{9})$/;
    return mobileRegex.test(mobileValue.trim());
  };

  const validateNIC = (nicValue: string): boolean => {
    if (!nicValue || nicValue.trim() === '') return true; // NIC is optional
    const trimmedNIC = nicValue.trim();
    // Format: 12 digits OR 9 digits + V/v
    const nicRegex = /^(\d{12}|\d{9}[Vv])$/;
    return nicRegex.test(trimmedNIC);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate mobile
    if (!validateMobile(mobile)) {
      showErrorToast('Invalid mobile number format. Use 0XXXXXXXXX or +94XXXXXXXXX');
      return;
    }

    // Validate NIC
    if (NIC && !validateNIC(NIC)) {
      showErrorToast('Invalid NIC format. Use 12 digits or 9 digits followed by V');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      // Convert NIC 'v' to uppercase if present
      const processedNIC = NIC ? NIC.trim().toUpperCase() : undefined;
      
      const res = await fetch(`${api}/customers`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          name, 
          mobile: mobile.trim(), 
          NIC: processedNIC, 
          address: address || undefined 
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Create failed');
      showSuccessToast(data.message || 'Customer created successfully');
      navigate('/viewCustomers');
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {loading && <Loader text="Creating customer" />}
        <div className="mb-6">
          <div className="text-2xl font-semibold text-[#001F54]">Create Customer</div>
        </div>
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-base font-medium text-[#001F54] mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input 
              required 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" 
            />
          </div>
          <div>
            <label className="block text-base font-medium text-[#001F54] mb-2">
              Mobile <span className="text-red-500">*</span>
            </label>
            <input 
              required 
              value={mobile} 
              onChange={e => setMobile(e.target.value)} 
              placeholder="0XXXXXXXXX or +94XXXXXXXXX"
              className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" 
            />
          </div>
          <div>
            <label className="block text-base font-medium text-[#001F54] mb-2">NIC</label>
            <input 
              value={NIC} 
              onChange={e => setNIC(e.target.value)} 
              placeholder="12 digits or 9 digits + V"
              className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" 
            />
          </div>
          <div>
            <label className="block text-base font-medium text-[#001F54] mb-2">Address</label>
            <textarea 
              value={address} 
              onChange={e => setAddress(e.target.value)} 
              rows={3}
              className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent" 
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button 
              type="button" 
              onClick={() => navigate('/viewCustomers')} 
              className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 text-base font-medium rounded bg-[#003366] text-white hover:bg-[#004080] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCustomer;

