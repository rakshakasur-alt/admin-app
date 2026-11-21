import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Signup from '../src/pages/Signup';
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
  updateHotelProfile: jest.fn().mockResolvedValue({ data: {}, error: null }),
  supabase: {
    auth: {
      signUp: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'u-new-owner', email: 'owner@hotel.com' } } },
        error: null,
      }),
      signInWithOtp: jest.fn().mockResolvedValue({ error: null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: { hotel_id: 'hotel-123' }, error: null }),
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
}));

describe('3-Step Onboarding Flow Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('Step 1: Renders initial credentials and requires OTP verification before proceed', () => {
    render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { name: /create owner account/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Rajesh Kumar')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('+91 9876543210')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send otp/i })).toBeInTheDocument();

    // Fill credentials without OTP
    fireEvent.change(screen.getByPlaceholderText('e.g. Rajesh Kumar'), { target: { value: 'Rajesh Kumar' } });
    fireEvent.change(screen.getByPlaceholderText('+91 9876543210'), { target: { value: '+91 9876543210' } });
    fireEvent.change(screen.getByPlaceholderText('owner@hotel.com'), { target: { value: 'rajesh@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('Min. 12 characters'), { target: { value: 'Secret123!Plate' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'Secret123!Plate' } });

    fireEvent.click(screen.getByRole('button', { name: /proceed to hotel details/i }));

    // Should stay on Step 1 and prompt for OTP verification
    expect(screen.getByText(/verify your phone number with the otp/i)).toBeInTheDocument();
  });

  test('Step 1 -> Step 2: Verifies phone OTP and transitions to Hotel & Location', async () => {
    render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByPlaceholderText('e.g. Rajesh Kumar'), { target: { value: 'Rajesh Kumar' } });
    fireEvent.change(screen.getByPlaceholderText('+91 9876543210'), { target: { value: '+91 9876543210' } });
    fireEvent.change(screen.getByPlaceholderText('owner@hotel.com'), { target: { value: 'rajesh@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('Min. 12 characters'), { target: { value: 'Secret123!Plate' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'Secret123!Plate' } });

    // Send OTP
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeInTheDocument());

    // Verify OTP with demo code 123456
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify otp/i }));

    await waitFor(() => expect(screen.getByText(/phone number verified successfully/i)).toBeInTheDocument());

    // Proceed to Step 2
    fireEvent.click(screen.getByRole('button', { name: /proceed to hotel details/i }));

    // Step 2 should be displayed
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /hotel details & location/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. Grand Heritage Palace')).toBeInTheDocument();
    });
  });

  test('Step 2 -> Step 3: Validates hotel info and navigates to Privacy Policy & Terms', async () => {
    render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );

    // Step 1 pass
    fireEvent.change(screen.getByPlaceholderText('e.g. Rajesh Kumar'), { target: { value: 'Rajesh Kumar' } });
    fireEvent.change(screen.getByPlaceholderText('+91 9876543210'), { target: { value: '+91 9876543210' } });
    fireEvent.change(screen.getByPlaceholderText('owner@hotel.com'), { target: { value: 'rajesh@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('Min. 12 characters'), { target: { value: 'Secret123!Plate' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'Secret123!Plate' } });
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify otp/i }));
    await waitFor(() => expect(screen.getByText(/phone number verified successfully/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /proceed to hotel details/i }));

    // Step 2 inputs
    await waitFor(() => expect(screen.getByRole('heading', { name: /hotel details & location/i })).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('e.g. Grand Heritage Palace'), { target: { value: 'Grand Heritage Palace' } });
    fireEvent.change(screen.getByPlaceholderText('Search street, area, city or pin on map...'), {
      target: { value: '123 Marine Drive, Mumbai' },
    });

    fireEvent.click(screen.getByRole('button', { name: /proceed to privacy policy/i }));

    // Step 3 Privacy & Terms should be displayed
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /privacy policy & terms/i })).toBeInTheDocument();
      expect(screen.getByText(/TERMS OF SERVICE AND PRIVACY AGREEMENT/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /i have read the policy and terms/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /i have agreed to all terms and conditions/i })).toBeInTheDocument();
    });
  });

  test('Step 3: Requires read and agree toggles to continue, then opens modal and finishes', async () => {
    render(
      <BrowserRouter>
        <Signup />
      </BrowserRouter>
    );

    // Step 1
    fireEvent.change(screen.getByPlaceholderText('e.g. Rajesh Kumar'), { target: { value: 'Rajesh Kumar' } });
    fireEvent.change(screen.getByPlaceholderText('+91 9876543210'), { target: { value: '+91 9876543210' } });
    fireEvent.change(screen.getByPlaceholderText('owner@hotel.com'), { target: { value: 'rajesh@hotel.com' } });
    fireEvent.change(screen.getByPlaceholderText('Min. 12 characters'), { target: { value: 'Secret123!Plate' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'Secret123!Plate' } });
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify otp/i }));
    await waitFor(() => expect(screen.getByText(/phone number verified successfully/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /proceed to hotel details/i }));

    // Step 2
    await waitFor(() => expect(screen.getByPlaceholderText('e.g. Grand Heritage Palace')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('e.g. Grand Heritage Palace'), { target: { value: 'Grand Heritage Palace' } });
    fireEvent.change(screen.getByPlaceholderText('Search street, area, city or pin on map...'), {
      target: { value: '123 Marine Drive, Mumbai' },
    });
    fireEvent.click(screen.getByRole('button', { name: /proceed to privacy policy/i }));

    // Step 3
    await waitFor(() => expect(screen.getByRole('heading', { name: /privacy policy & terms/i })).toBeInTheDocument());

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    expect(continueBtn).toBeDisabled();

    // Toggle Read & Agreed buttons
    fireEvent.click(screen.getByRole('button', { name: /i have read the policy and terms/i }));
    fireEvent.click(screen.getByRole('button', { name: /i have agreed to all terms and conditions/i }));

    expect(continueBtn).not.toBeDisabled();
    fireEvent.click(continueBtn);

    // Modal appears
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /digital confirmation notice/i })).toBeInTheDocument();
      expect(screen.getByText(/your acceptance of all terms and conditions will be recorded with your account/i)).toBeInTheDocument();
    });

    // Finish registration
    fireEvent.click(screen.getByRole('button', { name: /finish/i }));

    await waitFor(() => {
      expect(supabaseClient.supabase.auth.signUp).toHaveBeenCalled();
    });

  });
});
