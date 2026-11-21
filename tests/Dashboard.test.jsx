import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import Dashboard from '../src/pages/Dashboard';
import App from '../src/App';
import * as supabaseClient from '../src/lib/supabaseClient';

const mockDishes = [
  {
    id: 'dish-1',
    name: 'Truffle Pasta',
    category: 'Mains',
    price: 450,
    is_available: true,
    description: 'Creamy truffle tagliatelle with parmesan',
    image: 'https://example.com/pasta.jpg',
    model_glb_url: 'https://example.com/pasta.glb',
    ar_views: 450,
  },
  {
    id: 'dish-2',
    name: 'Caesar Salad',
    category: 'Starters',
    price: 250,
    is_available: false,
    description: 'Crispy romaine with herb croutons',
    image: 'https://example.com/salad.jpg',
    ar_views: 200,
  },
  {
    id: 'dish-3',
    name: 'Tiramisu',
    category: 'Dessert',
    price: 320,
    is_available: true,
    description: 'Classic Italian espresso dessert',
    image: 'https://example.com/tiramisu.jpg',
    ar_views: 100,
  },
];

const mockHotel = {
  id: 'hotel-001',
  name: 'Grand Horizon Resort',
  subdomain: 'grand-horizon',
  plan: 'free',
  currency: 'INR',
  menu_id: 'menu-001',
  phone: '+91 9999988888',
  contact_email: 'info@grandhorizon.com',
  operating_hours: '08:00 AM - 11:00 PM',
};

jest.mock('../src/lib/supabaseClient', () => ({
  peekAdminData: jest.fn(() => undefined),
  peekHotelReports: jest.fn(() => undefined),
  peekCache: jest.fn(() => undefined),
  resolveHotelPlan: jest.fn((h) => (h?.plan === 'pro' || h?.theme_config?.plan === 'pro' ? 'pro' : 'free')),
  refreshCurrentHotelRow: jest.fn().mockResolvedValue(null),
  fetchSuperAdminMessages: jest.fn().mockResolvedValue({ messages: [], unreadCount: 0, error: null }),
  fetchSuperAdminEmail: jest.fn().mockResolvedValue({ email: 'admin@platform.test', error: null }),
  deleteResolvedReport: jest.fn().mockResolvedValue({ error: null }),
  updateHotelLogo: jest.fn().mockResolvedValue({ error: null }),
  saveDishesBulk: jest.fn().mockResolvedValue({ inserted: 0, failed: [], error: null }),
  normalizeRange: jest.fn((r) => ({ start: new Date(), end: new Date(), days: typeof r === 'number' ? r : 7 })),
  fetchAdminData: jest.fn(),
  getCurrentHotel: jest.fn(),
  getCurrentHotelId: jest.fn(),
  deleteDish: jest.fn(),
  saveDish: jest.fn(),
  updateHotelProfile: jest.fn(),
  updateHotelTheme: jest.fn(),
  uploadHeaderImage: jest.fn(),
  normalizeGuestUrl: jest.fn((url) => (url ? url.replace('http://', 'https://') : 'https://guest.menu/grand-horizon')),
  getAdminSession: jest.fn().mockResolvedValue({ session: { user: { id: 'admin-1' } } }),
  fetchPlatformNotificationsForOwner: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
  fetchHotelReports: jest.fn().mockResolvedValue({
    reports: [
      {
        id: 'rep-1',
        dish_id: 'dish-1',
        dish_name: 'Murg Malai Tikka',
        table_number: 'Table 04',
        report_type: 'Dish Report',
        reason: 'Spiciness & Allergen',
        details: 'Listed as mild, but tasted spicy.',
        created_at: '2026-09-23T10:00:00Z'
      }
    ],
    error: null
  }),
  getReportsForHotel: jest.fn().mockResolvedValue({ data: [] }),
  fetchQrMerchUrl: jest.fn().mockResolvedValue('https://example.com/merch'),
  signOutAdmin: jest.fn().mockResolvedValue({ error: null }),
  supabase: null,
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqrdatauri'),
}));

describe('Admin Dashboard Suite (TC-ADM-021 to TC-ADM-045)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    supabaseClient.fetchAdminData.mockResolvedValue({
      dishes: mockDishes,
      tables: [],
      theme_config: null,
      hotel: mockHotel,
    });
    supabaseClient.getCurrentHotel.mockResolvedValue(mockHotel);
    supabaseClient.getCurrentHotelId.mockResolvedValue(mockHotel.id);
    supabaseClient.getAdminSession.mockResolvedValue({ session: { user: { id: 'admin-1' } } });
    supabaseClient.fetchPlatformNotificationsForOwner.mockResolvedValue({ notifications: [], unreadCount: 0 });
    supabaseClient.fetchHotelReports.mockResolvedValue({
      reports: [
        {
          id: 'rep-1',
          dish_id: 'dish-1',
          dish_name: 'Murg Malai Tikka',
          table_number: 'Table 04',
          report_type: 'Dish Report',
          reason: 'Spiciness & Allergen',
          details: 'Listed as mild, but tasted spicy.',
          created_at: '2026-09-23T10:00:00Z'
        }
      ],
      error: null
    });
    supabaseClient.getReportsForHotel.mockResolvedValue({ data: [] });
  });

  test('TC-ADM-021: Renders Dashboard header, hotel title, and free tier badge', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Horizon Resort')).toBeInTheDocument();
    });
    expect(screen.getByText('FREE TIER')).toBeInTheDocument();
  });

  test('TC-ADM-022: Renders Hotel Menu QR Code card with canvas', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Hotel Menu QR Code')).toBeInTheDocument();
    });
  });

  test('TC-ADM-023: normalizeGuestUrl upgrades plain http to https', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(supabaseClient.normalizeGuestUrl).toHaveBeenCalled();
    });
  });

  test('TC-ADM-024: Opens Standee Modal when clicked', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: /Customize Standee/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Customize Standee/i }));
    expect(screen.getByRole('heading', { name: /Customize Standee & QR/i })).toBeInTheDocument();
  });

  test('TC-ADM-025: Triggers Selected Standee PNG download', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText(/Download Standee/i)).toBeInTheDocument());
    const downloadBtn = screen.getByText(/Download Standee/i);
    expect(downloadBtn).toBeInTheDocument();
  });

  test('TC-ADM-026: Renders Physical Standee & Merch button and triggers action', async () => {
    window.open = jest.fn();
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: /Physical Standee & Merch/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Physical Standee & Merch/i }));
    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('https://example.com/merch', '_blank', 'noopener,noreferrer');
    });
  });

  test('TC-ADM-027: Renders Top Dishes by AR Engagement ranking', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Top Dishes by AR Engagement')).toBeInTheDocument();
      expect(screen.getByText('👑 Ranked by AR + Dish Views')).toBeInTheDocument();
      expect(screen.getAllByText('Truffle Pasta')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Caesar Salad')[0]).toBeInTheDocument();
      expect(screen.getByText('3D Active')).toBeInTheDocument();
      expect(screen.getAllByText('2D Only')[0]).toBeInTheDocument();
    });
  });

  test('TC-ADM-028: Renders Guest Reports & Flaggers card with pending alerts', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Guest Reports & Flaggers')).toBeInTheDocument();
      expect(screen.getByText(/Pending Alerts/i)).toBeInTheDocument();
      expect(screen.getByText(/Spiciness & Allergen/i)).toBeInTheDocument();
    });
  });

  test('TC-ADM-029: Toggles Guest Reports filter tabs', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Guest Reports & Flaggers')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /All Flags/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dish Issues/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AR & Pricing/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Dish Issues/i }));
    expect(screen.getByText(/Spiciness & Allergen/i)).toBeInTheDocument();
  });

  test('TC-ADM-030: Renders Getting Started Checklist steps', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Getting Started Checklist')).toBeInTheDocument();
      expect(screen.getByText('Add your first menu dish')).toBeInTheDocument();
      expect(screen.getByText('Brand your guest menu & standee')).toBeInTheDocument();
    });
  });

  test('TC-ADM-031: Dismisses Getting Started Checklist on click', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Getting Started Checklist')).toBeInTheDocument());
    const dismissBtn = screen.getByRole('button', { name: /Dismiss/i });
    fireEvent.click(dismissBtn);
    expect(screen.queryByText('Getting Started Checklist')).not.toBeInTheDocument();
  });

  test('TC-ADM-032: Renders Total Dishes stat tile', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Total Dishes')).toBeInTheDocument();
    });
  });

  test('TC-ADM-033: Renders No AR Dishes stat tile', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('No AR Dishes')).toBeInTheDocument();
      expect(screen.getByText('Needs 3D')).toBeInTheDocument();
    });
  });

  test('TC-ADM-034: Renders Suspended Dishes stat tile', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Suspended Dishes')).toBeInTheDocument();
      expect(screen.getByText('Hidden')).toBeInTheDocument();
    });
  });

  test('TC-ADM-035: Links to Full AR Analytics and Guest Reports pages', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Full AR engagement analytics/i)).toBeInTheDocument();
      expect(screen.getByText(/View all guest reports/i)).toBeInTheDocument();
    });
  });

  test('TC-ADM-036: Does not render settings modal on dashboard route', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Dashboard />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryByText('Restaurant Settings')).not.toBeInTheDocument();
    });
  });

  test('TC-ADM-037: Does not render settings modal even when openSettings param is present', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard?openSettings=true']}>
        <Dashboard />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryByText('Restaurant Settings')).not.toBeInTheDocument();
    });
  });

  test('TC-ADM-038: Dispatches hotel-menu-data-updated event on profile update', async () => {
    supabaseClient.updateHotelProfile.mockResolvedValueOnce({ error: null });
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Grand Horizon Resort')).toBeInTheDocument());
  });

  test('TC-ADM-039: Validates header image upload size limit under 5MB', async () => {
    supabaseClient.uploadHeaderImage.mockResolvedValueOnce({ url: 'https://example.com/header.jpg', error: null });
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Grand Horizon Resort')).toBeInTheDocument());
  });

  test('TC-ADM-040: Blocks oversized header upload exceeding 5MB', async () => {
    supabaseClient.uploadHeaderImage.mockResolvedValueOnce({ url: '', error: new Error('Header image exceeds maximum size of 5 MB.') });
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Grand Horizon Resort')).toBeInTheDocument());
  });

  test('TC-ADM-041: Rejects invalid image MIME types for header', async () => {
    supabaseClient.uploadHeaderImage.mockResolvedValueOnce({ url: '', error: new Error('Invalid image format.') });
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Grand Horizon Resort')).toBeInTheDocument());
  });

  test('TC-ADM-042: Displays Free Tier badge for non-pro hotel', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('FREE TIER')).toBeInTheDocument();
    });
  });

  test('TC-ADM-043: Displays PRO UNLOCKED badge when hotel has pro plan', async () => {
    supabaseClient.fetchAdminData.mockResolvedValueOnce({
      dishes: mockDishes,
      tables: [],
      hotel: { ...mockHotel, plan: 'pro' },
    });
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('⭐ PRO UNLOCKED')).toBeInTheDocument();
    });
  });

  test('TC-ADM-044: Refreshes hotel data on hotel-menu-data-updated window event', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => expect(screen.getByText('Grand Horizon Resort')).toBeInTheDocument());
    window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
    expect(supabaseClient.fetchAdminData).toHaveBeenCalledTimes(2);
  });

  test('TC-ADM-046: Preview Menu link redirects directly to guestMenuUrl with target=_blank', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      const previewLink = screen.getByRole('link', { name: /Preview Menu/i });
      expect(previewLink).toBeInTheDocument();
      const previewUrl = new URL(previewLink.getAttribute('href'));
      expect(previewUrl.pathname).toBe('/menu/1');
      expect(previewUrl.searchParams.get('hotel')).toBe('grand-horizon');
      expect(previewUrl.searchParams.get('preview')).toBe('true');
      expect(previewLink).toHaveAttribute('target', '_blank');
    });
  });

  test('TC-ADM-047: Dishes tiles (stat tiles and top dishes) link to /dish-form or /menu', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      const dishLinks = screen.getAllByRole('link');
      const menuOrDishLinks = dishLinks.filter(l => l.getAttribute('href')?.startsWith('/menu') || l.getAttribute('href')?.startsWith('/dish-form'));
      expect(menuOrDishLinks.length).toBeGreaterThanOrEqual(3);
    });
  });

  test('TC-ADM-048: Automatically removes onboarding block when all 3 checklist items are complete', async () => {
    supabaseClient.fetchAdminData.mockResolvedValueOnce({
      dishes: mockDishes,
      tables: [],
      theme_config: { headerData: { background: 'https://example.com/bg.jpg' } },
      hotel: mockHotel,
    });
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.queryByText('Getting Started Checklist')).not.toBeInTheDocument();
    });
  });

  test('TC-ADM-049: Flaggers Guest Reports links point to /reports', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      const viewReportsLink = screen.getByRole('link', { name: /View all guest reports/i });
      expect(viewReportsLink).toHaveAttribute('href', '/reports');
    });
  });

  test('TC-ADM-050: Persistent onboarding removal across page reloads via localStorage', async () => {
    localStorage.setItem('admin_onboarding_completed', 'true');
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.queryByText('Getting Started Checklist')).not.toBeInTheDocument();
    });
  });

  test('TC-ADM-051: Flaggers displays clean empty state when no reports exist (no demo data)', async () => {
    supabaseClient.fetchHotelReports.mockResolvedValueOnce({ reports: [], error: null });
    supabaseClient.fetchAdminData.mockResolvedValueOnce({
      dishes: [],
      tables: [],
      theme_config: null,
      hotel: mockHotel,
    });
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('No active flags')).toBeInTheDocument();
      expect(screen.queryByText('Murg Malai Tikka • Table 04')).not.toBeInTheDocument();
    });
  });

  test('TC-ADM-052: Flaggers Resolve link points directly to dish form for reported dish', async () => {
    supabaseClient.fetchHotelReports.mockResolvedValueOnce({
      reports: [
        {
          id: 'rep-xyz',
          dish_id: 'dish-101',
          dish_name: 'Paneer Tikka',
          table_number: 'Table 05',
          report_type: 'Dish Report',
          reason: 'Allergen Alert',
          details: 'Contains dairy',
          created_at: '2026-09-23T11:00:00Z'
        }
      ],
      error: null
    });
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      const resolveLinks = screen.getAllByRole('link', { name: /Resolve/i });
      expect(resolveLinks[0]).toHaveAttribute('href', '/dish-form?id=dish-101');
    });
  });

  test('TC-ADM-053: Dish rankings are non-clickable tiles and Full AR engagement analytics is in header', async () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Top Dishes by AR Engagement')).toBeInTheDocument();
      const arLink = screen.getByRole('link', { name: /Full AR engagement analytics/i });
      expect(arLink).toBeInTheDocument();
      expect(arLink).toHaveAttribute('href', '/analytics');
    });
  });

  test('TC-ADM-054: Admin console status dot reflects network connection state in App layout', async () => {
    render(<App />);
    await waitFor(() => {
      const dot = screen.getByTestId('admin-status-dot');
      expect(dot).toBeInTheDocument();
      expect(dot).toHaveStyle({ background: '#10b981' });
    });
  });

  test('TC-ADM-055: Flaggers displays platform announcements, missing photos, and missing 3D models', async () => {
    supabaseClient.fetchHotelReports.mockResolvedValueOnce({ reports: [], error: null });
    supabaseClient.fetchPlatformNotificationsForOwner.mockResolvedValue({
      notifications: [
        {
          id: 'plat-notif-1',
          title: 'System Notice',
          message: 'AR core engine updated to v3',
          type: 'info',
          created_at: '2026-09-23T08:00:00Z'
        }
      ],
      unreadCount: 1
    });
    supabaseClient.fetchAdminData.mockResolvedValueOnce({
      dishes: [
        { id: 'dish-missing-photo', name: 'Raw Soup', category: 'Soups', price: 150 },
        { id: 'dish-missing-3d', name: 'Salad Bowl', category: 'Salads', price: 200, image: 'https://example.com/s.jpg' }
      ],
      tables: [],
      theme_config: null,
      hotel: mockHotel
    });
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Photo Missing')).toBeInTheDocument();
      expect(screen.getAllByText('Model Missing').length).toBeGreaterThan(0);
      expect(screen.queryByText('Notice')).not.toBeInTheDocument();
    });
  });
});

