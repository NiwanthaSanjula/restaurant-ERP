import { ArrowLeft, Globe, Hash, Info, Lock, Mail, Send, Server, User } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { settingService } from '../../services/settingService';
import { usePermissions } from '../../contexts/PermissionContext';

const MailSettings: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('manageSettings', 'edit_notification_settings');
  const [formData, setFormData] = useState({
    mailMailer: '',
    mailHost: '',
    mailPort: 587,
    mailSenderName: '',
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  /*const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  const token = localStorage.getItem('token');*/

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
  try {
    const result = await settingService.getMailSettings();
    if (result.success && result.data) {
      setFormData({
        // Spread defaults first, then overwrite with API data
        mailMailer: result.data.mailMailer || '',
        mailHost: result.data.mailHost || '',
        mailPort: result.data.mailPort || 587,
        mailSenderName: result.data.mailSenderName || '',
        username: result.data.username || '',
        password: '' 
      });
    }
  } catch (err) {
    toast.error("Failed to load mail settings");
  }
};

  const handleSave = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!formData.username) {
      toast.error("Email/Username is required");
      return;
    }

    if (!validateEmail(formData.username)) {
      toast.error("Please enter a valid email address (e.g., name@domain.com)");
      return;
    }
  setLoading(true);
  try {
    const { password, ...settings } = formData;
    const result = await settingService.updateMailSettings({
      ...settings,
      ...(password.trim() ? { password } : {})
    });
    if (result.success) {
      setFormData((previous) => ({ ...previous, password: '' }));
      toast.success("Mail settings saved successfully!");
    }
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to save");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 bg-canvas min-h-screen">
      {/* Header Section */}
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-primary rounded-xl text-on-primary">
          <Mail size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Email Configuration</h1>
          <p className="text-muted text-sm">Configure SMTP settings for system-generated notifications.</p>
        </div></div>
        <div>
        <div className="p-0 max-w-4xl mx-auto">
    {/* Top Navigation / Back Button */}
    <div className="mb-6">
      <button 
        onClick={() => navigate('/SystemSettings')} 
        className="inline-flex items-center px-4 py-2 text-muted hover:text-primary transition-all"
      >
        <div className="p-1 rounded-lg group-hover:bg-surface border border-transparent group-hover:border-line transition-all">
                <ArrowLeft size={18} />
        </div>
        <span className="text-sm font-semibold">Back to Settings</span>
      </button>
    </div></div>
      </div></div>

      <form onSubmit={handleSave} className="space-y-6">
        <fieldset disabled={!canEdit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card 1: Connection Settings */}
          <div className="bg-surface p-6 rounded-2xl border border-line">
            <h3 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2 border-b pb-3">
              <Server size={18} className="text-foreground" /> Server Details
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted">Mail Mailer <span className="text-danger">*</span></label>
                <div className="relative">
                  <Send className="absolute left-3 top-3 text-subtle" size={16} />
                  <input
                    type="text"
                    className="w-full pl-10 pr-4 py-2 border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    value={formData.mailMailer}
                    onChange={(e) => setFormData({...formData, mailMailer: e.target.value})}
                    placeholder="e.g., smtp"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted">SMTP Host <span className="text-danger">*</span></label>
                <div className="relative">
                  <Globe className="absolute left-3 top-3 text-subtle" size={16} />
                  <input
                    type="text"
                    className="w-full pl-10 pr-4 py-2 border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    value={formData.mailHost}
                    onChange={(e) => setFormData({...formData, mailHost: e.target.value})}
                    placeholder="smtp.gmail.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted">Port Number</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 text-subtle" size={16} />
                  <input
                    type="number"
                    className="w-full pl-10 pr-4 py-2 border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    value={formData.mailPort}
                    onChange={(e) => setFormData({...formData, mailPort: parseInt(e.target.value)})}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Authentication & Identity */}
          <div className="bg-surface p-6 rounded-2xl border border-line">
            <h3 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2 border-b pb-3">
              <Lock size={18} className="text-foreground" /> Security & Identity
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted">Sender Display Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-subtle" size={16} />
                  <input
                    type="text"
                    className="w-full pl-10 pr-4 py-2 border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    value={formData.mailSenderName}
                    onChange={(e) => setFormData({...formData, mailSenderName: e.target.value})}
                    placeholder="POSify Notifications"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted">Username / Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-subtle" size={16} />
                  <input
                    type="email"
                    className="w-full pl-10 pr-4 py-2 border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    value={formData.username}
                    placeholder="admin@example.com"
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-subtle" size={16} />
                  <input
                    type="password"
                    className="w-full pl-10 pr-4 py-2 border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-primary-soft border border-primary-line p-4 rounded-xl flex gap-3 items-start">
          <Info className="text-foreground shrink-0" size={20} />
          <p className="text-xs text-primary leading-relaxed">
            <b>Note:</b> If you are using Gmail, you may need to use an "App Password" rather than your standard account password. Ensure your SMTP server allows connections from this server's IP address.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-primary text-on-primary px-8 py-3 rounded-xl font-bold hover:bg-primary-hover transition-all disabled:bg-surface-muted"
          >
            {loading ? (
              <span className="animate-pulse">Saving Settings...</span>
            ) : (
              <>
                <Send size={18} />
                Update SMTP Configuration
              </>
            )}
          </button>
        </div>
      </fieldset>
      </form>
    </div>
  );
};

export default MailSettings;
