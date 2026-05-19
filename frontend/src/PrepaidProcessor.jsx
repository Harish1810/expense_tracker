import { useState } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.DEV ? `http://${window.location.hostname}:5000` : '';

export default function PrepaidProcessor({ categories }) {
  const [originalData, setOriginalData] = useState([]);
  const [uniqueDates, setUniqueDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [dateStatus, setDateStatus] = useState({});
  const [existingCategories, setExistingCategories] = useState({});
  const [fetching, setFetching] = useState(false);

  const checkStatus = async (txns) => {
    try {
      const resp = await axios.post(`${API_BASE}/check_status`, {
        transactions: txns,
        bank: 'PREPAID'
      });
      if (resp.data.dates) {
        setDateStatus(resp.data.dates);
        setExistingCategories(resp.data.categories || {});
      } else {
        setDateStatus(resp.data);
      }
    } catch (e) {
      console.error('Status check failed', e);
    }
  };

  const handleFetch = async () => {
    setFetching(true);
    try {
      const resp = await axios.get(`${API_BASE}/prepaid_transactions`);
      const txns = resp.data.transactions || [];
      setOriginalData(txns);
      const dates = [...new Set(txns.map(t => t.Date))].filter(Boolean);
      setUniqueDates(dates);
      setSelectedDate('');
      setTransactions([]);
      setSyncStatus(null);
      checkStatus(txns);
    } catch (e) {
      console.error('Failed to fetch prepaid transactions', e);
      alert('Failed to fetch transactions');
    } finally {
      setFetching(false);
    }
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setSyncStatus(null);

    const norm = (val) => {
      if (!val) return '0.00';
      const s = String(val).replace(/,/g, '').trim();
      if (!s) return '0.00';
      return parseFloat(s).toFixed(2);
    };

    const filtered = originalData.filter(t => t.Date === date).map(t => {
      const d = (t.Date || '').trim();
      const desc = (t.Description || '').trim();
      const w = norm(t.Withdrawal);
      const dep = norm(t.Deposit);
      const sig = `${d}_${desc}_${w}_${dep}`;
      const prefilledCat = existingCategories[sig] || '';
      return { ...t, Category: t.Category || prefilledCat };
    });

    setTransactions(filtered);
  };

  const handleCategoryChange = (index, category) => {
    const updated = [...transactions];
    updated[index].Category = category;
    setTransactions(updated);
  };

  const handleSync = async () => {
    setSyncStatus('Syncing...');
    try {
      await axios.post(`${API_BASE}/sync`, {
        transactions,
        dates: [selectedDate],
        bank: 'PREPAID'
      });
      setSyncStatus('Success! Transactions synced.');
      checkStatus(originalData);
    } catch (e) {
      console.error('Sync failed', e);
      setSyncStatus('Failed to sync. Check console/backend.');
    }
  };

  return (
    <>
      <section className="card upload-section">
        <h2>1. Fetch Prepaid Transactions</h2>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '15px' }}>
          Loads transactions from your ICICI Prepaid Card email alerts (synced automatically every hour by Apps Script).
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={handleFetch} disabled={fetching} className="btn primary">
            {fetching ? 'Fetching...' : 'Fetch Transactions'}
          </button>
          {originalData.length > 0 && (
            <span style={{ color: '#10b981', fontSize: '0.9rem' }}>
              ✓ {originalData.length} transaction{originalData.length !== 1 ? 's' : ''} loaded
            </span>
          )}
        </div>
      </section>

      {uniqueDates.length > 0 && (
        <section className="card date-section">
          <h2>2. Select Date</h2>
          <div className="date-grid">
            {uniqueDates.map(date => {
              const status = dateStatus[date];
              const statusClass = status === 'green' ? 'status-green' : status === 'red' ? 'status-red' : '';
              return (
                <button
                  key={date}
                  onClick={() => handleDateSelect(date)}
                  className={`btn date-btn ${selectedDate === date ? 'active' : ''} ${statusClass}`}
                >
                  {date}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {transactions.length > 0 && (
        <section className="card transactions-section">
          <div className="section-header">
            <h2>3. Review & Tag ({selectedDate}) <span style={{ fontSize: '0.8em', color: '#666' }}>via Prepaid Card</span></h2>
            <button onClick={handleSync} className="btn success">Sync to Sheet</button>
          </div>
          {syncStatus && (
            <div className={`status-msg ${syncStatus.includes('Success') ? 'success' : 'error'}`}>
              {syncStatus}
            </div>
          )}
          <div className="table-responsive">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={i}>
                    <td className="desc-cell" title={t.Description}>{t.Description}</td>
                    <td className="amount-cell negative">{t.Withdrawal !== '0.00' ? `₹${t.Withdrawal}` : ''}</td>
                    <td className="amount-cell">₹{t.Balance}</td>
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
    </>
  );
}
