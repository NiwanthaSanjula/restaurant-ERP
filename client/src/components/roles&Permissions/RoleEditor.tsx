import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../../contexts/PermissionContext';
import Loader from '../common/Loader';
import { permissionAction, permissionArea, permissionDiff, permissionLabel, type PermissionEntry } from './roleEditorPermissions';

const RoleEditor: React.FC<{ roleId?: string }> = ({ roleId }) => {
  const navigate = useNavigate();
  const { refreshPermissions } = usePermissions();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [savedPermissions, setSavedPermissions] = useState<PermissionEntry[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReviewed(false);
    setError('');
    setPermissions([]);
    setSavedPermissions([]);
    setIssues([]);
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
        if (!cancelled) {
          setSavedPermissions(saved);
          setPermissions(Object.entries(catalog).map(([component, actions]) => ({
            component, actions: Object.fromEntries(actions.map(action => [action, saved.find(entry => entry.component === component)?.actions[action] === true]))
          })).sort((a, b) => Number(b.component === 'managePurchases') - Number(a.component === 'managePurchases')));
        }
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
  const diff = permissionDiff(savedPermissions, permissions);
  const hasGrants = permissions.some(entry => Object.values(entry.actions).some(Boolean));
  const disabledReason = loading ? 'Loading or saving permissions…'
    : !permissions.length ? 'Permissions are unavailable. Reload this page before saving.'
    : !name.trim() ? 'Enter a role name to enable saving.'
    : !hasGrants ? 'Select at least one permission to enable saving.'
    : issues.length && !reviewed ? `Update Role is disabled until you acknowledge the ${issues.length} unsupported legacy entries beside this button.`
    : '';
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
      <label className="block">Role Name<input required value={name} onChange={event => setName(event.target.value)} className="block w-full border p-2 rounded" /></label>
      <label className="block">Description<input value={description} onChange={event => setDescription(event.target.value)} className="block w-full border p-2 rounded" /></label>
      {roleId && <label className="flex gap-2"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} />Active role</label>}
      {issues.length > 0 && <div role="note" className="border border-warning-line bg-warning-soft p-3 rounded text-foreground">
        <p>{issues.length} unsupported legacy permission entries will be dropped on save. Recognised grants are shown below.</p>
        <a href="#role-permission-review" className="underline font-medium">Review the permission diff and acknowledge this beside Update Role.</a>
      </div>}
      <label className="flex gap-2"><input type="checkbox" checked={permissions.length > 0 && permissions.every(entry => Object.values(entry.actions).every(Boolean))} onChange={event => selectAll(event.target.checked)} />Select All Permissions</label>
      {permissions.map((entry, index) => <fieldset key={entry.component} id={`permission-${entry.component}`} className="border border-line rounded p-4 min-w-0">
        <legend className="font-medium">{permissionArea(entry.component)}</legend>
        {entry.component === 'managePurchases' && <p className="text-sm text-muted mb-3">Read enables purchase lists, details, returns, and purchase reports.</p>}
        <label className="flex gap-2 mb-3"><input type="checkbox" checked={Object.values(entry.actions).every(Boolean)} onChange={event => selectAll(event.target.checked, index)} />Select All</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{Object.entries(entry.actions).map(([action, checked]) =>
          <label key={action} className="flex items-start gap-2 min-w-0"><input type="checkbox" aria-label={`${permissionArea(entry.component)} → ${permissionAction(action)}`} className="mt-1 shrink-0" checked={checked} onChange={event => change(index, action, event.target.checked)} /><span>{permissionAction(action)}</span></label>)}</div>
      </fieldset>)}
      <section id="role-permission-review" tabIndex={-1} aria-label="Permission changes" className="rounded-xl border border-line p-4 space-y-3">
        <h2 className="text-lg font-semibold">Permission changes</h2>
        <p className="text-sm text-muted">These changes replace the saved selections. The server protects the last active account with View Role and Edit Role access.</p>
        {([['Grants added', diff.added], ['Grants removed', diff.removed]] as const).map(([label, entries]) => <details key={label} open={entries.length > 0}>
          <summary className="font-medium cursor-pointer">{label} ({entries.length})</summary>
          {entries.length ? <ul className="mt-2 space-y-1 text-sm">{entries.map(key => <li key={key}>{permissionLabel(key)}</li>)}</ul> : <p className="text-sm text-muted mt-1">None</p>}
        </details>)}
        <details>
          <summary className="font-medium cursor-pointer">Unsupported legacy entries to drop ({issues.length})</summary>
          {issues.length ? <ul className="mt-2 space-y-1 text-sm break-words">{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : <p className="text-sm text-muted mt-1">None</p>}
        </details>
      </section>
      <div className="border-t border-line pt-4 space-y-3">
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1 space-y-2">
            {issues.length > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 shrink-0" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed the permission diff and approve dropping the unsupported legacy entries.</label>}
            <p id="role-save-status" role="status" className="text-sm text-muted">{disabledReason || 'Ready to save. Confirm the permission changes above.'}</p>
          </div>
          <div className="flex justify-end gap-3 shrink-0">
            <button type="button" onClick={() => navigate('/viewRoles')} className="border border-line rounded px-4 py-2">Cancel</button>
            <button type="submit" aria-describedby="role-save-status" disabled={!!disabledReason} className="bg-primary text-on-primary rounded px-4 py-2 disabled:opacity-50">{roleId ? 'Update Role' : 'Create Role'}</button>
          </div>
        </div>
      </div>
    </form>
  </div>;
};
export default RoleEditor;
