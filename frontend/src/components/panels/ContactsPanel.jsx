import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

export default function ContactsPanel({ contacts, headers, colMap, contactFileName, onLoaded, onColMapChange, onRemove, addLog }) {
  const [contactDragging, setContactDragging] = useState(false);

  function parseFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!json.length) { addLog('File appears empty.', 'warn'); return; }
      const hdrs = Object.keys(json[0]);

      const detect = (keys) => hdrs.find(h => keys.includes(h.toLowerCase())) || '';
      const map = {
        name:    detect(['name', 'full name', 'contact name', 'firstname', 'first name']),
        email:   detect(['email', 'email address', 'e-mail', 'mail']),
        company: detect(['company', 'organization', 'org', 'employer']),
        role:    detect(['role', 'title', 'job title', 'position']),
      };

      onLoaded({ contacts: json, headers: hdrs, colMap: map, contactFileName: file.name });
      addLog(`Loaded ${json.length} contacts from "${file.name}".`, 'system');
    };
    reader.readAsArrayBuffer(file);
  }

  function onContactDrop(e) {
    e.preventDefault();
    setContactDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  // Columns to preview: mapped ones first, then fill up to 5 total
  const previewCols = (() => {
    if (!headers.length) return [];
    const mapped = Object.values(colMap).filter(Boolean);
    const extras = headers.filter(h => !mapped.includes(h));
    return [...mapped, ...extras].slice(0, 5);
  })();

  return (
    <div>
      <div className="section-header">
        <span className="section-title">02 · Contacts File</span>
        {contacts.length > 0 && (
          <span className="section-badge badge-info">{contacts.length} rows</span>
        )}
      </div>

      {contactFileName ? (
        <div className="file-loaded">
          <div>
            <div className="file-loaded-name">📄 {contactFileName}</div>
            <div className="file-loaded-meta">{contacts.length} contacts · {headers.length} columns</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onRemove}>Remove</button>
        </div>
      ) : (
        <div
          id="contacts-drop-zone"
          className={`drop-zone ${contactDragging ? 'dragging' : ''}`}
          onClick={() => document.getElementById('contacts-file-input').click()}
          onDragOver={e => { e.preventDefault(); setContactDragging(true); }}
          onDragLeave={() => setContactDragging(false)}
          onDrop={onContactDrop}
        >
          <span className="drop-zone-icon">📊</span>
          <p className="drop-zone-text">Drop your CSV or Excel file here</p>
          <p className="drop-zone-hint">.csv, .xlsx, .xls supported</p>
        </div>
      )}

      <input
        id="contacts-file-input"
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files[0]) parseFile(e.target.files[0]); e.target.value = ''; }}
      />

      {headers.length > 0 && (
        <>
          {/* Column mapper */}
          <div>
            <label style={{ display: 'block', marginTop: 12, marginBottom: 8 }}>Map Columns</label>
            <div className="col-mapper">
              {['name', 'email', 'company', 'role'].map(field => (
                <div key={field} className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ textTransform: 'capitalize' }}>{field}</label>
                  <select
                    id={`col-${field}`}
                    className="select input"
                    value={colMap[field]}
                    onChange={e => onColMapChange({ ...colMap, [field]: e.target.value })}
                  >
                    <option value="">— none —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Contact preview table */}
          {contacts.length > 0 && (
            <div className="contacts-preview-wrap">
              <table className="contacts-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {previewCols.map(col => <th key={col}>{col}</th>)}
                    {headers.length > 5 && <th style={{ color: 'var(--text-muted)' }}>+{headers.length - 5} more</th>}
                  </tr>
                </thead>
                <tbody>
                  {contacts.slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      {previewCols.map(col => (
                        <td key={col} title={String(row[col] ?? '')}>
                          {String(row[col] ?? '').slice(0, 28)}{String(row[col] ?? '').length > 28 ? '…' : ''}
                        </td>
                      ))}
                      {headers.length > 5 && <td />}
                    </tr>
                  ))}
                  {contacts.length > 50 && (
                    <tr>
                      <td colSpan={previewCols.length + 2} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px' }}>
                        … and {contacts.length - 50} more rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
