import { useState } from 'react';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import { Modal, Spinner } from './ui';
import { IconAlert, IconCheck, IconTrash } from './icons';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'SGD', 'AED', 'BRL', 'JPY'];

/**
 * Account settings: profile, default currency, password change (which revokes
 * every other session) and full account deletion.
 */
export default function AccountDialog({
  open,
  user,
  onClose,
  onUserChange,
  onDeleted,
}: {
  open: boolean;
  user: User;
  onClose: () => void;
  onUserChange: (u: User) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [currency, setCurrency] = useState(user.currency);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<'profile' | 'password' | 'delete' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  async function saveProfile() {
    setBusy('profile');
    setNotice(null);
    try {
      const res = await api.updateProfile({ name, currency });
      onUserChange(res.user);
      setNotice({ tone: 'ok', text: 'Profile updated' });
    } catch (err) {
      setNotice({ tone: 'err', text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      setBusy(null);
    }
  }

  async function changePassword() {
    setBusy('password');
    setNotice(null);
    try {
      await api.updateProfile({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setNotice({ tone: 'ok', text: 'Password changed — other sessions were signed out' });
    } catch (err) {
      setNotice({ tone: 'err', text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy('delete');
    setNotice(null);
    try {
      await api.deleteAccount(deletePassword);
      onDeleted();
    } catch (err) {
      setNotice({ tone: 'err', text: err instanceof Error ? err.message : 'Delete failed' });
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Account settings"
      subtitle="Profile, security and data controls"
      width="max-w-lg"
    >
      <div className="space-y-6">
        {notice && (
          <div
            className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] ${
              notice.tone === 'ok'
                ? 'border-mint/25 bg-mint/10 text-mint'
                : 'border-rose/25 bg-rose/10 text-rose'
            }`}
          >
            {notice.tone === 'ok' ? (
              <IconCheck width={15} height={15} className="mt-0.5 shrink-0" />
            ) : (
              <IconAlert width={15} height={15} className="mt-0.5 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        )}

        <section className="space-y-3">
          <h3 className="section-title">Profile</h3>
          <div>
            <label className="label" htmlFor="acct-email">
              Email
            </label>
            <input id="acct-email" className="field opacity-60" value={user.email} disabled />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="acct-name">
                Name
              </label>
              <input
                id="acct-name"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="acct-currency">
                Default currency
              </label>
              <select
                id="acct-currency"
                className="field"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn-primary !py-2 text-[12.5px]" onClick={saveProfile} disabled={busy !== null}>
            {busy === 'profile' ? <Spinner /> : <IconCheck width={14} height={14} />} Save profile
          </button>
        </section>

        <section className="space-y-3 border-t border-white/[0.06] pt-4">
          <h3 className="section-title">Password</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="acct-current">
                Current password
              </label>
              <input
                id="acct-current"
                type="password"
                className="field"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="label" htmlFor="acct-new">
                New password
              </label>
              <input
                id="acct-new"
                type="password"
                className="field"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 10 characters"
              />
            </div>
          </div>
          <button
            className="btn-ghost !py-2 text-[12.5px]"
            onClick={changePassword}
            disabled={busy !== null || !currentPassword || newPassword.length < 10}
          >
            {busy === 'password' ? <Spinner /> : null} Change password
          </button>
        </section>

        <section className="space-y-3 rounded-xl border border-rose/20 bg-rose/[0.05] p-4">
          <h3 className="text-[13px] font-semibold text-rose">Delete account</h3>
          <p className="text-[12px] leading-relaxed text-slate-400">
            Permanently deletes your account, every subscription and the full price history. This
            cannot be undone.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              className="field !py-2 flex-1"
              placeholder="Confirm with your password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              className={confirmDelete ? 'btn-danger !py-2' : 'btn-ghost !py-2'}
              disabled={busy !== null || deletePassword.length === 0}
              onClick={() => (confirmDelete ? deleteAccount() : setConfirmDelete(true))}
            >
              {busy === 'delete' ? <Spinner /> : <IconTrash width={14} height={14} />}
              {confirmDelete ? 'Yes, delete everything' : 'Delete account'}
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
