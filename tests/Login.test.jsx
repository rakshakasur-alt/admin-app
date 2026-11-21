import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../src/pages/Login';
import * as supabaseClient from '../src/lib/supabaseClient';

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
  getAdminSession: jest.fn().mockResolvedValue(null),
  signInAdmin: jest.fn(),
  getCurrentHotelId: jest.fn(),
  clearHotelIdCache: jest.fn(),
  requestPasswordReset: jest.fn(),
  signOutAdmin: jest.fn().mockResolvedValue({ error: null }),
  supabase: null,
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null }),
}));

describe('Admin Authentication Suite (TC-ADM-001 to TC-ADM-020)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('TC-ADM-001: Renders login form controls', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin@hotel.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByText('Remember my email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('TC-ADM-002: Toggles between Sign in and Reset Password views', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Forgot password?'));
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('owner@hotel.com')).toBeInTheDocument();
    fireEvent.click(screen.getByText('← Back to sign in'));
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  test('TC-ADM-003: Displays error message on invalid credentials', async () => {
    supabaseClient.signInAdmin.mockResolvedValueOnce({
      error: new Error('Invalid login credentials'),
    });
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('admin@hotel.com'), { target: { value: 'bad@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeInTheDocument();
    });
  });

  test('TC-ADM-004: Navigates to dashboard on successful login', async () => {
    supabaseClient.signInAdmin.mockResolvedValueOnce({
      data: { user: { email: 'admin@hotel.com' } },
      error: null,
    });
    supabaseClient.getCurrentHotelId.mockResolvedValueOnce('hotel-123');
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('admin@hotel.com'), { target: { value: 'admin@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'correctpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  test('TC-ADM-005: Auto-heals signup metadata if hotel ID resolution needed', async () => {
    supabaseClient.signInAdmin.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });
    supabaseClient.getCurrentHotelId.mockResolvedValueOnce('hotel-auto-healed');
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('admin@hotel.com'), { target: { value: 'newowner@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  test('TC-ADM-006: Shows unlinked hotel warning when user has no hotel', async () => {
    supabaseClient.signInAdmin.mockResolvedValueOnce({ data: { user: { id: 'u-no-hotel' } }, error: null });
    supabaseClient.getCurrentHotelId.mockResolvedValue(null);
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('admin@hotel.com'), { target: { value: 'unlinked@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/Your account is not linked to a hotel yet/i)).toBeInTheDocument();
    });
  });

  test('TC-ADM-007: Remembers email in localStorage when Remember checkbox checked', async () => {
    supabaseClient.signInAdmin.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });
    supabaseClient.getCurrentHotelId.mockResolvedValueOnce('hotel-1');
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('admin@hotel.com'), { target: { value: 'remember@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/remember my email/i));
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(localStorage.getItem('remembered_admin_email')).toBe('remember@hotel.com');
    });
  });

  test('TC-ADM-008: Clears remembered email from localStorage when unchecked', async () => {
    localStorage.setItem('remembered_admin_email', 'old@hotel.com');
    supabaseClient.signInAdmin.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });
    supabaseClient.getCurrentHotelId.mockResolvedValueOnce('hotel-1');
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    // Uncheck Remember Me
    const checkbox = screen.getByLabelText(/remember my email/i);
    if (checkbox.checked) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(localStorage.getItem('remembered_admin_email')).toBeNull();
    });
  });

  test('TC-ADM-009: Submits password reset and displays confirmation notice', async () => {
    supabaseClient.requestPasswordReset.mockResolvedValueOnce({ error: null });
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Forgot password?'));
    fireEvent.change(screen.getByPlaceholderText('owner@hotel.com'), { target: { value: 'reset@hotel.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText(/Check your email for a reset link/i)).toBeInTheDocument();
    });
  });

  test('TC-ADM-010: Redirects immediately to /dashboard if session exists on mount', async () => {
    supabaseClient.getAdminSession.mockResolvedValueOnce({ user: { id: 'u-active' } });
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  test('TC-ADM-011: Renders registration link to signup page', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    expect(screen.getByRole('link', { name: /register your hotel/i })).toHaveAttribute('href', '/signup');
  });

  test('TC-ADM-012: Renders need help contact support email link', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    // Contact goes to the Super Admin by e-mail with a pre-filled template
    const link = screen.getByRole('link', { name: /contact support/i });
    const href = link.getAttribute('href');
    expect(href).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?/);
    const params = new URL(href).searchParams;
    expect(params.get('to')).toBe('rakshakasur@gmail.com');
    expect(params.get('su')).toMatch(/sign-in help/i);
    expect(params.get('body')).toMatch(/Hello Super Admin team/);
  });

  test('TC-ADM-013: Requires email input field with HTML5 validation', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    expect(screen.getByPlaceholderText('admin@hotel.com')).toBeRequired();
  });

  test('TC-ADM-014: Password input has minLength of 6', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    expect(screen.getByPlaceholderText('••••••••')).toHaveAttribute('minlength', '6');
  });

  test('TC-ADM-015: Disables submit button during active loading state', async () => {
    let resolveLogin;
    supabaseClient.signInAdmin.mockReturnValueOnce(new Promise(res => { resolveLogin = res; }));
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('admin@hotel.com'), { target: { value: 'wait@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    resolveLogin({ error: null });
  });

  test('TC-ADM-016: Clears previous error messages upon initiating new submission', async () => {
    supabaseClient.signInAdmin.mockResolvedValueOnce({ error: new Error('First failure') });
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('admin@hotel.com'), { target: { value: 'err@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('First failure')).toBeInTheDocument());

    supabaseClient.signInAdmin.mockResolvedValueOnce({ error: new Error('Second failure') });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('Second failure')).toBeInTheDocument());
  });

  test('TC-ADM-017: Password field toggle switches type to text and back', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    const passInput = screen.getByPlaceholderText('••••••••');
    expect(passInput).toHaveAttribute('type', 'password');
    const toggleBtn = screen.getByRole('button', { name: /show password/i });
    fireEvent.click(toggleBtn);
    expect(passInput).toHaveAttribute('type', 'text');
    fireEvent.click(toggleBtn);
    expect(passInput).toHaveAttribute('type', 'password');
  });

  test('TC-ADM-018: Password reset view validates required email before sending', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Forgot password?'));
    expect(screen.getByPlaceholderText('owner@hotel.com')).toBeRequired();
  });

  test('TC-ADM-019: Handles network exception cleanly during login attempt', async () => {
    supabaseClient.signInAdmin.mockRejectedValueOnce(new Error('Network disconnected'));
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('admin@hotel.com'), { target: { value: 'net@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
    });
  });

  test('TC-ADM-020: Sets sessionStorage current_hotel_id upon successful login', async () => {
    supabaseClient.signInAdmin.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });
    supabaseClient.getCurrentHotelId.mockResolvedValueOnce('hotel-session-check');
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('admin@hotel.com'), { target: { value: 'admin@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'validpass' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(sessionStorage.getItem('current_hotel_id')).toBe('hotel-session-check');
    });
  });
});
