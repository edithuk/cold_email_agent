import { useState } from 'react';

export default function ResumePanel({ resume, onLoad, onRemove }) {
  const [resumeDragging, setResumeDragging] = useState(false);

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = btoa(
        new Uint8Array(e.target.result).reduce((d, b) => d + String.fromCharCode(b), '')
      );
      onLoad({ filename: file.name, content: b64, contentType: file.type || 'application/octet-stream' });
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div>
      <div className="section-header">
        <span className="section-title">03 · Resume (optional)</span>
        {resume && <span className="section-badge badge-success">Loaded</span>}
      </div>

      {resume ? (
        <div className="file-loaded">
          <div>
            <div className="file-loaded-name">📎 {resume.filename}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onRemove}>Remove</button>
        </div>
      ) : (
        <div
          id="resume-drop-zone"
          className={`drop-zone ${resumeDragging ? 'dragging' : ''}`}
          onClick={() => document.getElementById('resume-file-input').click()}
          onDragOver={e => { e.preventDefault(); setResumeDragging(true); }}
          onDragLeave={() => setResumeDragging(false)}
          onDrop={e => {
            e.preventDefault();
            setResumeDragging(false);
            if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
          }}
        >
          <span className="drop-zone-icon">📄</span>
          <p className="drop-zone-text">Drop your resume here</p>
          <p className="drop-zone-hint">.pdf, .docx, .doc</p>
        </div>
      )}

      <input
        id="resume-file-input"
        type="file"
        accept=".pdf,.docx,.doc"
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ''; }}
      />
    </div>
  );
}
