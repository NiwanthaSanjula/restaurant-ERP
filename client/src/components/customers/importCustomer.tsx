import { ArrowLeft } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';

const ImportCustomer: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importResults, setImportResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setImportResults(null);
    }
  };

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/customers/template/download`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message || 'Failed to download template');
      }

      // Get the blob from response
      const blob = await res.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'customer-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showSuccessToast('Template downloaded successfully');
    } catch (e) {
      showErrorToast((e as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      showErrorToast('Please select a file to upload');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${api}/customers/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Import failed');

      setImportResults(data.data);
      showSuccessToast(data.message || 'Import completed');
      
      // Clear file input
      setFile(null);
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PermissionGate
      component="manageCustomers"
      action="update"
      fallback={
        <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-md text-center">
            <h2 className="text-xl font-semibold text-gray-900">Access denied</h2>
            <p className="text-gray-600 mt-2">You do not have permission to import customers.</p>
            <button
              type="button"
              onClick={() => navigate('/viewCustomers')}
              className="mt-4 px-4 py-2 text-base font-medium text-white bg-[#003366] rounded-lg hover:bg-[#004080] transition-colors duration-200"
            >
              Back to Customers
            </button>
          </div>
        </div>
      }
    >
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {loading && <Loader text="Importing customers" />}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={() => navigate('/viewCustomers')}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[#cbd5e1] bg-white text-[#001F54] hover:bg-[#f8fafc] hover:border-[#94a3b8] transition-colors"
                title="Back to Customers"
                aria-label="Back to Customers"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="text-2xl font-semibold text-[#001F54]">Import Customers</div>
            </div>
            <p className="text-gray-600 mt-2">
              Upload an Excel file (.xlsx, .xls) or CSV file to import customers in bulk.
            </p>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
          {/* Download Template Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#001F54] mb-2">Download Template</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Download the Excel template to see the correct format for importing customers.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadTemplate}
                className="px-4 py-2 text-sm font-medium text-white bg-[#0066CC] rounded hover:bg-[#0052A3] transition-colors duration-200 whitespace-nowrap"
              >
                Download Template
              </button>
            </div>
          </div>

          {/* Upload Section */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-base font-medium text-[#001F54] mb-2">
                Select File <span className="text-red-500">*</span>
              </label>
              <input
                id="file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                required
                className="w-full text-base border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001F54] focus:border-transparent"
              />
              <p className="text-sm text-gray-500 mt-1">
                Supported formats: Excel (.xlsx, .xls) or CSV (.csv)
              </p>
            </div>

            {file && (
              <div className="bg-gray-50 border border-gray-200 rounded p-3">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Selected file:</span> {file.name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Size: {(file.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}

            {/* Import Results */}
            {importResults && (
              <div className={`border rounded-lg p-4 ${
                importResults.failed === 0 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <h4 className="font-semibold text-gray-900 mb-2">Import Results:</h4>
                <p className="text-sm text-gray-700 mb-2">
                  <span className="font-medium text-green-600">Success:</span> {importResults.success} customers imported
                </p>
                {importResults.failed > 0 && (
                  <>
                    <p className="text-sm text-gray-700 mb-2">
                      <span className="font-medium text-red-600">Failed:</span> {importResults.failed} customers
                    </p>
                    {importResults.errors.length > 0 && (
                      <div className="mt-3 max-h-40 overflow-y-auto">
                        <p className="text-xs font-medium text-gray-700 mb-1">Errors:</p>
                        <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
                          {importResults.errors.slice(0, 10).map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                          {importResults.errors.length > 10 && (
                            <li className="text-gray-500">
                              ... and {importResults.errors.length - 10} more errors
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

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
                disabled={loading || !file}
                className="px-4 py-2 text-base font-medium rounded bg-[#003366] text-white hover:bg-[#004080] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Importing...' : 'Import Customers'}
              </button>
            </div>
          </form>

          {/* Instructions */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
            <h4 className="font-semibold text-gray-900 mb-2">Instructions:</h4>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>Download the template to see the correct format</li>
              <li>Required columns: <strong>Name</strong>, <strong>Mobile</strong></li>
              <li>Optional columns: <strong>NIC</strong>, <strong>Address</strong></li>
              <li>Ensure mobile numbers are unique (no duplicates)</li>
              <li>Do not modify the column headers in the template</li>
            </ul>
          </div>
          </div>
        </div>
      </div>
    </PermissionGate>
  );
};

export default ImportCustomer;

