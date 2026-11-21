import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MenuCatalog from '../src/pages/MenuCatalog';
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
  fetchAdminData: jest.fn().mockResolvedValue({
    dishes: [
      {
        id: 'dish-1',
        name: 'Dum Pukht Awadhi Biryani',
        category: 'Mains',
        price: 650,
        description: 'Slow-cooked in terracotta handi with saffron.',
        veg: false,
        is_bestseller: true,
        is_special: true,
        is_available: true,
        model_glb_url: 'https://example.com/biryani.glb',
        thumbnail_url: 'https://example.com/biryani.jpg',
        portion_variants: [{ id: 'v1', name: 'Half', price: 420 }, { id: 'v2', name: 'Full', price: 650 }]
      },
      {
        id: 'dish-2',
        name: 'Grand Dal Bukhara Heritage',
        category: 'Mains',
        price: 520,
        description: 'Slow-simmered black lentils with churned butter.',
        veg: true,
        is_bestseller: false,
        is_special: false,
        is_available: true,
        model_glb_url: '',
        thumbnail_url: 'https://example.com/dal.jpg',
        portion_variants: []
      },
      {
        id: 'dish-3',
        name: 'Kesari Shahi Phirni',
        category: 'Desserts',
        price: 410,
        description: 'Gold leaf topped saffron rice pudding.',
        veg: true,
        is_bestseller: true,
        is_special: false,
        is_available: false,
        model_glb_url: 'https://example.com/phirni.glb',
        thumbnail_url: '',
        portion_variants: []
      }
    ],
    tables: [],
    hotel: { currency: 'INR' }
  }),
  getCurrentHotel: jest.fn().mockResolvedValue({ currency: 'INR', plan: 'pro' }),
  saveDish: jest.fn().mockResolvedValue({ error: null }),
  deleteDish: jest.fn().mockResolvedValue({ error: null }),
  supabase: {
    from: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null })
      })
    })
  }
}));

describe('MenuCatalog Component Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Renders Menu Catalog with title and dishes list', async () => {
    render(
      <BrowserRouter>
        <MenuCatalog />
      </BrowserRouter>
    );

    expect(await screen.findByText(/Menu Catalog & Organization/i)).toBeInTheDocument();
    expect(await screen.findByText('Dum Pukht Awadhi Biryani')).toBeInTheDocument();
    expect(screen.getByText('Grand Dal Bukhara Heritage')).toBeInTheDocument();
    expect(screen.getByText('Kesari Shahi Phirni')).toBeInTheDocument();
  });

  test('Filters dishes using the search input', async () => {
    render(
      <BrowserRouter>
        <MenuCatalog />
      </BrowserRouter>
    );

    await screen.findByText('Dum Pukht Awadhi Biryani');
    const searchInput = screen.getByPlaceholderText(/Search dishes/i);
    fireEvent.change(searchInput, { target: { value: 'Bukhara' } });

    expect(screen.getByText('Grand Dal Bukhara Heritage')).toBeInTheDocument();
    expect(screen.queryByText('Dum Pukht Awadhi Biryani')).not.toBeInTheDocument();
    expect(screen.queryByText('Kesari Shahi Phirni')).not.toBeInTheDocument();
  });

  test('Filters dishes by category selection', async () => {
    render(
      <BrowserRouter>
        <MenuCatalog />
      </BrowserRouter>
    );

    await screen.findByText('Dum Pukht Awadhi Biryani');
    const dessertsBtn = screen.getByRole('button', { name: /Desserts/i });
    fireEvent.click(dessertsBtn);

    expect(screen.getByText('Kesari Shahi Phirni')).toBeInTheDocument();
    expect(screen.queryByText('Dum Pukht Awadhi Biryani')).not.toBeInTheDocument();
  });

  test('Filters dishes by AR status pills (Ready vs Missing)', async () => {
    render(
      <BrowserRouter>
        <MenuCatalog />
      </BrowserRouter>
    );

    await screen.findByText('Dum Pukht Awadhi Biryani');
    const missingBtn = screen.getByRole('button', { name: /Missing/i });
    fireEvent.click(missingBtn);

    expect(screen.getByText('Grand Dal Bukhara Heritage')).toBeInTheDocument();
    expect(screen.queryByText('Dum Pukht Awadhi Biryani')).not.toBeInTheDocument();
  });

  test('Owners cannot suspend dishes — suspension is super-admin only', async () => {
    supabaseClient.fetchAdminData.mockResolvedValueOnce({
      dishes: [
        { id: 'dish-1', name: 'Dum Pukht Awadhi Biryani', category: 'Main', price: 650, veg: false },
        { id: 'dish-2', name: 'Suspended Kebab', category: 'Starters', price: 300, veg: false, is_suspended: true, suspended_reason: 'Photo mismatch' },
      ],
      tables: [],
      theme_config: null,
      hotel: { id: 'hotel-1', currency: 'INR' },
    });
    render(
      <BrowserRouter>
        <MenuCatalog />
      </BrowserRouter>
    );

    await screen.findByText('Dum Pukht Awadhi Biryani');
    expect(screen.queryByTestId('suspend-btn-dish-1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /⏸ Suspend|▶ Resume|^Suspend |^Resume /i })).not.toBeInTheDocument();

    const reactivate = screen.getByTestId('suspended-info-dish-2');
    expect(reactivate).toHaveAttribute('href', '/reports?view=suspended');
    expect(supabaseClient.saveDish).not.toHaveBeenCalled();
  });

  test('Opens delete confirmation modal and invokes deleteDish', async () => {
    render(
      <BrowserRouter>
        <MenuCatalog />
      </BrowserRouter>
    );

    await screen.findByText('Dum Pukht Awadhi Biryani');
    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText(/Confirm Dish Deletion/i)).toBeInTheDocument();
    const confirmDeleteBtn = screen.getByRole('button', { name: /Delete Dish/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(supabaseClient.deleteDish).toHaveBeenCalledWith('dish-1');
    });
  });

  test('Contains link to Add Dish page', async () => {
    render(
      <BrowserRouter>
        <MenuCatalog />
      </BrowserRouter>
    );

    const addLinks = await screen.findAllByRole('link', { name: /Add New Dish/i });
    expect(addLinks.length).toBeGreaterThan(0);
    expect(addLinks[0]).toHaveAttribute('href', '/dish-form');
  });
});
