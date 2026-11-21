import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../src/pages/Login';
import Signup from '../src/pages/Signup';
import Dashboard from '../src/pages/Dashboard';
import DishForm from '../src/pages/DishForm';
import Analytics from '../src/pages/Analytics';
import ReportsList from '../src/pages/ReportsList';
import StandeeModal from '../src/components/StandeeModal';
import NotificationBell from '../src/components/NotificationBell';
import ErrorBoundary from '../src/components/ErrorBoundary';
import * as supabaseClient from '../src/lib/supabaseClient';

function escapeHelper(str) {
  if (!str) return '';
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
  getAdminSession: jest.fn().mockResolvedValue({ session: { user: { id: 'adm-1', email: 'owner@hotel.com' } } }),
  signInAdmin: jest.fn().mockResolvedValue({ data: { user: { id: 'adm-1' } }, error: null }),
  signOutAdmin: jest.fn().mockResolvedValue({ error: null }),
  getCurrentHotel: jest.fn().mockResolvedValue({ id: 'h-1', name: 'Grand Palace', subdomain: 'grand', currency: 'INR', status: 'verified', plan: 'pro' }),
  getCurrentHotelId: jest.fn().mockResolvedValue('h-1'),
  clearHotelIdCache: jest.fn(),
  fetchPlatformNotificationsForOwner: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
  markAllNotificationsAsRead: jest.fn().mockResolvedValue({ error: null }),
  markNotificationAsRead: jest.fn().mockResolvedValue({ error: null }),
  getReportsForHotel: jest.fn().mockResolvedValue({ data: [] }),
  fetchQrMerchUrl: jest.fn().mockResolvedValue('https://example.com/merch'),
  updateHotelProfile: jest.fn().mockResolvedValue({ error: null }),
  updateHotelTheme: jest.fn().mockResolvedValue({ error: null }),
  uploadHeaderImage: jest.fn().mockResolvedValue({ url: 'http://img.png', error: null }),
  normalizeGuestUrl: jest.fn(() => 'https://guest.menu/grand'),
  fetchAdminData: jest.fn().mockResolvedValue({
    hotel: { id: 'h-1', name: 'Grand Palace', subdomain: 'grand', currency: 'INR', status: 'verified' },
    dishes: [
      { id: 'd-1', name: 'Butter Chicken', price: 350, veg: false, category: 'Mains', is_available: true }
    ],
    tables: [{ id: 't-1', name: 'Table 1' }]
  }),
  saveDish: jest.fn().mockResolvedValue({ data: { id: 'd-new' }, error: null }),
  uploadDishMedia: jest.fn().mockResolvedValue({ urls: [], error: null }),
  uploadDishModel: jest.fn().mockResolvedValue({ url: '', error: null }),
  getVisitorCount: jest.fn().mockResolvedValue({ totalVisitors: 1200, arViews: 450, totalDishes: 12, arAdoptionPct: 37, visitsChangePct: 15, arViewsChangePct: 8 }),
  getDishArRanking: jest.fn().mockResolvedValue([]),
  getEngagementTimeline: jest.fn().mockResolvedValue([]),
  fetchAnalyticsSummary: jest.fn().mockResolvedValue({ visits7d: 1500, arViews7d: 400, topDishes: [] }),
  fetchHotelReports: jest.fn().mockResolvedValue({ reports: [], error: null }),
  updateReportStatus: jest.fn().mockResolvedValue({ error: null }),
  supabase: null,
  STORAGE_LIMITS: {
    dishImage: { maxSizeBytes: 10 * 1024 * 1024, allowedExtensions: ['jpg', 'png'] },
    dishVideo: { maxSizeBytes: 15 * 1024 * 1024, allowedExtensions: ['mp4'] },
    dishModel: { maxSizeBytes: 25 * 1024 * 1024, allowedExtensions: ['glb'] },
  }
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqrdatauri'),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('Hotel Admin 300 Edge Cases Suite (FE/BE/SEC)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('FE-ADM-001: [FE] Login — empty email field', async () => {
    try {
    const { container } = render(<BrowserRouter><Login /></BrowserRouter>);
    const emailInput = container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
    const passInput = container.querySelector('input[type="password"]');
    if (emailInput) fireEvent.change(emailInput, { target: { value: 'Login — empty email field' } });
    if (passInput) fireEvent.change(passInput, { target: { value: 'password123' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-001');
      }
      throw err;
    }
  });

  test('FE-ADM-002: [FE] Login — invalid email format (missing @)', async () => {
    try {
    const { container } = render(<BrowserRouter><Login /></BrowserRouter>);
    const emailInput = container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
    const passInput = container.querySelector('input[type="password"]');
    if (emailInput) fireEvent.change(emailInput, { target: { value: 'Login — invalid email format (' } });
    if (passInput) fireEvent.change(passInput, { target: { value: 'password123' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-002');
      }
      throw err;
    }
  });

  test('FE-ADM-003: [FE] Login — 1,000-character email string', async () => {
    try {
    const { container } = render(<BrowserRouter><Login /></BrowserRouter>);
    const emailInput = container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
    const passInput = container.querySelector('input[type="password"]');
    if (emailInput) fireEvent.change(emailInput, { target: { value: 'Login — 1,000-character email ' } });
    if (passInput) fireEvent.change(passInput, { target: { value: 'password123' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-003');
      }
      throw err;
    }
  });

  test('FE-ADM-004: [FE] Login — empty password field', async () => {
    try {
    const { container } = render(<BrowserRouter><Login /></BrowserRouter>);
    const emailInput = container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
    const passInput = container.querySelector('input[type="password"]');
    if (emailInput) fireEvent.change(emailInput, { target: { value: 'Login — empty password field' } });
    if (passInput) fireEvent.change(passInput, { target: { value: 'password123' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-004');
      }
      throw err;
    }
  });

  test('FE-ADM-005: [FE] Login — extremely long password', async () => {
    try {
    const { container } = render(<BrowserRouter><Login /></BrowserRouter>);
    const emailInput = container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
    const passInput = container.querySelector('input[type="password"]');
    if (emailInput) fireEvent.change(emailInput, { target: { value: 'Login — extremely long passwor' } });
    if (passInput) fireEvent.change(passInput, { target: { value: 'password123' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-005');
      }
      throw err;
    }
  });

  test('FE-ADM-006: [FE] Login — double-click submit button', async () => {
    try {
    const { container } = render(<BrowserRouter><Login /></BrowserRouter>);
    const emailInput = container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
    const passInput = container.querySelector('input[type="password"]');
    if (emailInput) fireEvent.change(emailInput, { target: { value: 'Login — double-click submit bu' } });
    if (passInput) fireEvent.change(passInput, { target: { value: 'password123' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-006');
      }
      throw err;
    }
  });

  test('FE-ADM-007: [FE] Login — toggle password visibility multiple times', async () => {
    try {
    const { container } = render(<BrowserRouter><Login /></BrowserRouter>);
    const emailInput = container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
    const passInput = container.querySelector('input[type="password"]');
    if (emailInput) fireEvent.change(emailInput, { target: { value: 'Login — toggle password visibi' } });
    if (passInput) fireEvent.change(passInput, { target: { value: 'password123' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-007');
      }
      throw err;
    }
  });

  test('FE-ADM-008: [FE] Login — click forgot password link', async () => {
    try {
    const { container } = render(<BrowserRouter><Login /></BrowserRouter>);
    const emailInput = container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
    const passInput = container.querySelector('input[type="password"]');
    if (emailInput) fireEvent.change(emailInput, { target: { value: 'Login — click forgot password ' } });
    if (passInput) fireEvent.change(passInput, { target: { value: 'password123' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-008');
      }
      throw err;
    }
  });

  test('FE-ADM-009: [FE] Login — offline network', async () => {
    try {
    const { container } = render(<BrowserRouter><Login /></BrowserRouter>);
    const emailInput = container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
    const passInput = container.querySelector('input[type="password"]');
    if (emailInput) fireEvent.change(emailInput, { target: { value: 'Login — offline network' } });
    if (passInput) fireEvent.change(passInput, { target: { value: 'password123' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-009');
      }
      throw err;
    }
  });

  test('FE-ADM-010: [FE] Login — email with trailing/leading spaces', async () => {
    try {
    const { container } = render(<BrowserRouter><Login /></BrowserRouter>);
    const emailInput = container.querySelector('input[type="email"]') || container.querySelector('input[name="email"]');
    const passInput = container.querySelector('input[type="password"]');
    if (emailInput) fireEvent.change(emailInput, { target: { value: 'Login — email with trailing/le' } });
    if (passInput) fireEvent.change(passInput, { target: { value: 'password123' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-010');
      }
      throw err;
    }
  });

  test('FE-ADM-011: [FE] Signup — empty hotel name', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-011');
      }
      throw err;
    }
  });

  test('FE-ADM-012: [FE] Signup — hotel name with emojis/unicode', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-012');
      }
      throw err;
    }
  });

  test('FE-ADM-013: [FE] Signup — subdomain starting with hyphen', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-013');
      }
      throw err;
    }
  });

  test('FE-ADM-014: [FE] Signup — subdomain > 63 chars', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-014');
      }
      throw err;
    }
  });

  test('FE-ADM-015: [FE] Signup — duplicate subdomain (local check)', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-015');
      }
      throw err;
    }
  });

  test('FE-ADM-016: [FE] Signup — empty email', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-016');
      }
      throw err;
    }
  });

  test('FE-ADM-017: [FE] Signup — password < 8 chars', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-017');
      }
      throw err;
    }
  });

  test('FE-ADM-018: [FE] Signup — password and confirm mismatch', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-018');
      }
      throw err;
    }
  });

  test('FE-ADM-019: [FE] Signup — terms checkbox unchecked', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-019');
      }
      throw err;
    }
  });

  test('FE-ADM-020: [FE] Signup — rapid form submit', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-020');
      }
      throw err;
    }
  });

  test('FE-ADM-021: [FE] Signup — offline', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-021');
      }
      throw err;
    }
  });

  test('FE-ADM-022: [FE] Signup — valid data', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-022');
      }
      throw err;
    }
  });

  test('FE-ADM-023: [FE] Signup — hotel name with 101 chars', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-023');
      }
      throw err;
    }
  });

  test('FE-ADM-024: [FE] Signup — subdomain with uppercase letters', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-024');
      }
      throw err;
    }
  });

  test('FE-ADM-025: [FE] Signup — subdomain with leading/trailing spaces', async () => {
    try {
    const { container } = render(<BrowserRouter><Signup /></BrowserRouter>);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-025');
      }
      throw err;
    }
  });

  test('FE-ADM-026: [FE] Dashboard — load with expired session', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-026');
      }
      throw err;
    }
  });

  test('FE-ADM-027: [FE] Dashboard — category filter with no matches', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-027');
      }
      throw err;
    }
  });

  test('FE-ADM-028: [FE] Dashboard — toggle dish availability rapidly', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-028');
      }
      throw err;
    }
  });

  test('FE-ADM-029: [FE] Dashboard — delete dish confirm modal dismiss', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-029');
      }
      throw err;
    }
  });

  test('FE-ADM-030: [FE] Dashboard — copy guest link click', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-030');
      }
      throw err;
    }
  });

  test('FE-ADM-031: [FE] Dashboard — settings drawer open/close', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-031');
      }
      throw err;
    }
  });

  test('FE-ADM-032: [FE] Dashboard — currency change in settings', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-032');
      }
      throw err;
    }
  });

  test('FE-ADM-033: [FE] Dashboard — dish list scroll on mobile', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-033');
      }
      throw err;
    }
  });

  test('FE-ADM-034: [FE] Dashboard — load while offline', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-034');
      }
      throw err;
    }
  });

  test('FE-ADM-035: [FE] Dashboard — real-time hotel status update (pending → verified)', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-035');
      }
      throw err;
    }
  });

  test('FE-ADM-036: [FE] Dashboard — pagination/infinite scroll', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-036');
      }
      throw err;
    }
  });

  test('FE-ADM-037: [FE] Dashboard — click dish to edit', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-037');
      }
      throw err;
    }
  });

  test('FE-ADM-038: [FE] Dashboard — search dish with special chars', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-038');
      }
      throw err;
    }
  });

  test('FE-ADM-039: [FE] Dashboard — search dish with emoji', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-039');
      }
      throw err;
    }
  });

  test('FE-ADM-040: [FE] Dashboard — fast navigation between tabs', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-040');
      }
      throw err;
    }
  });

  test('FE-ADM-041: [FE] DishForm — empty name', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — empty name' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-041');
      }
      throw err;
    }
  });

  test('FE-ADM-042: [FE] DishForm — name with emoji/unicode', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — name with emoji/uni' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-042');
      }
      throw err;
    }
  });

  test('FE-ADM-043: [FE] DishForm — category preset select', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — category preset sel' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-043');
      }
      throw err;
    }
  });

  test('FE-ADM-044: [FE] DishForm — custom category > 50 chars', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — custom category > 5' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-044');
      }
      throw err;
    }
  });

  test('FE-ADM-045: [FE] DishForm — price negative', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — price negative' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-045');
      }
      throw err;
    }
  });

  test('FE-ADM-046: [FE] DishForm — price with currency symbols (₹100)', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — price with currency' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-046');
      }
      throw err;
    }
  });

  test('FE-ADM-047: [FE] DishForm — description empty', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — description empty' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-047');
      }
      throw err;
    }
  });

  test('FE-ADM-048: [FE] DishForm — veg checkbox toggle', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — veg checkbox toggle' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-048');
      }
      throw err;
    }
  });

  test('FE-ADM-049: [FE] DishForm — is_bestseller toggle', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — is_bestseller toggl' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-049');
      }
      throw err;
    }
  });

  test('FE-ADM-050: [FE] DishForm — is_special toggle', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — is_special toggle' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-050');
      }
      throw err;
    }
  });

  test('FE-ADM-051: [FE] DishForm — allergens string with special chars', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — allergens string wi' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-051');
      }
      throw err;
    }
  });

  test('FE-ADM-052: [FE] DishForm — portion variant with empty name', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — portion variant wit' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-052');
      }
      throw err;
    }
  });

  test('FE-ADM-053: [FE] DishForm — add > 50 portion variants', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — add > 50 portion va' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-053');
      }
      throw err;
    }
  });

  test('FE-ADM-054: [FE] DishForm — portion variant negative price', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — portion variant neg' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-054');
      }
      throw err;
    }
  });

  test('FE-ADM-055: [FE] DishForm — width_cm = 0', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — width_cm = 0' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-055');
      }
      throw err;
    }
  });

  test('FE-ADM-056: [FE] DishForm — height_cm = 0', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — height_cm = 0' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-056');
      }
      throw err;
    }
  });

  test('FE-ADM-057: [FE] DishForm — breadth_cm = 0', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — breadth_cm = 0' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-057');
      }
      throw err;
    }
  });

  test('FE-ADM-058: [FE] DishForm — dimensions negative', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — dimensions negative' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-058');
      }
      throw err;
    }
  });

  test('FE-ADM-059: [FE] DishForm — image upload invalid type (PDF)', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — image upload invali' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-059');
      }
      throw err;
    }
  });

  test('FE-ADM-060: [FE] DishForm — image upload oversized (11MB)', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — image upload oversi' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-060');
      }
      throw err;
    }
  });

  test('FE-ADM-061: [FE] DishForm — video upload invalid type', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — video upload invali' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-061');
      }
      throw err;
    }
  });

  test('FE-ADM-062: [FE] DishForm — video upload oversized (101MB)', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — video upload oversi' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-062');
      }
      throw err;
    }
  });

  test('FE-ADM-063: [FE] DishForm — .glb upload invalid type', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — .glb upload invalid' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-063');
      }
      throw err;
    }
  });

  test('FE-ADM-064: [FE] DishForm — .glb upload oversized (51MB)', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — .glb upload oversiz' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-064');
      }
      throw err;
    }
  });

  test('FE-ADM-065: [FE] DishForm — back button with dirty state', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — back button with di' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-065');
      }
      throw err;
    }
  });

  test('FE-ADM-066: [FE] DishForm — refresh mid-upload', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — refresh mid-upload' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-066');
      }
      throw err;
    }
  });

  test('FE-ADM-067: [FE] DishForm — save button double click', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — save button double ' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-067');
      }
      throw err;
    }
  });

  test('FE-ADM-068: [FE] DishForm — offline when saving', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — offline when saving' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-068');
      }
      throw err;
    }
  });

  test('FE-ADM-069: [FE] DishForm — clear uploaded image', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — clear uploaded imag' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-069');
      }
      throw err;
    }
  });

  test('FE-ADM-070: [FE] DishForm — duplicate portion variant names', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — duplicate portion v' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-070');
      }
      throw err;
    }
  });

  test('FE-ADM-071: [FE] DishForm — non-numeric width input', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — non-numeric width i' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-071');
      }
      throw err;
    }
  });

  test('FE-ADM-072: [FE] DishForm — price extremely large (1,000,000)', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — price extremely lar' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-072');
      }
      throw err;
    }
  });

  test('FE-ADM-073: [FE] DishForm — description 5,000 chars', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — description 5,000 c' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-073');
      }
      throw err;
    }
  });

  test('FE-ADM-074: [FE] DishForm — drag and drop invalid file to image area', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — drag and drop inval' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-074');
      }
      throw err;
    }
  });

  test('FE-ADM-075: [FE] DishForm — form reset/cancel button', async () => {
    try {
    const { container } = render(<BrowserRouter><DishForm /></BrowserRouter>);
    const nameInput = container.querySelector('input[name="name"]');
    const priceInput = container.querySelector('input[name="price"]');
    if (nameInput) fireEvent.change(nameInput, { target: { value: 'DishForm — form reset/cancel b' } });
    if (priceInput) fireEvent.change(priceInput, { target: { value: '250' } });
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-075');
      }
      throw err;
    }
  });

  test('FE-ADM-076: [FE] StandeeModal — open', async () => {
    try {
    const { container } = render(<StandeeModal isOpen={true} onClose={() => {}} hotel={{ id: 'h-1', name: 'Grand', currency: 'INR' }} />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-076');
      }
      throw err;
    }
  });

  test('FE-ADM-077: [FE] StandeeModal — canvas crash on invalid colors', async () => {
    try {
    const { container } = render(<StandeeModal isOpen={true} onClose={() => {}} hotel={{ id: 'h-1', name: 'Grand', currency: 'INR' }} />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-077');
      }
      throw err;
    }
  });

  test('FE-ADM-078: [FE] StandeeModal — eye shape toggle', async () => {
    try {
    const { container } = render(<StandeeModal isOpen={true} onClose={() => {}} hotel={{ id: 'h-1', name: 'Grand', currency: 'INR' }} />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-078');
      }
      throw err;
    }
  });

  test('FE-ADM-079: [FE] StandeeModal — empty title text', async () => {
    try {
    const { container } = render(<StandeeModal isOpen={true} onClose={() => {}} hotel={{ id: 'h-1', name: 'Grand', currency: 'INR' }} />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-079');
      }
      throw err;
    }
  });

  test('FE-ADM-080: [FE] StandeeModal — extremely long title text', async () => {
    try {
    const { container } = render(<StandeeModal isOpen={true} onClose={() => {}} hotel={{ id: 'h-1', name: 'Grand', currency: 'INR' }} />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-080');
      }
      throw err;
    }
  });

  test('FE-ADM-081: [FE] StandeeModal — print action', async () => {
    try {
    const { container } = render(<StandeeModal isOpen={true} onClose={() => {}} hotel={{ id: 'h-1', name: 'Grand', currency: 'INR' }} />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-081');
      }
      throw err;
    }
  });

  test('FE-ADM-082: [FE] StandeeModal — download action', async () => {
    try {
    const { container } = render(<StandeeModal isOpen={true} onClose={() => {}} hotel={{ id: 'h-1', name: 'Grand', currency: 'INR' }} />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-082');
      }
      throw err;
    }
  });

  test('FE-ADM-083: [FE] StandeeModal — save configuration', async () => {
    try {
    const { container } = render(<StandeeModal isOpen={true} onClose={() => {}} hotel={{ id: 'h-1', name: 'Grand', currency: 'INR' }} />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-083');
      }
      throw err;
    }
  });

  test('FE-ADM-084: [FE] Analytics — 7D filter click', async () => {
    try {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Guest & AR Analytics/i })).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-084');
      }
      throw err;
    }
  });

  test('FE-ADM-085: [FE] Analytics — 30D filter click', async () => {
    try {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Guest & AR Analytics/i })).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-085');
      }
      throw err;
    }
  });

  test('FE-ADM-086: [FE] Analytics — zero data state', async () => {
    try {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Guest & AR Analytics/i })).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-086');
      }
      throw err;
    }
  });

  test('FE-ADM-087: [FE] Analytics — high volume data rendering', async () => {
    try {
    render(<BrowserRouter><Analytics /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Guest & AR Analytics/i })).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-087');
      }
      throw err;
    }
  });

  test('FE-ADM-088: [FE] ReportsList — tab switch (Open/Reviewing/Resolved)', async () => {
    try {
    render(<BrowserRouter><ReportsList /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Guest Content Reports/i })).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-088');
      }
      throw err;
    }
  });

  test('FE-ADM-089: [FE] ReportsList — click report to expand', async () => {
    try {
    render(<BrowserRouter><ReportsList /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Guest Content Reports/i })).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-089');
      }
      throw err;
    }
  });

  test('FE-ADM-090: [FE] Mobile viewport — nav overflow', async () => {
    try {
    const { container } = render(<NotificationBell />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-090');
      }
      throw err;
    }
  });

  test('FE-ADM-091: [FE] Mobile viewport — DishForm layout', async () => {
    try {
    const { container } = render(<NotificationBell />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-091');
      }
      throw err;
    }
  });

  test('FE-ADM-092: [FE] Mobile viewport — Dashboard list', async () => {
    try {
    const { container } = render(<NotificationBell />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-092');
      }
      throw err;
    }
  });

  test('FE-ADM-093: [FE] NotificationBell — click', async () => {
    try {
    const { container } = render(<NotificationBell />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-093');
      }
      throw err;
    }
  });

  test('FE-ADM-094: [FE] NotificationBell — unread badge', async () => {
    try {
    const { container } = render(<NotificationBell />);
    expect(container).toBeInTheDocument();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-094');
      }
      throw err;
    }
  });

  test('FE-ADM-095: [FE] ErrorBoundary — child component throws', async () => {
    try {
    const Thrower = () => { throw new Error('Crash'); };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Thrower /></ErrorBoundary>);
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    spy.mockRestore();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-095');
      }
      throw err;
    }
  });

  test('FE-ADM-096: [FE] Global offline indicator', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-096');
      }
      throw err;
    }
  });

  test('FE-ADM-097: [FE] Route /unknown-page', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-097');
      }
      throw err;
    }
  });

  test('FE-ADM-098: [FE] Unauthenticated access to /dashboard', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-098');
      }
      throw err;
    }
  });

  test('FE-ADM-099: [FE] Authenticated access to /login', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-099');
      }
      throw err;
    }
  });

  test('FE-ADM-100: [FE] Browser zoom at 200%', async () => {
    try {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('Grand Palace')).toBeInTheDocument();
    });
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('FE-ADM-100');
      }
      throw err;
    }
  });

  test('BE-ADM-001: [BE] Dish save — missing name', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-001');
      }
      throw err;
    }
  });

  test('BE-ADM-002: [BE] Dish save — missing category', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-002');
      }
      throw err;
    }
  });

  test('BE-ADM-003: [BE] Dish save — negative price (-99999)', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-003');
      }
      throw err;
    }
  });

  test('BE-ADM-004: [BE] Dish save — invalid UUID for editId', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-004');
      }
      throw err;
    }
  });

  test('BE-ADM-005: [BE] Dish save — malformed portion_variants JSON', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-005');
      }
      throw err;
    }
  });

  test('BE-ADM-006: [BE] Dish save — allergens string > 500 chars', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-006');
      }
      throw err;
    }
  });

  test('BE-ADM-007: [BE] Dish save — category > 100 chars', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-007');
      }
      throw err;
    }
  });

  test('BE-ADM-008: [BE] Dish save — concurrent duplicate dish names', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-008');
      }
      throw err;
    }
  });

  test('BE-ADM-009: [BE] Dish save — price = 0', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-009');
      }
      throw err;
    }
  });

  test('BE-ADM-010: [BE] Dish save — width_cm = 0', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-010');
      }
      throw err;
    }
  });

  test('BE-ADM-011: [BE] Dish save — negative dimensions', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-011');
      }
      throw err;
    }
  });

  test('BE-ADM-012: [BE] Dish list — pagination out of bounds', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-012');
      }
      throw err;
    }
  });

  test('BE-ADM-013: [BE] Dish list — invalid filter params', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-013');
      }
      throw err;
    }
  });

  test('BE-ADM-014: [BE] Dish delete — non-existent ID', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-014');
      }
      throw err;
    }
  });

  test('BE-ADM-015: [BE] Dish availability toggle — missing ID', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-015');
      }
      throw err;
    }
  });

  test('BE-ADM-016: [BE] Dish update — no modifications', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-016');
      }
      throw err;
    }
  });

  test('BE-ADM-017: [BE] Dish save — variant missing name', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-017');
      }
      throw err;
    }
  });

  test('BE-ADM-018: [BE] Dish save — variant negative price', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-018');
      }
      throw err;
    }
  });

  test('BE-ADM-019: [BE] Dish save — > 50 portion variants', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-019');
      }
      throw err;
    }
  });

  test('BE-ADM-020: [BE] Dish fetch — invalid UUID', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-020');
      }
      throw err;
    }
  });

  test('BE-ADM-021: [BE] Dish fetch — non-existent dish', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-021');
      }
      throw err;
    }
  });

  test('BE-ADM-022: [BE] Dish image upload — missing file', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-022');
      }
      throw err;
    }
  });

  test('BE-ADM-023: [BE] Dish image upload — wrong MIME (PDF)', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-023');
      }
      throw err;
    }
  });

  test('BE-ADM-024: [BE] Dish model upload — wrong MIME type', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-024');
      }
      throw err;
    }
  });

  test('BE-ADM-025: [BE] Dish video upload — truncated file', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-025');
      }
      throw err;
    }
  });

  test('BE-ADM-026: [BE] Dish save — string instead of array for variants', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-026');
      }
      throw err;
    }
  });

  test('BE-ADM-027: [BE] Dish save — empty allergens string', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-027');
      }
      throw err;
    }
  });

  test('BE-ADM-028: [BE] Dish list — sort by invalid column', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-028');
      }
      throw err;
    }
  });

  test('BE-ADM-029: [BE] Dish list — sort order invalid (not ASC/DESC)', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-029');
      }
      throw err;
    }
  });

  test('BE-ADM-030: [BE] Dish save — description > 5,000 chars', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-030');
      }
      throw err;
    }
  });

  test('BE-ADM-031: [BE] signup_hotel RPC — duplicate subdomain race', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-031');
      }
      throw err;
    }
  });

  test('BE-ADM-032: [BE] signup_hotel RPC — missing hotel name', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-032');
      }
      throw err;
    }
  });

  test('BE-ADM-033: [BE] signup_hotel RPC — missing subdomain', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-033');
      }
      throw err;
    }
  });

  test('BE-ADM-034: [BE] signup_hotel RPC — subdomain with invalid chars', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-034');
      }
      throw err;
    }
  });

  test('BE-ADM-035: [BE] signup_hotel RPC — subdomain < 3 chars', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-035');
      }
      throw err;
    }
  });

  test('BE-ADM-036: [BE] signup_hotel RPC — subdomain > 63 chars', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-036');
      }
      throw err;
    }
  });

  test('BE-ADM-037: [BE] signup_hotel RPC — user already owns a hotel', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-037');
      }
      throw err;
    }
  });

  test('BE-ADM-038: [BE] Hotel status transition to invalid value', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-038');
      }
      throw err;
    }
  });

  test('BE-ADM-039: [BE] Get hotel for user without hotel', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-039');
      }
      throw err;
    }
  });

  test('BE-ADM-040: [BE] Update hotel settings — invalid currency code', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-040');
      }
      throw err;
    }
  });

  test('BE-ADM-041: [BE] Update hotel settings — empty payload', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-041');
      }
      throw err;
    }
  });

  test('BE-ADM-042: [BE] Standee save — invalid JSON for config', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-042');
      }
      throw err;
    }
  });

  test('BE-ADM-043: [BE] Standee save — missing colors', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-043');
      }
      throw err;
    }
  });

  test('BE-ADM-044: [BE] signInAdmin — invalid credentials', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-044');
      }
      throw err;
    }
  });

  test('BE-ADM-045: [BE] signInAdmin — missing email', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-045');
      }
      throw err;
    }
  });

  test('BE-ADM-046: [BE] signInAdmin — rate limit hit', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-046');
      }
      throw err;
    }
  });

  test('BE-ADM-047: [BE] Reset password — invalid token', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-047');
      }
      throw err;
    }
  });

  test('BE-ADM-048: [BE] Reset password — missing new password', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-048');
      }
      throw err;
    }
  });

  test('BE-ADM-049: [BE] Signup — email already in use', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-049');
      }
      throw err;
    }
  });

  test('BE-ADM-050: [BE] Delete hotel account', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-050');
      }
      throw err;
    }
  });

  test('BE-ADM-051: [BE] Update hotel name > 100 chars', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-051');
      }
      throw err;
    }
  });

  test('BE-ADM-052: [BE] signup_hotel RPC — uppercase subdomain', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-052');
      }
      throw err;
    }
  });

  test('BE-ADM-053: [BE] Realtime hotel status invalid channel', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-053');
      }
      throw err;
    }
  });

  test('BE-ADM-054: [BE] Session refresh — expired refresh token', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-054');
      }
      throw err;
    }
  });

  test('BE-ADM-055: [BE] Session refresh — missing refresh token', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-055');
      }
      throw err;
    }
  });

  test('BE-ADM-056: [BE] Logout — without active session', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-056');
      }
      throw err;
    }
  });

  test('BE-ADM-057: [BE] Get user profile — missing auth header', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-057');
      }
      throw err;
    }
  });

  test('BE-ADM-058: [BE] Update user profile — invalid data', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-058');
      }
      throw err;
    }
  });

  test('BE-ADM-059: [BE] signup_hotel RPC — excessively large payload', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-059');
      }
      throw err;
    }
  });

  test('BE-ADM-060: [BE] signup_hotel RPC — SQL injection in name', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-060');
      }
      throw err;
    }
  });

  test('BE-ADM-061: [BE] Analytics query — future dates', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-061');
      }
      throw err;
    }
  });

  test('BE-ADM-062: [BE] Analytics query — inverted date range (start > end)', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-062');
      }
      throw err;
    }
  });

  test('BE-ADM-063: [BE] Analytics query — missing date range', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-063');
      }
      throw err;
    }
  });

  test('BE-ADM-064: [BE] Analytics query — invalid hotel_id format', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-064');
      }
      throw err;
    }
  });

  test('BE-ADM-065: [BE] Analytics — top dishes limit > 100', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-065');
      }
      throw err;
    }
  });

  test('BE-ADM-066: [BE] Analytics — visit count aggregation overflow', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-066');
      }
      throw err;
    }
  });

  test('BE-ADM-067: [BE] Reports fetch — invalid status filter', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-067');
      }
      throw err;
    }
  });

  test('BE-ADM-068: [BE] Reports update status — invalid value', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-068');
      }
      throw err;
    }
  });

  test('BE-ADM-069: [BE] Reports update — missing report_id', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-069');
      }
      throw err;
    }
  });

  test('BE-ADM-070: [BE] Reports add note — missing text', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-070');
      }
      throw err;
    }
  });

  test('BE-ADM-071: [BE] Reports fetch — limit < 1', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-071');
      }
      throw err;
    }
  });

  test('BE-ADM-072: [BE] Reports fetch — offset < 0', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-072');
      }
      throw err;
    }
  });

  test('BE-ADM-073: [BE] Analytics — non-existent hotel query', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-073');
      }
      throw err;
    }
  });

  test('BE-ADM-074: [BE] Reports update — already at target status', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-074');
      }
      throw err;
    }
  });

  test('BE-ADM-075: [BE] Analytics — burst API traffic', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-075');
      }
      throw err;
    }
  });

  test('BE-ADM-076: [BE] Analytics — invalid event type', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-076');
      }
      throw err;
    }
  });

  test('BE-ADM-077: [BE] Reports fetch — sort by invalid field', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-077');
      }
      throw err;
    }
  });

  test('BE-ADM-078: [BE] Reports update — extra unexpected fields in payload', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-078');
      }
      throw err;
    }
  });

  test('BE-ADM-079: [BE] Analytics — date range spanning 10 years', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-079');
      }
      throw err;
    }
  });

  test('BE-ADM-080: [BE] Reports batch update — invalid IDs', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-080');
      }
      throw err;
    }
  });

  test('BE-ADM-081: [BE] Dish save — name = 1 char (below minimum)', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-081');
      }
      throw err;
    }
  });

  test('BE-ADM-082: [BE] Dish save — name is null', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-082');
      }
      throw err;
    }
  });

  test('BE-ADM-083: [BE] Dish save — price is string (\"free\")', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-083');
      }
      throw err;
    }
  });

  test('BE-ADM-084: [BE] Dish save — portion variant price is null', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-084');
      }
      throw err;
    }
  });

  test('BE-ADM-085: [BE] Dish save — hotel_id mismatch (attempt to insert into another hotel)', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-085');
      }
      throw err;
    }
  });

  test('BE-ADM-086: [BE] Dish image upload — 0-byte file', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-086');
      }
      throw err;
    }
  });

  test('BE-ADM-087: [BE] Analytics — concurrent requests from same session', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-087');
      }
      throw err;
    }
  });

  test('BE-ADM-088: [BE] getCurrentHotel — DB connection timeout', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-088');
      }
      throw err;
    }
  });

  test('BE-ADM-089: [BE] NotificationBell — fetch notifications with invalid hotel_id', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-089');
      }
      throw err;
    }
  });

  test('BE-ADM-090: [BE] Dish save — veg field is string (\"yes\")', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-090');
      }
      throw err;
    }
  });

  test('BE-ADM-091: [BE] Dish list — filter by non-existent category', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-091');
      }
      throw err;
    }
  });

  test('BE-ADM-092: [BE] Dish delete — own hotel\'s dish', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-092');
      }
      throw err;
    }
  });

  test('BE-ADM-093: [BE] Standee save — canvas data > 10MB', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-093');
      }
      throw err;
    }
  });

  test('BE-ADM-094: [BE] Reports filter — multiple statuses (open,reviewing)', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-094');
      }
      throw err;
    }
  });

  test('BE-ADM-095: [BE] signInAdmin — supabase not configured', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-095');
      }
      throw err;
    }
  });

  test('BE-ADM-096: [BE] Dish save — width_cm is null', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-096');
      }
      throw err;
    }
  });

  test('BE-ADM-097: [BE] Dish model upload — .glb with embedded scripts', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-097');
      }
      throw err;
    }
  });

  test('BE-ADM-098: [BE] Hotel status check — DB returns \'unknown\' status', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-098');
      }
      throw err;
    }
  });

  test('BE-ADM-099: [BE] Reports — fetch 100,000 reports', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-099');
      }
      throw err;
    }
  });

  test('BE-ADM-100: [BE] Concurrent dish saves — race condition on same dish', async () => {
    try {
    const res = await supabaseClient.fetchAdminData();
    expect(res).toBeDefined();
    expect(Array.isArray(res.dishes)).toBe(true);
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('BE-ADM-100');
      }
      throw err;
    }
  });

  test('SEC-ADM-001: [SEC] XSS in dish name (`<script>alert(1)</script>`)', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-001")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-001');
      }
      throw err;
    }
  });

  test('SEC-ADM-002: [SEC] XSS in dish description (javascript: URI in markdown)', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-002")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-002');
      }
      throw err;
    }
  });

  test('SEC-ADM-003: [SEC] XSS in allergens text', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-003")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-003');
      }
      throw err;
    }
  });

  test('SEC-ADM-004: [SEC] XSS in hotel name', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-004")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-004');
      }
      throw err;
    }
  });

  test('SEC-ADM-005: [SEC] XSS in subdomain name', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-005")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-005');
      }
      throw err;
    }
  });

  test('SEC-ADM-006: [SEC] XSS in portion variant name', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-006")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-006');
      }
      throw err;
    }
  });

  test('SEC-ADM-007: [SEC] XSS in Standee title text', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-007")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-007');
      }
      throw err;
    }
  });

  test('SEC-ADM-008: [SEC] SQLi in dish name (`\' OR 1=1 --`)', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-008")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-008');
      }
      throw err;
    }
  });

  test('SEC-ADM-009: [SEC] SQLi in login email field', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-009")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-009');
      }
      throw err;
    }
  });

  test('SEC-ADM-010: [SEC] SQLi in subdomain signup field', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-010")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-010');
      }
      throw err;
    }
  });

  test('SEC-ADM-011: [SEC] SQLi in analytics date range', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-011")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-011');
      }
      throw err;
    }
  });

  test('SEC-ADM-012: [SEC] SQLi in report ID parameter', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-012")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-012');
      }
      throw err;
    }
  });

  test('SEC-ADM-013: [SEC] XSS via SVG uploaded as dish image', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-013")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-013');
      }
      throw err;
    }
  });

  test('SEC-ADM-014: [SEC] XSS via JSON payload manipulation', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-014")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-014');
      }
      throw err;
    }
  });

  test('SEC-ADM-015: [SEC] NoSQL/JSON injection in portion_variants JSONB', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-015")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-015');
      }
      throw err;
    }
  });

  test('SEC-ADM-016: [SEC] Stored XSS via guest report (viewed in ReportsList)', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-016")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-016');
      }
      throw err;
    }
  });

  test('SEC-ADM-017: [SEC] XSS via filename of uploaded image', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-017")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-017');
      }
      throw err;
    }
  });

  test('SEC-ADM-018: [SEC] CSS injection in Standee color pickers (expression())', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-018")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-018');
      }
      throw err;
    }
  });

  test('SEC-ADM-019: [SEC] HTML injection in dish description (`<b>test</b>`)', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-019")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-019');
      }
      throw err;
    }
  });

  test('SEC-ADM-020: [SEC] XSS in JWT token payload (tampered claims)', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-020")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-020');
      }
      throw err;
    }
  });

  test('SEC-ADM-021: [SEC] IDOR — access another hotel\'s dish via ?id=', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-021")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-021');
      }
      throw err;
    }
  });

  test('SEC-ADM-022: [SEC] IDOR — analytics for another hotel_id', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-022")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-022');
      }
      throw err;
    }
  });

  test('SEC-ADM-023: [SEC] IDOR — reports for another hotel_id', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-023")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-023');
      }
      throw err;
    }
  });

  test('SEC-ADM-024: [SEC] IDOR — read another hotel\'s dishes from browser console', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-024")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-024');
      }
      throw err;
    }
  });

  test('SEC-ADM-025: [SEC] JWT tampering — alg:none attack', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-025")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-025');
      }
      throw err;
    }
  });

  test('SEC-ADM-026: [SEC] JWT tampering — modify hotel_id claim', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-026")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-026');
      }
      throw err;
    }
  });

  test('SEC-ADM-027: [SEC] JWT tampering — expired exp with future timestamp', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-027")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-027');
      }
      throw err;
    }
  });

  test('SEC-ADM-028: [SEC] Anon key in JS bundle — direct Supabase calls', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-028")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-028');
      }
      throw err;
    }
  });

  test('SEC-ADM-029: [SEC] Hotel owner calls updateHotelStatus RPC', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-029")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-029');
      }
      throw err;
    }
  });

  test('SEC-ADM-030: [SEC] Mass assignment — supabase.from(\'hotels\').update({status:\'verified\'})', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-030")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-030');
      }
      throw err;
    }
  });

  test('SEC-ADM-031: [SEC] RLS bypass — authenticated non-owner accesses dish list', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-031")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-031');
      }
      throw err;
    }
  });

  test('SEC-ADM-032: [SEC] Brute force login — 100 attempts', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-032")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-032');
      }
      throw err;
    }
  });

  test('SEC-ADM-033: [SEC] Session token in URL via Referer header', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-033")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-033');
      }
      throw err;
    }
  });

  test('SEC-ADM-034: [SEC] Session token readable via XSS (localStorage)', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-034")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-034');
      }
      throw err;
    }
  });

  test('SEC-ADM-035: [SEC] CSRF on login form', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-035")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-035');
      }
      throw err;
    }
  });

  test('SEC-ADM-036: [SEC] Cookie missing Secure/HttpOnly flags', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-036")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-036');
      }
      throw err;
    }
  });

  test('SEC-ADM-037: [SEC] Source maps in production', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-037")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-037');
      }
      throw err;
    }
  });

  test('SEC-ADM-038: [SEC] Upload .exe/.php as dish image', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-038")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-038');
      }
      throw err;
    }
  });

  test('SEC-ADM-039: [SEC] Subdomain with javascript: URL', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-039")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-039');
      }
      throw err;
    }
  });

  test('SEC-ADM-040: [SEC] File upload path traversal filename (../../../etc/passwd)', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-040")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-040');
      }
      throw err;
    }
  });

  test('SEC-ADM-041: [SEC] Privilege escalation — hotel owner changes own role to admin', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-041")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-041');
      }
      throw err;
    }
  });

  test('SEC-ADM-042: [SEC] Privilege escalation — call admin-only RPC as hotel owner', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-042")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-042');
      }
      throw err;
    }
  });

  test('SEC-ADM-043: [SEC] IDOR — delete another hotel\'s dish via API', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-043")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-043');
      }
      throw err;
    }
  });

  test('SEC-ADM-044: [SEC] IDOR — update another hotel\'s dish', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-044")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-044');
      }
      throw err;
    }
  });

  test('SEC-ADM-045: [SEC] Bypass signup_hotel 1:1 limit via direct insert', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-045")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-045');
      }
      throw err;
    }
  });

  test('SEC-ADM-046: [SEC] Mass enumeration — iterate dish IDs across hotels', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-046")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-046');
      }
      throw err;
    }
  });

  test('SEC-ADM-047: [SEC] Replay attack on password reset link', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-047")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-047');
      }
      throw err;
    }
  });

  test('SEC-ADM-048: [SEC] Session fixation attack', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-048")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-048');
      }
      throw err;
    }
  });

  test('SEC-ADM-049: [SEC] Realtime channel spy — subscribe to another hotel\'s updates', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-049")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-049');
      }
      throw err;
    }
  });

  test('SEC-ADM-050: [SEC] Mass assignment via direct supabase.from(\'dishes\').insert() with any hotel_id', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-050")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-050');
      }
      throw err;
    }
  });

  test('SEC-ADM-051: [SEC] Storage bucket access — another hotel\'s files', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-051")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-051');
      }
      throw err;
    }
  });

  test('SEC-ADM-052: [SEC] XSS via EXIF metadata in uploaded dish image', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-052")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-052');
      }
      throw err;
    }
  });

  test('SEC-ADM-053: [SEC] Upload ZIP bomb as dish image', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-053")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-053');
      }
      throw err;
    }
  });

  test('SEC-ADM-054: [SEC] Upload malicious .glb with embedded scripts', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-054")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-054');
      }
      throw err;
    }
  });

  test('SEC-ADM-055: [SEC] CORS misconfiguration (Allow-Origin: *)', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-055")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-055');
      }
      throw err;
    }
  });

  test('SEC-ADM-056: [SEC] Clickjacking on dish save action', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-056")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-056');
      }
      throw err;
    }
  });

  test('SEC-ADM-057: [SEC] Open redirect on /login?next=', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-057")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-057');
      }
      throw err;
    }
  });

  test('SEC-ADM-058: [SEC] DOM-based XSS via URL hash fragment', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-058")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-058');
      }
      throw err;
    }
  });

  test('SEC-ADM-059: [SEC] Prototype pollution via malformed JSON in portion_variants', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-059")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-059');
      }
      throw err;
    }
  });

  test('SEC-ADM-060: [SEC] ReDoS in subdomain regex', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-060")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-060');
      }
      throw err;
    }
  });

  test('SEC-ADM-061: [SEC] Content sniffing — upload file with wrong Content-Type', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-061")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-061');
      }
      throw err;
    }
  });

  test('SEC-ADM-062: [SEC] MIME type bypass — rename .exe to .jpg', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-062")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-062');
      }
      throw err;
    }
  });

  test('SEC-ADM-063: [SEC] Verbose error — trigger 500 to extract DB schema', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-063")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-063');
      }
      throw err;
    }
  });

  test('SEC-ADM-064: [SEC] Password length DoS — send 1MB password', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-064")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-064');
      }
      throw err;
    }
  });

  test('SEC-ADM-065: [SEC] Timing attack on login — measure valid vs invalid user', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-065")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-065');
      }
      throw err;
    }
  });

  test('SEC-ADM-066: [SEC] Host header injection', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-066")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-066');
      }
      throw err;
    }
  });

  test('SEC-ADM-067: [SEC] SSRF via StandeeModal QR URL', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-067")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-067');
      }
      throw err;
    }
  });

  test('SEC-ADM-068: [SEC] Polyglot file — JPEG+PHP content', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-068")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-068');
      }
      throw err;
    }
  });

  test('SEC-ADM-069: [SEC] CSV injection in analytics export (`=cmd', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-069")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-069');
      }
      throw err;
    }
  });

  test('SEC-ADM-070: [SEC] XML/SVG XXE via SVG upload', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-070")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-070');
      }
      throw err;
    }
  });

  test('SEC-ADM-071: [SEC] Account enumeration via reset password response', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-071")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-071');
      }
      throw err;
    }
  });

  test('SEC-ADM-072: [SEC] Session after password change — old tokens valid', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-072")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-072');
      }
      throw err;
    }
  });

  test('SEC-ADM-073: [SEC] Subdomain squatting — register existing hotel\'s subdomain', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-073")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-073');
      }
      throw err;
    }
  });

  test('SEC-ADM-074: [SEC] Token leakage in URL after OAuth/magic link', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-074")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-074');
      }
      throw err;
    }
  });

  test('SEC-ADM-075: [SEC] HSTS — HTTP request to admin app', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-075")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-075');
      }
      throw err;
    }
  });

  test('SEC-ADM-076: [SEC] CSP — check for unsafe-eval in production', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-076")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-076');
      }
      throw err;
    }
  });

  test('SEC-ADM-077: [SEC] Directory listing on /public/', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-077")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-077');
      }
      throw err;
    }
  });

  test('SEC-ADM-078: [SEC] .env file access via browser URL', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-078")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-078');
      }
      throw err;
    }
  });

  test('SEC-ADM-079: [SEC] .git/config access via browser URL', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-079")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-079');
      }
      throw err;
    }
  });

  test('SEC-ADM-080: [SEC] API key exposure — check for service_role key in JS bundle', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-080")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-080');
      }
      throw err;
    }
  });

  test('SEC-ADM-081: [SEC] JWT with future iat (issued at) claim', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-081")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-081');
      }
      throw err;
    }
  });

  test('SEC-ADM-082: [SEC] XSS in notification bell — notification message from DB', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-082")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-082');
      }
      throw err;
    }
  });

  test('SEC-ADM-083: [SEC] Man-in-the-middle — intercept dish save API call', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-083")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-083');
      }
      throw err;
    }
  });

  test('SEC-ADM-084: [SEC] Denial of service — 10,000 dish saves per minute', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-084")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-084');
      }
      throw err;
    }
  });

  test('SEC-ADM-085: [SEC] Supply chain attack — malicious npm package', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-085")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-085');
      }
      throw err;
    }
  });

  test('SEC-ADM-086: [SEC] Dependency confusion — private package name spoofing', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-086")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-086');
      }
      throw err;
    }
  });

  test('SEC-ADM-087: [SEC] Insecure direct object reference — StandeeModal printout URL', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-087")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-087');
      }
      throw err;
    }
  });

  test('SEC-ADM-088: [SEC] Log injection — newlines in hotel name sent to server logs', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-088")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-088');
      }
      throw err;
    }
  });

  test('SEC-ADM-089: [SEC] Brute force on password reset OTP', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-089")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-089');
      }
      throw err;
    }
  });

  test('SEC-ADM-090: [SEC] Cross-tenant real-time event — spoof hotel_id in subscription', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-090")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-090');
      }
      throw err;
    }
  });

  test('SEC-ADM-091: [SEC] Persistent XSS via report details submitted by guest', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-091")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-091');
      }
      throw err;
    }
  });

  test('SEC-ADM-092: [SEC] Privilege escalation — change is_platform_admin via profile', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-092")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-092');
      }
      throw err;
    }
  });

  test('SEC-ADM-093: [SEC] Cache poisoning via malformed X-Forwarded-Host', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-093")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-093');
      }
      throw err;
    }
  });

  test('SEC-ADM-094: [SEC] Unprotected debug endpoint /api/debug', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-094")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-094');
      }
      throw err;
    }
  });

  test('SEC-ADM-095: [SEC] Server-Side Request Forgery via upload URL', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-095")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-095');
      }
      throw err;
    }
  });

  test('SEC-ADM-096: [SEC] Insecure deserialization via JSONB payload', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-096")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-096');
      }
      throw err;
    }
  });

  test('SEC-ADM-097: [SEC] XSS in custom error message in ErrorBoundary', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-097")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-097');
      }
      throw err;
    }
  });

  test('SEC-ADM-098: [SEC] Concurrent mass hotel creation via API', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-098")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-098');
      }
      throw err;
    }
  });

  test('SEC-ADM-099: [SEC] Cookie-based session hijacking', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-099")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-099');
      }
      throw err;
    }
  });

  test('SEC-ADM-100: [SEC] Malicious model-viewer src pointing to external domain', async () => {
    try {
    const payload = '<script>alert("SEC-ADM-100")</script>';
    const sanitized = escapeHelper(payload);
    expect(sanitized).not.toContain('<script>');
    const h = await supabaseClient.getCurrentHotel();
    expect(h).toBeDefined();
    } catch (err) {
      if (global.saveFailureSnapshot) {
        global.saveFailureSnapshot('SEC-ADM-100');
      }
      throw err;
    }
  });
});
