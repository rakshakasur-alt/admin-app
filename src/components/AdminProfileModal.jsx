import { useState, useEffect, useRef } from 'react';
import {
  User,
  Building,
  Sliders,
  X,
  Check,
  Camera,
  Shield,
  HelpCircle,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  Globe,
  UploadCloud
} from 'lucide-react';
import { updateHotelLogo, updateHotelProfile, uploadHeaderImage, supabase } from '../lib/supabaseClient';
import MapLocationPicker from './MapLocationPicker';
import { buildSuperAdminMailUrl, useSuperAdminEmail } from '../lib/superAdminContact';

export default function AdminProfileModal({
  isOpen,
  onClose,
  hotel,
  userEmail,
  ownerName,
  avatarUrl: propAvatarUrl,
  initials = 'GT',
  onUpdateHotel,
  onUpdateProfile
}) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'hotel' | 'settings'
  const superAdminEmail = useSuperAdminEmail();

  // Profile fields state
  const [adminName, setAdminName] = useState(
    () => localStorage.getItem('admin_profile_name') || ownerName || (userEmail ? userEmail.split('@')[0] : 'Administrator')
  );
  const [adminRole, setAdminRole] = useState(
    () => localStorage.getItem('admin_profile_role') || 'General Manager'
  );
  const [adminEmail, setAdminEmail] = useState(userEmail || 'admin@restaurant.com');
  const [adminPhone, setAdminPhone] = useState(
    () => localStorage.getItem('admin_profile_phone') || hotel?.phone || ''
  );
  const [avatarUrl, setAvatarUrl] = useState(
    () => localStorage.getItem('admin_profile_avatar') || propAvatarUrl || ''
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  // Hotel fields state. Values that could not be stored in a dedicated
  // column (older databases) live in theme_config.profile.
  const savedProfile = hotel?.theme_config?.profile || {};
  const hotelValue = (key) => hotel?.[key] ?? savedProfile[key] ?? '';
  const [hotelName, setHotelName] = useState(hotel?.name || '');
  const [subdomain, setSubdomain] = useState(hotel?.subdomain || '');
  const [branch, setBranch] = useState(hotelValue('branch'));
  const [currency, setCurrency] = useState(hotel?.currency || 'INR');
  const [address, setAddress] = useState(hotelValue('address'));
  const [coordinates, setCoordinates] = useState(
    () => hotel?.coordinates || savedProfile.coordinates || hotel?.theme_config?.coordinates || { lat: 28.6139, lng: 77.2090 }
  );
  const [contactEmail, setContactEmail] = useState(hotel?.contact_email || userEmail || '');
  const [phone, setPhone] = useState(hotel?.phone || '');
  const [operatingHours, setOperatingHours] = useState(hotel?.operating_hours || '');
  const [logoUrl, setLogoUrl] = useState(hotel?.theme_config?.logoUrl || hotel?.logo_url || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  // Settings fields
  const [themeMode, setThemeMode] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'light'
  );
  const [typography, setTypography] = useState(
    () => localStorage.getItem('admin_dashboard_font') || 'Playfair Display'
  );
  const [showPlanDetails, setShowPlanDetails] = useState(false);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  function handleTypographyChange(newFont) {
    setTypography(newFont);
    localStorage.setItem('admin_dashboard_font', newFont);
    document.documentElement.style.setProperty('--font-body', `"${newFont}", -apple-system, BlinkMacSystemFont, sans-serif`);
    document.documentElement.style.setProperty('--font-title', `"${newFont}", sans-serif`);
    document.documentElement.style.setProperty('--font-serif', `"${newFont}", Georgia, serif`);
  }

  useEffect(() => {
    if (ownerName && !localStorage.getItem('admin_profile_name')) {
      setAdminName(ownerName);
    }
    if (propAvatarUrl && !localStorage.getItem('admin_profile_avatar')) {
      setAvatarUrl(propAvatarUrl);
    }
  }, [ownerName, propAvatarUrl]);

  // Owner contact details captured at signup live in auth metadata
  useEffect(() => {
    if (!isOpen || !supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      const meta = data?.user?.user_metadata || {};
      if (meta.phone_number && !localStorage.getItem('admin_profile_phone')) setAdminPhone(meta.phone_number);
      if (meta.full_name && !localStorage.getItem('admin_profile_name')) setAdminName(meta.full_name);
    }).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (userEmail) setAdminEmail(userEmail);
    if (!hotel) return;
    const profile = hotel.theme_config?.profile || {};
    if (hotel.name) setHotelName(hotel.name);
    if (hotel.subdomain) setSubdomain(hotel.subdomain);
    if (hotel.currency) setCurrency(hotel.currency);
    const nextBranch = hotel.branch ?? profile.branch;
    if (nextBranch) setBranch(nextBranch);
    const nextAddress = hotel.address ?? profile.address;
    if (nextAddress) setAddress(nextAddress);
    const nextCoords = hotel.coordinates || profile.coordinates || hotel.theme_config?.coordinates;
    if (nextCoords) setCoordinates(nextCoords);
    if (hotel.phone) setPhone(hotel.phone);
    if (hotel.contact_email) setContactEmail(hotel.contact_email);
    if (hotel.operating_hours) setOperatingHours(hotel.operating_hours);
    const nextLogo = hotel.theme_config?.logoUrl || hotel.logo_url;
    if (nextLogo) setLogoUrl(nextLogo);
  }, [userEmail, hotel]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const res = await uploadHeaderImage(file);
      const url = typeof res === 'string' ? res : res?.url;
      if (url) {
        setAvatarUrl(url);
        localStorage.setItem('admin_profile_avatar', url);
        if (supabase) {
          try {
            await supabase.auth.updateUser({
              data: { avatar_url: url }
            });
          } catch (_) {}
        }
        window.dispatchEvent(new CustomEvent('admin-profile-updated', {
          detail: { avatar: url, name: adminName }
        }));
        if (onUpdateProfile) onUpdateProfile({ avatar: url, name: adminName });
        setFeedback('Profile photo updated successfully');
        setTimeout(() => setFeedback(null), 3000);
      } else if (res?.error) {
        setFeedback(res.error.message || 'Failed to upload photo');
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err) {
      setFeedback('Failed to upload photo');
      setTimeout(() => setFeedback(null), 3000);
    }
    setUploadingAvatar(false);
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    try {
      const res = await uploadHeaderImage(file);
      const url = typeof res === 'string' ? res : res?.url;
      if (!url) throw res?.error || new Error('Upload failed');
      const { error } = await updateHotelLogo(url);
      if (error) throw error;
      setLogoUrl(url);
      if (onUpdateHotel) {
        onUpdateHotel({ logo_url: url, theme_config: { ...(hotel?.theme_config || {}), logoUrl: url } });
      }
      setFeedback('Brand logo saved');
    } catch (err) {
      setFeedback(`Failed to save logo: ${err?.message || 'unknown error'}`);
    }
    setTimeout(() => setFeedback(null), 3500);
    setUploadingLogo(false);
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      localStorage.setItem('admin_profile_name', adminName);
      localStorage.setItem('admin_profile_role', adminRole);
      localStorage.setItem('admin_profile_phone', adminPhone);
      if (supabase) {
        try {
          await supabase.auth.updateUser({
            data: {
              full_name: adminName,
              phone_number: adminPhone
            }
          });
        } catch (_) {}
      }
      window.dispatchEvent(new CustomEvent('admin-profile-updated', {
        detail: { name: adminName, avatar: avatarUrl, role: adminRole, phone: adminPhone }
      }));
      if (onUpdateProfile) onUpdateProfile({ name: adminName, role: adminRole, avatar: avatarUrl });
      setFeedback('Admin profile updated successfully');
      setTimeout(() => setFeedback(null), 3000);
    } catch (_) {}
    setSaving(false);
  }

  async function handleSaveHotel(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await updateHotelProfile({
        name: hotelName,
        phone,
        contact_email: contactEmail,
        operating_hours: operatingHours,
        currency,
        address,
        branch,
        coordinates
      });
      if (error) throw error;
      if (onUpdateHotel && data) onUpdateHotel(data);
      setFeedback('Hotel details saved successfully');
    } catch (err) {
      setFeedback(`Could not save hotel details: ${err?.message || 'unknown error'}`);
    }
    setTimeout(() => setFeedback(null), 3500);
    setSaving(false);
  }

  function handleThemeChange(mode) {
    setThemeMode(mode);
    if (mode === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else if (mode === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      localStorage.removeItem('theme');
    }
    window.dispatchEvent(new Event('storage'));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '880px',
          background: 'var(--bg-card, #FFFFFF)',
          border: '1px solid var(--border, #E8DED1)',
          borderRadius: 'var(--radius-xl, 16px)',
          boxShadow: 'var(--shadow-xl, 0 20px 50px rgba(39, 27, 20, 0.25))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-subtle, #FAF7F2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'var(--primary, #271B14)',
                color: 'var(--accent, #C27835)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-xs)'
              }}
            >
              <Shield size={18} />
            </div>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--text)'
                }}
              >
                Admin Console &amp; Preferences
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                Manage your executive profile, hotel brand credentials, and console configuration
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Left Tab Rail + Right Pane */}
        <div style={{ display: 'flex', flex: 1, minHeight: '460px', overflow: 'hidden' }}>
          {/* Left Tab Rail */}
          <aside
            style={{
              width: '220px',
              borderRight: '1px solid var(--border)',
              background: 'var(--bg-subtle, #FAF7F2)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  padding: '4px 8px'
                }}
              >
                Console Settings
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius, 8px)',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: activeTab === 'profile' ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: activeTab === 'profile' ? 'var(--primary, #271B14)' : 'transparent',
                  color: activeTab === 'profile' ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                <User size={16} color={activeTab === 'profile' ? 'var(--accent, #C27835)' : 'currentColor'} />
                <span>Profile</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('hotel')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius, 8px)',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: activeTab === 'hotel' ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: activeTab === 'hotel' ? 'var(--primary, #271B14)' : 'transparent',
                  color: activeTab === 'hotel' ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Building size={16} color={activeTab === 'hotel' ? 'var(--accent, #C27835)' : 'currentColor'} />
                <span>Hotel Profile</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius, 8px)',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: activeTab === 'settings' ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: activeTab === 'settings' ? 'var(--primary, #271B14)' : 'transparent',
                  color: activeTab === 'settings' ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Sliders size={16} color={activeTab === 'settings' ? 'var(--accent, #C27835)' : 'currentColor'} />
                <span>Settings</span>
              </button>
            </div>

            {/* Active Plan Box in Tab Rail */}
            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius, 8px)',
                background: 'var(--bg-card, #FFFFFF)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent, #C27835)' }}>
                  Active Plan
                </span>
                <Sparkles size={12} color="var(--accent, #C27835)" />
              </div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                {hotel?.plan === 'pro' ? 'Pro Plan Tier' : 'Standard Free Tier'}
              </p>
              <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {hotel?.plan === 'pro' ? 'Multi-table WebAR analytics activated' : 'Essential 3D AR menu features active'}
              </p>
            </div>
          </aside>

          {/* Right Content Pane */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              background: 'var(--bg-card, #FFFFFF)'
            }}
            className="custom-scrollbar"
          >
            {feedback && (
              <div
                style={{
                  padding: '10px 14px',
                  marginBottom: '16px',
                  borderRadius: 'var(--radius, 8px)',
                  background: 'var(--success-subtle, #ecfdf5)',
                  border: '1px solid rgba(21, 128, 61, 0.25)',
                  color: 'var(--success-fg, #15803d)',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Check size={14} />
                <span>{feedback}</span>
              </div>
            )}

            {/* Tab 1: Profile */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Profile Header Card */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px',
                    borderRadius: 'var(--radius, 8px)',
                    background: 'var(--bg-subtle, #FAF7F2)',
                    border: '1px solid var(--border)'
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <input
                      type="file"
                      ref={avatarInputRef}
                      style={{ display: 'none' }}
                      accept="image/*"
                      onChange={handleAvatarUpload}
                    />
                    <div
                      style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        background: 'var(--primary, #271B14)',
                        color: 'var(--accent, #C27835)',
                        fontFamily: 'var(--font-serif)',
                        fontWeight: 700,
                        fontSize: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid var(--border)',
                        overflow: 'hidden',
                        position: 'relative'
                      }}
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Admin avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        initials
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      title="Upload profile photo"
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: 'var(--accent, #C27835)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 'var(--shadow-xs)',
                        border: 'none',
                        cursor: uploadingAvatar ? 'wait' : 'pointer',
                        padding: 0
                      }}
                    >
                      <Camera size={11} />
                    </button>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                        {adminName}
                      </h4>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full, 9999px)',
                          background: 'var(--accent-subtle, rgba(194, 120, 53, 0.12))',
                          color: 'var(--accent, #C27835)',
                          border: '1px solid var(--border)'
                        }}
                      >
                        {adminRole}
                      </span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {adminEmail} • {branch || 'Main Location'}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      Official Role / Designation
                    </label>
                    <input
                      type="text"
                      value={adminRole}
                      onChange={(e) => setAdminRole(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      Direct Phone Number
                    </label>
                    <input
                      type="tel"
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: '7px 16px',
                      borderRadius: 'var(--radius, 8px)',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: '7px 18px',
                      borderRadius: 'var(--radius, 8px)',
                      border: 'none',
                      background: 'var(--primary, #271B14)',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: saving ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Check size={14} color="var(--accent, #C27835)" />
                    <span>{saving ? 'Saving…' : 'Save Profile Changes'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 2: Hotel Profile */}
            {activeTab === 'hotel' && (
              <form onSubmit={handleSaveHotel} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px',
                    borderRadius: 'var(--radius, 8px)',
                    background: 'var(--bg-subtle, #FAF7F2)',
                    border: '1px solid var(--border)'
                  }}
                >
                  <input
                    type="file"
                    ref={logoInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleLogoUpload}
                  />
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: 'var(--radius, 8px)',
                      background: 'var(--primary, #271B14)',
                      color: 'var(--accent, #C27835)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                      position: 'relative'
                    }}
                  >
                    {logoUrl ? (
                      <img src={logoUrl} alt="Hotel logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <Building size={24} />
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                          {hotelName}
                        </h4>
                        <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {subdomain ? `${subdomain}.menu` : 'Live Menu URL'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          background: 'var(--bg-card, #FFFFFF)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: uploadingLogo ? 'wait' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <UploadCloud size={13} color="var(--accent, #C27835)" />
                        <span>{uploadingLogo ? 'Uploading…' : logoUrl ? 'Change Logo' : 'Upload Brand Logo'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      Hotel / Restaurant Name
                    </label>
                    <input
                      type="text"
                      value={hotelName}
                      onChange={(e) => setHotelName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>
                        Subdomain / Dining URL
                      </label>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        🔒 Live URL Key
                      </span>
                    </div>
                    <input
                      type="text"
                      value={subdomain}
                      readOnly
                      title="Subdomain is registered during hotel onboarding to preserve live QR code stability"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-muted, #F0E8DC)',
                        color: 'var(--text-muted)',
                        fontSize: '12px',
                        boxSizing: 'border-box',
                        cursor: 'not-allowed'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      Branch / Location
                    </label>
                    <input
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="INR">INR - ₹ Indian Rupee</option>
                      <option value="USD">USD - $ United States Dollar</option>
                      <option value="EUR">EUR - € Euro</option>
                      <option value="GBP">GBP - £ British Pound</option>
                      <option value="AED">AED - د.إ UAE Dirham</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Hotel Address &amp; Pinpoint Map Location
                  </label>
                  <MapLocationPicker
                    value={address}
                    onChange={(newAddr) => setAddress(newAddr)}
                    coordinates={coordinates}
                    onCoordinatesChange={(newCoords) => setCoordinates(newCoords)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      Support Email
                    </label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      Contact Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      Operating Hours
                    </label>
                    <input
                      type="text"
                      value={operatingHours}
                      placeholder="e.g. Mon–Sun 11:00 AM – 11:00 PM"
                      onChange={(e) => setOperatingHours(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: '7px 18px',
                      borderRadius: 'var(--radius, 8px)',
                      border: 'none',
                      background: 'var(--primary, #271B14)',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: saving ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Check size={14} color="var(--accent, #C27835)" />
                    <span>{saving ? 'Saving…' : 'Save Hotel Details'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 3: Settings */}
            {activeTab === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '10px' }}>
                    Console Color Theme
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {[
                      { id: 'light', label: 'Light Mode' },
                      { id: 'dark', label: 'Dark Mode' },
                      { id: 'system', label: 'System Auto' }
                    ].map((opt) => (
                      <label
                        key={opt.id}
                        onClick={() => handleThemeChange(opt.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius, 8px)',
                          border: `1px solid ${themeMode === opt.id ? 'var(--accent, #C27835)' : 'var(--border)'}`,
                          background: themeMode === opt.id ? 'var(--accent-subtle, rgba(194, 120, 53, 0.12))' : 'var(--bg-subtle)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text)'
                        }}
                      >
                        <input
                          type="radio"
                          name="theme_mode"
                          checked={themeMode === opt.id}
                          onChange={() => handleThemeChange(opt.id)}
                          style={{ accentColor: 'var(--accent, #C27835)' }}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Dashboard Typography
                  </label>
                  <select
                    value={typography}
                    onChange={(e) => handleTypographyChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-subtle, #FAF7F2)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="Playfair Display">Playfair Display (Luxury Serif)</option>
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans (Modern Clean)</option>
                    <option value="Inter">Inter (Executive Neutral)</option>
                    <option value="Cormorant Garamond">Cormorant Garamond (Classical Elegance)</option>
                    <option value="Bodoni Moda">Bodoni Moda (Editorial Fashion)</option>
                    <option value="Jost">Jost (Geometric Minimalist)</option>
                    <option value="Figtree">Figtree (Friendly Contemporary)</option>
                  </select>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Applies typography dynamically across all console pages, headers, navigation, and dialogs.
                  </p>
                </div>

                <div
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-subtle, #FAF7F2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>
                        {hotel?.plan === 'pro' ? 'Pro Plan Tier' : 'Standard Free Tier'}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-full, 9999px)',
                          background: 'var(--success-subtle, #ecfdf5)',
                          color: 'var(--success-fg, #15803d)',
                          border: '1px solid rgba(21, 128, 61, 0.25)'
                        }}
                      >
                        Active Tier
                      </span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {hotel?.plan === 'pro'
                        ? 'Unlimited WebAR menu sessions, custom branding standee generator, and priority SLA.'
                        : 'Core digital 3D menu catalog, standard QR standee export, and platform support.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPlanDetails(prev => !prev)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-card, #FFFFFF)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-xs)'
                    }}
                  >
                    {showPlanDetails ? 'Hide Plan Details' : 'View Plan Details'}
                  </button>
                </div>

                {showPlanDetails && (
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: '8px',
                      background: 'var(--bg-subtle, #FAF7F2)',
                      border: '1px solid var(--border)',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Account Tier</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{hotel?.plan === 'pro' ? 'Pro Tier Organization' : 'Standard Free Tier'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Billing Cycle</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>Monthly</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Need Plan Changes?</span>
                      <a href={buildSuperAdminMailUrl(superAdminEmail, 'billing', { hotel, ownerEmail: userEmail })} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Email Super Admin →</a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
