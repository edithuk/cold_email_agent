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

      // Auto-detect standard columns
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
      )}
    </div>
  );
}
