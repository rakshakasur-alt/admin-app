import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchAdminData, getCurrentHotel, saveDish, uploadDishMedia, uploadDishModel, STORAGE_LIMITS } from '../lib/supabaseClient';
import useDocumentTitle from '../lib/useDocumentTitle';
import { getCurrencySymbol } from '../lib/formatters';
import CsvImportModal from '../components/CsvImportModal';
import { prepareDishImages, checkDishVideos, compressDishVideo, makeDishThumbnail, formatMb, IMAGE_RATIO_HINT, VIDEO_RATIO_HINT, MAX_TOTAL_IMAGE_BYTES, MAX_TOTAL_VIDEO_BYTES } from '../lib/mediaAspect';
import { deleteDraft, listDrafts, saveDraft } from '../lib/dishDrafts';

const PRESET_CATEGORIES = [
  'Main',
  'Starter',
  'Dessert',
  'Beverages',
  'Breads',
  'Soups & Salads',
  'Sides'
];

const initialForm = {
  name: '',
  category: 'Main',
  price: '',
  description: '',
  veg: true,
  is_bestseller: false,
  is_special: false,
  is_jain: false,
  spice_level: 1,
  allergens: '',
  portion_variants: []
};

export default function DishForm() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get('id');
  useDocumentTitle(editId ? 'Edit Dish' : 'Add Dish');

  const [form, setForm] = useState(initialForm);
  const [currencySymbol, setCurrencySymbol] = useState('₹');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Live upload notification shown in the sticky bottom tile while saving
  const [uploadStatus, setUploadStatus] = useState(null); // { label, step, total }
  const [imageNotices, setImageNotices] = useState([]);
  const [videoNotices, setVideoNotices] = useState([]);
  const [imageFiles, setImageFiles] = useState([]);
  const [videoFiles, setVideoFiles] = useState([]);
  const [modelFile, setModelFile] = useState(null);
  const [portionModelFiles, setPortionModelFiles] = useState({});
  const [mediaPreviews, setMediaPreviews] = useState([]); // { url, type, file? }
  // Video re-encoding (≈30% smaller) runs in the browser before saving
  const [videoProcessing, setVideoProcessing] = useState(null); // { name, pct }

  // Drafts (text only) & CSV import
  const [hotelId, setHotelId] = useState(null);
  const [hotelCurrency, setHotelCurrency] = useState('INR');
  const [drafts, setDrafts] = useState([]);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const [showCsvImport, setShowCsvImport] = useState(false);

  useEffect(() => {
    getCurrentHotel().then((h) => {
      if (h?.currency) {
        setCurrencySymbol(getCurrencySymbol(h.currency));
        setHotelCurrency(h.currency);
      }
      setHotelId(h?.id || null);
      setDrafts(listDrafts(h?.id || null));
    });
  }, []);

  function refreshDrafts() {
    setDrafts(listDrafts(hotelId));
  }

  function handleSaveDraft() {
    if (!(form.name || '').trim() && !(form.description || '').trim()) {
      setDraftNotice('Type at least a dish name or description before saving a draft.');
      setTimeout(() => setDraftNotice(''), 3000);
      return;
    }
    const draft = saveDraft(hotelId, form, currentDraftId);
    setCurrentDraftId(draft.id);
    refreshDrafts();
    setIsDirty(false);
    setDraftNotice('Draft saved (text only).');
    setTimeout(() => setDraftNotice(''), 3000);
  }

  function handleOpenDraft(draft) {
    if (editId) navigate('/dish-form');
    const f = draft.form || {};
    setForm({ ...initialForm, ...f });
    setIsCustomCategory(!PRESET_CATEGORIES.includes(f.category || 'Main'));
    setCurrentDraftId(draft.id);
    setImageFiles([]);
    setVideoFiles([]);
    setModelFile(null);
    setPortionModelFiles({});
    setMediaPreviews([]);
    setIsDirty(false);
    setSaved(false);
    setErrorMessage('');
    setShowDrafts(false);
  }

  function handleDeleteDraft(draftId) {
    deleteDraft(hotelId, draftId);
    if (currentDraftId === draftId) setCurrentDraftId(null);
    refreshDrafts();
  }

  // Warn on tab/browser close if form has unsaved modifications
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (isDirty && !saved) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, saved]);

  useEffect(() => {
    if (!editId) {
      // A new dish always starts blank — saved drafts are opened from the
      // Drafts popup instead of being silently restored.
      setForm(initialForm);
      setPortionModelFiles({});
      setIsCustomCategory(false);
      return;
    }

    let isMounted = true;

    async function loadDish() {
      const res = await fetchAdminData();
      const dish = (res?.dishes || []).find((item) => item.id === editId);
      if (isMounted && dish) {
        const dishCategory = dish.category || 'Main';
        setIsCustomCategory(!PRESET_CATEGORIES.includes(dishCategory) && dishCategory !== 'biryanis');
        setForm({
          name: dish.name || '',
          category: dishCategory,
          price: dish.price ?? '',
          description: dish.description || '',
          veg: Boolean(dish.veg),
          is_bestseller: Boolean(dish.is_bestseller ?? dish.bestseller),
          is_special: Boolean(dish.is_special ?? dish.special),
          is_jain: Boolean(dish.is_jain),
          spice_level: Number(dish.spice_level) || 1,
          allergens: dish.allergens || '',
          portion_variants: (() => {
            let raw = dish.portion_variants;
            if (typeof raw === 'string') {
              try { raw = JSON.parse(raw); } catch (_) { raw = []; }
            }
            return Array.isArray(raw)
              ? raw.map((v, i) => ({
                  id: v.id || `variant-${Date.now()}-${i}`,
                  name: v.name || '',
                  price: v.price ?? '',
                  model_glb_url: v.model_glb_url || '',
                  model_usdz_url: v.model_usdz_url || ''
                }))
              : [];
          })(),
          thumbnail_url: dish.thumbnail_url || '',
          gallery_urls: dish.gallery_urls || [],
          video_urls: dish.video_urls || (dish.video_url ? [dish.video_url] : []),
          model_glb_url: dish.model_glb_url || '',
          model_usdz_url: dish.model_usdz_url || ''
        });
        setPortionModelFiles({});
        setMediaPreviews([
          ...(dish.gallery_urls || []).map((url) => ({ url, type: 'image' })),
          ...(dish.video_urls || (dish.video_url ? [dish.video_url] : [])).map((url) => ({ url, type: 'video' }))
        ]);
      }
    }

    loadDish();
    return () => {
      isMounted = false;
    };
  }, [editId]);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setIsDirty(true);
    setSaved(false);
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }

  function handleAddPortionVariant(defaultName = '', defaultPrice = '') {
    setIsDirty(true);
    setSaved(false);
    const newId = `variant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setForm((prev) => ({
      ...prev,
      portion_variants: [
        ...prev.portion_variants,
        {
          id: newId,
          name: defaultName,
          price: defaultPrice,
          model_glb_url: '',
          model_usdz_url: ''
        }
      ]
    }));
  }

  function handleUpdatePortionVariant(index, field, value) {
    setIsDirty(true);
    setSaved(false);
    setForm((prev) => {
      const nextVariants = [...prev.portion_variants];
      nextVariants[index] = { ...nextVariants[index], [field]: value };
      return { ...prev, portion_variants: nextVariants };
    });
  }

  function handleRemovePortionVariant(index) {
    setIsDirty(true);
    setSaved(false);
    setForm((prev) => {
      const target = prev.portion_variants[index];
      if (target?.id) {
        setPortionModelFiles((p) => {
          const next = { ...p };
          delete next[target.id];
          return next;
        });
      }
      return {
        ...prev,
        portion_variants: prev.portion_variants.filter((_, i) => i !== index)
      };
    });
  }

  function handlePortionModelSelect(variantId, file) {
    if (file) {
      const ext = file.name?.split('.').pop()?.toLowerCase();
      if (!STORAGE_LIMITS.dishModel.allowedExtensions.includes(ext) || file.size > STORAGE_LIMITS.dishModel.maxSizeBytes) {
        setErrorMessage(`"${file.name}" is invalid. 3D models must be .glb or .usdz and under 25 MB.`);
        return;
      }
    }
    setErrorMessage('');
    setIsDirty(true);
    setSaved(false);
    setPortionModelFiles((prev) => ({
      ...prev,
      [variantId]: file
    }));
  }

  function handleClearPortionModel(variantIndex, variantId) {
    setIsDirty(true);
    setSaved(false);
    setPortionModelFiles((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    setForm((prev) => {
      const nextVariants = [...prev.portion_variants];
      if (nextVariants[variantIndex]) {
        nextVariants[variantIndex] = {
          ...nextVariants[variantIndex],
          model_glb_url: '',
          model_usdz_url: ''
        };
      }
      return { ...prev, portion_variants: nextVariants };
    });
  }

  function handleRemovePreview(index) {
    setIsDirty(true);
    setSaved(false);
    const target = mediaPreviews[index];
    if (!target) return;

    if (target.type === 'image') {
      if (target.file) {
        // Queued (not yet uploaded) photo — match by file, not preview index
        setImageFiles((prev) => prev.filter((f) => f !== target.file));
        URL.revokeObjectURL(target.url);
      } else {
        setForm((prev) => {
          const updatedGallery = (prev.gallery_urls || []).filter((u) => u !== target.url);
          return {
            ...prev,
            gallery_urls: updatedGallery,
            // The thumbnail is either the first photo itself (older dishes) or a
            // small copy of it — re-point it when that first photo is removed.
            thumbnail_url: (prev.thumbnail_url === target.url || (prev.gallery_urls || [])[0] === target.url)
              ? (updatedGallery[0] || '')
              : prev.thumbnail_url
          };
        });
      }
    } else if (target.type === 'video') {
      if (target.file) {
        setVideoFiles((prev) => prev.filter((f) => f !== target.file));
        URL.revokeObjectURL(target.url);
      } else {
        setForm((prev) => ({
          ...prev,
          video_urls: (prev.video_urls || []).filter((u) => u !== target.url)
        }));
      }
    }

    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (videoProcessing) {
      setErrorMessage(`Please wait — "${videoProcessing.name}" is still being compressed (${videoProcessing.pct}%).`);
      return;
    }
    setSubmitting(true);
    setSaved(false);
    setErrorMessage('');

    // Input sanitization & validation
    const sanitizedName = (form.name || '').replace(/<[^>]*>?/gm, '').trim();
    if (sanitizedName.length < 2) {
      setErrorMessage('Dish name must be at least 2 characters.');
      setSubmitting(false);
      return;
    }
    if (sanitizedName.length > 100) {
      setErrorMessage('Dish name cannot exceed 100 characters.');
      setSubmitting(false);
      return;
    }

    const priceNum = Number(form.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setErrorMessage('Base price must be a valid non-negative number.');
      setSubmitting(false);
      return;
    }

    const sanitizedCategory = (form.category || '').replace(/<[^>]*>?/gm, '').trim();
    if (!sanitizedCategory) {
      setErrorMessage('Please select or specify a category for this dish.');
      setSubmitting(false);
      return;
    }

    const sanitizedDesc = (form.description || '').replace(/<[^>]*>?/gm, '').trim();
    if (sanitizedDesc.length > 1000) {
      setErrorMessage('Description must be 1000 characters or fewer.');
      setSubmitting(false);
      return;
    }

    const sanitizedAllergens = (form.allergens || '').replace(/<[^>]*>?/gm, '').trim();

    // Build the list of upload steps so the bottom tile can show "2 / 4 · Uploading videos…"
    const pendingPortionFiles = form.portion_variants.filter((v) => portionModelFiles[v.id]);
    const steps = [
      imageFiles.length > 0 && `Uploading ${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'}…`,
      videoFiles.length > 0 && `Uploading ${videoFiles.length} video${videoFiles.length === 1 ? '' : 's'}…`,
      modelFile && !portionModelsActive && `Uploading 3D model "${modelFile.name}"…`,
      pendingPortionFiles.length > 0 && `Uploading ${pendingPortionFiles.length} portion 3D model${pendingPortionFiles.length === 1 ? '' : 's'}…`,
      'Saving dish details…',
    ].filter(Boolean);
    let stepIdx = 0;
    const nextStep = () => {
      setUploadStatus({ label: steps[stepIdx], step: stepIdx + 1, total: steps.length });
      stepIdx += 1;
    };

    try {
      // 1. Upload new gallery images
      let imageResult = { urls: [] };
      let thumbnailUrl = '';
      if (imageFiles.length > 0) {
        nextStep();
        imageResult = await uploadDishMedia(imageFiles, editId, 'images');
        if (imageResult.error) {
          setErrorMessage(`Image upload failed: ${imageResult.error.message}`);
          setSubmitting(false);
          return;
        }
        // Small (~600px WebP) thumbnail for menu cards, so guests scrolling
        // the menu don't download full-size photos. Falls back to the full
        // image if it can't be made.
        const thumbFile = await makeDishThumbnail(imageFiles[0]);
        if (thumbFile) {
          const thumbResult = await uploadDishMedia([thumbFile], editId, 'images');
          if (!thumbResult.error && thumbResult.urls[0]) thumbnailUrl = thumbResult.urls[0];
        }
      }

      // 2. Upload new videos
      let videoResult = { urls: [] };
      if (videoFiles.length > 0) {
        nextStep();
        videoResult = await uploadDishMedia(videoFiles, editId, 'videos');
        if (videoResult.error) {
          setErrorMessage(`Video upload failed: ${videoResult.error.message}`);
          setSubmitting(false);
          return;
        }
      }

      // 3. Upload base 3D model
      let modelResult = { url: '' };
      if (modelFile && !portionModelsActive) {
        nextStep();
        modelResult = await uploadDishModel(modelFile);
        if (modelResult.error) {
          setErrorMessage(`Model upload failed: ${modelResult.error.message}`);
          setSubmitting(false);
          return;
        }
      }

      // 4. Upload individual portion variant 3D models
      if (pendingPortionFiles.length > 0) nextStep();
      const failedPortionUploads = [];
      const cleanedVariants = await Promise.all(
        form.portion_variants.map(async (variant) => {
          let glbUrl = variant.model_glb_url || '';
          let usdzUrl = variant.model_usdz_url || '';
          const pendingFile = portionModelFiles[variant.id];
          if (pendingFile) {
            const uploaded = await uploadDishModel(pendingFile);
            if (!uploaded?.url) failedPortionUploads.push(`${variant.name || 'Portion'} (${uploaded?.error?.message || 'upload failed'})`);
            if (uploaded?.url) {
              if (pendingFile.name.toLowerCase().endsWith('.glb')) {
                glbUrl = uploaded.url;
              } else if (pendingFile.name.toLowerCase().endsWith('.usdz')) {
                usdzUrl = uploaded.url;
              }
            }
          }
          return {
            id: variant.id,
            name: (variant.name || '').trim(),
            price: Number(variant.price) || 0,
            model_glb_url: glbUrl,
            model_usdz_url: usdzUrl
          };
        })
      );

      const nextDish = {
        name: sanitizedName,
        category: sanitizedCategory,
        price: priceNum,
        description: sanitizedDesc || 'Freshly added dish.',
        veg: Boolean(form.veg),
        is_bestseller: Boolean(form.is_bestseller),
        is_special: Boolean(form.is_special),
        is_jain: Boolean(form.is_jain),
        spice_level: Number(form.spice_level) || 1,
        allergens: sanitizedAllergens,
        portion_variants: cleanedVariants,
        thumbnail_url: ((form.gallery_urls || []).length ? form.thumbnail_url : '') || thumbnailUrl || imageResult.urls[0] || form.thumbnail_url || '',
        // New uploads are added to the photos/videos the dish already has
        gallery_urls: [...(form.gallery_urls || []), ...imageResult.urls],
        video_urls: [...(form.video_urls || []), ...videoResult.urls],
        model_glb_url: (modelResult.url && modelFile?.name.toLowerCase().endsWith('.glb')) ? modelResult.url : (form.model_glb_url || ''),
        model_usdz_url: (modelResult.url && modelFile?.name.toLowerCase().endsWith('.usdz')) ? modelResult.url : (form.model_usdz_url || '')
      };

      if (failedPortionUploads.length) {
        setErrorMessage(`Portion 3D model upload failed: ${failedPortionUploads.join(', ')}`);
        return;
      }

      nextStep();
      const { error } = await saveDish(nextDish, editId);
      if (error) {
        setErrorMessage(error.message || 'Could not save dish. Check your Supabase setup.');
        return;
      }
      setSaved(true);
      setIsDirty(false);
      if (currentDraftId) {
        // The draft has been published — remove it from the drafts list
        deleteDraft(hotelId, currentDraftId);
        setCurrentDraftId(null);
        refreshDrafts();
      }
      setImageFiles([]);
      setVideoFiles([]);
      setModelFile(null);
      setPortionModelFiles({});
      if (!editId) {
        setMediaPreviews([]);
        setForm(initialForm);
      } else {
        setForm((prev) => ({
          ...prev,
          ...nextDish,
          portion_variants: cleanedVariants
        }));
      }
    } catch (err) {
      setErrorMessage(err.message || 'An unexpected error occurred while saving.');
    } finally {
      setSubmitting(false);
      setUploadStatus(null);
    }
  }

  // Active Model helper
  const hasExistingModel = Boolean(form.model_glb_url || form.model_usdz_url);
  // When portions carry their own 3D models, the single dish-level model slot
  // is locked so guests always see the model of the portion they selected.
  const portionModelCount = form.portion_variants.filter(
    (v) => v.model_glb_url || v.model_usdz_url || portionModelFiles[v.id]
  ).length;
  const portionModelsActive = portionModelCount > 0;
  const currentModelName = modelFile?.name || (hasExistingModel ? (form.model_glb_url?.split('/').pop() || form.model_usdz_url?.split('/').pop()) : '');

  // Uploaded image previews
  const uploadedImagePreviews = mediaPreviews.filter((m) => m.type === 'image');

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100%', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 32px 32px 32px', position: 'relative' }}>
        
        {/* ── Top Navigation & View Switcher Bar ────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-muted)' }}>
                <Link to="/dashboard" style={{ color: 'inherit', textDecoration: 'none' }}>Dashboard</Link>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--text-muted)' }}>chevron_right</span>
                <Link to="/menu" style={{ color: 'inherit', textDecoration: 'none' }}>Dish Form/menu</Link>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--text-muted)' }}>chevron_right</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{editId ? 'Edit Dish' : 'Add Dish'}</span>
              </nav>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '2px' }}>
                <h1
                  aria-label={editId ? 'Edit Dish' : 'Add Dish'}
                  className="font-serif-luxury"
                  style={{
                    margin: 0,
                    fontSize: '38px',
                    lineHeight: '44px',
                    fontWeight: 700,
                    color: 'var(--text)',
                    letterSpacing: '-0.02em'
                  }}
                >
                  {editId ? 'Edit Culinary Dish' : 'Add Culinary Dish'}
                </h1>
                {isDirty && !saved && (
                  <span style={{ fontSize: '11px', background: 'var(--accent-subtle)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '999px', fontWeight: 700, textTransform: 'uppercase' }}>
                    Unsaved Edits
                  </span>
                )}
              </div>
            </div>

            {/* Mode Selector & Quick Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '4px', borderRadius: '12px', display: 'flex', alignItems: 'center', boxShadow: 'var(--shadow-xs)' }}>
                <button
                  type="button"
                  id="tabDishFormBtn"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '8px',
                    background: 'var(--primary)', color: 'var(--primary-fg)',
                    border: 'none', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                    boxShadow: 'var(--shadow-xs)'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit_note</span>
                  <span>Dish Form</span>
                </button>
                <Link
                  to="/menu"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '8px',
                    background: 'transparent', color: 'var(--text-muted)',
                    textDecoration: 'none', fontWeight: 600, fontSize: '13px',
                    transition: 'color 0.15s ease'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>menu_book</span>
                  <span>Full Menu</span>
                </Link>
              </div>

              <button
                type="button"
                onClick={() => { refreshDrafts(); setShowDrafts(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '9px 16px', borderRadius: '8px',
                  background: 'var(--bg-card)', color: 'var(--text)',
                  border: '1px solid var(--border)', fontWeight: 600, fontSize: '13px',
                  cursor: 'pointer'
                }}
                title="Open saved drafts"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>drafts</span>
                <span>Drafts</span>
                <span style={{ minWidth: '20px', padding: '0 6px', borderRadius: '999px', background: drafts.length ? 'var(--accent)' : 'var(--bg-muted)', color: drafts.length ? '#fff' : 'var(--text-muted)', fontSize: '11px', fontWeight: 700, lineHeight: '18px', textAlign: 'center' }}>
                  {drafts.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowCsvImport(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '9px 16px', borderRadius: '8px',
                  background: 'var(--bg-card)', color: 'var(--text)',
                  border: '1px solid var(--border)', fontWeight: 600, fontSize: '13px',
                  cursor: 'pointer', transition: 'background 0.15s ease'
                }}
                title="Import many dishes at once from a CSV file — you will see a preview before anything is saved"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
                <span>Import CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Master Workspace Form ────────────────────────────────────── */}
        <form onSubmit={handleSubmit} id="dishFormView">
          {/* 2-Column Master Workspace Grid (7 cols / 5 cols) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }} className="dish-form-master-grid">
            <style>{`
              @media (min-width: 1024px) {
                .dish-form-master-grid {
                  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr) !important;
                }
              }
            `}</style>

            {/* ════════ LEFT COLUMN: Dish Culinary Essentials (7 Cols) ════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Section 1: Basic Identity & Classification */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '28px 32px',
                  boxShadow: 'var(--shadow-xs)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px' }}>
                  <h2
                    aria-label="Identity & Classification"
                    className="font-serif-luxury"
                    style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: '22px' }}>ramen_dining</span>
                    Dish Identity &amp; Classification
                  </h2>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Step 01 / 03
                  </span>
                </div>

                {/* Dish Name */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="dishName" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Dish Title (Menu Display) <span style={{ color: 'var(--accent)' }}>*</span></span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>Max 80 chars</span>
                  </label>
                  <input
                    id="dishName"
                    autoFocus
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Paneer Butter Masala, Dal Bukhara, Grilled Salmon..."
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: 'var(--bg-subtle, var(--bg))',
                      color: 'var(--text)',
                      fontSize: '15px',
                      fontWeight: 500,
                      border: '1px solid var(--border)',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Category & Base Price Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  {/* Category */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="dishCategory" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      Category Classification
                    </label>
                    <div style={{ position: 'relative' }}>
                      <select
                        id="dishCategory"
                        name="category_select"
                        value={isCustomCategory ? '__custom__' : (PRESET_CATEGORIES.includes(form.category) || form.category === 'biryanis' ? form.category : '__custom__')}
                        onChange={(e) => {
                          setIsDirty(true);
                          if (e.target.value === '__custom__') {
                            setIsCustomCategory(true);
                            if (PRESET_CATEGORIES.includes(form.category) || form.category === 'biryanis') {
                              setForm((prev) => ({ ...prev, category: '' }));
                            }
                          } else {
                            setIsCustomCategory(false);
                            setForm((prev) => ({ ...prev, category: e.target.value }));
                          }
                        }}
                        style={{
                          width: '100%',
                          appearance: 'none',
                          padding: '12px 40px 12px 16px',
                          borderRadius: '12px',
                          background: 'var(--bg-subtle, var(--bg))',
                          color: 'var(--text)',
                          fontSize: '14px',
                          fontWeight: 500,
                          border: '1px solid var(--border)',
                          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                          outline: 'none',
                          cursor: 'pointer',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="Main">Mains</option>
                        <option value="Starter">Starters &amp; Appetizers</option>
                        <option value="Dessert">Desserts</option>
                        <option value="Beverages">Beverages &amp; Drinks</option>
                        <option value="Breads">Breads</option>
                        <option value="Soups & Salads">Soups &amp; Salads</option>
                        <option value="Sides">Sides &amp; Accompaniments</option>
                        <option value="__custom__">Custom / Other…</option>
                      </select>
                      <span className="material-symbols-outlined" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)', fontSize: '20px' }}>
                        expand_more
                      </span>
                    </div>
                    {isCustomCategory && (
                      <input
                        type="text"
                        placeholder="Enter custom category (e.g. Seafood, Mocktails)"
                        value={form.category}
                        onChange={(e) => {
                          setIsDirty(true);
                          setForm((prev) => ({ ...prev, category: e.target.value }));
                        }}
                        required
                        style={{
                          width: '100%', marginTop: '4px', padding: '10px 14px',
                          border: '1px solid var(--border)', borderRadius: '10px',
                          background: 'var(--bg-subtle, var(--bg))', color: 'var(--text)', fontSize: '13px', boxSizing: 'border-box'
                        }}
                      />
                    )}
                  </div>

                  {/* Base Single Price */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="basePrice" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Base Single Price ({currencySymbol.trim()})</span>
                      <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 500 }}>Incl. luxury tax</span>
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: '14px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '15px', userSelect: 'none' }}>
                        {currencySymbol.trim()}
                      </span>
                      <input
                        id="basePrice"
                        name="price"
                        type="number"
                        min="0"
                        step="1"
                        value={form.price}
                        onChange={handleChange}
                        placeholder="0.00"
                        style={{
                          width: '100%',
                          padding: '12px 16px 12px 34px',
                          borderRadius: '12px',
                          background: 'var(--bg-subtle, var(--bg))',
                          color: 'var(--text)',
                          fontSize: '15px',
                          fontWeight: 600,
                          border: '1px solid var(--border)',
                          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Portion Variants & Pricing Sub-card */}
                <div
                  style={{
                    padding: '20px',
                    borderRadius: '14px',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    marginTop: '4px'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Portion Variants &amp; Serving Tiers</p>
                        <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Guests select size on the digital QR terminal with automatic kitchen routing.</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const base = Number(form.price) || 650;
                            handleAddPortionVariant('Regular Portion (Half)', Math.round(base * 0.65));
                            handleAddPortionVariant('Full Portion', base);
                          }}
                          style={{
                            padding: '6px 12px', borderRadius: '8px',
                            background: 'var(--bg-card)', color: 'var(--text)',
                            border: '1px solid var(--border)', fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
                          <span>Half / Full</span>
                        </button>

                        <button
                          type="button"
                          aria-label="+ Add Variant"
                          onClick={() => handleAddPortionVariant()}
                          style={{
                            padding: '6px 14px', borderRadius: '8px',
                            background: 'var(--primary)', color: 'var(--primary-fg)',
                            border: 'none', fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: 'var(--shadow-xs)'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'inherit' }}>tune</span>
                          <span>Custom Variant</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Variants List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {form.portion_variants.length > 0 ? (
                      form.portion_variants.map((variant, idx) => {
                        const pendingFile = portionModelFiles[variant.id];
                        const existingModel = variant.model_glb_url || variant.model_usdz_url;
                        const iconName = idx === 0 ? 'local_dining' : idx === 1 ? 'room_service' : 'diversity_3';
                        return (
                          <div
                            key={variant.id || idx}
                            style={{
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border)',
                              borderRadius: '12px',
                              padding: '14px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px',
                              boxShadow: 'var(--shadow-xs)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 200px' }}>
                                <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: '22px' }}>{iconName}</span>
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                  <input
                                    type="text"
                                    placeholder="e.g. Half, Full"
                                    value={variant.name}
                                    onChange={(e) => handleUpdatePortionVariant(idx, 'name', e.target.value)}
                                    style={{
                                      padding: '6px 8px', borderRadius: '6px',
                                      border: '1px solid var(--border)',
                                      background: 'var(--bg)', color: 'var(--text)',
                                      fontSize: '13px', fontWeight: 600, outline: 'none'
                                    }}
                                  />
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{currencySymbol.trim()}</span>
                                  <input
                                    type="number"
                                    placeholder="Price"
                                    value={variant.price}
                                    onChange={(e) => handleUpdatePortionVariant(idx, 'price', e.target.value)}
                                    style={{
                                      width: '80px', padding: '6px 8px', borderRadius: '6px',
                                      border: '1px solid var(--border)',
                                      background: 'var(--bg)', color: 'var(--text)',
                                      fontSize: '14px', fontWeight: 700, outline: 'none'
                                    }}
                                  />
                                </div>
                                {(pendingFile || existingModel) && (
                                  <span style={{ padding: '3px 8px', borderRadius: '999px', background: 'var(--success-subtle, #ecfdf5)', color: 'var(--success-fg, #15803d)', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                    ✓ 3D available
                                  </span>
                                )}
                                <span style={{ padding: '3px 8px', borderRadius: '999px', background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                                  {idx === 1 ? 'Default Base' : 'Active'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePortionVariant(idx)}
                                  title="Remove variant"
                                  style={{
                                    background: 'none', border: 'none', color: 'var(--danger-fg, #ba1a1a)',
                                    cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                  }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                                </button>
                              </div>
                            </div>

                            {/* Secondary Row: 3D Model Attachment */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', background: 'var(--bg-subtle)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--text)', border: '1px solid var(--border)' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--accent)' }}>view_in_ar</span>
                                  <span>{pendingFile ? pendingFile.name : existingModel ? 'Replace 3D' : 'Attach 3D'}</span>
                                  <input
                                    type="file"
                                    accept=".glb,.usdz,model/gltf-binary,model/vnd.usdz+zip"
                                    onChange={(e) => handlePortionModelSelect(variant.id, e.target.files?.[0] || null)}
                                    style={{ display: 'none' }}
                                  />
                                </label>
                                {existingModel && (
                                  <button
                                    type="button"
                                    onClick={() => handleClearPortionModel(idx, variant.id)}
                                    style={{ background: 'none', border: 'none', color: 'var(--danger-fg, #ba1a1a)', fontSize: '11px', cursor: 'pointer' }}
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '18px 20px',
                          background: 'var(--bg-card)',
                          borderRadius: '12px',
                          border: '1px dashed var(--border)'
                        }}
                      >
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>No Portion Variants Added</p>
                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                          Dish will be served at the single base price. Click <span style={{ fontWeight: 600, color: 'var(--accent)' }}>+ Half / Full</span> or <span style={{ fontWeight: 600, color: 'var(--accent)' }}>+ Custom Variant</span> above to configure portions.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 2: Culinary Heritage & Recipe Notes */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '28px 32px',
                  boxShadow: 'var(--shadow-xs)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px' }}>
                  <h2
                    className="font-serif-luxury"
                    style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: '22px' }}>history_edu</span>
                    Recipe Notes &amp; Culinary Details
                  </h2>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Step 02 / 03
                  </span>
                </div>

                {/* Description */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="dishDescription" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Gastronomic Narrative &amp; Plating Description</span>
                    <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 500 }}>Displayed prominently on 3D AR view</span>
                  </label>
                  <textarea
                    id="dishDescription"
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    rows={4}
                    placeholder="Describe culinary spices, authentic preparation methods, heirloom garnishes, and sensory plating..."
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: 'var(--bg-subtle, var(--bg))',
                      color: 'var(--text)',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      border: '1px solid var(--border)',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                {/* Dish Highlights & Curated Badges */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    Dish Highlights &amp; Curated Badges
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    {/* Non-Vegetarian button */}
                    <button
                      type="button"
                      aria-label="Non-Veg"
                      onClick={() => {
                        setIsDirty(true);
                        setSaved(false);
                        setForm((prev) => ({ ...prev, veg: false }));
                      }}
                      style={{
                        padding: '6px 14px', borderRadius: '999px',
                        background: !form.veg ? '#dc2626' : 'var(--bg-subtle)',
                        color: !form.veg ? '#ffffff' : 'var(--text-muted)',
                        border: !form.veg ? 'none' : '1px solid var(--border)',
                        fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        boxShadow: !form.veg ? '0 1px 3px rgba(220, 38, 38, 0.3)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: !form.veg ? '#ffffff' : 'var(--text-muted)' }}></span>
                      <span>Non-Vegetarian</span>
                    </button>

                    {/* Vegetarian button */}
                    <button
                      type="button"
                      aria-label="Vegetarian"
                      onClick={() => {
                        setIsDirty(true);
                        setSaved(false);
                        setForm((prev) => ({ ...prev, veg: true }));
                      }}
                      style={{
                        padding: '6px 14px', borderRadius: '999px',
                        background: form.veg ? '#16a34a' : 'var(--bg-subtle)',
                        color: form.veg ? '#ffffff' : 'var(--text-muted)',
                        border: form.veg ? 'none' : '1px solid var(--border)',
                        fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        boxShadow: form.veg ? '0 1px 3px rgba(22, 163, 74, 0.3)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: form.veg ? '#ffffff' : 'var(--text-muted)' }}></span>
                      <span>Vegetarian</span>
                    </button>

                    {/* Bestseller button */}
                    <button
                      type="button"
                      aria-label="Bestseller"
                      onClick={() => {
                        setIsDirty(true);
                        setSaved(false);
                        setForm((prev) => ({ ...prev, is_bestseller: !prev.is_bestseller }));
                      }}
                      style={{
                        padding: '6px 14px', borderRadius: '999px',
                        background: form.is_bestseller ? 'var(--accent)' : 'var(--bg-subtle)',
                        color: form.is_bestseller ? 'var(--accent-fg)' : 'var(--text-muted)',
                        border: form.is_bestseller ? 'none' : '1px solid var(--border)',
                        fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        boxShadow: form.is_bestseller ? '0 1px 3px rgba(194, 120, 53, 0.3)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'inherit' }}>hotel_class</span>
                      <span>Bestseller</span>
                    </button>

                    {/* Chef's Signature button */}
                    <button
                      type="button"
                      aria-label="Chef's Special"
                      onClick={() => {
                        setIsDirty(true);
                        setSaved(false);
                        setForm((prev) => ({ ...prev, is_special: !prev.is_special }));
                      }}
                      style={{
                        padding: '6px 14px', borderRadius: '999px',
                        background: form.is_special ? 'var(--primary)' : 'var(--bg-subtle)',
                        color: form.is_special ? 'var(--primary-fg)' : 'var(--text-muted)',
                        border: form.is_special ? 'none' : '1px solid var(--border)',
                        fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        boxShadow: form.is_special ? 'var(--shadow-xs)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'inherit' }}>award_star</span>
                      <span>Chef's Signature</span>
                    </button>

                    {/* Jain Available button */}
                    <button
                      type="button"
                      aria-label="Jain Available"
                      onClick={() => {
                        setIsDirty(true);
                        setSaved(false);
                        setForm((prev) => ({ ...prev, is_jain: !prev.is_jain }));
                      }}
                      style={{
                        padding: '6px 14px', borderRadius: '999px',
                        background: form.is_jain ? '#059669' : 'var(--bg-subtle)',
                        color: form.is_jain ? '#ffffff' : 'var(--text-muted)',
                        border: form.is_jain ? 'none' : '1px solid var(--border)',
                        fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>spa</span>
                      <span>Jain Available</span>
                    </button>

                    {/* Spice Level Indicator */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: '999px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginRight: '2px' }}>Spice:</span>
                      {[1, 2, 3].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => {
                            setIsDirty(true);
                            setSaved(false);
                            setForm((prev) => ({ ...prev, spice_level: lvl }));
                          }}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          title={`Spice level ${lvl}`}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{
                              fontSize: '16px',
                              color: lvl <= form.spice_level ? 'var(--accent)' : 'var(--text-muted)',
                              fontVariationSettings: lvl <= form.spice_level ? '"FILL" 1' : 'none'
                            }}
                          >
                            local_fire_department
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Allergens & Dietary Notes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="dishAllergens" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    Allergens &amp; Dietary Notes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <input
                    id="dishAllergens"
                    name="allergens"
                    type="text"
                    value={form.allergens}
                    onChange={handleChange}
                    placeholder="e.g. Contains Dairy, Nuts, Gluten / Gluten-Free"
                    style={{
                      width: '100%',
                      padding: '11px 16px',
                      borderRadius: '12px',
                      background: 'var(--bg-subtle, var(--bg))',
                      color: 'var(--text)',
                      fontSize: '13px',
                      border: '1px solid var(--border)',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

            </div>

            {/* ════════ RIGHT COLUMN: Media, 3D AR Assets & Dimensions (5 Cols) ════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Card 1: High-Res Dish Photography */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '28px 32px',
                  boxShadow: 'var(--shadow-xs)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2
                    aria-label="High-Res Photography"
                    className="font-serif-luxury"
                    style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: '22px' }}>photo_library</span>
                    High-Res Dish Photography
                  </h2>
                  <span style={{ fontSize: '11px', fontWeight: 600, background: uploadedImagePreviews.length > 0 ? 'var(--accent-subtle)' : 'var(--bg-subtle)', color: uploadedImagePreviews.length > 0 ? 'var(--accent)' : 'var(--text-muted)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '999px' }}>
                    {uploadedImagePreviews.length > 0 ? `${uploadedImagePreviews.length} Photos Added` : '0 Photos Added'}
                  </span>
                </div>

                {/* Photo Previews Grid */}
                {uploadedImagePreviews.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: uploadedImagePreviews.length > 1 ? 'minmax(0, 2fr) minmax(0, 1fr)' : '1fr', gap: '10px' }}>
                    {/* Hero Photo */}
                    <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', boxShadow: 'var(--shadow-xs)' }}>
                      <img
                        src={uploadedImagePreviews[0]?.url}
                        alt="Primary hero dish"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(17, 7, 3, 0.8)', backdropFilter: 'blur(8px)', color: '#ffffff', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '12px', color: '#ffdcc3' }}>star</span>
                        <span>Primary Hero</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePreview(mediaPreviews.indexOf(uploadedImagePreviews[0]))}
                        style={{
                          position: 'absolute', top: '8px', right: '8px',
                          width: '26px', height: '26px', borderRadius: '50%',
                          background: 'var(--bg-card)', border: '1px solid var(--border)',
                          color: 'var(--text)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }}
                        title="Remove photo"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                      </button>
                    </div>

                    {/* Secondary Photo */}
                    {uploadedImagePreviews.length > 1 && (
                      <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', boxShadow: 'var(--shadow-xs)' }}>
                        <img
                          src={uploadedImagePreviews[1]?.url}
                          alt="Secondary dish plating"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePreview(mediaPreviews.indexOf(uploadedImagePreviews[1]))}
                          style={{
                            position: 'absolute', top: '8px', right: '8px',
                            width: '24px', height: '24px', borderRadius: '50%',
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            color: 'var(--text)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                          }}
                          title="Remove photo"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Dropzone */}
                <label
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: '12px',
                    padding: '18px 16px',
                    background: 'var(--bg-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--accent)' }}>add_photo_alternate</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Click to upload</span> or drag high-res photography
                    </p>
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                      Ratios: {IMAGE_RATIO_HINT} only • JPG or PNG • {formatMb(MAX_TOTAL_IMAGE_BYTES)} total per dish • compressed ~30% on upload
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    multiple
                    onChange={async (event) => {
                      const picked = [...(event.target.files || [])];
                      event.target.value = '';
                      // JPG/PNG only, ratios 1:1, 4:3, 3:4, 16:9, 4:5, 5:4 only,
                      // ≤10 MB of photos per dish; accepted photos are compressed ≥30%
                      const queuedBytes = imageFiles.reduce((sum, f) => sum + f.size, 0);
                      const { files, notices, errors } = await prepareDishImages(picked, { existingBytes: queuedBytes });
                      setImageNotices(notices);
                      setErrorMessage(errors.join(' '));
                      if (!files.length) return;
                      setIsDirty(true);
                      setSaved(false);
                      setImageFiles((prev) => [...prev, ...files]);
                      setMediaPreviews((prev) => [
                        ...prev,
                        ...files.map((file) => ({ url: URL.createObjectURL(file), type: 'image', file }))
                      ]);
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
                {imageNotices.length > 0 && (
                  <ul style={{ margin: 0, padding: '8px 12px 8px 26px', borderRadius: '10px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {imageNotices.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                )}
              </div>

              {/* Card 2: Showcase & Plating Video */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '24px 28px',
                  boxShadow: 'var(--shadow-xs)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent)' }}>videocam</span>
                    </div>
                    <h2 className="font-serif-luxury" style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>
                      Showcase &amp; Plating Video
                    </h2>
                  </div>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '999px' }}>
                    HD 60fps • Optional
                  </span>
                </div>

                {/* Video Previews */}
                {mediaPreviews.filter((m) => m.type === 'video').length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {mediaPreviews.filter((m) => m.type === 'video').map((item) => (
                      <div key={item.url} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <video src={item.url} controls style={{ width: '180px', height: '110px', objectFit: 'cover' }} />
                        <button
                          type="button"
                          onClick={() => handleRemovePreview(mediaPreviews.indexOf(item))}
                          style={{
                            position: 'absolute', top: '4px', right: '4px',
                            width: '22px', height: '22px', borderRadius: '50%',
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            color: 'var(--danger-fg, #ba1a1a)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                          title="Remove video"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Video Dropzone */}
                <label
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: '12px',
                    padding: '18px 16px',
                    background: 'var(--bg-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--accent)' }}>video_library</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Click to upload</span> or drag culinary plating video
                    </p>
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                      Best ratios: {VIDEO_RATIO_HINT} (others allowed) • MP4 only • {formatMb(MAX_TOTAL_VIDEO_BYTES)} total per dish • compressed ~30% on upload
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".mp4,video/mp4"
                    multiple
                    disabled={Boolean(videoProcessing)}
                    onChange={async (event) => {
                      const picked = [...(event.target.files || [])];
                      event.target.value = '';
                      // MP4 only, ≤15 MB of video per dish. 4:3, 3:4 and 16:9 are
                      // preferred; other ratios are accepted with a heads-up.
                      const queuedBytes = videoFiles.reduce((sum, f) => sum + f.size, 0);
                      const { files, notices, errors } = await checkDishVideos(picked, { existingBytes: queuedBytes });
                      setErrorMessage(errors.join(' '));
                      if (!files.length) { setVideoNotices(notices); return; }
                      setIsDirty(true);
                      setSaved(false);
                      // Compress each video (~30% smaller) before it is queued for upload
                      const finalFiles = [];
                      let before = 0;
                      let after = 0;
                      for (const file of files) {
                        setVideoProcessing({ name: file.name, pct: 0 });
                        const result = await compressDishVideo(file, {
                          onProgress: (p) => setVideoProcessing({ name: file.name, pct: Math.round(p * 100) })
                        });
                        if (!result.compressed && result.reason) notices.push(result.reason);
                        before += file.size;
                        after += result.file.size;
                        finalFiles.push(result.file);
                      }
                      setVideoProcessing(null);
                      if (after < before) {
                        notices.push(`Video compressed: ${formatMb(before)} → ${formatMb(after)} (${Math.round((1 - after / before) * 100)}% smaller).`);
                      }
                      setVideoNotices(notices);
                      setVideoFiles((prev) => [...prev, ...finalFiles]);
                      setMediaPreviews((prev) => [
                        ...prev,
                        ...finalFiles.map((file) => ({ url: URL.createObjectURL(file), type: 'video', file }))
                      ]);
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
                {videoProcessing && (
                  <div role="status" aria-live="polite" style={{ padding: '8px 12px', borderRadius: '10px', background: 'var(--accent-subtle)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text)', fontWeight: 600 }}>
                    Compressing “{videoProcessing.name}” for faster loading… {videoProcessing.pct}%
                  </div>
                )}
                {videoNotices.length > 0 && (
                  <ul style={{ margin: 0, padding: '8px 12px 8px 26px', borderRadius: '10px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {videoNotices.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                )}
              </div>

              {/* Card 3: 3D Augmented Reality Asset */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '24px 28px',
                  boxShadow: 'var(--shadow-xs)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent)' }}>view_in_ar</span>
                    </div>
                    <h2 className="font-serif-luxury" style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>
                      3D Augmented Reality Asset
                    </h2>
                  </div>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, background: (modelFile || hasExistingModel || portionModelsActive) ? 'var(--accent-subtle)' : 'var(--bg-subtle)', color: (modelFile || hasExistingModel || portionModelsActive) ? 'var(--accent)' : 'var(--text-muted)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '999px' }}>
                    {portionModelsActive ? '3D Available' : (modelFile || hasExistingModel) ? 'AR Ready' : 'Optional'}
                  </span>
                </div>

                {portionModelsActive ? (
                  <div
                    data-testid="portion-models-lock"
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '16px',
                      background: 'var(--bg-subtle)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '22px', color: 'var(--accent)' }}>view_in_ar</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ display: 'inline-flex', alignSelf: 'flex-start', padding: '2px 10px', borderRadius: '999px', background: 'var(--success-subtle, #ecfdf5)', color: 'var(--success-fg, #15803d)', fontSize: '11px', fontWeight: 700 }}>
                        ✓ 3D available
                      </span>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text)', lineHeight: 1.45 }}>
                        {portionModelCount} portion{portionModelCount === 1 ? ' has' : 's have'} {portionModelCount === 1 ? 'its own' : 'their own'} 3D model, so the dish-level model upload is turned off.
                        Guests see the model of the portion they pick.
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                        To use a single model for the whole dish, clear the portion models first.
                      </p>
                    </div>
                  </div>
                ) : (
                <>
                {/* 3D Model Dropzone */}
                <label
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: '12px',
                    padding: '18px 16px',
                    background: 'var(--bg-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--accent)' }}>deployed_code</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Click to upload</span> or drag 3D model (.GLB, .USDZ)
                    </p>
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                      Max 25MB • Recommended for WebAR interactive dining
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".glb,.usdz,model/gltf-binary,model/vnd.usdz+zip"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      if (file) {
                        const ext = file.name?.split('.').pop()?.toLowerCase();
                        if (!STORAGE_LIMITS.dishModel.allowedExtensions.includes(ext) || file.size > STORAGE_LIMITS.dishModel.maxSizeBytes) {
                          setErrorMessage(`"${file.name}" is invalid. 3D models must be .glb or .usdz and under 25 MB.`);
                          event.target.value = '';
                          return;
                        }
                      }
                      setErrorMessage('');
                      setIsDirty(true);
                      setSaved(false);
                      setModelFile(file);
                    }}
                    style={{ display: 'none' }}
                  />
                </label>

                {/* Active Model Card */}
                {(modelFile || hasExistingModel) && (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      boxShadow: 'var(--shadow-xs)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xs)', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: '22px' }}>deployed_code</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {currentModelName}
                          </span>
                          <span style={{ padding: '1px 6px', borderRadius: '999px', background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>
                            Active
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {modelFile ? `${(modelFile.size / (1024 * 1024)).toFixed(1)} MB • Upload Ready` : 'Attached to dish • Active in WebAR'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <label
                        style={{ padding: '6px 8px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', boxShadow: 'var(--shadow-xs)', display: 'flex', alignItems: 'center' }}
                        title="Replace Asset"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>sync</span>
                        <input
                          type="file"
                          accept=".glb,.usdz,model/gltf-binary,model/vnd.usdz+zip"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            if (file) {
                              setIsDirty(true);
                              setSaved(false);
                              setModelFile(file);
                            }
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDirty(true);
                          setSaved(false);
                          setModelFile(null);
                          setForm((prev) => ({ ...prev, model_glb_url: '', model_usdz_url: '' }));
                        }}
                        style={{ padding: '6px 8px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--danger-fg, #ba1a1a)', cursor: 'pointer', boxShadow: 'var(--shadow-xs)', display: 'flex', alignItems: 'center' }}
                        title="Remove model"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                      </button>
                    </div>
                  </div>
                )}

                </>
                )}

                {/* Models must be authored at real-world size (1 unit = 1 metre) */}
                <div style={{ background: 'var(--bg-subtle)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Upload GLB and USDZ files authored at <strong>real-world size</strong> (1 unit = 1 metre). AR previews use the model&rsquo;s native dimensions — no scaling is applied.
                </div>
              </div>

            </div>
          </div>

          {/* ════════ STICKY BOTTOM CONTROL & CONFIRMATION DECK ════════ */}
          <div
            style={{
              position: 'sticky',
              bottom: '16px',
              zIndex: 30,
              width: '100%',
              marginTop: '28px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px 24px',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxSizing: 'border-box'
            }}
            aria-live="polite"
          >
            {/* ── Upload / save notifications (live) ── */}
            {(submitting && uploadStatus) && (
              <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 12px', borderRadius: '10px', background: 'var(--accent-subtle, rgba(194,120,53,0.1))', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent)' }}>cloud_upload</span>
                    {uploadStatus.label}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Step {uploadStatus.step} of {uploadStatus.total}</span>
                </div>
                <div style={{ height: '4px', borderRadius: '999px', background: 'var(--bg-muted, #F0E8DC)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(((uploadStatus.step - 0.5) / uploadStatus.total) * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}
            {errorMessage && !submitting && (
              <div role="alert" style={{ color: 'var(--danger-fg, #ba1a1a)', background: 'var(--danger-subtle, #ffdad6)', border: '1px solid var(--danger-border, #ba1a1a)', borderRadius: '10px', padding: '8px 12px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>error</span>
                <span style={{ flex: 1 }}>{errorMessage}</span>
                <button type="button" onClick={() => setErrorMessage('')} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '14px' }}>✕</button>
              </div>
            )}
            {saved && !submitting && (
              <div role="status" style={{ background: 'var(--success-subtle, #f0fdf4)', border: '1px solid var(--success-border, #86efac)', borderRadius: '10px', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--success-fg, #15803d)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
                  Dish saved — it is now live on your QR menu.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => { setSaved(false); setForm(initialForm); }}
                    style={{ background: 'var(--bg-card)', color: 'var(--success-fg, #15803d)', border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 12px', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}
                  >
                    + Add another dish
                  </button>
                  <Link
                    to="/menu"
                    style={{ background: 'var(--success, #16a34a)', color: '#ffffff', borderRadius: '8px', padding: '5px 12px', fontWeight: 600, textDecoration: 'none', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    View Full Menu →
                  </Link>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            {/* Left buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '10px 18px', borderRadius: '12px',
                    background: 'var(--bg-subtle)', color: 'var(--text)',
                    border: '1px solid var(--border)', fontWeight: 600, fontSize: '13px',
                    cursor: 'pointer', transition: 'background 0.15s ease'
                  }}
                  title="Saves the text of this dish to your Drafts list on this browser"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>drafts</span>
                  <span>{currentDraftId ? 'Update Draft' : 'Save as Draft'}</span>
                </button>
                <span style={{ fontSize: '10px', color: draftNotice ? 'var(--accent)' : 'var(--text-muted)', maxWidth: '240px', lineHeight: 1.3 }} title="Drafts save text only — images, videos and 3D models are not saved in a draft.">
                  {draftNotice || 'Drafts save text only (no media).'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCurrentDraftId(null);
                  setIsDirty(false);
                  setSaved(false);
                  setForm(initialForm);
                  setImageFiles([]);
                  setVideoFiles([]);
                  setModelFile(null);
                  setMediaPreviews([]);
                  navigate('/menu');
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '10px 18px', borderRadius: '12px',
                  background: 'transparent', border: 'none',
                  color: 'var(--danger-fg, #ba1a1a)', fontWeight: 600, fontSize: '13px',
                  cursor: 'pointer', transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger-subtle, rgba(232, 122, 104, 0.15))'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                <span>Discard</span>
              </button>
            </div>

            {/* Right: auto-saved indicator + Save & Publish button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                {isDirty ? 'Unsaved edits' : saved ? 'Dish saved' : 'New draft'}
              </span>

              <button
                type="submit"
                aria-label="Save dish"
                disabled={submitting}
                aria-busy={submitting}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '10px 22px', borderRadius: '12px',
                  background: submitting ? 'var(--text-muted)' : 'var(--primary)',
                  color: 'var(--primary-fg)',
                  border: 'none', fontWeight: 700, fontSize: '14px',
                  cursor: submitting ? 'wait' : 'pointer',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'inherit' }}>
                  {submitting ? 'hourglass_top' : 'check_circle'}
                </span>
                <span>
                  {submitting
                    ? (uploadStatus ? `Uploading ${uploadStatus.step}/${uploadStatus.total}…` : 'Saving dish…')
                    : editId
                      ? `Save dish changes ${form.price ? `(${currencySymbol.trim()}${form.price})` : ''}`
                      : `Save & Publish Dish ${form.price ? `(${currencySymbol.trim()}${form.price})` : ''}`}
                </span>
              </button>
            </div>
            </div>
          </div>
        </form>

        {showCsvImport && (
          <CsvImportModal
            currency={hotelCurrency}
            onClose={() => setShowCsvImport(false)}
            onImported={() => {}}
          />
        )}

        {showDrafts && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Saved drafts"
            onClick={(e) => { if (e.target === e.currentTarget) setShowDrafts(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          >
            <div style={{ width: '100%', maxWidth: '560px', maxHeight: '80vh', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-xl, 0 20px 50px rgba(0,0,0,0.3))' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-subtle)' }}>
                <div>
                  <h2 className="font-serif-luxury" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Saved drafts</h2>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Click a draft to continue editing it. Drafts keep text only.</p>
                </div>
                <button type="button" onClick={() => setShowDrafts(false)} aria-label="Close drafts" style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', padding: '10px' }}>
                {drafts.length === 0 ? (
                  <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No drafts yet. Use <strong>Save as Draft</strong> at the bottom of the dish form.
                  </div>
                ) : drafts.map((draft) => (
                  <div
                    key={draft.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${currentDraftId === draft.id ? 'var(--accent)' : 'var(--border)'}`, marginBottom: '8px', background: 'var(--bg)' }}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenDraft(draft)}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)' }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {draft.form?.name?.trim() || 'Untitled dish'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {draft.form?.category || 'Main'}
                        {draft.form?.price !== '' && draft.form?.price !== undefined ? ` · ${currencySymbol}${draft.form.price}` : ''}
                        {' · '}saved {new Date(draft.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(draft.id)}
                      title="Delete draft"
                      aria-label={`Delete draft ${draft.form?.name || ''}`}
                      style={{ background: 'none', border: 'none', color: 'var(--danger-fg, #ba1a1a)', cursor: 'pointer', padding: '4px' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
