import { useState } from 'react';
import { AlertTriangle, CheckCheck, Mail, ShieldAlert, Trash2, Inbox } from 'lucide-react';
import { buildGmailComposeUrl } from '../lib/gmail';

const cardStyle = {
  background: 'var(--bg-card, #FFFFFF)',
  border: '1px solid var(--border, #E8DED1)',
  borderRadius: 'var(--radius-lg, 12px)',
  padding: '20px',
  boxShadow: 'var(--shadow-xs, 0 1px 2px 0 rgb(43 29 23 / 0.05))',
};

const TYPE_STYLE = {
  critical: { label: 'Critical', bg: 'var(--danger-fg, #ba1a1a)', fg: '#fff' },
  warning: { label: 'Warning', bg: 'var(--warning-subtle, #fef3c7)', fg: 'var(--warning-fg, #b45309)' },
  update: { label: 'Update', bg: 'rgba(99, 102, 241, 0.15)', fg: '#6366f1' },
  info: { label: 'Notice', bg: 'var(--bg-muted)', fg: 'var(--text-muted)' },
};

function formatWhen(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function buildUnsuspendMailto({ superAdminEmail, hotel, dish, ownerEmail }) {
  const subject = `Request to reactivate suspended dish: ${dish.name}`;
  const body = [
    'Hello Super Admin team,',
    '',
    `The issue that caused "${dish.name}" to be suspended has been resolved. Please review and reactivate the dish.`,
    '',
    `Hotel: ${hotel?.name || '—'}`,
    `Hotel ID: ${hotel?.id || '—'}`,
    `Dish: ${dish.name}`,
    `Dish ID: ${dish.id}`,
    `Suspension reason: ${dish.suspended_reason || 'Not specified'}`,
    '',
    'What we fixed:',
    '- ',
    '',
    'Thank you,',
    ownerEmail || hotel?.name || '',
  ].join('\n');
  return buildGmailComposeUrl({ to: superAdminEmail, subject, body });
}

/** Gmail compose URL for a general "Contact Super Admin" request, pre-filled with hotel details. */
export function buildContactSuperAdminUrl({ superAdminEmail, hotel, ownerEmail }) {
  const subject = `Support request – ${hotel?.name || 'Hotel'}`;
  const body = [
    'Hello Super Admin team,',
    '',
    'I need help with:',
    '- ',
    '',
    '— Hotel details —',
    `Hotel: ${hotel?.name || '—'}`,
    `Hotel ID: ${hotel?.id || '—'}`,
    `Subdomain: ${hotel?.subdomain || '—'}`,
    `Plan: ${hotel?.plan || 'free'}`,
    `Status: ${hotel?.status || '—'}`,
    `Owner e-mail: ${ownerEmail || hotel?.contact_email || '—'}`,
    `Contact phone: ${hotel?.contact_phone || hotel?.phone || '—'}`,
    '',
    'Thank you,',
    ownerEmail || hotel?.name || '',
  ].join('\n');
  return buildGmailComposeUrl({ to: superAdminEmail, subject, body });
}

/**
 * Super Admin Compliance: ONLY real messages written by the super admin for
 * this hotel, plus dishes the super admin has suspended (with a Fix button
 * that drafts a reactivation e-mail). No demo content.
 */
export function SuperAdminCompliancePanel({ messages = [], suspendedDishes = [], hotel, superAdminEmail, ownerEmail, onMarkRead, loading }) {
  const unread = messages.filter(m => !m.is_read).length;
  const hasContent = messages.length > 0 || suspendedDishes.length > 0;

  return (
    <div style={cardStyle} id="super-admin-compliance">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={18} color="var(--danger-fg, #ba1a1a)" />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
              Super Admin Compliance
            </h3>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
            Messages from the Super Admin and dishes suspended by the platform
          </p>
        </div>
        {(unread > 0 || suspendedDishes.length > 0) && (
          <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--danger-subtle, #ffdad6)', color: 'var(--danger-fg, #ba1a1a)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', border: '1px solid rgba(186, 26, 26, 0.25)' }}>
            {unread + suspendedDishes.length} action{unread + suspendedDishes.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
        {loading && !hasContent && (
          <div className="skeleton" style={{ height: '64px', borderRadius: '8px' }} />
        )}

        {!loading && !hasContent && (
          <div style={{ padding: '22px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <Inbox size={22} />
            No messages from the Super Admin. You're in good standing.
          </div>
        )}

        {suspendedDishes.length > 0 && (
          <div id="suspended-dishes" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: 'var(--danger-fg, #ba1a1a)', textTransform: 'uppercase' }}>
              <ShieldAlert size={14} /> Suspended dishes ({suspendedDishes.length})
            </div>
            {suspendedDishes.map(dish => (
              <div key={dish.id} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--danger-subtle, rgba(186, 26, 26, 0.06))', border: '1px solid rgba(186, 26, 26, 0.25)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{dish.name}</div>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {dish.suspended_reason || 'Suspended by the platform administrator.'} Hidden from guests until the Super Admin reactivates it.
                </p>
                <a
                  href={buildUnsuspendMailto({ superAdminEmail, hotel, dish, ownerEmail })}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', background: 'var(--primary, #271B14)', color: 'var(--primary-fg, #fff)', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}
                  title={`Email ${superAdminEmail} to request reactivation`}
                >
                  <Mail size={13} /> Fix — request reactivation
                </a>
              </div>
            ))}
          </div>
        )}

        {messages.map(msg => {
          const conf = TYPE_STYLE[msg.type] || TYPE_STYLE.info;
          return (
            <div
              key={msg.id}
              style={{ padding: '12px', borderRadius: 'var(--radius, 8px)', background: msg.is_read ? 'var(--bg-subtle, #FAF7F2)' : 'var(--bg-card)', border: `1px solid ${msg.is_read ? 'var(--border)' : 'rgba(186, 26, 26, 0.3)'}`, display: 'flex', flexDirection: 'column', gap: '6px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: conf.bg, color: conf.fg, textTransform: 'uppercase' }}>
                  {conf.label}{msg.target_type === 'hotel' ? ' · For your hotel' : ''}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formatWhen(msg.created_at)}</span>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{msg.title}</div>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{msg.message}</p>
              {!msg.is_read && (
                <button
                  type="button"
                  onClick={() => onMarkRead?.(msg.id)}
                  style={{ alignSelf: 'flex-end', background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Mark as read
                </button>
              )}
            </div>
          );
        })}

        <a
          href={buildContactSuperAdminUrl({ superAdminEmail, hotel, ownerEmail })}
          target="_blank"
          rel="noopener noreferrer"
          title={`Opens Gmail with a message to ${superAdminEmail}`}
          style={{ padding: '7px 10px', borderRadius: '6px', background: 'var(--bg-card, #FFFFFF)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '11px', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
        >
          <Mail size={13} color="var(--accent)" /> Contact Super Admin
        </a>
      </div>
    </div>
  );
}

/**
 * Resolved History: every resolved ticket, newest first, with a Delete
 * button (resolved tickets only).
 */
export function ResolvedHistoryPanel({ reports = [], reasonLabels = {}, onDelete }) {
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const resolved = reports
    .filter(r => r.status === 'resolved')
    .sort((a, b) => new Date(b.resolved_at || b.updated_at || b.created_at) - new Date(a.resolved_at || a.updated_at || a.created_at));

  async function handleDelete(id) {
    setDeletingId(id);
    setDeleteError('');
    const res = await onDelete?.(id);
    if (res?.error) setDeleteError(res.error.message || 'Could not delete this ticket.');
    setDeletingId(null);
    setConfirmId(null);
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
            Resolved History
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
            Tickets you have resolved
          </p>
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent, #C27835)' }}>{resolved.length}</span>
      </div>

      {deleteError && (
        <div role="alert" style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '8px', background: 'var(--danger-subtle, #fef2f2)', color: 'var(--danger-fg, #b91c1c)', fontSize: '11px', fontWeight: 600 }}>
          {deleteError}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px', maxHeight: '420px', overflowY: 'auto' }} className="custom-scrollbar">
        {resolved.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
            No resolved tickets yet
          </div>
        ) : resolved.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--bg-subtle, #FAF7F2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: '2px' }}>
              <CheckCheck size={14} color="var(--success-fg, #15803d)" />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.dishes?.name || r.dish_name || 'Menu item'}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent)' }}>{reasonLabels[r.reason] || r.reason}</span>
              {r.details && (
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  “{r.details}”
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '2px' }}>
                {confirmId === r.id ? (
                  <>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Delete permanently?</span>
                    <button type="button" onClick={() => setConfirmId(null)} style={{ background: 'none', border: 'none', fontSize: '11px', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>Cancel</button>
                    <button
                      type="button"
                      disabled={deletingId === r.id}
                      onClick={() => handleDelete(r.id)}
                      style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer', color: 'var(--danger-fg, #b91c1c)', padding: 0 }}
                    >
                      {deletingId === r.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(r.id)}
                    aria-label={`Delete resolved ticket for ${r.dishes?.name || 'dish'}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: 'var(--danger-fg, #b91c1c)', padding: 0 }}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
