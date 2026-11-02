import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../../contexts/PermissionContext';
import Loader from '../common/Loader';

interface PermissionEntry { component: string; actions: Record<string, boolean> }

const RoleEditor: React.FC<{ roleId?: string }> = ({ roleId }) => {
  const navigate = useNavigate();
  const { refreshPermissions } = usePermissions();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const headers = { Authorization: 'Bearer ' + localStorage.getItem('token') };
        const catalogResponse = await fetch(api + '/roles/permission-catalog', { headers });
        if (!catalogResponse.ok) throw new Error('Unable to load permission catalog');
        const catalogBody = await catalogResponse.json();
        const catalog: Record<string, string[]> = catalogBody.data;
        let saved: PermissionEntry[] = [];
        if (roleId) {
          const response = await fetch(api + '/roles/' + roleId, { headers });
          const body = await response.json();
          if (!response.ok) throw new Error(body.message || 'Unable to load role');
          if (cancelled) return;
          setName(body.data.name);
          setDescription(body.data.description || '');
          setIsActive(body.data.isActive === true);
          setIssues(body.data.permissionIssues || []);
          saved = body.data.permissions;
        }
        if (!cancelled) setPermissions(Object.entries(catalog).map(([component, actions]) => ({
          component, actions: Object.fromEntries(actions.map(action => [action, saved.find(entry => entry.component === component)?.actions[action] === true]))
        })));
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'Unable to load role');
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [api, roleId]);

  const change = (index: number, action: string, checked: boolean) => setPermissions(previous =>
    previous.map((entry, position) => position === index ? { ...entry, actions: { ...entry.actions, [action]: checked } } : entry));
  const selectAll = (checked: boolean, index?: number) => setPermissions(previous => previous.map((entry, position) =>
    index === undefined || index === position ? { ...entry, actions: Object.fromEntries(Object.keys(entry.actions).map(action => [action, checked])) } : entry));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!permissions.some(entry => Object.values(entry.actions).some(Boolean))) { setError('Select at least one permission'); return; }
    if (issues.length && !reviewed) { setError('Review the unmapped permissions before replacing them'); return; }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(api + '/roles' + (roleId ? '/' + roleId : ''), {
        method: roleId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify({ name, description, isActive, permissions })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Unable to save role');
      await refreshPermissions();
      navigate('/viewRoles');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save role');
    } finally { setLoading(false); }
  };
  return <div>
    {loading && <Loader text="Loading role" />}
    <h1 className="text-2xl font-semibold text-foreground mb-4">{roleId ? 'Edit Role' : 'Create Role'}</h1>
    <form onSubmit={submit} className="bg-surface border border-line rounded-lg p-6 max-w-4xl space-y-6">
      {error && <p role="alert" className="text-danger">{error}</p>}
      <label className="block">Role Name<input required value={name} onChange={event => setName(event.target.value)} className="block w-full border p-2 rounded" /></label>
      <label className="block">Description<input value={description} onChange={event => setDescription(event.target.value)} className="block w-full border p-2 rounded" /></label>
      {roleId && <label className="flex gap-2"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} />Active role</label>}
      {issues.length > 0 && <div role="alert" className="border border-warning-line p-3 rounded">
        <p>These legacy grants cannot be mapped safely. Saving will replace them with the selections below.</p>
        <ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
        <label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> I reviewed the unmapped grants and approve replacing them.</label>
      </div>}
      <label className="flex gap-2"><input type="checkbox" checked={permissions.length > 0 && permissions.every(entry => Object.values(entry.actions).every(Boolean))} onChange={event => selectAll(event.target.checked)} />Select All Permissions</label>
      {permissions.map((entry, index) => <fieldset key={entry.component} className="border rounded p-4">
        <legend className="font-medium">{entry.component}</legend>
        <label className="flex gap-2 mb-3"><input type="checkbox" checked={Object.values(entry.actions).every(Boolean)} onChange={event => selectAll(event.target.checked, index)} />Select All</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Object.entries(entry.actions).map(([action, checked]) =>
          <label key={action} className="flex gap-2"><input type="checkbox" checked={checked} onChange={event => change(index, action, event.target.checked)} />{action.replace(/_/g, ' ')}</label>)}</div>
      </fieldset>)}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => navigate('/viewRoles')} className="border rounded px-4 py-2">Cancel</button>
        <button type="submit" disabled={loading || !permissions.length || (!!issues.length && !reviewed)} className="bg-primary text-on-primary rounded px-4 py-2">{roleId ? 'Update Role' : 'Create Role'}</button>
      </div>
    </form>
  </div>;
};
export default RoleEditor;
