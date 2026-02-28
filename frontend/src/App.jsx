
import { useState, useEffect } from 'react'
import axios from 'axios'
import './index.css'
import Dashboard from './Dashboard'

function App() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [originalData, setOriginalData] = useState([])
  const [uniqueDates, setUniqueDates] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [transactions, setTransactions] = useState([])
  const [syncStatus, setSyncStatus] = useState(null)

  // Bank state
  const [bankName, setBankName] = useState('')
  // Date status state
  const [dateStatus, setDateStatus] = useState({})
  // Existing categories map
  const [existingCategories, setExistingCategories] = useState({})

  // Categories state
  const [categories, setCategories] = useState([])
  const [view, setView] = useState('processor') // 'processor' | 'categories'
  const [newCategory, setNewCategory] = useState('')

  const [lastSyncDates, setLastSyncDates] = useState({ ICICI: '...', HDFC: '...' })

  const API_BASE = import.meta.env.DEV ? `http://${window.location.hostname}:5000` : ''

  // Fetch categories and sync dates on mount
  useEffect(() => {
    fetchCategories()
    fetchLastSyncDates()
  }, [])

  const fetchLastSyncDates = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/last_sync`)
      setLastSyncDates(resp.data)
    } catch (e) {
      console.error("Failed to fetch last sync dates", e)
    }
  }

  const fetchCategories = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/categories`)
      setCategories(resp.data)
    } catch (e) {
      console.error("Failed to fetch categories", e)
    }
  }

  const addCategory = async () => {
    if (!newCategory.trim()) return
    try {
      const resp = await axios.post(`${API_BASE}/categories`, { category: newCategory })
      setCategories(resp.data)
      setNewCategory('')
    } catch (e) {
      console.error("Failed to add category", e)
    }
  }

  const deleteCategory = async (cat) => {
    if (!confirm(`Delete category '${cat}'?`)) return
    try {
      // Axios delete with body requires 'data' key
      const resp = await axios.delete(`${API_BASE}/categories`, {
        data: { category: cat }
      })
      setCategories(resp.data)
    } catch (e) {
      console.error("Failed to delete category", e)
    }
  }

  // Password state
  const [password, setPassword] = useState('')
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const handleFileChange = (e) => {
    setFile(e.target.files[0])
    setOriginalData([])
    setUniqueDates([])
    setSelectedDate('')
    setTransactions([])
    setBankName('')
    setDateStatus({})
    setExistingCategories({})
    setPassword('')
    setShowPasswordModal(false)
  }

  const checkStatus = async (txns, bank) => {
    try {
      const resp = await axios.post(`${API_BASE}/check_status`, {
        transactions: txns,
        bank: bank
      })
      // Backend now returns { dates: {...}, categories: {...} }
      if (resp.data.dates) {
        setDateStatus(resp.data.dates)
        setExistingCategories(resp.data.categories || {})
      } else {
        // Fallback for older response format if any
        setDateStatus(resp.data)
      }
    } catch (e) {
      console.error("Status check failed", e)
    }
  }

  const handleUpload = async (pwd = null) => {
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    if (pwd) formData.append('password', pwd)

    try {
      const response = await axios.post(`${API_BASE}/extract?format=json`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const data = response.data
      setOriginalData(data.transactions || [])
      setBankName(data.bank || 'ICICI')

      const dates = [...new Set((data.transactions || []).map(t => t.Date))].filter(Boolean)
      setUniqueDates(dates)

      // Check status
      checkStatus(data.transactions || [], data.bank || 'ICICI')

      setUploading(false)
      setShowPasswordModal(false)
    } catch (error) {
      console.error("Upload failed", error)
      setUploading(false)
      if (error.response && error.response.status === 401 && error.response.data.code === 'PASSWORD_REQUIRED') {
        setShowPasswordModal(true)
      } else {
        alert("Failed to extract statement")
      }
    }
  }

  const submitPassword = () => {
    handleUpload(password)
  }

  const handleDateSelect = (date) => {
    setSelectedDate(date)
    const filtered = originalData.filter(t => t.Date === date).map(t => {
      // Signature matching logic MUST match backend python get_sig
      // 1. Strings trimmed
      // 2. Amounts normalized to 2 decimal places

      const norm = (val) => {
        if (!val) return "0.00"
        let s = String(val).replace(/,/g, '').trim()
        if (!s) return "0.00"
        return parseFloat(s).toFixed(2)
      }

      const d = (t.Date || '').trim()
      const desc = (t.Description || '').trim()
      const w = norm(t.Withdrawal)
      const dep = norm(t.Deposit)

      const sig = `${d}_${desc}_${w}_${dep}`
      const prefilledCat = existingCategories[sig] || ''

      return { ...t, Category: t.Category || prefilledCat }
    })
    setTransactions(filtered)
    setSyncStatus(null)
  }

  const handleCategoryChange = (index, category) => {
    const updated = [...transactions]
    updated[index].Category = category
    setTransactions(updated)
  }

  const handleSync = async () => {
    setSyncStatus('Syncing...')

    try {
      await axios.post(`${API_BASE}/sync`, {
        transactions: transactions,
        dates: [selectedDate],
        bank: bankName
      })
      setSyncStatus('Success! Transactions synced.')
      // Refresh status
      checkStatus(originalData, bankName)
    } catch (error) {
      console.error("Sync failed", error)
      setSyncStatus('Failed to sync. Check console/backend.')
    }
  }

  return (
    <div className="container">
      <header className="header">
        <h1>Bank Statement Processor</h1>
        <div style={{ marginBottom: '20px', fontSize: '0.9rem', color: '#666' }}>
          Last Synced: <strong>ICICI:</strong> {lastSyncDates.ICICI} | <strong>HDFC:</strong> {lastSyncDates.HDFC}
        </div>
        <div className="nav-tabs">
          <button
            className={`btn ${view === 'processor' ? 'primary' : ''}`}
            onClick={() => setView('processor')}
            style={{ marginRight: '10px' }}
          >
            Processor
          </button>
          <button
            className={`btn ${view === 'categories' ? 'primary' : ''}`}
            onClick={() => setView('categories')}
            style={{ marginRight: '10px' }}
          >
            Manage Categories
          </button>
          <button
            className={`btn ${view === 'h-dashboard' ? 'primary' : ''}`}
            onClick={() => setView('h-dashboard')}
            style={{ marginRight: '10px' }}
          >
            H Dashboard
          </button>
          <button
            className={`btn ${view === 'j-dashboard' ? 'primary' : ''}`}
            onClick={() => setView('j-dashboard')}
          >
            J Dashboard
          </button>
        </div>
      </header>

      <main className="main-content">
        {view === 'processor' && (
          <>
            <section className="card upload-section">
              <h2>1. Upload Statement</h2>
              <div className="file-input-wrapper">
                <input type="file" onChange={handleFileChange} accept=".pdf" className="file-input" />
                <button onClick={() => handleUpload()} disabled={!file || uploading} className="btn primary">
                  {uploading ? 'Extracting...' : 'Get Transactions'}
                </button>
              </div>
            </section>

            {uniqueDates.length > 0 && (
              <section className="card date-section">
                <h2>2. Select Date</h2>
                <div className="date-grid">
                  {uniqueDates.map(date => {
                    const status = dateStatus[date]
                    let statusClass = ''
                    if (status === 'green') statusClass = 'status-green'
                    if (status === 'red') statusClass = 'status-red'

                    return (
                      <button
                        key={date}
                        onClick={() => handleDateSelect(date)}
                        className={`btn date-btn ${selectedDate === date ? 'active' : ''} ${statusClass}`}
                      >
                        {date}
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {transactions.length > 0 && (
              <section className="card transactions-section">
                <div className="section-header">
                  <h2>3. Review & Tag ({selectedDate}) <span style={{ fontSize: '0.8em', color: '#666' }}>via {bankName}</span></h2>
                  <button onClick={handleSync} className="btn success">Sync to Sheet</button>
                </div>
                {syncStatus && <div className={`status-msg ${syncStatus.includes('Success') ? 'success' : 'error'}`}>{syncStatus}</div>}

                <div className="table-responsive">
                  <table className="transactions-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Withdrawal</th>
                        <th>Deposit</th>
                        <th>Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t, i) => (
                        <tr key={i}>
                          <td className="desc-cell" title={t.Description}>{t.Description}</td>
                          <td className="amount-cell negative">{t.Withdrawal !== '0.00' ? t.Withdrawal : ''}</td>
                          <td className="amount-cell positive">{t.Deposit !== '0.00' ? t.Deposit : ''}</td>
                          <td>
                            <select
                              value={t.Category}
                              onChange={(e) => handleCategoryChange(i, e.target.value)}
                              className="category-select"
                            >
                              <option value="">Select...</option>
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {showPasswordModal && (
              <div className="modal-overlay">
                <div className="card modal-content">
                  <h3>Password Required</h3>
                  <p>This PDF is password protected. Please enter the PDF password.</p>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="text-input"
                    style={{ marginBottom: '20px', width: '100%', boxSizing: 'border-box' }}
                  />
                  <div className="modal-actions">
                    <button onClick={submitPassword} className="btn primary">Unlock</button>
                    <button onClick={() => setShowPasswordModal(false)} className="btn">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        
        {view === 'categories' && (
          <section className="card">
            <h2>Manage Categories</h2>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New Category (e.g. travel)"
                className="text-input"
              />
              <button onClick={addCategory} className="btn primary">Add</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {categories.map(c => (
                <span key={c} style={{
                  padding: '8px 12px',
                  background: '#e5e7eb',
                  borderRadius: '20px',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {c}
                  <button
                    onClick={() => deleteCategory(c)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#666',
                      fontSize: '1.1rem',
                      lineHeight: 1,
                      padding: 0
                    }}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </section>
        )}

        {view === 'h-dashboard' && <Dashboard bank="ICICI" />}
        {view === 'j-dashboard' && <Dashboard bank="HDFC" />}
      </main>
    </div>
  )
}

export default App
