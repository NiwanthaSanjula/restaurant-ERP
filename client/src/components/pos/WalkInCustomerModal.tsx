import React, { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customer: any) => void;
}

const WalkInCustomerModal = ({ isOpen, onClose, onSuccess }: Props) => {
  const [formData, setFormData] = useState({
    name: "",
    nic: "",
    mobile: "",
  });

  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);

  try {
    const api = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
    const token = sessionStorage.getItem("token") || localStorage.getItem("token");

    if (!token) {
      alert("Session expired. Please login again.");
      return;
    }

    const res = await fetch(`${api}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        name: formData.name,
        mobile: formData.mobile,
        NIC: formData.nic
      })
    });

    const data = await res.json();

    if (res.ok && data.status === "success") {
      onSuccess(data.data);
      onClose();
      setFormData({ name: "", nic: "", mobile: "" });
    } else {
      const message = String(data?.message || "Failed to create customer");
      if (message.includes('Role "undefined"')) {
        alert("Your login session is outdated. Please logout and login again.");
      } else {
        alert(message);
      }
    }
  } catch (error) {
    alert("Error saving customer");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/40">
      {/* Modal */}
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Quick Add Customer</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="p-5 space-y-4 overflow-y-auto flex-1"
        >
          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              Customer Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>

          {/* NIC */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              NIC (Optional)
            </label>
            <input
              type="text"
              value={formData.nic}
              onChange={(e) =>
                setFormData({ ...formData, nic: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>

          {/* Mobile */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">
              Mobile Number *
            </label>
            <input
              type="tel"
              required
              value={formData.mobile}
              onChange={(e) =>
                setFormData({ ...formData, mobile: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 text-sm font-medium text-white bg-[#1f3b63] rounded-lg hover:bg-[#1f3b63]/80 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

export default WalkInCustomerModal;
