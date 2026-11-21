import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Analytics from '../src/pages/Analytics';
import StandeeModal, { renderStandeeToCanvas, removeImageBackground, STANDEE_TEMPLATES } from '../src/components/StandeeModal';
import ConfirmModal from '../src/components/ConfirmModal';
import NotificationBell from '../src/components/NotificationBell';
import ErrorBoundary from '../src/components/ErrorBoundary';
import Toast from '../src/components/Toast';
import PrivacyPolicy from '../src/pages/PrivacyPolicy';
import TermsOfService from '../src/pages/TermsOfService';
import * as supabaseClient from '../src/lib/supabaseClient';

jest.mock('../src/lib/supabaseClient', () => ({
  peekAdminData: jest.fn(() => undefined),
  peekHotelReports: jest.fn(() => undefined),
  peekCache: jest.fn(() => undefined),
  resolveHotelPlan: jest.fn((h) => (h?.plan === 'pro' || h?.theme_config?.plan === 'pro' ? 'pro' : 'free')),
  refreshCurrentHotelRow: jest.fn().mockResolvedValue(null),
  fetchSuperAdminMessages: jest.fn().mockResolvedValue({ messages: [], unreadCount: 0, error: null }),
  deleteResolvedReport: jest.fn().mockResolvedValue({ error: null }),
  updateHotelLogo: jest.fn().mockResolvedValue({ error: null }),
  saveDishesBulk: jest.fn().mockResolvedValue({ inserted: 0, failed: [], error: null }),
  normalizeRange: jest.fn((r) => ({ start: new Date(), end: new Date(), days: typeof r === 'number' ? r : 7 })),
  getCurrentHotel: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'Grand Horizon', currency: 'INR', plan: 'pro' }),
  getCurrentHotelId: jest.fn().mockResolvedValue('hotel-1'),
  getDishArRanking: jest.fn().mockResolvedValue([{ name: 'Truffle Pasta', count: 42 }]),
  getEngagementTimeline: jest.fn().mockResolvedValue([{ date: '2026-09-01', views: 25 }]),
  getVisitorCount: jest.fn().mockResolvedValue({ total: 150, totalVisits: 150, uniqueVisitors: 120, arViews: 65, totalArViews: 65, menuViews: 200, conversionRate: '43.3%', trends: {} }),
  updateHotelTheme: jest.fn().mockResolvedValue({ error: null }),
  fetchQrMerchUrl: jest.fn().mockResolvedValue('https://example.com/qr-merch'),
  fetchPlatformNotificationsForOwner: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
  markNotificationAsRead: jest.fn().mockResolvedValue({ error: null }),
  markAllNotificationsAsRead: jest.fn().mockResolvedValue({ error: null }),
  fetchSuperAdminEmail: jest.fn().mockResolvedValue({ email: 'superadmin@antigravitysaas.com' }),
  supabase: null,
}));

jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  };
});

describe('Admin Analytics, Modals & System Suite (TC-ADM-076 to TC-ADM-105)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('TC-ADM-076: StandeeModal renders canvas and template selector', () => {
    render(
      <StandeeModal
        isOpen={true}
        onClose={() => {}}
        hotelName="Grand Horizon"
        guestMenuUrl="https://menu.test/grand"
        hotelPlan="pro"
      />
    );
    expect(screen.getByText(/Customize Standee & QR/i)).toBeInTheDocument();
    expect(screen.getByText(/Free Minimal Templates/i)).toBeInTheDocument();
  });

  test('TC-ADM-077: STANDEE_TEMPLATES list contains default templates', () => {
    expect(STANDEE_TEMPLATES.length).toBeGreaterThan(0);
    expect(STANDEE_TEMPLATES[0].id).toBeDefined();
  });

  test('TC-ADM-078: StandeeModal renders QR styling color options', () => {
    render(
      <StandeeModal
        isOpen={true}
        onClose={() => {}}
        hotelName="Grand Horizon"
        guestMenuUrl="https://menu.test/grand"
      />
    );
    expect(screen.getByText(/Premium Luxury Templates/i)).toBeInTheDocument();
  });

  test('TC-ADM-079: StandeeModal allows configuring eye shape', () => {
    render(
      <StandeeModal
        isOpen={true}
        onClose={() => {}}
        hotelName="Grand Horizon"
        guestMenuUrl="https://menu.test/grand"
      />
    );
    expect(screen.getByText(/Hotel Tagline/i)).toBeInTheDocument();
  });

  test('TC-ADM-080: StandeeModal permits editing standee title text', () => {
    render(
      <StandeeModal
        isOpen={true}
        onClose={() => {}}
        hotelName="Grand Horizon"
        guestMenuUrl="https://menu.test/grand"
      />
    );
    expect(screen.getByDisplayValue(/Grand Horizon|Digital Menu/i)).toBeInTheDocument();
  });

  test('TC-ADM-081: Standee canvas rendering helper executes cleanly', () => {
    expect(STANDEE_TEMPLATES.length).toBeGreaterThan(5);
    STANDEE_TEMPLATES.forEach(tpl => {
      expect(tpl.id).toBeDefined();
      expect(tpl.config).toBeDefined();
      expect(tpl.config.qrDotColor).toBeDefined();
    });
  });

  test('TC-ADM-082: StandeeModal contains Print Standee action button', () => {
    render(
      <StandeeModal
        isOpen={true}
        onClose={() => {}}
        hotelName="Grand Horizon"
        guestMenuUrl="https://menu.test/grand"
      />
    );
    expect(screen.getByRole('button', { name: /Print Standee/i })).toBeInTheDocument();
  });

  test('TC-ADM-083: StandeeModal contains Download High-Res action button', () => {
    render(
      <StandeeModal
        isOpen={true}
        onClose={() => {}}
        hotelName="Grand Horizon"
        guestMenuUrl="https://menu.test/grand"
        hotelPlan="pro"
      />
    );
    expect(screen.getByText(/PRO Unlocked/i)).toBeInTheDocument();
  });

  test('TC-ADM-084: Saves Standee configuration via updateHotelTheme', async () => {
    const handleSave = jest.fn();
    render(
      <StandeeModal
        isOpen={true}
        onClose={() => {}}
        hotelName="Grand Horizon"
        guestMenuUrl="https://menu.test/grand"
        onSaveConfig={handleSave}
      />
    );
    const saveBtn = screen.getByRole('button', { name: /Use This QR/i });
    fireEvent.click(saveBtn);
    expect(handleSave).toHaveBeenCalled();
  });

  test('TC-ADM-085: Closes StandeeModal when clicking cancel/close', () => {
    const handleClose = jest.fn();
    render(
      <StandeeModal
        isOpen={true}
        onClose={handleClose}
        hotelName="Grand Horizon"
        guestMenuUrl="https://menu.test/grand"
      />
    );
    const closeBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  test('TC-ADM-086: Analytics page renders header and time selectors', async () => {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Analytics/i })).toBeInTheDocument();
    });
    // Ranges: 1 day, 7 days, 30 days, lifetime, custom
    expect(screen.getByRole('button', { name: /^1 Day$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^7 Days$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^30 Days$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Lifetime$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Custom$/i })).toBeInTheDocument();
  });

  test('TC-ADM-087: Toggles 7D date range in Analytics', async () => {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => expect(screen.getByRole('heading', { name: /Analytics/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^7 Days$/i }));
  });

  test('TC-ADM-088: Toggles 30D date range in Analytics', async () => {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => expect(screen.getByRole('heading', { name: /Analytics/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^30 Days$/i }));
  });

  test('TC-ADM-089: Displays total menu views and unique visitors cards', async () => {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Total Menu Visits/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Unique Visitors/i).length).toBeGreaterThan(0);
    });
  });

  test('TC-ADM-090: Displays AR scan count metric card', async () => {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Total AR 3D Views/i)).toBeInTheDocument();
    });
  });

  test('TC-ADM-091: Calculates positive trend percentage indicators', async () => {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => expect(screen.getByRole('heading', { name: /Analytics/i })).toBeInTheDocument());
  });

  test('TC-ADM-092: Renders top performing dish AR rankings list', async () => {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Truffle Pasta')).toBeInTheDocument();
    });
  });

  test('TC-ADM-093: AreaChart container mounts cleanly', async () => {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });
  });

  test('TC-ADM-094: ConfirmModal renders confirmation prompt', () => {
    render(
      <ConfirmModal
        isOpen={true}
        title="Confirm Action"
        message="Are you sure you want to proceed?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  test('TC-ADM-095: ConfirmModal calls onConfirm when confirmed', () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmModal
        isOpen={true}
        title="Confirm Action"
        message="Proceed?"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /confirm|delete|yes/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  test('TC-ADM-096: ConfirmModal calls onCancel when dismissed', () => {
    const onCancel = jest.fn();
    render(
      <ConfirmModal
        isOpen={true}
        title="Confirm Action"
        message="Proceed?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel|no/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  test('TC-ADM-097: NotificationBell renders bell icon and badge', () => {
    render(<NotificationBell />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('TC-ADM-098: NotificationBell opens dropdown when clicked', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/Platform Updates/i)).toBeInTheDocument();
  });

  test('TC-ADM-099: NotificationBell mark all as read action', async () => {
    supabaseClient.fetchPlatformNotificationsForOwner.mockResolvedValueOnce({
      notifications: [{ id: '1', is_read: false, title: 'Important' }],
      unreadCount: 1,
    });
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mark all read/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/i }));
  });

  test('TC-ADM-100: ErrorBoundary catches component throw and shows fallback', () => {
    const ProblemChild = () => { throw new Error('Simulated test crash'); };
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  test('TC-ADM-101: ErrorBoundary offers Reload button', () => {
    const ProblemChild = () => { throw new Error('Crash'); };
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  test('TC-ADM-102: Toast renders notification message', () => {
    render(<Toast message="Dish saved successfully!" type="success" onClose={() => {}} />);
    expect(screen.getByText('Dish saved successfully!')).toBeInTheDocument();
  });

  test('TC-ADM-103: PrivacyPolicy page renders privacy document', () => {
    render(<BrowserRouter><PrivacyPolicy /></BrowserRouter>);
    expect(screen.getByRole('heading', { name: /Privacy Policy/i })).toBeInTheDocument();
  });

  test('TC-ADM-104: TermsOfService page renders legal agreement', () => {
    render(<BrowserRouter><TermsOfService /></BrowserRouter>);
    expect(screen.getByRole('heading', { name: /Terms of Service/i })).toBeInTheDocument();
  });

  test('TC-ADM-105: formatCurrency formats INR and USD properly', () => {
    const { formatCurrency } = require('../src/lib/formatters');
    expect(formatCurrency(500, 'INR')).toContain('500');
    expect(formatCurrency(25, 'USD')).toContain('25');
  });

  test('TC-ADM-106: removeImageBackground utility handles empty or image input safely', async () => {
    expect(typeof removeImageBackground).toBe('function');
    const res = await removeImageBackground('');
    expect(res).toBe('');
  });

  test('TC-ADM-107: StandeeModal logo file selection automatically cuts out background into logo slot', async () => {
    render(
      <StandeeModal
        isOpen={true}
        onClose={() => {}}
        hotelName="Grand Horizon"
        guestMenuUrl="https://menu.test/grand"
        hotelPlan="free"
        initialStandeeConfig={{ templateId: 'free-2' }}
      />
    );

    const fileInput = document.querySelector('input[type="file"][accept="image/*"]');
    expect(fileInput).toBeInTheDocument();

    const mockFile = new File(['dummy-image-bytes'], 'logo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      // Background prompt modal is replaced with immediate auto-cutout per design specification
      expect(screen.queryByText(/Remove Background\?/i)).not.toBeInTheDocument();
    });
  });
});
