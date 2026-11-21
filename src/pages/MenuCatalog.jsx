import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { deleteDish, fetchAdminData, getCurrentHotel, peekAdminData } from '../lib/supabaseClient';
import useDocumentTitle from '../lib/useDocumentTitle';
import { formatCurrency, getCurrencySymbol } from '../lib/formatters';
import { dishHasModel } from '../lib/dishModel';

export default function MenuCatalog() {
  useDocumentTitle('Menu Catalog & Organization');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const cached = peekAdminData();
  const [dishes, setDishes] = useState(() => cached?.dishes || []);
  const [loading, setLoading] = useState(() => !cached);
  const [currencySymbol, setCurrencySymbol] = useState(() => getCurrencySymbol(cached?.hotel?.currency || 'INR'));
  const [hotelCurrency, setHotelCurrency] = useState(() => cached?.hotel?.currency || 'INR');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [arFilter, setArFilter] = useState('all'); // 'all' | 'ready' | 'missing'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'suspended' | 'active'
  const [sortBy, setSortBy] = useState('manual'); // 'manual' | 'recent' | 'alpha' | 'flagged' | 'suspended'

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Action status feedback
  const [actionNotice, setActionNotice] = useState(null);
  const [deleteModalDish, setDeleteModalDish] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const hotel = await getCurrentHotel();
        if (!isMounted) return;
        if (hotel?.currency) {
          setHotelCurrency(hotel.currency);
          setCurrencySymbol(getCurrencySymbol(hotel.currency));
        }

        const data = await fetchAdminData();
        if (isMounted && data?.dishes) {
          setDishes(data.dishes);
        }
      } catch (err) {
        console.error('Failed to load menu catalog:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    window.addEventListener('hotel-menu-data-updated', loadData);

    return () => {
      isMounted = false;
      window.removeEventListener('hotel-menu-data-updated', loadData);
    };
  }, []);

  // Apply URL filter param on mount or URL change (e.g. from dashboard tiles)
  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter === 'no-ar') {
      setArFilter('missing');
    } else if (filter === 'suspended') {
      setStatusFilter('suspended');
      setSortBy('suspended');
    }
  }, [searchParams]);

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set();
    dishes.forEach((d) => {
      if (d.category) set.add(d.category);
    });
    return Array.from(set);
  }, [dishes]);

  // Counts & Status
  const has3D = dishHasModel;
  const isSuspended = (d) => Boolean(d.is_suspended || d.status === 'suspended');
  const readyCount = useMemo(() => dishes.filter(has3D).length, [dishes]);
  const missingCount = useMemo(() => dishes.filter(d => !has3D(d)).length, [dishes]);
  const suspendedCount = useMemo(() => dishes.filter(isSuspended).length, [dishes]);

  // Active category stats
  const activeCategoryDishes = useMemo(() => {
    if (selectedCategory === 'All') return dishes;
    return dishes.filter((d) => (d.category || '').toLowerCase() === selectedCategory.toLowerCase());
  }, [dishes, selectedCategory]);

  const activeCategoryArCoverage = useMemo(() => {
    if (!activeCategoryDishes.length) return 0;
    const ready = activeCategoryDishes.filter(has3D).length;
    return Math.round((ready / activeCategoryDishes.length) * 100);
  }, [activeCategoryDishes]);

  // Filtered & Sorted Dishes
  const filteredDishes = useMemo(() => {
    return dishes
      .filter((d) => {
        // Category filter
        if (selectedCategory !== 'All' && (d.category || '').toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
        // AR filter
        if (arFilter === 'ready' && !has3D(d)) return false;
        if (arFilter === 'missing' && has3D(d)) return false;
        // Status filter
        if (statusFilter === 'suspended' && !isSuspended(d)) return false;
        if (statusFilter === 'active' && isSuspended(d)) return false;
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = (d.name || '').toLowerCase().includes(q);
          const matchDesc = (d.description || '').toLowerCase().includes(q);
          const matchCat = (d.category || '').toLowerCase().includes(q);
          const matchAllergens = (d.allergens || '').toLowerCase().includes(q);
          if (!matchName && !matchDesc && !matchCat && !matchAllergens) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'alpha') {
          return (a.name || '').localeCompare(b.name || '');
        }
        if (sortBy === 'recent') {
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        }
        if (sortBy === 'flagged') {
          const aFlag = !a.thumbnail_url && !a.image ? 1 : 0;
          const bFlag = !b.thumbnail_url && !b.image ? 1 : 0;
          return bFlag - aFlag;
        }
        if (sortBy === 'suspended') {
          const aSusp = isSuspended(a) ? 0 : 1;
          const bSusp = isSuspended(b) ? 0 : 1;
          if (aSusp !== bSusp) return aSusp - bSusp;
          return (a.name || '').localeCompare(b.name || '');
        }
        return 0; // manual order
      });
  }, [dishes, selectedCategory, arFilter, statusFilter, searchQuery, sortBy]);

  // Paginated slice
  const totalPages = Math.ceil(filteredDishes.length / pageSize) || 1;
  const paginatedDishes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDishes.slice(start, start + pageSize);
  }, [filteredDishes, currentPage, pageSize]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, arFilter, statusFilter, searchQuery, sortBy]);

  async function handleConfirmDelete() {
    if (!deleteModalDish) return;
    setDeleting(true);
    const dishToDelete = deleteModalDish;

    try {
      const { error } = await deleteDish(dishToDelete.id);
      if (error) throw error;

      setDishes((prev) => prev.filter((d) => d.id !== dishToDelete.id));
      setActionNotice({ type: 'success', message: `"${dishToDelete.name}" was permanently removed.` });
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err) {
      console.error('Failed to delete dish:', err);
      setActionNotice({ type: 'error', message: 'Could not delete dish. Please try again.' });
      setTimeout(() => setActionNotice(null), 3500);
    } finally {
      setDeleting(false);
      setDeleteModalDish(null);
    }
  }

  function formatVariantsText(dish) {
    let variants = dish.portion_variants;
    if (typeof variants === 'string') {
      try { variants = JSON.parse(variants); } catch (_) { variants = []; }
    }
    if (Array.isArray(variants) && variants.length > 0) {
      return variants.map(v => `${v.name} ${currencySymbol}${v.price}`).join(' / ');
    }
    return null;
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }} data-purpose="menu-catalog-page">
      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        <Link to="/dish-form" style={{ color: 'inherit', textDecoration: 'none' }}>Dish Form / Menu</Link>
        <span>›</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>Edit Menu</span>
      </div>

      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h1 className="font-serif-luxury" style={{ margin: 0, fontSize: '26px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Menu Catalog & Organization
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted)', maxWidth: '750px', lineHeight: 1.5 }}>
            Curate categories, dish hierarchy, pricing, availability, and live QR menu display for palace guests across dining saloons.
          </p>
        </div>
        <Link
          to="/dish-form"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '8px',
            background: 'var(--primary, #271B14)',
            color: 'var(--primary-fg, #ffffff)',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
            boxShadow: 'var(--shadow-sm)',
            transition: 'opacity var(--transition)'
          }}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>＋</span>
          <span>Add New Dish</span>
        </Link>
      </header>

      {/* ── Notification Banner ─────────────────────────────────────────────── */}
      {actionNotice && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: actionNotice.type === 'error' ? 'var(--danger-subtle, #fef2f2)' : 'var(--success-subtle, #ecfdf5)',
            color: actionNotice.type === 'error' ? 'var(--danger-fg, #b91c1c)' : 'var(--success-fg, #15803d)',
            border: '1px solid var(--border)'
          }}
        >
          <span>{actionNotice.message}</span>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '14px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Global Search & Filter Bar ──────────────────────────────────────── */}
      <section
        style={{
          background: 'var(--bg-card, #FFFFFF)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '12px 16px',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px'
        }}
        data-purpose="catalog-filter-bar"
      >
        {/* Search input */}
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '15px' }}>
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dishes, royal ingredients, allergens, or tags..."
            style={{
              width: '100%',
              padding: '8px 48px 8px 36px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
              color: 'var(--text)',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
            ⌘K
          </span>
        </div>

        {/* AR Status toggle pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-subtle)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            AR Status:
          </span>
          <button
            type="button"
            onClick={() => setArFilter('all')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              background: arFilter === 'all' ? 'var(--bg-card, #FFFFFF)' : 'transparent',
              color: arFilter === 'all' ? 'var(--text)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              boxShadow: arFilter === 'all' ? 'var(--shadow-xs)' : 'none',
              cursor: 'pointer'
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)' }} />
            <span>All ({dishes.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setArFilter('ready')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              background: arFilter === 'ready' ? 'var(--bg-card, #FFFFFF)' : 'transparent',
              color: arFilter === 'ready' ? 'var(--success-fg, #15803d)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              boxShadow: arFilter === 'ready' ? 'var(--shadow-xs)' : 'none',
              cursor: 'pointer'
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
            <span>Ready ({readyCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setArFilter('missing')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              background: arFilter === 'missing' ? 'var(--bg-card, #FFFFFF)' : 'transparent',
              color: arFilter === 'missing' ? 'var(--danger-fg, #b91c1c)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              boxShadow: arFilter === 'missing' ? 'var(--shadow-xs)' : 'none',
              cursor: 'pointer'
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />
            <span>Missing ({missingCount})</span>
          </button>
        </div>

        {/* Availability / Status toggle pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-subtle)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', padding: '0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Status:
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              background: statusFilter === 'all' ? 'var(--bg-card, #FFFFFF)' : 'transparent',
              color: statusFilter === 'all' ? 'var(--text)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              boxShadow: statusFilter === 'all' ? 'var(--shadow-xs)' : 'none',
              cursor: 'pointer'
            }}
          >
            <span>All ({dishes.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const next = statusFilter === 'suspended' ? 'all' : 'suspended';
              setStatusFilter(next);
              if (next === 'suspended') setSortBy('suspended');
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              background: statusFilter === 'suspended' ? 'var(--bg-card, #FFFFFF)' : 'transparent',
              color: statusFilter === 'suspended' ? 'var(--danger-fg, #b91c1c)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              boxShadow: statusFilter === 'suspended' ? 'var(--shadow-xs)' : 'none',
              cursor: 'pointer'
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#b91c1c' }} />
            <span>Suspended ({suspendedCount})</span>
          </button>
        </div>

        {/* Sort dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-subtle)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>⇅</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="manual">Manual Order</option>
            <option value="recent">Recent</option>
            <option value="alpha">Alphabetical (A-Z)</option>
            <option value="suspended">Suspended Dishes First</option>
            <option value="flagged">Flaggers / Needs Photo</option>
          </select>
        </div>
      </section>

      {/* ── Category Filter Ribbon ──────────────────────────────────────────── */}
      <nav
        aria-label="Category Filters"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '8px',
          marginBottom: '16px'
        }}
        className="custom-scrollbar"
      >
        <button
          type="button"
          onClick={() => setSelectedCategory('All')}
          style={{
            padding: '6px 14px',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            background: selectedCategory === 'All' ? 'var(--primary, #271B14)' : 'var(--bg-subtle)',
            color: selectedCategory === 'All' ? 'var(--primary-fg, #ffffff)' : 'var(--text)',
            fontSize: '12px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            transition: 'background var(--transition), color var(--transition)'
          }}
        >
          All Categories ({dishes.length})
        </button>

        {categories.map((cat) => {
          const count = dishes.filter(d => (d.category || '').toLowerCase() === cat.toLowerCase()).length;
          const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '999px',
                border: '1px solid var(--border)',
                background: isSelected ? 'var(--primary, #271B14)' : 'var(--bg-subtle)',
                color: isSelected ? 'var(--primary-fg, #ffffff)' : 'var(--text)',
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'background var(--transition), color var(--transition)'
              }}
            >
              <span>{cat} ({count})</span>
              {isSelected && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)' }} />}
            </button>
          );
        })}
      </nav>

      {/* ── Active Category Management Banner ───────────────────────────────── */}
      <div
        style={{
          background: 'var(--bg-card, #FFFFFF)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '16px 20px',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '16px'
        }}
        data-purpose="active-category-header"
      >
        <div style={{ maxWidth: '650px' }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', fontWeight: 700 }}>
            Active Category Management
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
            <h2 className="font-serif-luxury" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
              {selectedCategory === 'All' ? 'Complete Palace Menu Catalog' : selectedCategory}
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {selectedCategory === 'All'
              ? 'Showing all active, seasonal, and heritage dishes across all dining saloons and banquet menus.'
              : `Curated bespoke menu selections categorized under ${selectedCategory}.`}
          </p>
        </div>

        {/* Category AR Asset Coverage */}
        <div
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '10px 14px',
            minWidth: '240px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>AR Asset Coverage</span>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{activeCategoryArCoverage}%</span>
          </div>
          <div style={{ width: '100%', height: '6px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${activeCategoryArCoverage}%`,
                height: '100%',
                borderRadius: '999px',
                background: 'var(--accent)',
                transition: 'width 0.4s ease'
              }}
            />
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {activeCategoryDishes.filter(has3D).length} of {activeCategoryDishes.length} dishes have photorealistic 3D models active.
          </span>
        </div>
      </div>

      {/* ── Dish Catalog List ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Loading dishes catalog...
          </div>
        ) : filteredDishes.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: 'var(--bg-card, #FFFFFF)',
              borderRadius: '12px',
              border: '1px dashed var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span style={{ fontSize: '32px' }}>🍽️</span>
            <h3 className="font-serif-luxury" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
              No dishes found
            </h3>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', maxWidth: '400px' }}>
              {searchQuery
                ? `No dishes matched "${searchQuery}". Try a different keyword or reset filters.`
                : 'No dishes found under this category filter.'}
            </p>
            <Link
              to="/dish-form"
              style={{
                marginTop: '8px',
                padding: '8px 16px',
                borderRadius: '6px',
                background: 'var(--primary)',
                color: 'var(--primary-fg)',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              + Add First Dish
            </Link>
          </div>
        ) : (
          paginatedDishes.map((dish) => {
            const is3d = has3D(dish);
            const isSuspended = Boolean(dish.is_suspended || dish.status === 'suspended');
            const variantsText = formatVariantsText(dish);
            const displayPhoto = dish.thumbnail_url || (Array.isArray(dish.gallery) && dish.gallery[0]) || dish.image;

            return (
              <article
                key={dish.id}
                style={{
                  background: 'var(--bg-card, #FFFFFF)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  padding: '12px 16px',
                  boxShadow: 'var(--shadow-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                  opacity: isSuspended ? 0.65 : 1,
                  transition: 'opacity var(--transition), box-shadow var(--transition)'
                }}
              >
                {/* Left Section: Drag handle + Photo + Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 500px', minWidth: '300px' }}>
                  {/* Drag Handle */}
                  <span
                    title="Reorder priority"
                    style={{
                      cursor: 'grab',
                      color: 'var(--text-muted)',
                      fontSize: '18px',
                      userSelect: 'none',
                      flexShrink: 0
                    }}
                  >
                    ⠿
                  </span>

                  {/* Thumbnail */}
                  <div
                    style={{
                      width: '72px',
                      height: '72px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {displayPhoto ? (
                      <img
                        src={displayPhoto}
                        alt={dish.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '24px' }}>🍲</span>
                    )}
                  </div>

                  {/* Dish Details */}
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <h3
                        className="font-serif-luxury"
                        style={{
                          margin: 0,
                          fontSize: '14px',
                          fontWeight: 700,
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {dish.name}
                      </h3>

                      {/* Veg / Non-Veg Badge */}
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '1px 6px',
                          borderRadius: '999px',
                          background: dish.veg ? 'var(--success-subtle, #ecfdf5)' : 'var(--danger-subtle, #fef2f2)',
                          color: dish.veg ? 'var(--success-fg, #15803d)' : 'var(--danger-fg, #b91c1c)',
                          border: '1px solid var(--border)'
                        }}
                      >
                        {dish.veg ? 'Vegetarian' : 'Non-Veg'}
                      </span>

                      {/* Bestseller Badge */}
                      {Boolean(dish.is_bestseller || dish.bestseller) && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: 'var(--warning-subtle, #fef3c7)',
                            color: 'var(--warning-fg, #b45309)',
                            border: '1px solid var(--border)'
                          }}
                        >
                          Bestseller
                        </span>
                      )}

                      {/* Chef's Signature */}
                      {Boolean(dish.is_special || dish.special) && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: 'var(--accent-subtle)',
                            color: 'var(--accent)',
                            border: '1px solid var(--border)'
                          }}
                        >
                          Chef's Special
                        </span>
                      )}

                      {/* Suspended indicator */}
                      {isSuspended && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: 'var(--border)',
                            color: 'var(--text-muted)'
                          }}
                        >
                          Suspended by Super Admin
                        </span>
                      )}
                    </div>

                    {/* Description preview */}
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {isSuspended && dish.suspended_reason ? `Suspended: ${dish.suspended_reason}` : (dish.description || 'No description yet.')}
                    </p>

                    {/* Price, Portion Variants & AR Tag */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '2px', fontSize: '11px' }}>
                      {/* 3D AR Ready Chip */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '9px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: is3d ? 'var(--success-subtle, #ecfdf5)' : 'var(--bg-subtle)',
                          color: is3d ? 'var(--success-fg, #15803d)' : 'var(--text-muted)',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <span>{is3d ? '📦 3D AR Ready' : '📷 2D Only'}</span>
                      </span>

                      {/* Base Price */}
                      <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', fontSize: '12px' }}>
                        {formatCurrency(dish.price, hotelCurrency)}
                      </span>

                      {/* Portion breakdown */}
                      {variantsText && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          • {variantsText}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Section: Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <Link
                    to={`/dish-form?id=${dish.id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-subtle)',
                      color: 'var(--text)',
                      fontSize: '11px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      cursor: 'pointer',
                      transition: 'background var(--transition)'
                    }}
                  >
                    <span>✎</span>
                    <span>Edit</span>
                  </Link>

                  {/* Suspension is controlled by the Super Admin only */}
                  {isSuspended && (
                    <Link
                      to="/reports?view=suspended"
                      data-testid={`suspended-info-${dish.id}`}
                      title={dish.suspended_reason || 'Suspended by the platform. Fix the issue and request reactivation.'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: '1px solid rgba(220, 38, 38, 0.35)',
                        background: 'var(--danger-subtle, #fef2f2)',
                        color: 'var(--danger-fg, #b91c1c)',
                        fontSize: '11px',
                        fontWeight: 600,
                        textDecoration: 'none'
                      }}
                    >
                      <span>🔒 Request reactivation</span>
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={() => setDeleteModalDish(dish)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--danger-fg, #b91c1c)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background var(--transition)'
                    }}
                  >
                    <span>🗑</span>
                    <span>Delete</span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* ── Pagination Footer ───────────────────────────────────────────────── */}
      {filteredDishes.length > pageSize && (
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '16px',
            borderTop: '1px solid var(--border)',
            fontSize: '12px',
            color: 'var(--text-muted)'
          }}
        >
          <span>
            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredDishes.length)} of {filteredDishes.length} dishes
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-subtle)',
                color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text)',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '11px',
                fontWeight: 600
              }}
            >
              ‹ Previous
            </button>

            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i + 1}
                type="button"
                onClick={() => setCurrentPage(i + 1)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: currentPage === i + 1 ? 'var(--primary, #271B14)' : 'var(--bg-subtle)',
                  color: currentPage === i + 1 ? 'var(--primary-fg, #ffffff)' : 'var(--text)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {i + 1}
              </button>
            ))}

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-subtle)',
                color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text)',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '11px',
                fontWeight: 600
              }}
            >
              Next ›
            </button>
          </div>
        </footer>
      )}

      {/* ── Delete Confirmation Dialog ──────────────────────────────────────── */}
      {deleteModalDish && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px'
          }}
        >
          <div
            style={{
              background: 'var(--bg-card, #FFFFFF)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '24px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <h3 className="font-serif-luxury" style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
              Confirm Dish Deletion
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Are you sure you want to permanently remove <strong>{deleteModalDish.name}</strong> from your menu catalog? This action will immediately remove it from all guest QR codes and table standees.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setDeleteModalDish(null)}
                disabled={deleting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--danger-fg, #b91c1c)',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: deleting ? 'wait' : 'pointer'
                }}
              >
                {deleting ? 'Deleting...' : 'Delete Dish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
