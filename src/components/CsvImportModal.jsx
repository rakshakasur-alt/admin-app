import { useEffect, useMemo, useRef, useState } from 'react';
import { saveDishesBulk } from '../lib/supabaseClient';
import {
  DISH_CSV_FIELDS,
  CSV_TEMPLATE_HEADER,
  CSV_TEMPLATE_EXAMPLE,
  CSV_TEMPLATE_EXAMPLE_2,
  autoMapColumns,
  parseCsv,
  rowsToDishes,
} from '../lib/dishCsv';
import { formatCurrency } from '../lib/formatters';

const PREVIEW_LIMIT = 100;

const th = {
  textAlign: 'left',
  padding: '6px 8px',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)',
  position: 'sticky',
  top: 0,
  background: 'var(--bg-subtle)',
  whiteSpace: 'nowrap',
};
const td = {
  padding: '6px 8px',
  fontSize: '12px',
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
};

/**
 * CSV import popup.
 *  Step 1 — template message + download, and a drop zone / Browse button.
 *  Step 2 — shows exactly what is in the file, how each column is mapped to
 *           a dish field (editable), validates every row, then saves all
 *           valid dishes in one go.
 */
export default function CsvImportModal({ file: initialFile = null, currency = 'INR', onClose, onImported }) {
  const [file, setFile] = useState(initialFile);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!file) return undefined;
    setParsed(null);
    setResult(null);
    setParseError('');
    file.text().then((text) => {
      if (cancelled) return;
      const data = parseCsv(text);
      if (!data.headers.length || !data.rows.length) {
        setParseError('The file needs a header row and at least one dish row.');
        return;
      }
      setParsed(data);
      setMapping(autoMapColumns(data.headers));
    }).catch((err) => {
      if (!cancelled) setParseError(`Could not read the file: ${err.message}`);
    });
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !importing) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [importing, onClose]);

  const results = useMemo(
    () => (parsed ? rowsToDishes(parsed.rows, mapping) : []),
    [parsed, mapping]
  );
  const validRows = results.filter(r => r.errors.length === 0);
  const invalidRows = results.filter(r => r.errors.length > 0);
  const mappedFields = new Set(mapping.filter(Boolean));
  const missingRequired = DISH_CSV_FIELDS.filter(f => f.required && !mappedFields.has(f.key));

  function updateMapping(colIdx, fieldKey) {
    setMapping(prev => prev.map((key, i) => {
      if (i === colIdx) return fieldKey;
      // each field can only be fed by one column
      return fieldKey && key === fieldKey ? '' : key;
    }));
  }

  async function handleImport() {
    if (!validRows.length || importing) return;
    setImporting(true);
    setProgress({ done: 0, total: validRows.length });
    const res = await saveDishesBulk(validRows.map(r => r.dish), {
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setImporting(false);
    setResult(res);
    if (res.inserted > 0 && onImported) onImported(res.inserted);
  }

  function acceptFile(f) {
    if (!f) return;
    const okType = /\.csv$/i.test(f.name) || /csv|comma-separated|vnd\.ms-excel/i.test(f.type || '');
    if (!okType) {
      setParseError('Please choose a .csv file (in Excel: File → Save As → CSV UTF-8).');
      return;
    }
    setParseError('');
    setFile(f);
  }

  function downloadTemplate() {
    const blob = new Blob([`${CSV_TEMPLATE_HEADER}\n${CSV_TEMPLATE_EXAMPLE}\n${CSV_TEMPLATE_EXAMPLE_2}\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dish-import-template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import dishes from CSV"
      onClick={(e) => { if (e.target === e.currentTarget && !importing) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div style={{ width: '100%', maxWidth: '1080px', maxHeight: '92vh', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: 'var(--shadow-xl, 0 20px 50px rgba(0,0,0,0.3))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', background: 'var(--bg-subtle)' }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="font-serif-luxury" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Import dishes from CSV</h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {file ? <>{file.name} {parsed ? `· ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} · ${parsed.headers.length} columns` : ''}</> : 'Step 1 of 2 · Download the template, then add your file'}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={importing} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: '20px', cursor: importing ? 'not-allowed' : 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* How it works + template */}
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px' }}>
            <strong style={{ color: 'var(--text)' }}>How it works:</strong> the first row of your file is read as column names. Each column is matched to a dish
            field by its name (e.g. <code>Dish Name</code>, <code>dish_name</code> or <code>Item</code> → Dish name; <code>Veg/Non-Veg</code> → Veg / Non-veg).
            Check the mapping and change any column you need, unmatched columns are ignored. Every following row becomes one dish,
            and all valid dishes are saved together when you click Import. Portions use the format <code>Half:250|Full:450</code>.
            <br />
            <strong style={{ color: 'var(--text)' }}>Tags:</strong> put every tag of a dish in the single <code>tags</code> column, separated by commas —
            e.g. <code>Bestseller, Chef Signature, Jain Available</code>. Tags found there are switched on automatically; leave it empty for none.{' '}
            <button type="button" onClick={downloadTemplate} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}>
              Download a template CSV
            </button>
          </div>

          {!file && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop a CSV file here or browse"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                acceptFile(e.dataTransfer?.files?.[0]);
              }}
              style={{
                border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                background: dragOver ? 'var(--accent-subtle, rgba(194,120,53,0.08))' : 'var(--bg)',
                borderRadius: '14px',
                padding: '36px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'var(--accent)' }}>upload_file</span>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                {dragOver ? 'Drop the CSV file to continue' : 'Drag & drop your CSV file here'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>or</div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                style={{ padding: '8px 18px', borderRadius: '10px', border: 'none', background: 'var(--primary)', color: 'var(--primary-fg, #fff)', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                Browse files
              </button>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>.csv only · you will see a preview before anything is saved</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  acceptFile(f);
                }}
              />
            </div>
          )}

          {parseError && (
            <div style={{ color: 'var(--danger-fg, #b91c1c)', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {parseError}
              {file && (
                <button type="button" onClick={() => { setFile(null); setParsed(null); setParseError(''); }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 10px', color: 'var(--text)', cursor: 'pointer', fontSize: '12px' }}>
                  Choose another file
                </button>
              )}
            </div>
          )}
          {file && !parsed && !parseError && (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Reading file…</div>
          )}

          {parsed && !result && (
            <>
              {/* Column mapping */}
              <section>
                <h3 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>1. Column mapping</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                  {parsed.headers.map((header, colIdx) => (
                    <label key={`${header}-${colIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: mapping[colIdx] ? 'var(--bg-card)' : 'var(--bg-subtle)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={header}>
                        “{header || `Column ${colIdx + 1}`}”
                      </span>
                      <select
                        value={mapping[colIdx] || ''}
                        onChange={(e) => updateMapping(colIdx, e.target.value)}
                        style={{ fontSize: '12px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                      >
                        <option value="">— Ignore this column —</option>
                        {DISH_CSV_FIELDS.filter(f => !f.legacy || mapping[colIdx] === f.key).map(f => (
                          <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {missingRequired.length > 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--danger-fg, #b91c1c)', fontWeight: 600 }}>
                    Map a column to: {missingRequired.map(f => f.label).join(', ')}
                  </p>
                )}
              </section>

              {/* Preview */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>2. Preview of file contents</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--success-fg, #15803d)' }}>{validRows.length} ready</strong>
                    {invalidRows.length > 0 && <> · <strong style={{ color: 'var(--danger-fg, #b91c1c)' }}>{invalidRows.length} with problems (skipped)</strong></>}
                    {results.length > PREVIEW_LIMIT && <> · showing first {PREVIEW_LIMIT}</>}
                  </span>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'auto', maxHeight: '42vh' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Row</th>
                        <th style={th}>Dish</th>
                        <th style={th}>Category</th>
                        <th style={th}>Price</th>
                        <th style={th}>Type</th>
                        <th style={th}>Spice</th>
                        <th style={th}>Tags</th>
                        <th style={th}>Portions</th>
                        <th style={th}>Description</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.slice(0, PREVIEW_LIMIT).map(({ rowNumber, dish, errors }) => (
                        <tr key={rowNumber} style={{ background: errors.length ? 'var(--danger-subtle, rgba(239,68,68,0.06))' : 'transparent' }}>
                          <td style={{ ...td, color: 'var(--text-muted)' }}>{rowNumber}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{dish.name || '—'}</td>
                          <td style={td}>{dish.category}</td>
                          <td style={{ ...td, fontFamily: 'monospace' }}>{formatCurrency(dish.price, currency)}</td>
                          <td style={td}>{dish.veg ? '🟢 Veg' : '🔴 Non-veg'}</td>
                          <td style={td}>{'🌶'.repeat(dish.spice_level)}</td>
                          <td style={{ ...td, fontSize: '11px' }}>
                            {[dish.is_bestseller && 'Bestseller', dish.is_special && 'Chef Signature', dish.is_jain && 'Jain Available', dish.allergens && `Allergens: ${dish.allergens}`].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td style={{ ...td, fontSize: '11px' }}>
                            {dish.portion_variants.length ? dish.portion_variants.map(p => `${p.name} ${formatCurrency(p.price, currency)}`).join(', ') : '—'}
                          </td>
                          <td style={{ ...td, fontSize: '11px', maxWidth: '260px', color: 'var(--text-muted)' }}>
                            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{dish.description || '—'}</span>
                          </td>
                          <td style={{ ...td, fontSize: '11px', fontWeight: 600, color: errors.length ? 'var(--danger-fg, #b91c1c)' : 'var(--success-fg, #15803d)', whiteSpace: 'nowrap' }}>
                            {errors.length ? errors.join(', ') : 'Ready'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {result && (
            <div style={{ padding: '18px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
              <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
                {result.inserted > 0 ? `✅ ${result.inserted} dish${result.inserted === 1 ? '' : 'es'} imported` : 'No dishes were imported'}
              </div>
              {result.error && <div style={{ color: 'var(--danger-fg, #b91c1c)' }}>{result.error.message}</div>}
              {invalidRows.length > 0 && <div>{invalidRows.length} row(s) were skipped because of problems shown in the preview.</div>}
              {result.failed?.length > 0 && (
                <div style={{ color: 'var(--danger-fg, #b91c1c)' }}>
                  {result.failed.length} row(s) failed to save: {result.failed.slice(0, 5).map(f => `${f.name} (${f.message})`).join('; ')}
                </div>
              )}
              <div style={{ color: 'var(--text-muted)', marginTop: '6px' }}>Add photos, videos and 3D models to each dish from Edit Menu.</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', background: 'var(--bg-subtle)' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {importing ? `Saving ${progress.done} / ${progress.total}…` : 'Only text fields are imported. Media is added per dish.'}
            {file && !importing && !result && (
              <button type="button" onClick={() => { setFile(null); setParsed(null); setParseError(''); }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}>
                ← Choose a different file
              </button>
            )}
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={onClose} disabled={importing} style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontWeight: 600, fontSize: '13px', cursor: importing ? 'not-allowed' : 'pointer' }}>
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && file && (
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || !validRows.length || missingRequired.length > 0}
                style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', background: (importing || !validRows.length || missingRequired.length) ? 'var(--text-muted)' : 'var(--primary)', color: 'var(--primary-fg, #fff)', fontWeight: 700, fontSize: '13px', cursor: (importing || !validRows.length || missingRequired.length) ? 'not-allowed' : 'pointer' }}
              >
                {importing ? 'Importing…' : `Import ${validRows.length} dish${validRows.length === 1 ? '' : 'es'}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
